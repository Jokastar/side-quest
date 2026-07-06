// Script de test du pipeline de données
// Usage : node scripts/test-sync.mjs

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://hipjrrosvpggslurhrlh.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhpcGpycm9zdnBnZ3NsdXJocmxoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MDgyNTkwNiwiZXhwIjoyMDk2NDAxOTA2fQ.zV0Wl9jXYrKagzkSZZ0PkjQb_08TOpEmOTJcHBOJc24';
const GOOGLE_API_KEY = 'AIzaSyBuEHtfaV1w8KWA1lx-DqODOzJBmp_yng4';
const PARIS_LAT = 48.8566;
const PARIS_LNG = 2.3522;
const RADIUS = 5000;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ── Helpers ──────────────────────────────────────────────────

function buildPhotoUrl(ref) {
  return `https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photo_reference=${ref}&key=${GOOGLE_API_KEY}`;
}

// Tags qui correspondent à une sortie soirée adulte → 'ambiance'
const AMBIANCE_TAGS = ['concert', 'festival', 'nuit', 'humour', 'danse', 'spectacle', 'musique', 'loisirs', 'lgbt', 'cirque', 'théâtre'];

// Tags qui correspondent à une visite culturelle → 'lieu'
const LIEU_TAGS = ['exposition', 'musée', 'histoire', 'patrimoine', 'sciences', 'cinéma', 'visite', 'littérature'];

// Tags à exclure (hors cible pour une app de soirée)
const EXCLUDED_TAGS = ['enfants', 'sport', 'santé', 'atelier', 'conférence', 'solidarité', 'formation', 'emploi'];

// Retourne null si l'event doit être exclu, sinon la catégorie DB
function classifyEvent(r) {
  const tags = (r.qfap_tags ?? '').toLowerCase();
  const audience = (r.audience ?? '').toLowerCase();

  // Exclure les events pour enfants
  if (r.childrens != null) return null;
  if (audience.includes('enfant') || audience.includes('enfants')) return null;

  // Exclure les tags hors cible
  if (EXCLUDED_TAGS.some(t => tags.includes(t))) return null;

  // Classifier selon les tags
  if (LIEU_TAGS.some(t => tags.includes(t))) return 'lieu';
  if (AMBIANCE_TAGS.some(t => tags.includes(t))) return 'ambiance';

  // Fallback : garder comme ambiance si aucun tag exclu
  return 'ambiance';
}

// Extrait le prix depuis price_detail (ex: "<p>De 10 à 15 euros.</p>")
function parsePrice(priceType, priceDetail) {
  if (!priceType || priceType === 'gratuit') return 0;
  if (priceDetail) {
    const match = priceDetail.match(/(\d+)/);
    if (match) return parseInt(match[1], 10);
  }
  return 10; // valeur par défaut si payant mais sans détail
}

// ── Fetch Paris Open Data ────────────────────────────────────

async function fetchParisOpenData() {
  const now = new Date();
  const in48h = new Date(now.getTime() + 48 * 60 * 60 * 1000);
  const start = now.toISOString().split('T')[0];
  const end = in48h.toISOString().split('T')[0];
  const url = `https://opendata.paris.fr/api/explore/v2.1/catalog/datasets/que-faire-a-paris-/records?where=date_start%20>=%20%22${start}%22%20AND%20date_start%20<=%20%22${end}%22&limit=10&lang=fr`;

  console.log('📡 Fetching Paris Open Data...');
  const res = await fetch(url);
  const json = await res.json();

  const events = [];
  for (const r of (json.results ?? [])) {
    const category = classifyEvent(r);
    if (!category) {
      console.log(`  ⏭️  Exclu  [${r.qfap_tags}] : "${r.title?.slice(0, 40)}"`);
      continue;
    }
    events.push({
      source: 'paris_opendata',
      external_id: String(r.id),
      title: r.title ?? 'Sans titre',
      description: r.lead_text ?? null,
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
    console.log(`  ✅ Gardé  [${category}] [${r.qfap_tags}] : "${r.title?.slice(0, 40)}"`);
  }

  console.log(`\n✅ Paris Open Data : ${events.length} événements retenus`);
  return events;
}

// ── Fetch Google Places ──────────────────────────────────────

async function fetchPlacesByType(type, category) {
  const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${PARIS_LAT},${PARIS_LNG}&radius=${RADIUS}&type=${type}&language=fr&key=${GOOGLE_API_KEY}`;

  const res = await fetch(url);
  const json = await res.json();

  return (json.results ?? []).slice(0, 10).map(r => ({
    google_place_id: r.place_id,
    name: r.name,
    address: r.vicinity ?? '',
    category,
    lat: r.geometry?.location?.lat ?? null,
    lng: r.geometry?.location?.lng ?? null,
    price_level: r.price_level ?? null,
    rating: r.rating ?? null,
    photo_url: r.photos?.[0]?.photo_reference ? buildPhotoUrl(r.photos[0].photo_reference) : null,
    rarity: 'common',
    is_active: true,
    cached_at: new Date().toISOString(),
  }));
}

async function fetchAllVenues() {
  console.log('📡 Fetching Google Places...');
  const [lieux, restaurants, ambiances] = await Promise.all([
    fetchPlacesByType('museum', 'lieu'),
    fetchPlacesByType('restaurant', 'restaurant'),
    fetchPlacesByType('night_club', 'ambiance'),
  ]);
  const all = [...lieux, ...restaurants, ...ambiances];
  console.log(`✅ Google Places : ${lieux.length} lieux, ${restaurants.length} restaurants, ${ambiances.length} ambiances`);
  return all;
}

// ── Upsert Supabase ──────────────────────────────────────────

async function syncEvents(events) {
  const { error } = await supabase
    .from('events')
    .upsert(events, { onConflict: 'external_id,source' });

  if (error) {
    console.error('❌ Events upsert error:', error.message);
  } else {
    console.log(`✅ ${events.length} événements stockés en DB`);
  }
}

async function syncVenues(venues) {
  const { error } = await supabase
    .from('venues')
    .upsert(venues, { onConflict: 'google_place_id' });

  if (error) {
    console.error('❌ Venues upsert error:', error.message);
  } else {
    console.log(`✅ ${venues.length} venues stockées en DB`);
  }
}

// ── Vérification ─────────────────────────────────────────────

async function verifyDB() {
  const { count: eventsCount } = await supabase.from('events').select('*', { count: 'exact', head: true });
  const { count: venuesCount } = await supabase.from('venues').select('*', { count: 'exact', head: true });

  const { data: byCategory } = await supabase
    .from('venues')
    .select('category')
    .order('category');

  const counts = { lieu: 0, restaurant: 0, ambiance: 0 };
  byCategory?.forEach(v => counts[v.category]++);

  console.log('\n📊 Résultat en DB :');
  console.log(`   events  : ${eventsCount} lignes`);
  console.log(`   venues  : ${venuesCount} lignes (lieu: ${counts.lieu}, restaurant: ${counts.restaurant}, ambiance: ${counts.ambiance})`);
}

// ── Main ─────────────────────────────────────────────────────

async function main() {
  console.log('🚀 Démarrage du test de synchronisation...\n');

  const [events, venues] = await Promise.all([
    fetchParisOpenData(),
    fetchAllVenues(),
  ]);

  console.log('\n💾 Stockage en DB...');
  await Promise.all([
    syncEvents(events),
    syncVenues(venues),
  ]);

  await verifyDB();
  console.log('\n✅ Pipeline OK');
}

main().catch(console.error);
