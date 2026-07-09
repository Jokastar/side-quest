import type { Item, Category } from '../types/database';

// ─────────────────────────────────────────────────────────────
// Helpers partagés autour des items.
// Toute logique "comment lire/afficher un item" vit ici, une seule
// fois — les écrans importent au lieu de dupliquer.
// ─────────────────────────────────────────────────────────────

// ── Coordonnées ───────────────────────────────────────────────

// lat/lng sont nullables en base → on ne retourne des coordonnées
// que si les DEUX existent (sinon pas de pin, pas d'itinéraire)
export function getCoords(item: Item): { latitude: number; longitude: number } | null {
  if (item.lat == null || item.lng == null) return null;
  return { latitude: item.lat, longitude: item.lng };
}

// ── Prix ──────────────────────────────────────────────────────

// Le prix vit dans 2 colonnes selon la nature de l'item :
//   éphémère  → price (euros, 0 = gratuit)
//   permanent → price_level (1 à 3, affiché € / €€ / €€€)
export function priceLabel(item: Item): string | null {
  if (item.price != null) return item.price === 0 ? 'Gratuit' : `${item.price}€`;
  if (item.price_level != null) return '€'.repeat(item.price_level);
  return null; // pas d'info prix
}

// ── Catégories ────────────────────────────────────────────────

export const CATEGORY_LABEL: Record<Category, string> = {
  culture:   'Culture',
  loisir:    'Loisir',
  plein_air: 'Plein air',
  food:      'Food',
  bar:       'Bar',
  club:      'Club',
  concert:   'Concert',
};

// Version avec emoji, pour les badges des fiches détail
export const CATEGORY_LABEL_EMOJI: Record<Category, string> = {
  culture:   '🎭 Culture',
  loisir:    '🎳 Loisir',
  plein_air: '🌳 Plein air',
  food:      '🍽️ Food',
  bar:       '🍸 Bar',
  club:      '🪩 Club',
  concert:   '🎶 Concert',
};

// ── Horaires ──────────────────────────────────────────────────

// Les événements récurrents stockent leurs créneaux précis dans
// `occurrences` : "2026-07-08T18:00:00+02:00_2026-07-08T20:00:00+02:00;…"
// Cette fonction cherche le créneau d'AUJOURD'HUI et retourne ses
// horaires formatés ("18h00 – 20h00"), ou null s'il n'y en a pas.
export function todayOccurrence(occurrences: string | null): string | null {
  if (!occurrences) return null;

  const todayKey = new Date().toDateString();
  const fmtTime = (d: Date) =>
    d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }).replace(':', 'h');

  // Chaque créneau est "début_fin", séparés par des ";"
  for (const slot of occurrences.split(';')) {
    const [start, end] = slot.split('_');
    if (!start) continue;
    const s = new Date(start);
    if (s.toDateString() !== todayKey) continue; // pas aujourd'hui → suivant
    return end ? `${fmtTime(s)} – ${fmtTime(new Date(end))}` : fmtTime(s);
  }
  return null;
}

// ── Heure du jour d'un item ───────────────────────────────────

// Retourne l'heure à laquelle l'item a lieu AUJOURD'HUI, si elle est
// connue et précise :
//   1. un créneau d'occurrence aujourd'hui (événements récurrents)
//   2. sinon start_date, si c'est aujourd'hui avec une vraie heure
//      (minuit pile = "pas d'heure renseignée" chez Paris Open Data)
//   3. sinon null → item "flexible" (expo ouverte toute la journée,
//      resto, bar…) qui se placera à une heure par défaut dans le plan
export function itemTimeToday(item: Item): Date | null {
  const todayKey = new Date().toDateString();

  // 1. Occurrence du jour
  if (item.occurrences) {
    for (const slot of item.occurrences.split(';')) {
      const start = slot.split('_')[0];
      if (!start) continue;
      const d = new Date(start);
      if (d.toDateString() === todayKey) return d;
    }
  }

  // 2. start_date aujourd'hui avec une heure renseignée
  if (item.start_date) {
    const d = new Date(item.start_date);
    if (d.toDateString() === todayKey && (d.getHours() !== 0 || d.getMinutes() !== 0)) {
      return d;
    }
  }

  return null;
}

// Badge horaire pour les cartes : "20h30" si heure connue, sinon null
export function timeBadge(item: Item): string | null {
  const t = itemTimeToday(item);
  if (!t) return null;
  return t.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }).replace(':', 'h');
}

// ── Arrondissement ────────────────────────────────────────────

// Extrait l'arrondissement (1-20) d'un code postal parisien présent
// dans une adresse : "12 Rue de Rivoli, 75004 Paris" → 4.
// Utilisé en secours quand item.arrondissement est null en base.
export function parseArrondissement(address: string | null): number | null {
  if (!address) return null;
  const match = address.match(/750(\d{2})/);
  if (!match) return null;
  const arr = parseInt(match[1], 10);
  return arr >= 1 && arr <= 20 ? arr : null;
}
