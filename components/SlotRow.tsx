// ─────────────────────────────────────────────────────────────
// SlotRow — une rangée d'escapade (activité / table / sortie)
//
// Une carte visible à la fois, swipe horizontal pour passer à la
// proposition suivante. La carte affichée EST la sélection.
// Tap sur la carte → fiche détail (géré par le parent).
// ─────────────────────────────────────────────────────────────

import { useRef } from 'react';
import {
  View, Text, Image, FlatList, TouchableOpacity,
  StyleSheet, Dimensions, type ViewToken,
} from 'react-native';
import type { Item } from '../types/database';

const SCREEN_WIDTH = Dimensions.get('window').width;
const CARD_MARGIN = 16;               // padding écran
const CARD_WIDTH = SCREEN_WIDTH - CARD_MARGIN * 2;

const CATEGORY_LABEL: Record<string, string> = {
  culture: 'Culture', loisir: 'Loisir', plein_air: 'Plein air',
  food: 'Food', bar: 'Bar', club: 'Club', concert: 'Concert',
};

function priceLabel(item: Item): string | null {
  if (item.price != null) return item.price === 0 ? 'Gratuit' : `${item.price}€`;
  if (item.price_level != null) return '€'.repeat(item.price_level);
  return null;
}

interface SlotRowProps {
  emoji: string;
  label: string;
  color: string;
  items: Item[];
  onSelect: (item: Item | null) => void;  // carte visible = sélection
  onPressItem: (item: Item) => void;      // tap → fiche détail
}

export default function SlotRow({ emoji, label, color, items, onSelect, onPressItem }: SlotRowProps) {
  const currentIndex = useRef(0);

  // La carte majoritairement visible devient la sélection
  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      const first = viewableItems[0];
      if (first?.index != null && first.item) {
        currentIndex.current = first.index;
        onSelect(first.item as Item);
      }
    },
  );

  if (items.length === 0) {
    return (
      <View style={styles.row}>
        <RowHeader emoji={emoji} label={label} color={color} count={null} />
        <View style={[styles.card, styles.emptyCard]}>
          <Text style={styles.emptyEmoji}>🫥</Text>
          <Text style={styles.emptyText}>Rien de disponible sur ce créneau</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.row}>
      <RowHeader emoji={emoji} label={label} color={color} count={items.length} />
      <FlatList
        horizontal
        data={items}
        keyExtractor={i => i.id}
        showsHorizontalScrollIndicator={false}
        // Une carte par "page" de scroll
        snapToInterval={CARD_WIDTH + 10}
        decelerationRate="fast"
        contentContainerStyle={{ paddingHorizontal: CARD_MARGIN, gap: 10 }}
        onViewableItemsChanged={onViewableItemsChanged.current}
        viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}
        renderItem={({ item, index }) => (
          <TouchableOpacity
            style={[styles.card, { borderColor: color + '44' }]}
            activeOpacity={0.85}
            onPress={() => onPressItem(item)}
          >
            {/* Photo pleine carte + voile pour la lisibilité du texte */}
            {item.photo_url ? (
              <Image source={{ uri: item.photo_url }} style={styles.photo} resizeMode="cover" />
            ) : (
              <View style={[styles.photo, { backgroundColor: color + '18' }]}>
                <Text style={styles.photoEmoji}>{emoji}</Text>
              </View>
            )}
            <View style={styles.veil} />

            {/* Infos par-dessus la photo */}
            <View style={styles.cardTop}>
              <View style={[styles.chip, { backgroundColor: color }]}>
                <Text style={styles.chipText}>{CATEGORY_LABEL[item.category] ?? item.category}</Text>
              </View>
              <View style={styles.topRight}>
                {item.rarity !== 'common' && (
                  <View style={styles.rarityChip}>
                    <Text style={styles.rarityText}>
                      {item.rarity === 'legendary' ? '★ LÉGENDAIRE' : item.rarity === 'epic' ? '★ ÉPIQUE' : '★ RARE'}
                    </Text>
                  </View>
                )}
                <Text style={styles.counter}>{index + 1}/{items.length}</Text>
              </View>
            </View>

            <View style={styles.cardBottom}>
              <Text style={styles.name} numberOfLines={2}>{item.name}</Text>
              <View style={styles.metaRow}>
                {priceLabel(item) && <Text style={styles.meta}>{priceLabel(item)}</Text>}
                {item.arrondissement && <Text style={styles.meta}>{item.arrondissement}ᵉ</Text>}
                {item.access_type === 'obligatoire' && <Text style={[styles.meta, styles.resa]}>🎟 résa</Text>}
              </View>
            </View>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

function RowHeader({ emoji, label, color, count }: { emoji: string; label: string; color: string; count: number | null }) {
  return (
    <View style={styles.header}>
      <Text style={[styles.headerLabel, { color }]}>{emoji}  {label.toUpperCase()}</Text>
      {count != null && count > 1 && (
        <Text style={styles.headerHint}>swipe pour changer  ↔</Text>
      )}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  row: { gap: 8 },

  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: CARD_MARGIN,
  },
  headerLabel: { fontSize: 12, fontWeight: '900', letterSpacing: 1.5 },
  headerHint:  { color: 'rgba(255,255,255,0.25)', fontSize: 11 },

  card: {
    width: CARD_WIDTH,
    height: 148,
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1.5,
    backgroundColor: '#12122a',
    justifyContent: 'space-between',
  },
  photo: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoEmoji: { fontSize: 44, opacity: 0.5 },
  veil: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(6,6,18,0.45)',
  },

  cardTop: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    padding: 10,
  },
  chip: {
    borderRadius: 8, paddingHorizontal: 9, paddingVertical: 3,
  },
  chipText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  topRight: { alignItems: 'flex-end', gap: 4 },
  rarityChip: {
    backgroundColor: 'rgba(245,158,11,0.9)', borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 2,
  },
  rarityText: { color: '#1a1000', fontSize: 9, fontWeight: '900', letterSpacing: 0.5 },
  counter: {
    color: 'rgba(255,255,255,0.75)', fontSize: 11, fontWeight: '700',
    backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 8,
    paddingHorizontal: 7, paddingVertical: 2,
    fontVariant: ['tabular-nums'],
  },

  cardBottom: { padding: 12, gap: 3 },
  name: { color: '#fff', fontSize: 17, fontWeight: '800', lineHeight: 22 },
  metaRow: { flexDirection: 'row', gap: 10 },
  meta: { color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: '600' },
  resa: { color: '#fb923c' },

  emptyCard: {
    marginHorizontal: CARD_MARGIN,
    alignItems: 'center', justifyContent: 'center', gap: 6,
    borderStyle: 'dashed', borderColor: 'rgba(255,255,255,0.12)',
  },
  emptyEmoji: { fontSize: 28 },
  emptyText: { color: 'rgba(255,255,255,0.3)', fontSize: 13 },
});
