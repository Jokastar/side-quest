import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

const GOOGLE_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY!;
const PARIS_CENTER = { lat: 48.8566, lng: 2.3522 };
const RADIUS_METERS = 5000;
const STALE_AFTER_MS = 6 * 60 * 60 * 1000; // 6h

// ── Helpers ──────────────────────────────────────────────────

// Construit l'URL d'une photo Google Places depuis son photo_reference
function buildPhotoUrl(photoReference: string): string {
  return `https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photo_reference=${photoReference}&key=${GOOGLE_API_KEY}`;
}

const AMBIANCE_TAGS = ['concert', 'festival', 'nuit', 'humour', 'danse', 'spectacle', 'musique', 'loisirs', 'lgbt', 'cirque', 'théâtre'];
const LIEU_TAGS = ['exposition', 'musée', 'histoire', 'patrimoine', 'sciences', 'cinéma', 'visite', 'littérature'];
const EXCLUDED_TAGS = ['enfants', 'sport', 'santé', 'atelier', 'conférence', 'solidarité', 'formation', 'emploi'];

// Retourne null si l'event doit être exclu (hors cible), sinon la catégorie DB
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

// Extrait le prix depuis price_detail (ex: "<p>De 10 à 15 euros.</p>")
function parsePrice(priceType: string | null, priceDetail: string | null): number {
  if (!priceType || priceType === 'gratuit') return 0;
  if (priceDetail) {
    const match = priceDetail.match(/(\d+)/);
    if (match) return parseInt(match[1], 10);
  }
  return 10;
}

// Vérifie si les données sont périmées (dernière sync > 6h)
async function isDataStale(): Promise<boolean> {
  const { data } = await supabase
    .from('events')
    .select('cached_at')
    .order('cached_at', { ascending: false })
    .limit(1)
    .single();

  if (!data) return true; // table vide → périmée

  const lastSync = new Date(data.cached_at).getTime();
  return Date.now() - lastSync > STALE_AFTER_MS;
}

// ── Fetch Paris Open Data ────────────────────────────────────

async function fetchParisOpenData() {
  const now = new Date();
  const in48h = new Date(now.getTime() + 48 * 60 * 60 * 1000);
  const start = now.toISOString().split('T')[0];
  const end = in48h.toISOString().split('T')[0];
  const params = new URLSearchParams({
    where: `date_start >= "${start}" AND date_start <= "${end}"`,
    limit: '50',
    lang: 'fr',
  });
  const url = `https://opendata.paris.fr/api/explore/v2.1/catalog/datasets/que-faire-a-paris-/records?${params}`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Paris Open Data: ${res.status}`);
  const json = await res.json();

  const events = [];
  for (const r of (json.results ?? [])) {
    const category = classifyEvent(r);
    if (!category) continue;
    events.push({
      source: 'paris_opendata' as const,
      external_id: String(r.id),
      title: r.title ?? 'Sans titre',
      description: r.lead_text ?? r.description_courte ?? r.description ?? null,
      category,
      venue_name: r.address_name ?? null,
      lat: r.lat_lon?.lat ?? null,
      lng: r.lat_lon?.lon ?? null,
      start_date: r.date_start,
      end_date: r.date_end ?? null,
      price: parsePrice(r.price_type, r.price_detail),
      url: r.url ?? null,
      photo_url: r.cover_url ?? null,
      cached_at: new Date().toISOString(),
    });
  }
  return events;
}

// ── Fetch Google Places ──────────────────────────────────────

async function fetchPlacesByType(type: string, category: 'lieu' | 'restaurant' | 'ambiance') {
  const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${PARIS_CENTER.lat},${PARIS_CENTER.lng}&radius=${RADIUS_METERS}&type=${type}&language=fr&key=${GOOGLE_API_KEY}`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Google Places (${type}): ${res.status}`);
  const json = await res.json();

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
    rarity: 'common' as const,
    is_active: true,
    cached_at: new Date().toISOString(),
  }));
}

async function fetchAllVenues() {
  // On fetch les 3 catégories en parallèle, 10 résultats chacune
  const [lieux, restaurants, ambiances] = await Promise.all([
    fetchPlacesByType('museum', 'lieu'),
    fetchPlacesByType('restaurant', 'restaurant'),
    fetchPlacesByType('night_club', 'ambiance'),
  ]);
  return [...lieux, ...restaurants, ...ambiances];
}

// ── Upsert en DB ─────────────────────────────────────────────

async function syncEvents() {
  const events = await fetchParisOpenData();
  if (!events.length) return;

  // onConflict sur external_id + source pour ne pas créer de doublons
  const { error } = await supabase
    .from('events')
    .upsert(events, { onConflict: 'external_id,source' });

  if (error) console.error('[syncEvents] upsert error:', error.message);
  else console.log(`[syncEvents] ${events.length} événements synchronisés`);
}

async function syncVenues() {
  const venues = await fetchAllVenues();
  if (!venues.length) return;

  // onConflict sur google_place_id pour ne pas créer de doublons
  const { error } = await supabase
    .from('venues')
    .upsert(venues, { onConflict: 'google_place_id' });

  if (error) console.error('[syncVenues] upsert error:', error.message);
  else console.log(`[syncVenues] ${venues.length} venues synchronisées`);
}

// ── Hook principal ───────────────────────────────────────────

export function useDataSync() {
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    async function run() {
      setSyncing(true);
      setSyncError(null);

      try {
        const stale = await isDataStale();

        if (stale) {
          console.log('[useDataSync] données périmées, synchronisation...');
          await Promise.all([syncEvents(), syncVenues()]);
        } else {
          console.log('[useDataSync] données récentes, pas de sync nécessaire');
        }
      } catch (e: any) {
        console.error('[useDataSync] erreur:', e.message);
        setSyncError(e.message);
      } finally {
        setSyncing(false);
        setReady(true); // prêt même en cas d'erreur (on sert le cache)
      }
    }

    run();
  }, []);

  return { syncing, syncError, ready };
}
