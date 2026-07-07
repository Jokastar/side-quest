// ─────────────────────────────────────────────────────────────
// Onboarding — 4 étapes, une seule fois
//
//   0. Bienvenue / proposition de valeur
//   1. Permission GPS (avec contexte avant le prompt OS)
//   2. Préférences : créneau par défaut, groupe, budget/pers, vibe
//   3. Récap + "C'est parti"
//
// Chaque étape est passable — les défauts sont déjà bons.
// À la fin : prefs sauvées en SecureStore + hasOnboarded = true.
// ─────────────────────────────────────────────────────────────

import { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, SafeAreaView, ScrollView,
} from 'react-native';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { useGameStore } from '../store/gameStore';
import { saveStoredPrefs } from '../lib/prefsStorage';
import {
  OptionCard, TIMING_OPTIONS, GROUP_OPTIONS, PRICE_OPTIONS, VIBE_OPTIONS,
} from '../components/PreferencesSheet';
import type { UserPreferences, MaxPrice, GroupSize, Vibe, DefaultTiming } from '../types/database';

// ── Écran principal ───────────────────────────────────────────

export default function OnboardingScreen() {
  const router = useRouter();
  const { preferences, setPreferences, setHasOnboarded, finishOnboarding } = useGameStore();

  const [step, setStep] = useState(0);
  const [gpsStatus, setGpsStatus] = useState<'idle' | 'granted' | 'denied'>('idle');

  // Sélections locales (initialisées depuis le store = défauts)
  const [timing, setTiming]       = useState<DefaultTiming>(preferences.defaultTiming);
  const [groupSize, setGroupSize] = useState<GroupSize>(preferences.groupSize);
  const [maxPrice, setMaxPrice]   = useState<MaxPrice>(preferences.maxPrice);
  const [vibe, setVibe]           = useState<Vibe>(preferences.vibe);

  async function requestGps() {
    const { status } = await Location.requestForegroundPermissionsAsync();
    setGpsStatus(status === 'granted' ? 'granted' : 'denied');
    // On avance dans les deux cas — l'app gère le GPS manquant plus tard
    setStep(2);
  }

  async function finish() {
    const prefs: UserPreferences = {
      maxPrice,
      groupSize,
      vibe,
      distance: preferences.distance,
      defaultTiming: timing,
    };

    setPreferences(prefs);
    setHasOnboarded(true);
    finishOnboarding(); // FSM : ONBOARDING → HOME
    await saveStoredPrefs({ preferences: prefs, hasOnboarded: true });

    router.replace('/');
  }

  // Progression (pas de barre sur l'étape 0, c'est le splash)
  const showProgress = step > 0;

  return (
    <SafeAreaView style={styles.root}>

      {/* Barre de progression */}
      {showProgress && (
        <View style={styles.progressRow}>
          {[1, 2, 3].map(i => (
            <View key={i} style={[styles.progressDot, step >= i && styles.progressDotActive]} />
          ))}
        </View>
      )}

      {/* ── Étape 0 : Bienvenue ─────────────────────────────── */}
      {step === 0 && (
        <View style={styles.stepCentered}>
          <Text style={styles.splashEmoji}>🎰</Text>
          <Text style={styles.splashTitle}>Spin</Text>
          <Text style={styles.splashTagline}>Paris en 3 secondes.{'\n'}Ce soir.</Text>
          <Text style={styles.splashDetail}>
            Un lieu, une table, une sortie —{'\n'}tirés au sort pour toi. Tu valides, tu y vas.
          </Text>
          <TouchableOpacity style={styles.primaryBtn} onPress={() => setStep(1)}>
            <Text style={styles.primaryBtnText}>Commencer</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Étape 1 : GPS ───────────────────────────────────── */}
      {step === 1 && (
        <View style={styles.stepCentered}>
          <Text style={styles.stepEmoji}>📍</Text>
          <Text style={styles.stepTitle}>Où es-tu dans Paris ?</Text>
          <Text style={styles.stepText}>
            Ta position sert à te proposer des lieux proches{'\n'}
            et à valider tes check-ins sur place.{'\n\n'}
            Elle n'est jamais partagée.
          </Text>
          <TouchableOpacity style={styles.primaryBtn} onPress={requestGps}>
            <Text style={styles.primaryBtnText}>Activer le GPS</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.skipBtn} onPress={() => setStep(2)}>
            <Text style={styles.skipText}>Plus tard</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Étape 2 : Préférences ───────────────────────────── */}
      {step === 2 && (
        <ScrollView style={styles.stepScroll} contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
          <Text style={styles.stepTitle}>Tes escapades, ta façon</Text>
          <Text style={styles.stepSubtitle}>Modifiable à tout moment — choisis vite, spin vite.</Text>

          <Text style={styles.sectionLabel}>TU SORS PLUTÔT…</Text>
          <View style={styles.optionGrid}>
            {TIMING_OPTIONS.map(o => (
              <OptionCard key={String(o.value)} {...o} selected={timing === o.value} onPress={() => setTiming(o.value)} />
            ))}
          </View>

          <Text style={styles.sectionLabel}>AVEC QUI ?</Text>
          <View style={styles.optionGrid}>
            {GROUP_OPTIONS.map(o => (
              <OptionCard key={o.value} {...o} selected={groupSize === o.value} onPress={() => setGroupSize(o.value)} />
            ))}
          </View>

          <Text style={styles.sectionLabel}>BUDGET PAR PERSONNE</Text>
          <View style={styles.optionGrid}>
            {PRICE_OPTIONS.map(o => (
              <OptionCard key={String(o.value)} {...o} selected={maxPrice === o.value} onPress={() => setMaxPrice(o.value)} />
            ))}
          </View>

          <Text style={styles.sectionLabel}>TON MOOD</Text>
          <View style={styles.optionGrid}>
            {VIBE_OPTIONS.map(o => (
              <OptionCard key={o.value} {...o} selected={vibe === o.value} onPress={() => setVibe(o.value)} />
            ))}
          </View>

          <TouchableOpacity style={styles.primaryBtn} onPress={() => setStep(3)}>
            <Text style={styles.primaryBtnText}>Continuer</Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      {/* ── Étape 3 : Récap ─────────────────────────────────── */}
      {step === 3 && (
        <View style={styles.stepCentered}>
          <Text style={styles.stepEmoji}>🎉</Text>
          <Text style={styles.stepTitle}>Tout est prêt</Text>

          <View style={styles.recapCard}>
            <RecapRow label="Créneau" value={TIMING_OPTIONS.find(o => o.value === timing)!} />
            <RecapRow label="Groupe"  value={GROUP_OPTIONS.find(o => o.value === groupSize)!} />
            <RecapRow label="Budget"  value={PRICE_OPTIONS.find(o => o.value === maxPrice)!} />
            <RecapRow label="Mood"    value={VIBE_OPTIONS.find(o => o.value === vibe)!} />
            {gpsStatus === 'granted' && (
              <Text style={styles.recapGps}>📍 GPS activé</Text>
            )}
          </View>

          <TouchableOpacity style={styles.primaryBtn} onPress={finish}>
            <Text style={styles.primaryBtnText}>C'est parti  🎰</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.skipBtn} onPress={() => setStep(2)}>
            <Text style={styles.skipText}>Modifier</Text>
          </TouchableOpacity>
        </View>
      )}

    </SafeAreaView>
  );
}

function RecapRow({ label, value }: { label: string; value: { emoji: string; label: string } }) {
  return (
    <View style={styles.recapRow}>
      <Text style={styles.recapLabel}>{label}</Text>
      <Text style={styles.recapValue}>{value.emoji}  {value.label}</Text>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0a0a16' },

  progressRow: {
    flexDirection: 'row', justifyContent: 'center', gap: 8,
    paddingTop: 16,
  },
  progressDot: {
    width: 32, height: 4, borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  progressDotActive: { backgroundColor: '#7C3AED' },

  stepCentered: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 32, gap: 12,
  },
  stepScroll: {
    flex: 1, paddingHorizontal: 20, paddingTop: 24,
  },

  // Splash
  splashEmoji:   { fontSize: 72 },
  splashTitle:   { color: '#fff', fontSize: 44, fontWeight: '900', letterSpacing: 3 },
  splashTagline: { color: '#a78bfa', fontSize: 20, fontWeight: '700', textAlign: 'center', lineHeight: 28 },
  splashDetail:  { color: 'rgba(255,255,255,0.4)', fontSize: 14, textAlign: 'center', lineHeight: 21, marginTop: 8 },

  // Steps
  stepEmoji:    { fontSize: 56 },
  stepTitle:    { color: '#fff', fontSize: 24, fontWeight: '900', textAlign: 'center' },
  stepSubtitle: { color: 'rgba(255,255,255,0.4)', fontSize: 13, marginBottom: 16 },
  stepText:     { color: 'rgba(255,255,255,0.5)', fontSize: 15, textAlign: 'center', lineHeight: 22 },

  // Preference grids
  sectionLabel: {
    color: 'rgba(255,255,255,0.35)', fontSize: 11, fontWeight: '800',
    letterSpacing: 1.2, marginTop: 14, marginBottom: 8,
  },
  optionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },

  // Recap
  recapCard: {
    alignSelf: 'stretch',
    backgroundColor: '#12122a', borderRadius: 18, padding: 18, gap: 12,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
    marginVertical: 8,
  },
  recapRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  recapLabel: { color: 'rgba(255,255,255,0.4)', fontSize: 13 },
  recapValue: { color: '#fff', fontSize: 14, fontWeight: '700' },
  recapGps:   { color: '#4ade80', fontSize: 12, fontWeight: '600', textAlign: 'center', marginTop: 4 },

  // Buttons
  primaryBtn: {
    alignSelf: 'stretch',
    backgroundColor: '#7C3AED', borderRadius: 16,
    paddingVertical: 16, alignItems: 'center',
    marginTop: 20,
  },
  primaryBtnText: { color: '#fff', fontSize: 17, fontWeight: '800' },
  skipBtn:  { paddingVertical: 10 },
  skipText: { color: 'rgba(255,255,255,0.3)', fontSize: 14 },
});
