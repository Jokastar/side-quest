// ─────────────────────────────────────────────────────────────
// Accueil — composer sa journée librement.
//
// Navigation dans le catalogue du jour :
//   · chips de créneau (quand ?)  → filtrent la disponibilité
//   · onglets de slot (quoi ?)    → Activité / Table / Sortie
//   · chips de catégorie          → affinent dans l'onglet
//   · grille 2 colonnes           → triée par pertinence (scoring)
//
// L'utilisateur AJOUTE jusqu'à 3 items (tous types confondus) via
// le + des cartes. La barre du bas montre la sélection et valide :
// l'itinéraire s'ordonnera ensuite chronologiquement (plan.tsx).
// ─────────────────────────────────────────────────────────────

import { useMemo, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ActivityIndicator, FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useGameStore, MAX_SELECTION } from '../store/gameStore';
import { useDataSync } from '../hooks/useDataSync';
import { useItemLists } from '../hooks/useItemLists';
import { useUserLocation } from '../hooks/useUserLocation';
import { supabase } from '../lib/supabase';
import ItemGridCard from '../components/ItemGridCard';
import VenueDetailModal from '../components/VenueDetailModal';
import PreferencesSheet from '../components/PreferencesSheet';
import { detectMode, isModePast, type SpinMode } from '../lib/timing';
import { CATEGORY_LABEL } from '../lib/items';
import type { Item, Slot, Category } from '../types/database';

// ── Config des filtres ────────────────────────────────────────

type TimingSelection = 'auto' | SpinMode;

const MODES: { key: TimingSelection; label: string; emoji: string }[] = [
  { key: 'auto',    label: 'Mnt',   emoji: '✨' },
  { key: 'midi',    label: 'Déj',   emoji: '☀️' },
  { key: 'journee', label: 'Aprem', emoji: '🌤️' },
  { key: 'soiree',  label: 'Soir',  emoji: '🌙' },
];

const SLOT_TABS: { key: Slot; label: string; emoji: string; color: string }[] = [
  { key: 'activite', label: 'Activité', emoji: '🎭', color: '#a78bfa' },
  { key: 'table',    label: 'Table',    emoji: '🍽️', color: '#fb923c' },
  { key: 'sortie',   label: 'Sortie',   emoji: '🎶', color: '#f472b6' },
];

// Chips de catégorie proposées dans chaque onglet
const SLOT_CATEGORIES: Record<Slot, Category[]> = {
  activite: ['culture', 'loisir', 'plein_air'],
  table:    ['food'],                       // une seule catégorie → pas de chips
  sortie:   ['bar', 'club', 'concert'],
};

export default function HomeScreen() {
  const router = useRouter();
  const { syncing, ready } = useDataSync();
  useUserLocation();
  const {
    selection, addToSelection, removeFromSelection,
    resetEscapade, goToPlan, preferences, setSpinMode,
  } = useGameStore();

  // ── Filtres actifs ──────────────────────────────────────────

  // Créneau initial = celui de l'onboarding, sauf s'il est déjà passé
  const [timingSelection, setTimingSelection] = useState<TimingSelection>(() =>
    preferences.defaultTiming !== 'auto' && isModePast(preferences.defaultTiming)
      ? 'auto'
      : preferences.defaultTiming,
  );
  const mode: SpinMode = timingSelection === 'auto' ? detectMode() : timingSelection;

  const [activeSlot, setActiveSlot] = useState<Slot>('activite');
  const [activeCategory, setActiveCategory] = useState<Category | 'all'>('all');

  const { lists, loading, error } = useItemLists(mode, ready);
  const [detailItem, setDetailItem] = useState<Item | null>(null);
  const [prefsOpen, setPrefsOpen] = useState(false);

  // Items de l'onglet actif, éventuellement filtrés par catégorie.
  // (les listes arrivent déjà triées par pertinence depuis useItemLists)
  const gridItems = useMemo(() => {
    const list = lists[activeSlot];
    return activeCategory === 'all' ? list : list.filter(i => i.category === activeCategory);
  }, [lists, activeSlot, activeCategory]);

  const isFull = selection.length >= MAX_SELECTION;
  const selectedIds = new Set(selection.map(i => i.id));

  // ── Actions ─────────────────────────────────────────────────

  function toggleItem(item: Item) {
    if (selectedIds.has(item.id)) removeFromSelection(item.id);
    else addToSelection(item);
  }

  function handleValidate() {
    setSpinMode(mode);   // mémorise le créneau (timeline + tri chrono du plan)
    goToPlan();          // FSM : HOME → PLAN
    router.push('/plan');
    createEscapade();    // en arrière-plan, non bloquant
  }

  // Insère l'escapade + ses étapes ordonnées, mémorise son id
  // (l'id lie les tampons de la soirée entre eux)
  async function createEscapade() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error: insertError } = await supabase
        .from('escapades')
        .insert({ user_id: user.id, status: 'accepted' })
        .select('id')
        .single();

      if (insertError || !data?.id) {
        console.warn('[escapade] insert error:', insertError?.message);
        return;
      }

      const steps = selection.map((item, i) => ({
        escapade_id: data.id,
        item_id: item.id,
        position: i + 1,
      }));
      if (steps.length) {
        const { error: stepsError } = await supabase.from('escapade_items').insert(steps);
        if (stepsError) console.warn('[escapade] items insert error:', stepsError.message);
      }

      useGameStore.getState().setCurrentEscapadeId(data.id);
    } catch (e) {
      console.warn('[escapade] create error:', e);
    }
  }

  // ── Rendu ───────────────────────────────────────────────────

  if (!ready) {
    return (
      <View style={styles.loading}>
        <Text style={styles.loadingEmoji}>🗼</Text>
        <ActivityIndicator color="#7C3AED" size="large" style={{ marginTop: 16 }} />
        <Text style={styles.loadingText}>
          {syncing ? 'Préparation de ta journée...' : 'Chargement...'}
        </Text>
      </View>
    );
  }

  const categories = SLOT_CATEGORIES[activeSlot];
  const activeSlotColor = SLOT_TABS.find(t => t.key === activeSlot)!.color;

  return (
    <SafeAreaView style={styles.root}>
      {/* Header */}
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => setPrefsOpen(true)} style={styles.iconBtn}>
          <Text style={styles.iconText}>🎛️</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Spin</Text>
        <TouchableOpacity onPress={() => router.push('/profile')} style={styles.iconBtn}>
          <Text style={styles.iconText}>👤</Text>
        </TouchableOpacity>
      </View>

      {/* Créneau — quand est-ce que je sors ? */}
      <View style={styles.modeSelector}>
        {MODES.map(m => {
          const isPast = m.key !== 'auto' && isModePast(m.key);
          return (
            <TouchableOpacity
              key={m.key}
              style={[
                styles.modeBtn,
                timingSelection === m.key && styles.modeBtnActive,
                isPast && styles.disabled,
              ]}
              disabled={isPast}
              onPress={() => { setTimingSelection(m.key); resetEscapade(); }}
            >
              <Text style={styles.modeEmoji}>{m.emoji}</Text>
              <Text style={[styles.modeLabel, timingSelection === m.key && styles.modeLabelActive]}>
                {m.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Onglets de slot — qu'est-ce que je cherche ? */}
      <View style={styles.slotTabs}>
        {SLOT_TABS.map(t => (
          <TouchableOpacity
            key={t.key}
            style={[styles.slotTab, activeSlot === t.key && { borderBottomColor: t.color }]}
            onPress={() => { setActiveSlot(t.key); setActiveCategory('all'); }}
          >
            <Text style={[
              styles.slotTabText,
              activeSlot === t.key && { color: t.color },
            ]}>
              {t.emoji} {t.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Chips de catégorie (masquées si l'onglet n'en a qu'une) */}
      {categories.length > 1 && (
        <View style={styles.catChips}>
          <CatChip label="Tout" active={activeCategory === 'all'} color={activeSlotColor}
            onPress={() => setActiveCategory('all')} />
          {categories.map(c => (
            <CatChip key={c} label={CATEGORY_LABEL[c]} active={activeCategory === c} color={activeSlotColor}
              onPress={() => setActiveCategory(c)} />
          ))}
        </View>
      )}

      {/* Grille */}
      {loading ? (
        <View style={styles.listLoading}><ActivityIndicator color="#7C3AED" /></View>
      ) : (
        <FlatList
          data={gridItems}
          keyExtractor={i => i.id}
          numColumns={2}
          columnWrapperStyle={{ gap: 10 }}
          contentContainerStyle={styles.grid}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <Text style={styles.empty}>🫥 Rien de disponible sur ce créneau</Text>
          }
          renderItem={({ item }) => (
            <ItemGridCard
              item={item}
              selected={selectedIds.has(item.id)}
              full={isFull}
              onPress={() => setDetailItem(item)}
              onToggle={() => toggleItem(item)}
            />
          )}
        />
      )}

      {error && <Text style={styles.error}>{error}</Text>}

      {/* Barre de sélection — la journée en cours de composition */}
      <View style={styles.footer}>
        <View style={styles.selectionRow}>
          {selection.map(item => (
            <TouchableOpacity
              key={item.id}
              style={styles.selectionChip}
              onPress={() => removeFromSelection(item.id)}
            >
              <Text style={styles.selectionChipText} numberOfLines={1}>
                {SLOT_TABS.find(t => t.key === item.slot)?.emoji} {item.name}
              </Text>
              <Text style={styles.selectionRemove}>✕</Text>
            </TouchableOpacity>
          ))}
          {selection.length === 0 && (
            <Text style={styles.selectionHint}>Ajoute jusqu'à {MAX_SELECTION} étapes avec le +</Text>
          )}
        </View>

        <TouchableOpacity
          style={[styles.validateBtn, selection.length === 0 && styles.disabled]}
          disabled={selection.length === 0}
          onPress={handleValidate}
        >
          <Text style={styles.validateText}>
            C'est parti · {selection.length}/{MAX_SELECTION} →
          </Text>
        </TouchableOpacity>
      </View>

      <VenueDetailModal
        item={detailItem}
        visible={detailItem !== null}
        onClose={() => setDetailItem(null)}
      />
      <PreferencesSheet visible={prefsOpen} onClose={() => setPrefsOpen(false)} />
    </SafeAreaView>
  );
}

// ── Chip de catégorie ─────────────────────────────────────────

function CatChip({ label, active, color, onPress }: {
  label: string; active: boolean; color: string; onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.chip, active && { backgroundColor: color + '26', borderColor: color }]}
      onPress={onPress}
    >
      <Text style={[styles.chipText, active && { color }]}>{label}</Text>
    </TouchableOpacity>
  );
}

// ─────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0a0a16' },

  loading: { flex: 1, backgroundColor: '#0a0a16', alignItems: 'center', justifyContent: 'center' },
  loadingEmoji: { fontSize: 64 },
  loadingText: { color: 'rgba(255,255,255,0.5)', marginTop: 16, fontSize: 14 },
  listLoading: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  headerRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 20, paddingTop: 8,
  },
  title: { color: '#fff', fontSize: 28, fontWeight: '900', letterSpacing: 2, flex: 1, textAlign: 'center' },
  iconBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.07)',
    alignItems: 'center', justifyContent: 'center',
  },
  iconText: { fontSize: 16 },

  modeSelector: {
    flexDirection: 'row',
    marginHorizontal: 16, marginTop: 10,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 14, padding: 4, gap: 4,
  },
  modeBtn: {
    flex: 1, alignItems: 'center', paddingVertical: 8,
    borderRadius: 10, flexDirection: 'row', justifyContent: 'center', gap: 5,
  },
  modeBtnActive: { backgroundColor: '#7C3AED' },
  modeEmoji: { fontSize: 12 },
  modeLabel: { color: 'rgba(255,255,255,0.4)', fontWeight: '600', fontSize: 12.5 },
  modeLabelActive: { color: '#fff' },

  slotTabs: { flexDirection: 'row', marginTop: 12, paddingHorizontal: 16 },
  slotTab: {
    flex: 1, alignItems: 'center', paddingVertical: 10,
    borderBottomWidth: 2, borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  slotTabText: { color: 'rgba(255,255,255,0.35)', fontSize: 14, fontWeight: '800' },

  catChips: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 10 },
  chip: {
    borderRadius: 18, paddingHorizontal: 13, paddingVertical: 6,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
  },
  chipText: { color: 'rgba(255,255,255,0.45)', fontSize: 12.5, fontWeight: '700' },

  grid: { padding: 16, gap: 10, paddingBottom: 12 },
  empty: { color: 'rgba(255,255,255,0.3)', textAlign: 'center', marginTop: 48, fontSize: 14 },

  error: { color: '#f87171', textAlign: 'center', padding: 8, fontSize: 13 },

  footer: {
    borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.07)',
    paddingHorizontal: 16, paddingTop: 10, paddingBottom: 8, gap: 10,
  },
  selectionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, minHeight: 26 },
  selectionChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#1b1b3a', borderRadius: 14,
    paddingHorizontal: 10, paddingVertical: 5,
    maxWidth: '48%',
  },
  selectionChipText: { color: '#fff', fontSize: 12, fontWeight: '600', flexShrink: 1 },
  selectionRemove: { color: 'rgba(255,255,255,0.4)', fontSize: 11, fontWeight: '800' },
  selectionHint: { color: 'rgba(255,255,255,0.25)', fontSize: 12.5, paddingVertical: 5 },

  validateBtn: {
    backgroundColor: '#7C3AED', borderRadius: 14,
    paddingVertical: 14, alignItems: 'center',
  },
  validateText: { color: '#fff', fontWeight: '800', fontSize: 15.5 },

  disabled: { opacity: 0.35 },
});
