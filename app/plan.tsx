import { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, SafeAreaView, Linking, Image, Modal, Platform,
} from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { useRouter } from 'expo-router';
import { useGameStore } from '../store/gameStore';
import type { Venue, SpinEvent } from '../types/database';

// ── Helpers ──────────────────────────────────────────────────

function isEvent(item: Venue | SpinEvent): item is SpinEvent {
  return 'title' in item;
}

function getName(item: Venue | SpinEvent) {
  return isEvent(item) ? item.title : item.name;
}

function getAddress(item: Venue | SpinEvent) {
  return isEvent(item) ? (item.address ?? item.venue_name ?? null) : item.address;
}

function getCoords(item: Venue | SpinEvent) {
  if (item.lat == null || item.lng == null) return null;
  return { latitude: item.lat, longitude: item.lng };
}

function getDescription(item: Venue | SpinEvent): string | null {
  return isEvent(item) ? (item.description ?? null) : null;
}

const TIME_SLOTS: Record<string, string[]> = {
  soiree:  ['20h00', '21h30', '23h00'],
  midi:    ['12h00', '13h00', '14h30'],
  journee: ['15h00', '17h00', '19h00'],
};

const STOP_CONFIG = [
  { emoji: '🎭', label: 'Lieu',   color: '#7C3AED' },
  { emoji: '🍽️', label: 'Table',  color: '#EA580C' },
  { emoji: '🎶', label: 'Sortie', color: '#DB2777' },
];

// Ouvre Google Maps vers UN seul lieu depuis la position de l'user
function openSingleStop(
  stop: Venue | SpinEvent,
  travelMode: 'bicycling' | 'transit',
  userLocation: { latitude: number; longitude: number } | null,
) {
  const coords = getCoords(stop);
  if (!coords) return;

  const destination = `${coords.latitude},${coords.longitude}`;
  let url = `https://www.google.com/maps/dir/?api=1&destination=${destination}&travelmode=${travelMode}`;
  if (userLocation) {
    url += `&origin=${userLocation.latitude},${userLocation.longitude}`;
  }
  Linking.openURL(url);
}

// Ouvre Google Maps avec l'itinéraire complet depuis la position de l'user
function openFullRoute(
  stops: (Venue | SpinEvent)[],
  travelMode: 'bicycling' | 'transit',
  userLocation: { latitude: number; longitude: number } | null,
) {
  const stopCoords = stops.map(getCoords).filter(Boolean) as { latitude: number; longitude: number }[];
  if (stopCoords.length < 1) return;

  // Si on a la position de l'user, on part de là et tous les stops sont des waypoints/destination
  // Sinon, on part du premier stop comme fallback
  const origin = userLocation
    ? `${userLocation.latitude},${userLocation.longitude}`
    : `${stopCoords[0].latitude},${stopCoords[0].longitude}`;

  const waypointCoords = userLocation ? stopCoords.slice(0, -1) : stopCoords.slice(1, -1);
  const destination = `${stopCoords[stopCoords.length - 1].latitude},${stopCoords[stopCoords.length - 1].longitude}`;
  const waypoints = waypointCoords.map(c => `${c.latitude},${c.longitude}`).join('|');

  const url = `https://www.google.com/maps/dir/?api=1`
    + `&origin=${origin}`
    + `&destination=${destination}`
    + (waypoints ? `&waypoints=${waypoints}` : '')
    + `&travelmode=${travelMode}`;

  Linking.openURL(url);
}

function getRegion(coords: { latitude: number; longitude: number }[]) {
  if (coords.length === 0) {
    return { latitude: 48.8566, longitude: 2.3522, latitudeDelta: 0.05, longitudeDelta: 0.05 };
  }
  const lats = coords.map(c => c.latitude);
  const lngs = coords.map(c => c.longitude);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const padding = 0.01;
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: Math.max(maxLat - minLat + padding, 0.02),
    longitudeDelta: Math.max(maxLng - minLng + padding, 0.02),
  };
}

// ── Pin numéroté style Mario ──────────────────────────────────

function MapPin({ number, color, emoji }: { number: number; color: string; emoji: string }) {
  return (
    <View style={styles.pinWrapper}>
      <View style={[styles.pinBubble, { backgroundColor: color }]}>
        <Text style={styles.pinNumber}>{number}</Text>
        <Text style={styles.pinEmoji}>{emoji}</Text>
      </View>
      <View style={[styles.pinTail, { borderTopColor: color }]} />
    </View>
  );
}

// ── Modal détail d'un stop ────────────────────────────────────

interface StopModalProps {
  stop: Venue | SpinEvent;
  stopIndex: number;
  userLocation: { latitude: number; longitude: number } | null;
  onClose: () => void;
}

function StopModal({ stop, stopIndex, userLocation, onClose }: StopModalProps) {
  const cfg = STOP_CONFIG[stopIndex];
  const name = getName(stop);
  const address = getAddress(stop);
  const description = getDescription(stop);
  const coords = getCoords(stop);

  // Champs enrichis (events uniquement) — l'escapade est validée ici,
  // donc le bouton Réserver a sa place
  const isEvt       = isEvent(stop);
  const schedule    = isEvt ? stop.schedule_text : null;
  const transport   = isEvt ? stop.transport : null;
  const needsResa   = isEvt && stop.access_type === 'obligatoire';
  const bookingLink = isEvt ? stop.access_link : null;

  return (
    <Modal
      visible
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      {/* Overlay semi-transparent */}
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose} />

      {/* Panel bas de page */}
      <View style={styles.sheet}>
        {/* Pill de drag */}
        <View style={styles.sheetPill} />

        {/* Photo */}
        {stop.photo_url ? (
          <Image source={{ uri: stop.photo_url }} style={styles.sheetPhoto} resizeMode="cover" />
        ) : (
          <View style={[styles.sheetPhotoPlaceholder, { backgroundColor: cfg.color + '22' }]}>
            <Text style={styles.sheetPhotoEmoji}>{cfg.emoji}</Text>
          </View>
        )}

        {/* Infos */}
        <View style={styles.sheetContent}>
          {/* Badges : catégorie + résa obligatoire */}
          <View style={styles.sheetBadgeRow}>
            <View style={[styles.sheetBadge, { backgroundColor: cfg.color + '22' }]}>
              <Text style={[styles.sheetBadgeText, { color: cfg.color }]}>
                {cfg.emoji}  {cfg.label.toUpperCase()}  ·  ÉTAPE {stopIndex + 1}
              </Text>
            </View>
            {needsResa && (
              <View style={styles.sheetResaBadge}>
                <Text style={styles.sheetResaBadgeText}>🎟 RÉSA OBLIGATOIRE</Text>
              </View>
            )}
          </View>

          <Text style={styles.sheetName}>{name}</Text>

          {address && (
            <Text style={styles.sheetAddress}>{address}</Text>
          )}

          {/* Horaires en clair (expos, événements récurrents) */}
          {schedule && (
            <Text style={styles.sheetSchedule} numberOfLines={3}>🕐 {schedule}</Text>
          )}

          {/* Transports à proximité */}
          {transport && (
            <View style={styles.sheetTransitInfo}>
              {transport.split('\n').slice(0, 2).map((line, i) => (
                <Text key={i} style={styles.sheetTransitLine}>🚇 {line.replace('->', '·')}</Text>
              ))}
            </View>
          )}

          {description && (
            <Text style={styles.sheetDescription} numberOfLines={3}>{description}</Text>
          )}

          {/* Réserver — visible ici car l'escapade est validée */}
          {bookingLink && (
            <TouchableOpacity
              style={styles.sheetBookBtn}
              onPress={() => Linking.openURL(bookingLink)}
            >
              <Text style={styles.sheetBookBtnText}>🎟  Réserver ma place</Text>
            </TouchableOpacity>
          )}

          {/* Boutons transport → CE lieu précis */}
          {coords && (
            <>
              <Text style={styles.sheetRouteLabel}>M'y emmener via</Text>
              <View style={styles.sheetTransportRow}>
                <TouchableOpacity
                  style={[styles.sheetTransportBtn, { borderColor: cfg.color + '60' }]}
                  onPress={() => openSingleStop(stop, 'bicycling', userLocation)}
                >
                  <Text style={styles.sheetTransportIcon}>🚲</Text>
                  <Text style={[styles.sheetTransportText, { color: cfg.color }]}>Vélo</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.sheetTransportBtn, { borderColor: cfg.color + '60' }]}
                  onPress={() => openSingleStop(stop, 'transit', userLocation)}
                >
                  <Text style={styles.sheetTransportIcon}>🚇</Text>
                  <Text style={[styles.sheetTransportText, { color: cfg.color }]}>Métro</Text>
                </TouchableOpacity>
              </View>
            </>
          )}

          {/* Fermer */}
          <TouchableOpacity style={styles.sheetCloseBtn} onPress={onClose}>
            <Text style={styles.sheetCloseBtnText}>Fermer</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ── Écran principal ───────────────────────────────────────────

export default function PlanScreen() {
  const router = useRouter();
  const { reelResults, resetEscapade, startCheckin, spinMode: mode } = useGameStore();

  const [selectedStopIndex, setSelectedStopIndex] = useState<number | null>(null);
  const userLocation = useGameStore((s) => s.userLocation);

  const stops = reelResults.filter(Boolean) as (Venue | SpinEvent)[];
  const timeSlots = TIME_SLOTS[mode];

  const validCoords = stops.map(getCoords).filter(Boolean) as { latitude: number; longitude: number }[];
  const region = getRegion(validCoords);

  const selectedStop = selectedStopIndex !== null ? stops[selectedStopIndex] : null;

  return (
    <SafeAreaView style={styles.root}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.backText}>← Retour</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Ton escapade</Text>
          <Text style={styles.subtitle}>{stops.length} étapes · Paris</Text>
        </View>

        {/* Carte */}
        <View style={styles.mapWrapper}>
          <MapView style={styles.map} initialRegion={region} showsUserLocation>

            {stops.map((stop, i) => {
              const coords = getCoords(stop);
              if (!coords) return null;
              return (
                <Marker
                  key={i}
                  coordinate={coords}
                  anchor={{ x: 0.5, y: 1 }}
                  onPress={() => setSelectedStopIndex(i)}
                >
                  <MapPin number={i + 1} color={STOP_CONFIG[i].color} emoji={STOP_CONFIG[i].emoji} />
                </Marker>
              );
            })}

            {validCoords.length > 1 && (
              <Polyline
                coordinates={validCoords}
                strokeColor="#7C3AED"
                strokeWidth={3}
                lineDashPattern={[8, 6]}
              />
            )}
          </MapView>

          {/* Itinéraire complet */}
          <View style={styles.transportRow}>
            <TouchableOpacity
              style={styles.transportBtn}
              onPress={() => openFullRoute(stops, 'bicycling', userLocation)}
            >
              <Text style={styles.transportIcon}>🚲</Text>
              <Text style={styles.transportLabel}>Itinéraire vélo</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.transportBtn}
              onPress={() => openFullRoute(stops, 'transit', userLocation)}
            >
              <Text style={styles.transportIcon}>🚇</Text>
              <Text style={styles.transportLabel}>Itinéraire métro</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Timeline */}
        <View style={styles.timeline}>
          {stops.map((stop, i) => {
            const cfg = STOP_CONFIG[i];
            const time = isEvent(stop) && stop.start_date
              ? new Date(stop.start_date).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
              : timeSlots[i];

            return (
              <TouchableOpacity
                key={i}
                style={styles.timelineItem}
                activeOpacity={0.75}
                onPress={() => setSelectedStopIndex(i)}
              >
                {/* Trait vertical + numéro */}
                <View style={styles.timelineLeft}>
                  <View style={[styles.stepCircle, { backgroundColor: cfg.color }]}>
                    <Text style={styles.stepNumber}>{i + 1}</Text>
                  </View>
                  {i < stops.length - 1 && <View style={styles.stepLine} />}
                </View>

                {/* Carte étape */}
                <View style={styles.stepCard}>
                  {stop.photo_url && (
                    <Image source={{ uri: stop.photo_url }} style={styles.stepPhoto} resizeMode="cover" />
                  )}
                  <View style={styles.stepInfo}>
                    <View style={styles.stepTop}>
                      <Text style={[styles.stepLabel, { color: cfg.color }]}>
                        {cfg.emoji}  {cfg.label.toUpperCase()}
                      </Text>
                      <Text style={styles.stepTime}>{time}</Text>
                    </View>
                    <Text style={styles.stepName} numberOfLines={2}>{getName(stop)}</Text>
                    {getAddress(stop) && (
                      <Text style={styles.stepAddress} numberOfLines={1}>{getAddress(stop)}</Text>
                    )}
                    <Text style={styles.stepTap}>Appuyer pour y aller →</Text>
                  </View>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* CTA */}
        <View style={styles.cta}>
          <TouchableOpacity style={styles.startBtn} onPress={() => { startCheckin(); router.push('/checkin'); }}>
            <Text style={styles.startBtnText}>🚀  Démarrer l'escapade</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.cancelBtn} onPress={() => { resetEscapade(); router.back(); }}>
            <Text style={styles.cancelBtnText}>Recommencer</Text>
          </TouchableOpacity>
        </View>

      </ScrollView>

      {/* Modal stop sélectionné */}
      {selectedStop !== null && selectedStopIndex !== null && (
        <StopModal
          stop={selectedStop}
          stopIndex={selectedStopIndex}
          userLocation={userLocation}
          onClose={() => setSelectedStopIndex(null)}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0a0a16' },
  scroll: { paddingBottom: 40 },

  header: { padding: 20, gap: 4 },
  backBtn: { marginBottom: 8 },
  backText: { color: '#a78bfa', fontSize: 14 },
  title: { color: '#fff', fontSize: 28, fontWeight: '900' },
  subtitle: { color: 'rgba(255,255,255,0.4)', fontSize: 13 },

  // Carte
  mapWrapper: { marginHorizontal: 16, borderRadius: 20, overflow: 'hidden' },
  map: { height: 280 },

  transportRow: {
    flexDirection: 'row',
    backgroundColor: '#12122a',
    padding: 12,
    gap: 10,
  },
  transportBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(124,58,237,0.15)',
    borderRadius: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: 'rgba(124,58,237,0.3)',
  },
  transportIcon: { fontSize: 18 },
  transportLabel: { color: '#a78bfa', fontWeight: '700', fontSize: 13 },

  // Pin Mario
  pinWrapper: { alignItems: 'center' },
  pinBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowOffset: { width: 0, height: 3 },
    shadowRadius: 4,
    elevation: 6,
  },
  pinNumber: { color: '#fff', fontWeight: '900', fontSize: 14 },
  pinEmoji: { fontSize: 14 },
  pinTail: {
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 8,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },

  // Timeline
  timeline: { padding: 20, gap: 0 },
  timelineItem: { flexDirection: 'row', gap: 12 },
  timelineLeft: { alignItems: 'center', width: 32 },
  stepCircle: {
    width: 32, height: 32, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
  },
  stepNumber: { color: '#fff', fontWeight: '900', fontSize: 15 },
  stepLine: { width: 2, flex: 1, backgroundColor: 'rgba(255,255,255,0.1)', marginVertical: 4 },

  stepCard: {
    flex: 1,
    backgroundColor: '#12122a',
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 16,
  },
  stepPhoto: { width: '100%', height: 120 },
  stepInfo: { padding: 12, gap: 4 },
  stepTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  stepLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 1.2 },
  stepTime: { color: 'rgba(255,255,255,0.5)', fontSize: 12, fontWeight: '600' },
  stepName: { color: '#fff', fontSize: 15, fontWeight: '700', lineHeight: 20 },
  stepAddress: { color: 'rgba(255,255,255,0.4)', fontSize: 12 },
  stepTap: { color: 'rgba(124,58,237,0.6)', fontSize: 11, marginTop: 2 },

  // CTA
  cta: { paddingHorizontal: 20, gap: 10 },
  startBtn: {
    backgroundColor: '#7C3AED',
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
  },
  startBtnText: { color: '#fff', fontWeight: '800', fontSize: 17 },
  cancelBtn: { alignItems: 'center', paddingVertical: 10 },
  cancelBtnText: { color: 'rgba(255,255,255,0.3)', fontSize: 14 },

  // Modal bottom sheet
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#12122a',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
    paddingBottom: Platform.OS === 'ios' ? 34 : 24,
  },
  sheetPill: {
    width: 40,
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 4,
  },
  sheetPhoto: {
    width: '100%',
    height: 180,
  },
  sheetPhotoPlaceholder: {
    width: '100%',
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetPhotoEmoji: { fontSize: 48 },
  sheetContent: { padding: 20, gap: 10 },
  sheetBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  sheetBadgeText: { fontSize: 10, fontWeight: '800', letterSpacing: 1.2 },
  sheetBadgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  sheetResaBadge: {
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8,
    backgroundColor: 'rgba(234,88,12,0.18)',
    borderWidth: 1, borderColor: 'rgba(234,88,12,0.45)',
  },
  sheetResaBadgeText: { color: '#fb923c', fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  sheetName: { color: '#fff', fontSize: 20, fontWeight: '900', lineHeight: 26 },
  sheetAddress: { color: 'rgba(255,255,255,0.45)', fontSize: 13 },
  sheetSchedule: {
    color: 'rgba(255,255,255,0.55)', fontSize: 12, lineHeight: 17,
    backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 6,
  },
  sheetTransitInfo: { gap: 2 },
  sheetTransitLine: { color: 'rgba(255,255,255,0.5)', fontSize: 12 },
  sheetBookBtn: {
    backgroundColor: '#EA580C', borderRadius: 12,
    paddingVertical: 13, alignItems: 'center', marginTop: 4,
  },
  sheetBookBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  sheetDescription: { color: 'rgba(255,255,255,0.6)', fontSize: 13, lineHeight: 19 },
  sheetRouteLabel: { color: 'rgba(255,255,255,0.4)', fontSize: 12, marginTop: 4 },
  sheetTransportRow: { flexDirection: 'row', gap: 10 },
  sheetTransportBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    paddingVertical: 12,
    borderWidth: 1,
  },
  sheetTransportIcon: { fontSize: 20 },
  sheetTransportText: { fontWeight: '700', fontSize: 14 },
  sheetCloseBtn: {
    marginTop: 4,
    alignItems: 'center',
    paddingVertical: 10,
  },
  sheetCloseBtnText: { color: 'rgba(255,255,255,0.3)', fontSize: 14 },
});
