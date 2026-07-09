// ─────────────────────────────────────────────────────────────
// ItemGridCard — carte compacte de la grille de navigation.
//
// Tap sur la carte  → fiche détail (géré par le parent)
// Tap sur [+ / ✓]   → ajoute / retire de la sélection
// ─────────────────────────────────────────────────────────────

import { View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native';
import { priceLabel, timeBadge, CATEGORY_LABEL } from '../lib/items';
import type { Item } from '../types/database';

// Couleur d'accent par slot (cohérente avec le reste de l'app)
const SLOT_COLOR: Record<string, string> = {
  activite: '#a78bfa',
  table:    '#fb923c',
  sortie:   '#f472b6',
};

interface ItemGridCardProps {
  item: Item;
  selected: boolean;
  full: boolean;               // sélection pleine → le + est désactivé
  onPress: () => void;         // ouvre la fiche détail
  onToggle: () => void;        // ajoute / retire
}

export default function ItemGridCard({ item, selected, full, onPress, onToggle }: ItemGridCardProps) {
  const color = SLOT_COLOR[item.slot] ?? '#a78bfa';
  const time = timeBadge(item);
  const price = priceLabel(item);

  return (
    <TouchableOpacity
      style={[styles.card, selected && { borderColor: color }]}
      activeOpacity={0.85}
      onPress={onPress}
    >
      {/* Photo (ou fond coloré si absente) */}
      <View style={styles.photoWrap}>
        {item.photo_url ? (
          <Image source={{ uri: item.photo_url }} style={styles.photo} resizeMode="cover" />
        ) : (
          <View style={[styles.photo, { backgroundColor: color + '20' }]} />
        )}

        {/* Heure du jour (si connue) — sinon l'item est "flexible" */}
        <View style={styles.timeBadge}>
          <Text style={styles.timeText}>{time ?? 'Journée'}</Text>
        </View>

        {/* Rareté (rare et au-delà seulement) */}
        {item.rarity !== 'common' && (
          <View style={styles.rarityBadge}>
            <Text style={styles.rarityText}>★</Text>
          </View>
        )}

        {/* Bouton ajout / retrait */}
        <TouchableOpacity
          style={[
            styles.addBtn,
            selected && { backgroundColor: color },
            !selected && full && styles.addBtnDisabled,
          ]}
          disabled={!selected && full}
          onPress={onToggle}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.addText}>{selected ? '✓' : '+'}</Text>
        </TouchableOpacity>
      </View>

      {/* Infos */}
      <View style={styles.body}>
        <Text style={[styles.category, { color }]}>
          {CATEGORY_LABEL[item.category]?.toUpperCase() ?? item.category}
        </Text>
        <Text style={styles.name} numberOfLines={2}>{item.name}</Text>
        <View style={styles.metaRow}>
          {price && <Text style={styles.meta}>{price}</Text>}
          {item.arrondissement && <Text style={styles.meta}>{item.arrondissement}ᵉ</Text>}
          {item.access_type === 'obligatoire' && <Text style={[styles.meta, styles.resa]}>🎟</Text>}
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: '#12122a',
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.06)',
  },

  photoWrap: { height: 96 },
  photo: { width: '100%', height: '100%' },

  timeBadge: {
    position: 'absolute', bottom: 6, left: 6,
    backgroundColor: 'rgba(0,0,0,0.65)',
    borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2,
  },
  timeText: { color: '#fff', fontSize: 10.5, fontWeight: '700' },

  rarityBadge: {
    position: 'absolute', top: 6, left: 6,
    backgroundColor: 'rgba(245,158,11,0.95)',
    borderRadius: 8, width: 20, height: 20,
    alignItems: 'center', justifyContent: 'center',
  },
  rarityText: { color: '#1a1000', fontSize: 11, fontWeight: '900' },

  addBtn: {
    position: 'absolute', top: 6, right: 6,
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)',
    alignItems: 'center', justifyContent: 'center',
  },
  addBtnDisabled: { opacity: 0.35 },
  addText: { color: '#fff', fontSize: 16, fontWeight: '800', lineHeight: 18 },

  body: { padding: 10, gap: 3 },
  category: { fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  name: { color: '#fff', fontSize: 13.5, fontWeight: '700', lineHeight: 18, minHeight: 36 },
  metaRow: { flexDirection: 'row', gap: 8 },
  meta: { color: 'rgba(255,255,255,0.5)', fontSize: 11.5, fontWeight: '600' },
  resa: { color: '#fb923c' },
});
