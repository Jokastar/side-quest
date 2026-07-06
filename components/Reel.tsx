import { useEffect, useRef, useState } from 'react';
import { View, Image, Text, StyleSheet, TouchableOpacity } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

export interface ReelItem {
  id: string;
  name: string;
  photo_url: string | null;
}

interface Props {
  label: string;
  emoji: string;
  items: ReelItem[];
  result: ReelItem | null;
  isSpinning: boolean;
  stopDelay: number;
  onStop?: () => void;
  onPress?: () => void;
}

const IMAGE_SIZE = 80;

const SPIN_PHASES: [number, number][] = [
  [60,  600],
  [120, 400],
  [240, 400],
  [400, 300],
];

export default function Reel({ label, emoji, items, result, isSpinning, stopDelay, onStop, onPress }: Props) {
  const [displayIdx, setDisplayIdx] = useState(0);
  const [stopped, setStopped] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const borderOpacity = useSharedValue(0);

  const animStyle = useAnimatedStyle(() => ({
    borderColor: `rgba(168, 85, 247, ${borderOpacity.value})`,
  }));

  function clearAll() {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (timerRef.current) clearTimeout(timerRef.current);
  }

  useEffect(() => {
    if (!isSpinning) return;

    setStopped(false);
    borderOpacity.value = 0;

    const pool = items.length > 0 ? items : [{ id: '', name: '—', photo_url: null }];
    let phaseIdx = 0;

    function runPhase() {
      if (phaseIdx >= SPIN_PHASES.length) return;
      const [intervalMs, duration] = SPIN_PHASES[phaseIdx];
      intervalRef.current = setInterval(() => {
        setDisplayIdx(prev => (prev + 1) % pool.length);
      }, intervalMs);
      timerRef.current = setTimeout(() => {
        clearInterval(intervalRef.current!);
        phaseIdx++;
        runPhase();
      }, duration);
    }

    const totalPhaseTime = SPIN_PHASES.reduce((s, [, d]) => s + d, 0);

    timerRef.current = setTimeout(() => {
      runPhase();
      timerRef.current = setTimeout(() => {
        clearAll();
        setStopped(true);
        borderOpacity.value = withTiming(1, { duration: 350 });
        onStop?.();
      }, totalPhaseTime + 50);
    }, stopDelay);

    return clearAll;
  }, [isSpinning]);

  const displayed = stopped && result
    ? result
    : items[displayIdx % Math.max(items.length, 1)];

  const isClickable = !!(stopped && result && onPress);

  return (
    <TouchableOpacity
      style={styles.wrapper}
      activeOpacity={isClickable ? 0.75 : 1}
      disabled={!isClickable}
      onPress={isClickable ? onPress : undefined}
    >
      <Animated.View style={[styles.card, animStyle]}>

        {/* Image */}
        <View style={styles.imageWrap}>
          {displayed?.photo_url ? (
            <Image source={{ uri: displayed.photo_url }} style={styles.image} resizeMode="cover" />
          ) : (
            <View style={styles.placeholder}>
              <Text style={styles.placeholderEmoji}>{emoji}</Text>
            </View>
          )}
          {isSpinning && !stopped && <View style={styles.scanLine} />}
        </View>

        {/* Texte */}
        <View style={styles.info}>
          <Text style={styles.labelText}>{emoji}  {label.toUpperCase()}</Text>
          {stopped && result ? (
            <>
              <Text style={styles.name} numberOfLines={2}>{result.name}</Text>
              {isClickable && <Text style={styles.hint}>Voir les détails →</Text>}
            </>
          ) : (
            <Text style={styles.placeholder2}>
              {isSpinning ? '···' : 'Lance un spin'}
            </Text>
          )}
        </View>

      </Animated.View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#12122a',
    borderRadius: 16,
    padding: 12,
    gap: 12,
    borderWidth: 2,
    borderColor: 'transparent',
    minHeight: IMAGE_SIZE + 24,
  },
  imageWrap: {
    width: IMAGE_SIZE,
    height: IMAGE_SIZE,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#1e1e3a',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  placeholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderEmoji: {
    fontSize: 30,
  },
  scanLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '50%',
    height: 2,
    backgroundColor: 'rgba(168,85,247,0.8)',
  },
  info: {
    flex: 1,
    gap: 6,
  },
  labelText: {
    color: '#a78bfa',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  name: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 19,
  },
  placeholder2: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 13,
    fontStyle: 'italic',
  },
  hint: {
    color: 'rgba(167,139,250,0.7)',
    fontSize: 11,
  },
});
