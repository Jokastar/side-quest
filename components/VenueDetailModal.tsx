import {
  Modal,
  View,
  Text,
  Image,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Linking,
  Platform,
} from 'react-native';
import { priceLabel, todayOccurrence, CATEGORY_LABEL_EMOJI } from '../lib/items';
import type { Item, Category } from '../types/database';

interface Props {
  item: Item | null;
  visible: boolean;
  onClose: () => void;
}

function categoryLabel(cat: Category): string {
  return CATEGORY_LABEL_EMOJI[cat] ?? cat;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', {
    weekday: 'short', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
  });
}

export default function VenueDetailModal({ item, visible, onClose }: Props) {
  if (!item) return null;

  const { name, description, address, url, lat, lng, tags, schedule_text: schedule, transport } = item;
  const todaySlot = todayOccurrence(item.occurrences);
  // Avant validation de l'escapade : on SIGNALE la résa (badge) mais le
  // bouton Réserver n'apparaît que sur l'écran plan, une fois validée
  const needsResa = item.access_type === 'obligatoire';

  function openMaps() {
    if (lat == null || lng == null) return;
    const query = encodeURIComponent(name);
    const mapsUrl = Platform.OS === 'ios'
      ? `maps://?q=${query}&ll=${lat},${lng}`
      : `geo:${lat},${lng}?q=${query}`;
    Linking.openURL(mapsUrl);
  }

  function openUrl() {
    if (url) Linking.openURL(url);
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.root}>
        {/* Bouton fermer */}
        <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
          <Text style={styles.closeText}>✕</Text>
        </TouchableOpacity>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
          {/* Photo */}
          {item.photo_url ? (
            <Image source={{ uri: item.photo_url }} style={styles.photo} resizeMode="cover" />
          ) : (
            <View style={[styles.photo, styles.photoPlaceholder]}>
              <Text style={styles.photoEmoji}>{categoryLabel(item.category)[0]}</Text>
            </View>
          )}

          <View style={styles.content}>
            {/* Badges : catégorie + types source + résa */}
            <View style={styles.badgeRow}>
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{categoryLabel(item.category)}</Text>
              </View>
              {tags?.split(';').map(t => (
                <View key={t} style={[styles.badge, styles.badgeTag]}>
                  <Text style={styles.badgeText}>{t.trim()}</Text>
                </View>
              ))}
              {needsResa && (
                <View style={[styles.badge, styles.badgeResa]}>
                  <Text style={styles.badgeResaText}>🎟 Résa obligatoire</Text>
                </View>
              )}
            </View>

            {/* Nom */}
            <Text style={styles.name}>{name}</Text>

            {/* Infos clés */}
            <View style={styles.infoGrid}>

              {/* Prix */}
              <View style={styles.infoCard}>
                <Text style={styles.infoIcon}>💰</Text>
                <Text style={styles.infoLabel}>Prix</Text>
                <Text style={styles.infoValue}>{priceLabel(item)}</Text>
              </View>

              {/* Note (si renseignée) */}
              {item.rating != null && (
                <View style={styles.infoCard}>
                  <Text style={styles.infoIcon}>⭐</Text>
                  <Text style={styles.infoLabel}>Note</Text>
                  <Text style={styles.infoValue}>{item.rating.toFixed(1)} / 5</Text>
                </View>
              )}

              {/* Horaires — créneau du jour, horaires en clair, ou dates de l'éphémère */}
              {(todaySlot || schedule || item.start_date) && (
                <View style={[styles.infoCard, styles.infoCardWide]}>
                  <Text style={styles.infoIcon}>🕐</Text>
                  <Text style={styles.infoLabel}>Horaires</Text>
                  {todaySlot && (
                    <Text style={styles.infoToday}>Aujourd'hui : {todaySlot}</Text>
                  )}
                  {schedule ? (
                    <Text style={styles.infoValueSub}>{schedule}</Text>
                  ) : !todaySlot && item.start_date ? (
                    <>
                      <Text style={styles.infoValue}>{formatDate(item.start_date)}</Text>
                      {item.end_date && (
                        <Text style={styles.infoValueSub}>→ {formatDate(item.end_date)}</Text>
                      )}
                    </>
                  ) : null}
                </View>
              )}

              {/* Adresse */}
              {address && (
                <View style={[styles.infoCard, styles.infoCardWide]}>
                  <Text style={styles.infoIcon}>📍</Text>
                  <Text style={styles.infoLabel}>Adresse</Text>
                  <Text style={styles.infoValue}>{address}</Text>
                </View>
              )}

              {/* Transports (events uniquement) */}
              {transport && (
                <View style={[styles.infoCard, styles.infoCardWide]}>
                  <Text style={styles.infoIcon}>🚇</Text>
                  <Text style={styles.infoLabel}>Y aller</Text>
                  {transport.split('\n').slice(0, 2).map((line, i) => (
                    <Text key={i} style={styles.infoValueSub}>{line.replace('->', '·')}</Text>
                  ))}
                </View>
              )}
            </View>

            {/* Description */}
            {description && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>À propos</Text>
                <Text style={styles.description}>{description}</Text>
              </View>
            )}

            {/* Boutons d'action */}
            <View style={styles.actions}>
              {(lat != null && lng != null) && (
                <TouchableOpacity style={styles.actionBtn} onPress={openMaps}>
                  <Text style={styles.actionBtnText}>🗺️  Ouvrir dans Maps</Text>
                </TouchableOpacity>
              )}
              {url && (
                <TouchableOpacity style={[styles.actionBtn, styles.actionBtnSecondary]} onPress={openUrl}>
                  <Text style={styles.actionBtnTextSecondary}>🔗  Voir le site</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0a0a16',
  },
  closeBtn: {
    position: 'absolute',
    top: 16,
    right: 16,
    zIndex: 10,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  scroll: {
    paddingBottom: 40,
  },
  photo: {
    width: '100%',
    height: 240,
  },
  photoPlaceholder: {
    backgroundColor: '#1e1e3a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoEmoji: {
    fontSize: 64,
  },
  content: {
    padding: 20,
    gap: 16,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(124,58,237,0.25)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: 'rgba(124,58,237,0.5)',
  },
  badgeTag: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderColor: 'rgba(255,255,255,0.15)',
  },
  badgeResa: {
    backgroundColor: 'rgba(234,88,12,0.18)',
    borderColor: 'rgba(234,88,12,0.5)',
  },
  badgeResaText: {
    color: '#fb923c',
    fontSize: 12,
    fontWeight: '700',
  },
  badgeText: {
    color: '#a78bfa',
    fontSize: 12,
    fontWeight: '700',
  },
  infoToday: {
    color: '#4ade80',
    fontSize: 14,
    fontWeight: '800',
  },
  actionBtnResa: {
    backgroundColor: '#EA580C',
  },
  name: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '800',
    lineHeight: 30,
  },
  infoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  infoCard: {
    backgroundColor: '#12122a',
    borderRadius: 14,
    padding: 14,
    minWidth: 100,
    gap: 4,
  },
  infoCardWide: {
    flex: 1,
    minWidth: '100%',
  },
  infoIcon: {
    fontSize: 18,
  },
  infoLabel: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  infoValue: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  infoValueSub: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13,
  },
  section: {
    gap: 8,
  },
  sectionTitle: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  description: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 14,
    lineHeight: 22,
  },
  actions: {
    gap: 10,
    marginTop: 8,
  },
  actionBtn: {
    backgroundColor: '#7C3AED',
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
  },
  actionBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
  actionBtnSecondary: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  actionBtnTextSecondary: {
    color: 'rgba(255,255,255,0.8)',
    fontWeight: '600',
    fontSize: 15,
  },
});
