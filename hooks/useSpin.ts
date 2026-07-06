import { useState, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useGameStore, ReelIndex, ReelResult } from '../store/gameStore';
import { getDistance } from './useProximityCheck';
import type { Venue, SpinEvent, UserPreferences } from '../types/database';

// ============================================================
// Algorithme de sélection — 4 phases
// 1. Filtre     → candidats valides selon budget, heure, anti-repeat
// 2. Score      → chaque candidat reçoit un poids (rareté, distance, rating...)
// 3. Weighted random → tirage aléatoire pondéré par les scores
// 4. Anti-repeat → on mémorise les 10 derniers résultats par reel
// ============================================================

// Source de données par reel :
// 0 = lieu     → table venues (lieux permanents Google Places)
// 1 = restaurant → table venues (restaurants Google Places)
// 2 = ambiance → table events (événements Paris Open Data + Eventbrite)
const REEL_SOURCES: Record<ReelIndex, 'venues' | 'events'> = {
  0: 'venues',
  1: 'venues',
  2: 'events',
};

const REEL_CATEGORIES: Record<ReelIndex, 'lieu' | 'restaurant' | 'ambiance'> = {
  0: 'lieu',
  1: 'restaurant',
  2: 'ambiance',
};

// Budget utilisateur → prix maximum accepté pour un événement (en euros)
const BUDGET_MAX_PRICE: Record<number, number> = {
  1: 0,    // € = gratuit uniquement
  2: 20,   // €€ = jusqu'à 20€
  3: 999,  // €€€ = pas de limite
};

// Budget utilisateur → price_level maximum accepté pour un venue Google Places
const BUDGET_MAX_PRICE_LEVEL: Record<number, number> = {
  1: 1,
  2: 2,
  3: 3,
};

// Fenêtre d'accessibilité dynamique :
// - start_before : events qui commencent dans les 48h
// - now          : pour vérifier que l'event n'est pas déjà terminé
function getAccessibilityWindow(): { now: string; in48h: string } {
  const now = new Date();
  const in48h = new Date(now.getTime() + 48 * 60 * 60 * 1000);
  return { now: now.toISOString(), in48h: in48h.toISOString() };
}

// Calcule le score d'un candidat selon les préférences et la position de l'user
function scoreCandidate(
  item: Venue | SpinEvent,
  userLat: number,
  userLng: number,
  preferences: UserPreferences,
): number {
  let score = 0;

  // Rareté (venues uniquement) — plus c'est rare, plus c'est probable
  if ('rarity' in item) {
    const rarityWeights = { common: 10, rare: 30, epic: 70, legendary: 150 };
    score += rarityWeights[item.rarity] ?? 10;
  } else {
    score += 10; // score de base pour les events
  }

  // Distance — on favorise les lieux proches
  const lat = item.lat ?? null;
  const lng = item.lng ?? null;
  if (lat != null && lng != null) {
    const km = getDistance(userLat, userLng, lat, lng) / 1000;
    if (km < 1)       score += 40;
    else if (km < 3)  score += 20;
    else if (km < 5)  score += 10;
    else if (km > 10) score -= 20;
  }

  // Rating Google Places — max +25 points pour un 5 étoiles
  if ('rating' in item && item.rating) {
    score += item.rating * 5;
  }

  // Gratuit / pas cher → bonus
  if ('price' in item && item.price === 0) score += 15;
  if ('price_level' in item && item.price_level === 1) score += 15;

  // Préférences vibe de l'utilisateur
  if (preferences.vibe === 'culturel' && item.category === 'lieu') score += 25;
  if (preferences.vibe === 'festif' && item.category === 'ambiance') score += 25;
  if (preferences.vibe === 'chill' && 'price_level' in item && (item.price_level ?? 2) <= 2) score += 10;

  return Math.max(score, 1); // score minimum de 1 pour ne jamais exclure complètement
}

// Tirage aléatoire pondéré — un score plus élevé = plus de chances d'être sélectionné
function weightedRandom<T extends { score: number }>(candidates: T[]): T {
  const total = candidates.reduce((sum, c) => sum + c.score, 0);
  let r = Math.random() * total;
  for (const c of candidates) {
    r -= c.score;
    if (r <= 0) return c;
  }
  return candidates[candidates.length - 1];
}

// ============================================================

export function useSpin() {
  const { userLocation, preferences, setReelResult, setSpinningReel, showResults, startSpin } = useGameStore();
  const [error, setError] = useState<string | null>(null);

  // Mémoire anti-repeat par reel — persiste pendant la session (pas entre les lancements)
  const recentlyShown = useRef<Record<ReelIndex, string[]>>({ 0: [], 1: [], 2: [] });

  // Ajoute un ID à la mémoire d'un reel, supprime le plus ancien si > 10
  function addToMemory(index: ReelIndex, id: string) {
    const mem = recentlyShown.current[index];
    mem.push(id);
    if (mem.length > 10) mem.shift();
  }

  // Fetch et sélectionne un résultat pour un reel donné.
  // Merge venues + events pour maximiser les candidats disponibles,
  // surtout quand la sync Google Places n'a pas encore tourné.
  async function spinSingleReel(index: ReelIndex, retryWithoutMemory = false): Promise<ReelResult> {
    const category = REEL_CATEGORIES[index];
    const { budget } = preferences;
    const { now, in48h } = getAccessibilityWindow();
    const excluded = retryWithoutMemory ? [] : recentlyShown.current[index];

    // ── Venues (lieux permanents Google Places) ─────────────────
    // price_level.is.null OR price_level <= max : on inclut les venues sans prix renseigné
    const maxLevel = BUDGET_MAX_PRICE_LEVEL[budget];
    let venueQuery = supabase
      .from('venues')
      .select('*')
      .eq('category', category)
      .eq('is_active', true)
      .or(`price_level.is.null,price_level.lte.${maxLevel}`);
    if (excluded.length > 0) {
      venueQuery = venueQuery.not('id', 'in', `(${excluded.join(',')})`);
    }

    // ── Events (Paris Open Data) — sauf pour les restaurants ────
    // Les events n'ont pas de catégorie 'restaurant', inutile de les chercher
    let eventData: SpinEvent[] = [];
    if (category !== 'restaurant') {
      let eventQuery = supabase
        .from('events')
        .select('*')
        .eq('category', category)
        .lte('start_date', in48h)
        .or(`end_date.gt.${now},end_date.is.null`)
        .lte('price', BUDGET_MAX_PRICE[budget]);
      if (excluded.length > 0) {
        eventQuery = eventQuery.not('id', 'in', `(${excluded.join(',')})`);
      }
      const { data: evData } = await eventQuery;
      eventData = (evData ?? []) as SpinEvent[];
    }

    const { data: venData, error: dbError } = await venueQuery;
    if (dbError) throw new Error(dbError.message);

    const combined: (Venue | SpinEvent)[] = [
      ...((venData ?? []) as Venue[]),
      ...eventData,
    ];

    // Fallback : si aucun résultat avec anti-repeat, on réessaie sans la mémoire
    if (combined.length === 0) {
      if (!retryWithoutMemory) return spinSingleReel(index, true);
      return null;
    }

    // Score + tirage pondéré
    const userLat = userLocation?.latitude ?? 48.8566;
    const userLng = userLocation?.longitude ?? 2.3522;

    const scored = combined.map((item) => ({
      ...item,
      score: scoreCandidate(item, userLat, userLng, preferences),
    }));

    const selected = weightedRandom(scored);
    addToMemory(index, selected.id);
    return selected;
  }

  // Spin principal appelé depuis l'UI :
  // - sans argument → spin des 3 reels (depuis HOME)
  // - avec un index → re-spin d'un seul reel (depuis RESULTS)
  async function spin(reelIndex?: ReelIndex) {
    if (!userLocation) {
      setError('Position GPS non disponible.');
      return;
    }

    setError(null);

    // Vide les résultats avant de lancer pour éviter d'afficher les anciens
    // pendant que la nouvelle animation tourne
    if (reelIndex !== undefined) {
      setReelResult(reelIndex, null);
    } else {
      setReelResult(0, null);
      setReelResult(1, null);
      setReelResult(2, null);
    }

    startSpin(reelIndex);

    try {
      if (reelIndex !== undefined) {
        // Re-spin d'un seul reel
        setSpinningReel(reelIndex);
        const result = await spinSingleReel(reelIndex);
        setReelResult(reelIndex, result);
      } else {
        // Spin des 3 reels en parallèle
        setSpinningReel(null);
        const [lieu, restaurant, ambiance] = await Promise.all([
          spinSingleReel(0),
          spinSingleReel(1),
          spinSingleReel(2),
        ]);
        setReelResult(0, lieu);
        setReelResult(1, restaurant);
        setReelResult(2, ambiance);
      }
    } catch (e) {
      setError('Erreur lors du spin. Réessaie.');
      console.error('[useSpin]', e);
    } finally {
      showResults(); // FSM : SPINNING → RESULTS
    }
  }

  return { spin, error };
}
