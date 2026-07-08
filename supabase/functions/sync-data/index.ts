// ─────────────────────────────────────────────────────────────
// Edge Function : sync-data
//
// Rafraîchit la table unifiée `items` côté serveur :
//   1. Purge les éphémères terminés
//   2. Paris Open Data → items éphémères (événements du jour)
//   3. Google Places  → items permanents (placeholders, en attendant
//      la liste curée créée à la main dans l'admin)
//
// Modèle : nature (permanent|ephemere) · slot (activite|table|sortie)
//          · category (culture|food|bar|club|concert|loisir|plein_air)
//
// Tourne avec la clé service_role. Déclenchée par :
//   - le cron Supabase toutes les 6h
//   - le client mobile au lancement si le cache est périmé
//   - le bouton 🔄 de l'admin
//
// Secrets requis : GOOGLE_PLACES_API_KEY
// ─────────────────────────────────────────────────────────────

import { createClient } from 'jsr:@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

const GOOGLE_API_KEY = Deno.env.get('GOOGLE_PLACES_API_KEY') ?? '';
const PARIS_CENTER = { lat: 48.8566, lng: 2.3522 };
const RADIUS_METERS = 5000;

type Slot = 'activite' | 'table' | 'sortie';
type Category = 'culture' | 'loisir' | 'plein_air' | 'food' | 'bar' | 'club' | 'concert';

// ── Classification Paris Open Data ────────────────────────────
// Des tags source vers notre taxonomie. Premier match gagne,
// l'ordre va du plus spécifique au plus générique.

const EXCLUDED_TAGS = ['enfants', 'sport', 'santé', 'atelier', 'conférence', 'solidarité', 'formation', 'emploi'];

const CATEGORY_RULES: { match: string[]; category: Category }[] = [
  { match: ['nuit', 'clubbing', 'électro', 'dj', 'lgbt'],                                       category: 'club' },
  { match: ['concert', 'festival', 'musique', 'spectacle', 'théâtre', 'humour', 'cirque', 'danse'], category: 'concert' },
  { match: ['balade', 'plein air', 'nature', 'jardin'],                                          category: 'plein_air' },
  { match: ['expo', 'musée', 'histoire', 'patrimoine', 'sciences', 'cinéma', 'visite', 'littérature', 'art'], category: 'culture' },
  { match: ['loisirs', 'jeux'],                                                                  category: 'loisir' },
];

const CATEGORY_TO_SLOT: Record<Category, Slot> = {
  culture: 'activite', loisir: 'activite', plein_air: 'activite',
  food: 'table',
  bar: 'sortie', club: 'sortie', concert: 'sortie',
};

// deno-lint-ignore no-explicit-any
function classifyEvent(r: any): { slot: Slot; category: Category } | null {
  const tags = (r.qfap_tags ?? '').toLowerCase();
  const audience = (r.audience ?? '').toLowerCase();

  if (r.childrens != null) return null;
  if (audience.includes('enfant')) return null;
  if (EXCLUDED_TAGS.some(t => tags.includes(t))) return null;

  for (const rule of CATEGORY_RULES) {
    if (rule.match.some(t => tags.includes(t))) {
      return { category: rule.category, slot: CATEGORY_TO_SLOT[rule.category] };
    }
  }
  // Défaut : un événement sans tag reconnu part en sortie/concert
  return { category: 'concert', slot: 'sortie' };
}

function parsePrice(priceType: string | null, priceDetail: string | null): number {
  if (!priceType || priceType === 'gratuit') return 0;
  if (priceDetail) {
    const match = priceDetail.match(/(\d+)/);
    if (match) return parseInt(match[1], 10);
  }
  return 10;
}

// "75004" quelque part dans le code postal → arrondissement 4
function parseArrondissement(zipcode: string | null): number | null {
  if (!zipcode) return null;
  const match = String(zipcode).match(/750(\d{2})/);
  if (!match) return null;
  const arr = parseInt(match[1], 10);
  return arr >= 1 && arr <= 20 ? arr : null;
}

// ── Paris Open Data → items éphémères ─────────────────────────
// Événements qui ont lieu AUJOURD'HUI : déjà commencés, pas terminés.

async function syncEvents(): Promise<number> {
  // Purge 1 : éphémères dont la date de fin est passée
  const { error: purgeError } = await supabase
    .from('items')
    .delete()
    .eq('nature', 'ephemere')
    .lt('end_date', new Date().toISOString());
  if (purgeError) console.warn('[sync-data] purge:', purgeError.message);

  // Purge 2 : éphémères SANS date de fin commencés il y a plus de 2 jours
  const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
  const { error: purgeNullError } = await supabase
    .from('items')
    .delete()
    .eq('nature', 'ephemere')
    .is('end_date', null)
    .lt('start_date', twoDaysAgo);
  if (purgeNullError) console.warn('[sync-data] purge (end_date null):', purgeNullError.message);

  const today = new Date().toISOString().split('T')[0];
  const PAGE_SIZE = 100;
  const MAX_PAGES = 3;

  // deno-lint-ignore no-explicit-any
  const results: any[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const params = new URLSearchParams({
      where: `date_start <= "${today}" AND date_end >= "${today}"`,
      limit: String(PAGE_SIZE),
      offset: String(page * PAGE_SIZE),
      lang: 'fr',
    });
    const res = await fetch(`https://opendata.paris.fr/api/explore/v2.1/catalog/datasets/que-faire-a-paris-/records?${params}`);
    if (!res.ok) throw new Error(`Paris Open Data: ${res.status}`);
    const json = await res.json();
    const batch = json.results ?? [];
    results.push(...batch);
    if (batch.length < PAGE_SIZE) break;
  }

  const items = [];
  for (const r of results) {
    const classified = classifyEvent(r);
    if (!classified) continue;
    if (r.lat_lon?.lat == null || r.lat_lon?.lon == null) continue;
    items.push({
      nature: 'ephemere',
      slot: classified.slot,
      category: classified.category,

      name: r.title ?? 'Sans titre',
      description: r.lead_text ?? r.description_courte ?? r.description ?? null,
      photo_url: r.cover_url ?? null,

      address: [r.address_name, r.address_street, r.address_zipcode, r.address_city]
        .filter(Boolean).join(', ') || null,
      arrondissement: parseArrondissement(r.address_zipcode),
      lat: r.lat_lon.lat,
      lng: r.lat_lon.lon,
      transport: r.transport ?? null,

      price: parsePrice(r.price_type, r.price_detail),
      schedule_text: r.date_description
        ? String(r.date_description).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() || null
        : null,
      access_type: r.access_type ?? null,
      access_link: r.access_link ?? null,
      url: r.url ?? null,
      is_indoor: r.event_indoor === 1,
      tags: r.qfap_tags ?? null,

      start_date: r.date_start,
      end_date: r.date_end ?? null,
      occurrences: r.occurrences ?? null,

      // status jamais envoyé → défaut 'pending' à l'insert,
      // décision de curation préservée à l'update
      source: 'paris_opendata',
      external_id: String(r.id),
      cached_at: new Date().toISOString(),
    });
  }

  if (items.length) {
    const { error } = await supabase
      .from('items')
      .upsert(items, { onConflict: 'source,external_id' });
    if (error) throw new Error(`items upsert (events): ${error.message}`);
  }
  return items.length;
}

// ── Google Places → items permanents (placeholders) ──────────
// À SUPPRIMER quand la liste curée créée dans l'admin sera prête.

function buildPhotoUrl(photoReference: string): string {
  return `https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photo_reference=${photoReference}&key=${GOOGLE_API_KEY}`;
}

async function fetchPlacesByType(type: string, slot: Slot, category: Category) {
  const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${PARIS_CENTER.lat},${PARIS_CENTER.lng}&radius=${RADIUS_METERS}&type=${type}&language=fr&key=${GOOGLE_API_KEY}`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Google Places (${type}): ${res.status}`);
  const json = await res.json();

  // deno-lint-ignore no-explicit-any
  return (json.results ?? []).slice(0, 10).map((r: any) => ({
    nature: 'permanent',
    slot,
    category,
    name: r.name,
    address: r.vicinity ?? null,
    lat: r.geometry?.location?.lat ?? null,
    lng: r.geometry?.location?.lng ?? null,
    price_level: r.price_level ?? null,
    rating: r.rating ?? null,
    photo_url: r.photos?.[0]?.photo_reference
      ? buildPhotoUrl(r.photos[0].photo_reference)
      : null,
    // Les placeholders Google sont approuvés d'office pour que l'app
    // fonctionne — ta liste curée passera par 'pending' comme le reste
    status: 'approved',
    source: 'google_places',
    external_id: r.place_id,
    cached_at: new Date().toISOString(),
  }));
}

async function syncVenues(): Promise<number> {
  if (!GOOGLE_API_KEY) {
    console.warn('[sync-data] GOOGLE_PLACES_API_KEY manquante, permanents ignorés');
    return 0;
  }

  const [culture, food, club] = await Promise.all([
    fetchPlacesByType('museum', 'activite', 'culture'),
    fetchPlacesByType('restaurant', 'table', 'food'),
    fetchPlacesByType('night_club', 'sortie', 'club'),
  ]);
  const items = [...culture, ...food, ...club];

  if (items.length) {
    const { error } = await supabase
      .from('items')
      .upsert(items, { onConflict: 'source,external_id' });
    if (error) throw new Error(`items upsert (venues): ${error.message}`);
  }
  return items.length;
}

// ── Handler ───────────────────────────────────────────────────

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  try {
    const [eventCount, venueCount] = await Promise.all([syncEvents(), syncVenues()]);
    const body = { ok: true, ephemeres: eventCount, permanents: venueCount };
    console.log('[sync-data]', JSON.stringify(body));
    return new Response(JSON.stringify(body), {
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('[sync-data] error:', message);
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }
});
