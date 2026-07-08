// ─────────────────────────────────────────────────────────────
// Accueil — composer son escapade
//
// L'utilisateur voit 3 rangées (activité / table / sortie),
// chacune ordonnée du meilleur match au moins bon selon ses
// préférences. Il swipe chaque rangée pour changer de proposition,
// puis valide : la sélection = les 3 cartes visibles.
// ─────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, SafeAreaView,
  ActivityIndicator, ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useGameStore } from '../store/gameStore';
import { useDataSync } from '../hooks/useDataSync';
import { useItemLists } from '../hooks/useItemLists';
import { useUserLocation } from '../hooks/useUserLocation';
import { supabase } from '../lib/supabase';
import SlotRow from '../components/SlotRow';
import VenueDetailModal from '../components/VenueDetailModal';
import PreferencesSheet from '../components/PreferencesSheet';
import { detectMode, isModePast, type SpinMode } from '../lib/timing';
import type { Item } from '../types/database';

// Sélection du créneau : 'auto' = suivre l'heure actuelle
type TimingSelection = 'auto' | SpinMode;

const MODES: { key: TimingSelection; label: string; emoji: string }[] = [
  { key: 'auto',    label: 'Mnt',   emoji: '✨' },
  { key: 'midi',    label: 'Déj',   emoji: '☀️' },
  { key: 'journee', label: 'Aprem', emoji: '🌤️' },
  { key: 'soiree',  label: 'Soir',  emoji: '🌙' },
];

const ROWS = [
  { emoji: '🎭', label: 'Activité', color: '#a78bfa' },
  { emoji: '🍽️', label: 'Table',    color: '#fb923c' },
  { emoji: '🎶', label: 'Sortie',   color: '#f472b6' },
] as const;

export default function HomeScreen() {
  const router = useRouter();
  const { syncing, ready } = useDataSync();
  useUserLocation();
  const { reelResults, setReelResult, resetEscapade, goToPlan, preferences, setSpinMode } = useGameStore();

  // Créneau initial = celui de l'onboarding, sauf s'il est déjà passé aujourd'hui
  const [timingSelection, setTimingSelection] = useState<TimingSelection>(() =>
    preferences.defaultTiming !== 'auto' && isModePast(preferences.defaultTiming)
      ? 'auto'
      : preferences.defaultTiming,
  );
  const mode: SpinMode = timingSelection === 'auto' ? detectMode() : timingSelection;

  const { lists, loading, error } = useItemLists(mode, ready);
  const [detailItem, setDetailItem] = useState<Item | null>(null);
  const [prefsOpen, setPrefsOpen] = useState(false);

  // Quand les listes (re)chargent, la première carte de chaque rangée
  // devient la sélection par défaut
  useEffect(() => {
    setReelResult(0, lists.activite[0] ?? null);
    setReelResult(1, lists.table[0] ?? null);
    setReelResult(2, lists.sortie[0] ?? null);
  }, [lists]);

  const selectionCount = reelResults.filter(Boolean).length;
  const canValidate = selectionCount > 0;

  function handleValidate() {
    setSpinMode(mode);      // mémorise le créneau pour la timeline du plan
    goToPlan();             // FSM : HOME → PLAN
    router.push('/plan');
    createEscapade();       // en arrière-plan, non bloquant
  }

  // Insère l'escapade + ses étapes ordonnées (escapade_items),
  // puis mémorise son id dans le store pour lier les tampons.
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

      const steps = reelResults
        .map((item, i) => (item ? { escapade_id: data.id, item_id: item.id, position: i + 1 } : null))
        .filter(Boolean) as { escapade_id: string; item_id: string; position: number }[];

      if (steps.length) {
        const { error: stepsError } = await supabase.from('escapade_items').insert(steps);
        if (stepsError) console.warn('[escapade] items insert error:', stepsError.message);
      }

      useGameStore.getState().setCurrentEscapadeId(data.id);
    } catch (e) {
      console.warn('[escapade] create error:', e);
    }
  }

  // Écran de chargement pendant la sync des données
  if (!ready) {
    return (
      <View style={styles.loading}>
        <Text style={styles.loadingEmoji}>🗼</Text>
        <ActivityIndicator color="#7C3AED" size="large" style={{ marginTop: 16 }} />
        <Text style={styles.loadingText}>
          {syncing ? 'Préparation de ton escapade...' : 'Chargement...'}
        </Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.root}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => setPrefsOpen(true)} style={styles.iconBtn}>
            <Text style={styles.iconText}>🎛️</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Spin</Text>
          <TouchableOpacity onPress={() => router.push('/profile')} style={styles.iconBtn}>
            <Text style={styles.iconText}>👤</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.subtitle}>Compose ta journée à Paris</Text>
      </View>

      {/* Sélecteur de créneau — les créneaux passés sont désactivés */}
      <View style={styles.modeSelector}>
        {MODES.map(m => {
          const isPast = m.key !== 'auto' && isModePast(m.key);
          return (
            <TouchableOpacity
              key={m.key}
              style={[
                styles.modeBtn,
                timingSelection === m.key && styles.modeBtnActive,
                isPast && styles.modeBtnDisabled,
              ]}
              disabled={isPast}
              onPress={() => { setTimingSelection(m.key); resetEscapade(); }}
            >
              <Text style={[styles.modeEmoji, isPast && styles.modeDisabledText]}>{m.emoji}</Text>
              <Text style={[
                styles.modeLabel,
                timingSelection === m.key && styles.modeLabelActive,
                isPast && styles.modeDisabledText,
              ]}>
                {m.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Les 3 rangées */}
      {loading ? (
        <View style={styles.listLoading}>
          <ActivityIndicator color="#7C3AED" />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.rows} showsVerticalScrollIndicator={false}>
          <SlotRow
            {...ROWS[0]}
            items={lists.activite}
            onSelect={item => setReelResult(0, item)}
            onPressItem={setDetailItem}
          />
          <SlotRow
            {...ROWS[1]}
            items={lists.table}
            onSelect={item => setReelResult(1, item)}
            onPressItem={setDetailItem}
          />
          <SlotRow
            {...ROWS[2]}
            items={lists.sortie}
            onSelect={item => setReelResult(2, item)}
            onPressItem={setDetailItem}
          />
        </ScrollView>
      )}

      {/* Erreur */}
      {error && <Text style={styles.error}>{error}</Text>}

      {/* Valider */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.validateBtn, !canValidate && styles.validateBtnDisabled]}
          disabled={!canValidate}
          onPress={handleValidate}
        >
          <Text style={styles.validateText}>
            {canValidate
              ? `C'est parti  ·  ${selectionCount} étape${selectionCount > 1 ? 's' : ''}  →`
              : 'Aucune proposition disponible'}
          </Text>
        </TouchableOpacity>
      </View>

      <VenueDetailModal
        item={detailItem}
        visible={detailItem !== null}
        onClose={() => setDetailItem(null)}
      />
      <PreferencesSheet
        visible={prefsOpen}
        onClose={() => setPrefsOpen(false)}
      />
    </SafeAreaView>
  );
}

// ─────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0a0a16' },

  loading: {
    flex: 1, backgroundColor: '#0a0a16',
    alignItems: 'center', justifyContent: 'center',
  },
  loadingEmoji: { fontSize: 64 },
  loadingText:  { color: 'rgba(255,255,255,0.5)', marginTop: 16, fontSize: 14 },
  listLoading:  { flex: 1, alignItems: 'center', justifyContent: 'center' },

  header: { paddingTop: 12, paddingBottom: 4, paddingHorizontal: 20 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  title: {
    color: '#fff', fontSize: 32, fontWeight: '900', letterSpacing: 2,
    flex: 1, textAlign: 'center',
  },
  iconBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.07)',
    alignItems: 'center', justifyContent: 'center',
  },
  iconText: { fontSize: 16 },
  subtitle: {
    color: 'rgba(255,255,255,0.4)', fontSize: 13,
    textAlign: 'center', marginTop: 2,
  },

  modeSelector: {
    flexDirection: 'row',
    marginHorizontal: 16, marginVertical: 12,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 14, padding: 4, gap: 4,
  },
  modeBtn: {
    flex: 1, alignItems: 'center', paddingVertical: 9,
    borderRadius: 10, flexDirection: 'row', justifyContent: 'center', gap: 5,
  },
  modeBtnActive:   { backgroundColor: '#7C3AED' },
  modeBtnDisabled: { opacity: 0.35 },
  modeEmoji: { fontSize: 13 },
  modeLabel: { color: 'rgba(255,255,255,0.4)', fontWeight: '600', fontSize: 13 },
  modeLabelActive:  { color: '#fff' },
  modeDisabledText: { color: 'rgba(255,255,255,0.25)' },

  rows: { gap: 18, paddingBottom: 16 },

  error: { color: '#f87171', textAlign: 'center', padding: 10, fontSize: 13 },

  footer: { paddingHorizontal: 16, paddingBottom: 10, paddingTop: 4 },
  validateBtn: {
    backgroundColor: '#7C3AED', borderRadius: 16,
    paddingVertical: 16, alignItems: 'center',
  },
  validateBtnDisabled: { backgroundColor: 'rgba(124,58,237,0.25)' },
  validateText: { color: '#fff', fontWeight: '800', fontSize: 16 },
});
