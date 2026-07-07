import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useGameStore } from '../store/gameStore';
import { useDataSync } from '../hooks/useDataSync';
import { useSpin } from '../hooks/useSpin';
import { useUserLocation } from '../hooks/useUserLocation';
import { supabase } from '../lib/supabase';
import SlotMachine, { SpinMode } from '../components/SlotMachine';
import VenueDetailModal from '../components/VenueDetailModal';
import PreferencesSheet from '../components/PreferencesSheet';
import { detectMode, isModePast } from '../lib/timing';
import type { ReelItem } from '../components/Reel';
import type { Venue, SpinEvent } from '../types/database';

// Sélection du créneau : 'auto' = suivre l'heure actuelle
// (detectMode / isModePast : voir lib/timing.ts)
type TimingSelection = 'auto' | SpinMode;

// Convertit un Venue ou SpinEvent en ReelItem (format attendu par Reel)
function toReelItem(item: Venue | SpinEvent | null): ReelItem | null {
  if (!item) return null;
  return {
    id: item.id,
    name: 'name' in item ? item.name : item.title,
    photo_url: item.photo_url ?? null,
  };
}

const MODES: { key: TimingSelection; label: string; emoji: string }[] = [
  { key: 'auto',    label: 'Mnt',        emoji: '✨' },
  { key: 'midi',    label: 'Déj',        emoji: '☀️' },
  { key: 'journee', label: 'Aprem',      emoji: '🌤️' },
  { key: 'soiree',  label: 'Soir',       emoji: '🌙' },
];

export default function HomeScreen() {
  const router = useRouter();
  const { syncing, ready } = useDataSync();
  const { spin, error: spinError } = useSpin();
  useUserLocation();
  const { stage, reelResults, resetEscapade, goToPlan, preferences, setSpinMode } = useGameStore();

  // Créneau initial = celui choisi à l'onboarding ('auto' = suivre l'heure).
  // Si le créneau par défaut est déjà passé aujourd'hui (ex: "Déjeuner" à 21h),
  // on retombe sur 'auto' plutôt que de proposer un créneau impossible.
  const [timingSelection, setTimingSelection] = useState<TimingSelection>(() =>
    preferences.defaultTiming !== 'auto' && isModePast(preferences.defaultTiming)
      ? 'auto'
      : preferences.defaultTiming,
  );
  const mode: SpinMode = timingSelection === 'auto' ? detectMode() : timingSelection;
  const [isSpinning, setIsSpinning] = useState(false);
  const [detailItem, setDetailItem] = useState<Venue | SpinEvent | null>(null);
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [candidates, setCandidates] = useState<{
    lieu: ReelItem[];
    table: ReelItem[];
    sortie: ReelItem[];
  }>({ lieu: [], table: [], sortie: [] });

  // Charge les candidats depuis Supabase pour peupler les reels pendant le spin
  useEffect(() => {
    if (!ready) return;
    loadCandidates();
  }, [ready, mode]);

  async function loadCandidates() {
    // Aligné sur la sync : événements de la journée uniquement
    const now = new Date().toISOString();
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);

    const [venuesRes, eventsRes] = await Promise.all([
      supabase.from('venues').select('id, name, photo_url, category').eq('is_active', true),
      supabase.from('events').select('id, title, photo_url, category')
        .eq('status', 'approved')   // curation : seuls les événements validés
        .lte('start_date', endOfToday.toISOString())
        .or(`end_date.gt.${now},end_date.is.null`),
    ]);

    const venues = (venuesRes.data ?? []) as Venue[];
    const events = (eventsRes.data ?? []) as SpinEvent[];

    setCandidates({
      lieu: [...venues.filter(v => v.category === 'lieu'), ...events.filter(e => e.category === 'lieu')]
        .map(i => ({ id: i.id, name: 'name' in i ? i.name : i.title, photo_url: i.photo_url ?? null })),
      table: venues.filter(v => v.category === 'restaurant')
        .map(v => ({ id: v.id, name: v.name, photo_url: v.photo_url ?? null })),
      sortie: [...venues.filter(v => v.category === 'ambiance'), ...events.filter(e => e.category === 'ambiance')]
        .map(i => ({ id: i.id, name: 'name' in i ? i.name : i.title, photo_url: i.photo_url ?? null })),
    });
  }

  async function handleSpin(reelIndex?: 0 | 1 | 2) {
    setIsSpinning(true);
    setSpinMode(mode); // mémorise le créneau pour la timeline du plan
    await spin(reelIndex, mode);
    // useSpin appelle showResults() qui met à jour le stage
    // On attend la fin des animations (géré dans Reel via stopDelay)
    // Reel 2 finit à 1400ms (stopDelay) + 1550ms (phases) = 2950ms → on attend 3200ms
    setTimeout(() => setIsSpinning(false), 3200);
  }

  function handleValidate() {
    goToPlan();
    router.push('/plan');
    // Crée la ligne escapade en arrière-plan (non bloquant pour la navigation).
    // L'id arrive bien avant le check-in, qui l'utilise pour lier les tampons.
    createEscapade();
  }

  // Insère l'escapade en DB et mémorise son id dans le store.
  // Les reels lieu/ambiance peuvent être des venues OU des events :
  // on ne remplit que les colonnes du bon type (les autres restent null).
  async function createEscapade() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const [lieu, table, sortie] = reelResults;
      const isVenue = (i: Venue | SpinEvent | null): i is Venue => !!i && 'name' in i;
      const isEvent = (i: Venue | SpinEvent | null): i is SpinEvent => !!i && 'title' in i;

      const { data, error } = await supabase
        .from('escapades')
        .insert({
          user_id:       user.id,
          venue_id:      isVenue(lieu) ? lieu.id : null,
          restaurant_id: isVenue(table) ? table.id : null,
          event_id:      isEvent(sortie) ? sortie.id : isEvent(lieu) ? lieu.id : null,
          status:        'accepted',
        })
        .select('id')
        .single();

      if (error) {
        console.warn('[escapade] insert error:', error.message);
        return;
      }
      if (data?.id) useGameStore.getState().setCurrentEscapadeId(data.id);
    } catch (e) {
      console.warn('[escapade] create error:', e);
    }
  }

  function handleReelPress(index: 0 | 1 | 2) {
    const result = reelResults[index];
    if (result) setDetailItem(result);
  }

  // Écran de chargement pendant la sync des données
  if (!ready) {
    return (
      <View style={styles.loading}>
        <Text style={styles.loadingEmoji}>🎰</Text>
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
          <TouchableOpacity onPress={() => setPrefsOpen(true)} style={styles.profileBtn}>
            <Text style={styles.profileIcon}>🎛️</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Spin</Text>
          <TouchableOpacity onPress={() => router.push('/profile')} style={styles.profileBtn}>
            <Text style={styles.profileIcon}>👤</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.subtitle}>Paris en 3 secondes.</Text>
      </View>

      {/* Sélecteur de mode — les créneaux déjà passés aujourd'hui sont désactivés */}
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

      {/* Machine à sous */}
      <View style={styles.machine}>
        <SlotMachine
          mode={mode}
          candidates={candidates}
          results={{
            lieu:   toReelItem(reelResults[0]),
            table:  toReelItem(reelResults[1]),
            sortie: toReelItem(reelResults[2]),
          }}
          isSpinning={isSpinning}
          onSpin={handleSpin}
          onValidate={handleValidate}
          onReelPress={handleReelPress}
        />
        <VenueDetailModal
          item={detailItem}
          visible={detailItem !== null}
          onClose={() => setDetailItem(null)}
        />
        <PreferencesSheet
          visible={prefsOpen}
          onClose={() => setPrefsOpen(false)}
        />
      </View>

      {/* Erreur spin */}
      {spinError && (
        <Text style={styles.error}>{spinError}</Text>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0a0a16',
  },
  loading: {
    flex: 1,
    backgroundColor: '#0a0a16',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingEmoji: {
    fontSize: 64,
  },
  loadingText: {
    color: 'rgba(255,255,255,0.5)',
    marginTop: 16,
    fontSize: 14,
  },
  header: {
    paddingTop: 16,
    paddingBottom: 8,
    paddingHorizontal: 24,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    color: '#fff',
    fontSize: 36,
    fontWeight: '900',
    letterSpacing: 2,
    flex: 1,
    textAlign: 'center',
  },
  profileBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.07)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileIcon: { fontSize: 16 },
  subtitle: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 13,
    letterSpacing: 1,
    textAlign: 'center',
    marginTop: 2,
  },
  modeSelector: {
    flexDirection: 'row',
    marginHorizontal: 24,
    marginVertical: 16,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 14,
    padding: 4,
    gap: 4,
  },
  modeBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  modeBtnActive: {
    backgroundColor: '#7C3AED',
  },
  modeBtnDisabled: {
    opacity: 0.35,
  },
  modeDisabledText: {
    color: 'rgba(255,255,255,0.25)',
  },
  modeEmoji: {
    fontSize: 14,
  },
  modeLabel: {
    color: 'rgba(255,255,255,0.4)',
    fontWeight: '600',
    fontSize: 13,
  },
  modeLabelActive: {
    color: '#fff',
  },
  machine: {
    flex: 1,
    justifyContent: 'center',
  },
  error: {
    color: '#f87171',
    textAlign: 'center',
    padding: 16,
    fontSize: 13,
  },
});
