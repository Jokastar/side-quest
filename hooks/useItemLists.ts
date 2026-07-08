import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useGameStore } from '../store/gameStore';
import { getDistance } from './useProximityCheck';
import { modeWindow, type SpinMode } from '../lib/timing';
import type { Item, Slot, UserPreferences } from '../types/database';

// ============================================================
// Les listes du jour — remplace la machine à sous.
//
// Pour chaque rangée (activité / table / sortie), on charge les
// items disponibles pendant le créneau choisi, on les SCORE selon
// les préférences, et on les TRIE : le meilleur match est la
// première carte, l'utilisateur swipe pour explorer la suite.
// ============================================================

const ROW_SLOTS: [Slot, Slot, Slot] = ['activite', 'table', 'sortie'];

// ── Budget ───────────────────────────────────────────────────

function maxPriceLevel(maxPrice: number | null): number {
  if (maxPrice === null) return 3;
  if (maxPrice === 0) return 1;
  if (maxPrice <= 15) return 2;
  return 3;
}

// Le candidat rentre-t-il dans le budget ?
// Éphémères : prix en euros · permanents : price_level 1-3.
// Un item sans info de prix passe (on ne peut pas juger).
function fitsBudget(item: Item, maxPrice: number | null): boolean {
  if (maxPrice === null) return true;
  if (item.price != null) return item.price <= maxPrice;
  if (item.price_level != null) return item.price_level <= maxPriceLevel(maxPrice);
  return true;
}

// ── Scoring = ordre de présentation ──────────────────────────
// Plus le score est haut, plus la carte apparaît tôt dans la rangée.

function scoreItem(
  item: Item,
  userLat: number,
  userLng: number,
  preferences: UserPreferences,
): number {
  let score = 0;

  // Rareté — les pépites curées remontent en tête
  const rarityWeights = { common: 10, rare: 30, epic: 70, legendary: 150 };
  score += rarityWeights[item.rarity] ?? 10;

  // Distance — on favorise les lieux proches
  if (item.lat != null && item.lng != null) {
    const km = getDistance(userLat, userLng, item.lat, item.lng) / 1000;
    if (km < 1)       score += 40;
    else if (km < 3)  score += 20;
    else if (km < 5)  score += 10;
    else if (km > 10) score -= 20;
  }

  // Rating — max +25 points pour un 5 étoiles
  if (item.rating) score += item.rating * 5;

  // Gratuit / pas cher → bonus
  if (item.price === 0) score += 15;
  if (item.price_level === 1) score += 15;

  // Vibe de l'utilisateur
  if (preferences.vibe === 'culturel' && item.category === 'culture') score += 25;
  if (preferences.vibe === 'festif' && (item.category === 'club' || item.category === 'concert')) score += 25;
  if (preferences.vibe === 'chill' && (item.category === 'bar' || item.category === 'plein_air')) score += 15;

  return score;
}

// ── Le hook ──────────────────────────────────────────────────

export interface ItemLists {
  activite: Item[];
  table: Item[];
  sortie: Item[];
}

export function useItemLists(mode: SpinMode, ready: boolean) {
  const { userLocation, preferences } = useGameStore();
  const [lists, setLists] = useState<ItemLists>({ activite: [], table: [], sortie: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const window = modeWindow(mode);

      // UNE requête : tous les items approuvés disponibles pendant le créneau.
      // Permanent = toujours dispo · éphémère = doit chevaucher la fenêtre.
      const { data, error: dbError } = await supabase
        .from('items')
        .select('*')
        .eq('status', 'approved')
        .eq('is_active', true)
        .or(
          `nature.eq.permanent,` +
          `and(start_date.lte.${window.end.toISOString()},` +
          `or(end_date.gte.${window.start.toISOString()},end_date.is.null))`,
        );
      if (dbError) throw new Error(dbError.message);

      const userLat = userLocation?.latitude ?? 48.8566;
      const userLng = userLocation?.longitude ?? 2.3522;

      // Budget en JS (le prix vit dans 2 colonnes selon la nature),
      // puis score → tri décroissant : le meilleur match en première carte
      const usable = ((data ?? []) as Item[])
        .filter(i => fitsBudget(i, preferences.maxPrice));

      const sorted = (slot: Slot) =>
        usable
          .filter(i => i.slot === slot)
          .map(i => ({ item: i, score: scoreItem(i, userLat, userLng, preferences) }))
          .sort((a, b) => b.score - a.score)
          .map(s => s.item);

      setLists({
        activite: sorted(ROW_SLOTS[0]),
        table:    sorted(ROW_SLOTS[1]),
        sortie:   sorted(ROW_SLOTS[2]),
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error('[useItemLists]', message);
      setError('Impossible de charger les propositions. Réessaie.');
    } finally {
      setLoading(false);
    }
  }, [mode, preferences, userLocation?.latitude, userLocation?.longitude]);

  // Recharge quand les données sont prêtes, ou quand créneau/prefs changent
  useEffect(() => {
    if (!ready) return;
    load();
    // volontairement PAS de reload sur chaque tick GPS : la position
    // au moment du chargement suffit pour ordonner les listes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, mode, preferences]);

  return { lists, loading, error, refresh: load };
}
