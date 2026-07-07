// ─────────────────────────────────────────────────────────────
// PreferencesSheet — bottom sheet d'édition des préférences
//
// Ouvert depuis l'écran spin : l'user peut changer d'avis sur
// le groupe, le budget et le mood sans quitter la machine à sous.
// (Le créneau se change via les chips déjà présentes sur l'écran.)
//
// Les options (labels, emojis) sont exportées d'ici et réutilisées
// par l'onboarding pour rester cohérentes.
// ─────────────────────────────────────────────────────────────

import { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Modal, Pressable,
} from 'react-native';
import { useGameStore } from '../store/gameStore';
import { saveStoredPrefs } from '../lib/prefsStorage';
import type { MaxPrice, GroupSize, Vibe, DefaultTiming } from '../types/database';

// ── Options partagées (onboarding + sheet) ────────────────────

export interface PrefOption<T> {
  value: T;
  emoji: string;
  label: string;
  sub: string;
}

export const TIMING_OPTIONS: PrefOption<DefaultTiming>[] = [
  { value: 'auto',    emoji: '✨', label: 'Maintenant',  sub: "selon l'heure" },
  { value: 'midi',    emoji: '☀️', label: 'Déjeuner',    sub: '10h – 14h' },
  { value: 'journee', emoji: '🌤️', label: 'Après-midi',  sub: '14h – 19h' },
  { value: 'soiree',  emoji: '🌙', label: 'Soirée',      sub: '19h – 3h' },
];

export const GROUP_OPTIONS: PrefOption<GroupSize>[] = [
  { value: 'solo',   emoji: '🚶', label: 'Solo',          sub: 'juste moi' },
  { value: 'duo',    emoji: '💑', label: 'Duo',           sub: 'à deux' },
  { value: 'groupe', emoji: '👥', label: 'Petit groupe',  sub: '3 – 5' },
  { value: 'bande',  emoji: '🎉', label: 'Grande bande',  sub: '6 et +' },
];

export const PRICE_OPTIONS: PrefOption<MaxPrice>[] = [
  { value: 0,    emoji: '🆓', label: 'Gratuit',     sub: '0€' },
  { value: 15,   emoji: '💰', label: 'Petit prix',  sub: '≤ 15€ / pers' },
  { value: 30,   emoji: '💳', label: 'Confort',     sub: '≤ 30€ / pers' },
  { value: null, emoji: '🤷', label: 'Peu importe', sub: 'pas de limite' },
];

export const VIBE_OPTIONS: PrefOption<Vibe>[] = [
  { value: 'chill',    emoji: '🛋️', label: 'Chill',    sub: 'tranquille, cosy' },
  { value: 'festif',   emoji: '🪩', label: 'Festif',   sub: 'danser, sortir' },
  { value: 'culturel', emoji: '🎭', label: 'Culturel', sub: 'expos, découvertes' },
];

// ── Carte d'option (réutilisée par l'onboarding) ──────────────

interface OptionCardProps {
  emoji: string;
  label: string;
  sub: string;
  selected: boolean;
  onPress: () => void;
}

export function OptionCard({ emoji, label, sub, selected, onPress }: OptionCardProps) {
  return (
    <TouchableOpacity
      style={[styles.optionCard, selected && styles.optionCardSelected]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <Text style={styles.optionEmoji}>{emoji}</Text>
      <Text style={[styles.optionLabel, selected && styles.optionLabelSelected]}>{label}</Text>
      <Text style={styles.optionSub}>{sub}</Text>
    </TouchableOpacity>
  );
}

// ── Le bottom sheet ───────────────────────────────────────────

interface PreferencesSheetProps {
  visible: boolean;
  onClose: () => void;
}

export default function PreferencesSheet({ visible, onClose }: PreferencesSheetProps) {
  const { preferences, setPreferences, hasOnboarded } = useGameStore();

  // Sélections locales — appliquées seulement au "Enregistrer"
  const [groupSize, setGroupSize] = useState<GroupSize>(preferences.groupSize);
  const [maxPrice, setMaxPrice]   = useState<MaxPrice>(preferences.maxPrice);
  const [vibe, setVibe]           = useState<Vibe>(preferences.vibe);

  // Re-synchronise les sélections à chaque ouverture
  // (si l'user a annulé la dernière fois, on repart des vraies prefs)
  function handleShow() {
    setGroupSize(preferences.groupSize);
    setMaxPrice(preferences.maxPrice);
    setVibe(preferences.vibe);
  }

  async function save() {
    const updated = { ...preferences, groupSize, maxPrice, vibe };
    setPreferences(updated);
    await saveStoredPrefs({ preferences: updated, hasOnboarded: hasOnboarded ?? true });
    onClose();
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onShow={handleShow} onRequestClose={onClose}>
      {/* Fond cliquable pour fermer */}
      <Pressable style={styles.backdrop} onPress={onClose} />

      <View style={styles.sheet}>
        <View style={styles.handle} />
        <Text style={styles.title}>Tes préférences</Text>

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

        <TouchableOpacity style={styles.saveBtn} onPress={save}>
          <Text style={styles.saveBtnText}>Enregistrer</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  sheet: {
    backgroundColor: '#12122a',
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 20, paddingBottom: 36, paddingTop: 10,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  handle: {
    alignSelf: 'center',
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.2)',
    marginBottom: 14,
  },
  title: { color: '#fff', fontSize: 20, fontWeight: '900', marginBottom: 4 },

  sectionLabel: {
    color: 'rgba(255,255,255,0.35)', fontSize: 11, fontWeight: '800',
    letterSpacing: 1.2, marginTop: 14, marginBottom: 8,
  },
  optionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  optionCard: {
    flexGrow: 1, flexBasis: '30%',
    backgroundColor: '#0a0a16', borderRadius: 14,
    paddingVertical: 10, paddingHorizontal: 8,
    alignItems: 'center', gap: 2,
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.06)',
  },
  optionCardSelected: {
    borderColor: '#7C3AED',
    backgroundColor: 'rgba(124,58,237,0.14)',
  },
  optionEmoji:         { fontSize: 20 },
  optionLabel:         { color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: '700' },
  optionLabelSelected: { color: '#fff' },
  optionSub:           { color: 'rgba(255,255,255,0.3)', fontSize: 10 },

  saveBtn: {
    backgroundColor: '#7C3AED', borderRadius: 16,
    paddingVertical: 15, alignItems: 'center',
    marginTop: 20,
  },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
});
