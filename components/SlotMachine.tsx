import { useState } from 'react';
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import Reel, { ReelItem } from './Reel';

export type SpinMode = 'soiree' | 'midi' | 'journee';

interface Props {
  mode: SpinMode;
  candidates: {
    lieu: ReelItem[];
    table: ReelItem[];
    sortie: ReelItem[];
  };
  results: {
    lieu: ReelItem | null;
    table: ReelItem | null;
    sortie: ReelItem | null;
  };
  isSpinning: boolean;
  onSpin: (reelIndex?: 0 | 1 | 2) => void;
  onValidate: () => void;
  onReelPress?: (index: 0 | 1 | 2) => void;
}

// Délais d'arrêt des reels : le premier s'arrête à 1s, le deuxième à 1.7s, le troisième à 2.4s
const STOP_DELAYS = [0, 700, 1400];

// Labels et emojis selon le mode
const REEL_CONFIG: Record<SpinMode, { label: string; emoji: string }[]> = {
  soiree: [
    { label: 'Lieu',   emoji: '🎭' },
    { label: 'Table',  emoji: '🍽️' },
    { label: 'Sortie', emoji: '🎶' },
  ],
  midi: [
    { label: 'Balade', emoji: '🚶' },
    { label: 'Table',  emoji: '☕' },
    { label: 'Activité', emoji: '🎬' },
  ],
  journee: [
    { label: 'Lieu',     emoji: '🏛️' },
    { label: 'Table',    emoji: '🍽️' },
    { label: 'Activité', emoji: '🎨' },
  ],
};

export default function SlotMachine({ mode, candidates, results, isSpinning, onSpin, onValidate, onReelPress }: Props) {
  const [stoppedCount, setStoppedCount] = useState(0);
  const config = REEL_CONFIG[mode];

  const reelData = [
    { items: candidates.lieu,   result: results.lieu },
    { items: candidates.table,  result: results.table },
    { items: candidates.sortie, result: results.sortie },
  ];

  const allResultsIn = results.lieu && results.table && results.sortie;

  function handleReelStop() {
    setStoppedCount(prev => prev + 1);
  }

  return (
    <View style={styles.container}>
      {/* Les 3 reels en colonne */}
      <View style={styles.reels}>
        {reelData.map((reel, i) => (
          <View key={i} style={styles.reelRow}>
            <Reel
              label={config[i].label}
              emoji={config[i].emoji}
              items={reel.items}
              result={reel.result}
              isSpinning={isSpinning}
              stopDelay={STOP_DELAYS[i]}
              onStop={handleReelStop}
              onPress={onReelPress ? () => onReelPress(i as 0 | 1 | 2) : undefined}
            />
          </View>
        ))}
      </View>

      {/* Bouton principal SPIN / VALIDER */}
      <View style={styles.actions}>
        {allResultsIn && !isSpinning ? (
          <>
            <TouchableOpacity style={styles.spinBtn} onPress={() => onSpin()}>
              <Text style={styles.spinBtnText}>🎰  Nouveau spin</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.validateBtn} onPress={onValidate}>
              <Text style={styles.validateBtnText}>✓  C'est parti !</Text>
            </TouchableOpacity>
          </>
        ) : (
          <TouchableOpacity
            style={[styles.spinBtn, isSpinning && styles.spinBtnDisabled]}
            onPress={() => onSpin()}
            disabled={isSpinning}
          >
            <Text style={styles.spinBtnText}>
              {isSpinning ? 'En cours...' : '🎰  SPIN'}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    gap: 24,
  },
  reels: {
    flexDirection: 'column',
    gap: 10,
    paddingHorizontal: 16,
  },
  reelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  actions: {
    width: '100%',
    paddingHorizontal: 24,
    gap: 12,
  },
  spinBtn: {
    backgroundColor: '#7C3AED',
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
  },
  spinBtnDisabled: {
    backgroundColor: '#4B2B8A',
    opacity: 0.7,
  },
  spinBtnText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 18,
    letterSpacing: 1,
  },
  validateBtn: {
    backgroundColor: '#16A34A',
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: 'center',
  },
  validateBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
});
