// ─────────────────────────────────────────────────────────────
// Edge Function : sync-data
//
// Rafraîchit le cache partagé (events + venues) côté serveur :
//   1. Purge les événements terminés
//   2. Paris Open Data → events (événements du jour uniquement)
//   3. Google Places  → venues (3 catégories)
//
// Tourne avec la clé service_role → aucune policy RLS d'écriture
// n'est nécessaire côté client. Déclenchée par :
//   - le cron Supabase toutes les 6h
//   - le client au lancement si le cache est périmé (functions.invoke)
//
// Secrets requis : GOOGLE_PLACES_API_KEY
// (SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont injectés automatiquement)
// ─────────────────────────────────────────────────────────────

import { createClient } from 'jsr:@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

const GOOGLE_API_KEY = Deno.env.get('GOOGLE_PLACES_API_KEY') ?? '';
const PARIS_CENTER = { lat: 48.8566, lng: 2.3522 };
const RADIUS_METERS = 5000;

// ── Classification Paris Open Data ────────────────────────────

const AMBIANCE_TAGS = ['concert', 'festival', 'nuit', 'humour', 'danse', 'spectacle', 'musique', 'loisirs', 'lgbt', 'cirque', 'théâtre'];
const LIEU_TAGS = ['expo', 'musée', 'histoire', 'patrimoine', 'sciences', 'cinéma', 'visite', 'littérature', 'balade'];
const EXCLUDED_TAGS = ['enfants', 'sport', 'santé', 'atelier', 'conférence', 'solidarité', 'formation', 'emploi'];

// deno-lint-ignore no-explicit-any
function classifyEvent(r: any): 'lieu' | 'ambiance' | null {
  const tags = (r.qfap_tags ?? '').toLowerCase();
  const audience = (r.audience ?? '').toLowerCase();

  if (r.childrens != null) return null;
  if (audience.includes('enfant')) return null;
  if (EXCLUDED_TAGS.some(t => tags.includes(t))) return null;
  if (LIEU_TAGS.some(t => tags.includes(t))) return 'lieu';
  if (AMBIANCE_TAGS.some(t => tags.includes(t))) return 'ambiance';

  return 'ambiance'; // fallback
}

function parsePrice(priceType: string | null, priceDetail: string | null): number {
  if (!priceType || priceType === 'gratuit') return 0;
  if (priceDetail) {
    const match = priceDetail.match(/(\d+)/);
    if (match) return parseInt(match[1], 10);
  }
  return 10;
}

// ── Paris Open Data → events ──────────────────────────────────
// Événements qui ont lieu AUJOURD'HUI : déjà commencés, pas encore terminés.

async function syncEvents(): Promise<number> {
  // Purge 1 : événements dont la date de fin est passée
  const { error: purgeError } = await supabase
    .from('events')
    .delete()
    .lt('end_date', new Date().toISOString());
  if (purgeError) console.warn('[sync-data] purge:', purgeError.message);

  // Purge 2 : événements SANS date de fin qui ont commencé il y a plus de 2 jours
  // (sans ça ils ne seraient jamais supprimés et s'accumuleraient indéfiniment)
  const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
  const { error: purgeNullError } = await supabase
    .from('events')
    .delete()
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

  const events = [];
  for (const r of results) {
    const category = classifyEvent(r);
    if (!category) continue;
    if (r.lat_lon?.lat == null || r.lat_lon?.lon == null) continue;
    events.push({
      source: 'paris_opendata',
      external_id: String(r.id),
      title: r.title ?? 'Sans titre',
      description: r.lead_text ?? r.description_courte ?? r.description ?? null,
      category,
      venue_name: r.address_name ?? null,
      lat: r.lat_lon.lat,
      lng: r.lat_lon.lon,
      start_date: r.date_start,
      end_date: r.date_end ?? null,
      price: parsePrice(r.price_type, r.price_detail),
      url: r.url ?? null,
      photo_url: r.cover_url ?? null,
      // Type(s) d'événement source, ex: "Expo;Histoire" — affiché en curation
      tags: r.qfap_tags ?? null,
      // Créneaux précis pour les événements récurrents, ex:
      // "2026-07-07T18:00:00+02:00_2026-07-07T20:00:00+02:00;..."
      occurrences: r.occurrences ?? null,
      // Horaires en clair, ex: "Du 13 mai au 1er nov : dimanche de 11h à 20h…"
      // (HTML retiré, espaces normalisés)
      schedule_text: r.date_description
        ? String(r.date_description).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() || null
        : null,
      // Adresse complète — le code postal permet de déduire l'arrondissement
      // (indispensable pour le passeport des arrondissements côté tampons)
      address: [r.address_street, r.address_zipcode, r.address_city]
        .filter(Boolean).join(', ') || null,
      // Transports à proximité, ex: "Métro -> 8 : Chemin Vert (272m)\nBus -> …"
      transport: r.transport ?? null,
      // Réservation : 'obligatoire' | 'conseillé' | null + lien de résa
      access_type: r.access_type ?? null,
      access_link: r.access_link ?? null,
      // Intérieur / extérieur (utile plus tard pour scorer selon la météo)
      is_indoor: r.event_indoor === 1,
      cached_at: new Date().toISOString(),
    });
  }

  if (events.length) {
    const { error } = await supabase
      .from('events')
      .upsert(events, { onConflict: 'external_id,source' });
    if (error) throw new Error(`events upsert: ${error.message}`);
  }
  return events.length;
}

// ── Google Places → venues ────────────────────────────────────

function buildPhotoUrl(photoReference: string): string {
  return `https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photo_reference=${photoReference}&key=${GOOGLE_API_KEY}`;
}

async function fetchPlacesByType(type: string, category: 'lieu' | 'restaurant' | 'ambiance') {
  const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${PARIS_CENTER.lat},${PARIS_CENTER.lng}&radius=${RADIUS_METERS}&type=${type}&language=fr&key=${GOOGLE_API_KEY}`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Google Places (${type}): ${res.status}`);
  const json = await res.json();

  // deno-lint-ignore no-explicit-any
  return (json.results ?? []).slice(0, 10).map((r: any) => ({
    google_place_id: r.place_id,
    name: r.name,
    address: r.vicinity ?? '',
    category,
    lat: r.geometry?.location?.lat ?? null,
    lng: r.geometry?.location?.lng ?? null,
    price_level: r.price_level ?? null,
    rating: r.rating ?? null,
    photo_url: r.photos?.[0]?.photo_reference
      ? buildPhotoUrl(r.photos[0].photo_reference)
      : null,
    rarity: 'common',
    is_active: true,
    cached_at: new Date().toISOString(),
  }));
}

async function syncVenues(): Promise<number> {
  if (!GOOGLE_API_KEY) {
    console.warn('[sync-data] GOOGLE_PLACES_API_KEY manquante, venues ignorées');
    return 0;
  }

  const [lieux, restaurants, ambiances] = await Promise.all([
    fetchPlacesByType('museum', 'lieu'),
    fetchPlacesByType('restaurant', 'restaurant'),
    fetchPlacesByType('night_club', 'ambiance'),
  ]);
  const venues = [...lieux, ...restaurants, ...ambiances];

  if (venues.length) {
    const { error } = await supabase
      .from('venues')
      .upsert(venues, { onConflict: 'google_place_id' });
    if (error) throw new Error(`venues upsert: ${error.message}`);
  }
  return venues.length;
}

// ── Handler ───────────────────────────────────────────────────

// CORS : nécessaire pour les appels depuis un navigateur (admin web).
// Les clients mobiles et le cron ne font pas de preflight, ça ne les affecte pas.
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  // Réponse au preflight du navigateur
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  try {
    const [eventCount, venueCount] = await Promise.all([syncEvents(), syncVenues()]);
    const body = { ok: true, events: eventCount, venues: venueCount };
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
