// ─────────────────────────────────────────────────────────────
// Check-in screen
//
// Flow per stop (2 steps, one single DB write) :
//   1. "J'y suis"  → GPS proximity → unlocks the camera (local state only)
//   2. "Photo"     → EXIF GPS check → Gemini validates the photo
//                  → INSERT stamps row + XP  ← the only DB write
//
// The stamp is the collectible: it copies the venue's name, photo,
// arrondissement and rarity so it survives even if the venue is
// deleted later. Photos are never uploaded — Gemini only.
// ─────────────────────────────────────────────────────────────

import { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, SafeAreaView, ActivityIndicator, Linking,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { useRouter } from 'expo-router';
import { useGameStore } from '../store/gameStore';
import { supabase } from '../lib/supabase';
import { getDistance } from '../hooks/useProximityCheck';
import type { Venue, SpinEvent } from '../types/database';

// ── Constants ─────────────────────────────────────────────────

const CHECKIN_RADIUS = 150;  // metres
const XP_GPS   = 70;
const XP_PHOTO = 30;

const GEMINI_API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY ?? '';
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent';

const STOP_CONFIG = [
  { emoji: '🎭', label: 'Lieu',   color: '#7C3AED', stamp: '🏛️' },
  { emoji: '🍽️', label: 'Table',  color: '#EA580C', stamp: '🍽️' },
  { emoji: '🎶', label: 'Sortie', color: '#DB2777', stamp: '🎶' },
];

// ── Types ──────────────────────────────────────────────────────

// pending → gps_ok → validating → done | skipped
type StopStatus = 'pending' | 'gps_ok' | 'validating' | 'done' | 'skipped';

interface StopState {
  status:    StopStatus;
  xp:        number;
  error:     string | null;
  geminiSaw: string | null;  // description de la photo par Gemini (affichée après validation)
}

// ── Item helpers ───────────────────────────────────────────────

function isEvent(item: Venue | SpinEvent): item is SpinEvent {
  return 'title' in item;
}
function getName(item: Venue | SpinEvent) {
  return isEvent(item) ? item.title : item.name;
}
function getAddress(item: Venue | SpinEvent) {
  // Events : l'adresse complète (avec code postal → arrondissement du tampon),
  // sinon le nom du lieu en secours
  return isEvent(item) ? (item.address ?? item.venue_name ?? null) : item.address;
}
function getCoords(item: Venue | SpinEvent) {
  if (item.lat == null || item.lng == null) return null;
  return { latitude: item.lat, longitude: item.lng };
}

// Parses the arrondissement (1–20) from a Paris postal code in the address.
// "12 Rue de Rivoli, 75004 Paris" → 4
function parseArrondissement(address: string | null): number | null {
  if (!address) return null;
  const match = address.match(/750(\d{2})/);
  if (!match) return null;
  const arr = parseInt(match[1], 10);
  return arr >= 1 && arr <= 20 ? arr : null;
}

// ── EXIF GPS extraction ────────────────────────────────────────
// iOS wraps GPS fields in a '{GPS}' block; Android puts them at the root.

function extractGpsFromExif(exif: Record<string, unknown>): { latitude: number; longitude: number } | null {
  const block  = (exif['{GPS}'] as Record<string, unknown>) ?? exif;
  const lat    = block['GPSLatitude']     as number | undefined;
  const lon    = block['GPSLongitude']    as number | undefined;
  const latRef = block['GPSLatitudeRef']  as string | undefined;
  const lonRef = block['GPSLongitudeRef'] as string | undefined;
  if (lat == null || lon == null) return null;
  return {
    latitude:  latRef === 'S' ? -lat : lat,
    longitude: lonRef === 'W' ? -lon : lon,
  };
}

// ── Gemini photo validation ────────────────────────────────────

const CATEGORY_HINTS: Record<string, string> = {
  lieu:       "un musée, galerie, monument ou lieu culturel (œuvres d'art, architecture, panneau d'exposition, façade historique)",
  restaurant: "un restaurant, café ou bar (table dressée, plat servi, comptoir, salle, menu, terrasse)",
  ambiance:   "une sortie nocturne : concert, club, bar ou spectacle (scène, foule, lumières de soirée, dancefloor, DJ, ambiance festive)",
};

async function validateWithGemini(
  uri:       string,
  venueName: string,
  category:  string,
): Promise<{ valid: boolean; reason: string }> {
  if (!GEMINI_API_KEY) return { valid: true, reason: 'Pas de clé Gemini.' };

  // Compress before sending (saves bandwidth, still readable by Gemini)
  const compressed = await manipulateAsync(
    uri,
    [{ resize: { width: 800 } }],
    { compress: 0.6, format: SaveFormat.JPEG, base64: true },
  );
  if (!compressed.base64) return { valid: true, reason: 'Compression échouée.' };

  // MODE TEST : accepte toutes les photos, décrit juste ce que Gemini voit.
  // Restaurer la vraie validation par catégorie (CATEGORY_HINTS) avant la prod.
  const prompt = `Décris en une courte phrase en français ce que tu vois sur cette photo.
Réponds UNIQUEMENT avec ce JSON (sans markdown) :
{ "valid": true, "reason": "ce que tu vois en une phrase" }`;

  const body = JSON.stringify({
    contents: [{ parts: [
      { inline_data: { mime_type: 'image/jpeg', data: compressed.base64 } },
      { text: prompt },
    ]}],
  });

  // Retry x3 with backoff on transient 5xx errors
  let res: Response | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    res = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    if (res.ok || res.status < 500) break;
    await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
  }

  if (!res?.ok) throw new Error(`Gemini ${res?.status ?? 'no response'}`);
  const data    = await res.json();
  const raw     = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  const cleaned = raw.replace(/```json\n?|\n?```/g, '').trim();
  return JSON.parse(cleaned);
}

// ── Stamp minting ─────────────────────────────────────────────
// The single DB write of the whole flow. Copies everything the
// stamp design needs so it stays renderable forever.

async function mintStamp(
  userId:   string,
  escapadeId: string | null,
  stop:     Venue | SpinEvent,
  category: 'lieu' | 'restaurant' | 'ambiance',
): Promise<boolean> {
  const { error } = await supabase.from('stamps').insert({
    user_id:        userId,
    escapade_id:    escapadeId,
    venue_id:       stop.id,
    category,
    venue_name:     getName(stop),
    arrondissement: parseArrondissement(getAddress(stop)),
    rarity:         !isEvent(stop) ? stop.rarity : 'common',
    photo_url:      stop.photo_url ?? null,
  });

  if (error) {
    console.error('[stamp] insert error:', error.message);
    return false;
  }
  return true;
}

// ── XP award ──────────────────────────────────────────────────

async function awardXp(userId: string, amount: number) {
  const { data } = await supabase.from('users').select('xp').eq('id', userId).single();
  const { error } = await supabase.from('users').upsert(
    { id: userId, xp: (data?.xp ?? 0) + amount },
    { onConflict: 'id' },
  );
  if (error) console.warn('[awardXp]', error.message);
}

// ── Stamp badge (shown on the card once earned) ───────────────

function StampBadge({ emoji, color }: { emoji: string; color: string }) {
  return (
    <View style={[styles.stampBadge, { borderColor: color }]}>
      <View style={[styles.stampInner, { borderColor: color + 'aa' }]}>
        <Text style={styles.stampEmoji}>{emoji}</Text>
        <Text style={[styles.stampText, { color }]}>VALIDÉ</Text>
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────
// Main screen
// ─────────────────────────────────────────────────────────────

export default function CheckinScreen() {
  const router = useRouter();
  const { reelResults, userLocation, currentEscapadeId, completeEscapade, resetEscapade } = useGameStore();

  const stops = reelResults.filter(Boolean) as (Venue | SpinEvent)[];

  const [stopStates, setStopStates] = useState<StopState[]>(
    stops.map(() => ({ status: 'pending', xp: 0, error: null, geminiSaw: null })),
  );

  function updateStop(index: number, patch: Partial<StopState>) {
    setStopStates(prev => {
      const next = [...prev];
      next[index] = { ...next[index], ...patch };
      return next;
    });
  }

  function distanceTo(stop: Venue | SpinEvent): number | null {
    const coords = getCoords(stop);
    if (!coords || !userLocation) return null;
    return getDistance(
      userLocation.latitude, userLocation.longitude,
      coords.latitude, coords.longitude,
    );
  }

  // ── Dynamic itinerary ─────────────────────────────────────────

  function openRouteToRemaining(travelMode: 'bicycling' | 'transit') {
    const remaining = stops.filter((_, i) =>
      stopStates[i].status !== 'done' && stopStates[i].status !== 'skipped',
    );
    const coords = remaining.map(getCoords).filter(Boolean) as { latitude: number; longitude: number }[];
    if (coords.length === 0) return;

    const origin      = userLocation
      ? `${userLocation.latitude},${userLocation.longitude}`
      : `${coords[0].latitude},${coords[0].longitude}`;
    const destination = `${coords[coords.length - 1].latitude},${coords[coords.length - 1].longitude}`;
    const waypoints   = (userLocation ? coords.slice(0, -1) : coords.slice(1, -1))
      .map(c => `${c.latitude},${c.longitude}`).join('|');

    Linking.openURL(
      `https://www.google.com/maps/dir/?api=1`
      + `&origin=${origin}`
      + `&destination=${destination}`
      + (waypoints ? `&waypoints=${waypoints}` : '')
      + `&travelmode=${travelMode}`,
    );
  }

  // ── Step 1: GPS — unlocks the camera, no DB write ────────────
  // Radius check disabled for testing; re-enable before prod.

  function handleGpsCheckin(i: number) {
    updateStop(i, { status: 'gps_ok', error: null });
  }

  // ── Step 2: photo → Gemini → mint stamp + XP ─────────────────

  async function handlePhoto(i: number) {
    const stop = stops[i];

    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      updateStop(i, { error: 'Permission caméra refusée.' });
      return;
    }

    // Camera only (no gallery) to prevent cheating
    const captured = await ImagePicker.launchCameraAsync({
      quality:       0.7,
      exif:          true,
      allowsEditing: false,
    });

    if (captured.canceled || !captured.assets?.[0]) return;

    const asset = captured.assets[0];
    updateStop(i, { status: 'validating', error: null });

    try {
      // 1. EXIF GPS — reject if the photo was taken too far from the stop
      const exif = asset.exif as Record<string, unknown> | undefined;
      if (exif) {
        const exifCoords = extractGpsFromExif(exif);
        const stopCoords = getCoords(stop);
        if (exifCoords && stopCoords) {
          const dist = getDistance(
            exifCoords.latitude, exifCoords.longitude,
            stopCoords.latitude, stopCoords.longitude,
          );
          if (dist > CHECKIN_RADIUS) {
            updateStop(i, {
              status: 'gps_ok',
              error:  `Photo prise à ${Math.round(dist)} m du lieu. Tu dois être sur place.`,
            });
            return;
          }
        }
      }

      // 2. Gemini checks the photo matches the venue category
      const category = (stop.category ?? (i === 1 ? 'restaurant' : i === 2 ? 'ambiance' : 'lieu')) as
        'lieu' | 'restaurant' | 'ambiance';
      const result = await validateWithGemini(asset.uri, getName(stop), category);

      if (!result.valid) {
        updateStop(i, {
          status: 'gps_ok',
          error:  result.reason ?? 'Photo non reconnue. Réessaie en cadrant mieux le lieu.',
        });
        return;
      }

      // 3. Validated → mint the stamp + award full XP
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const minted = await mintStamp(user.id, currentEscapadeId, stop, category);
      if (!minted) {
        updateStop(i, { status: 'gps_ok', error: 'Erreur de sauvegarde du tampon. Réessaie.' });
        return;
      }

      await awardXp(user.id, XP_GPS + XP_PHOTO);
      updateStop(i, { status: 'done', xp: XP_GPS + XP_PHOTO, geminiSaw: result.reason });

    } catch (e) {
      console.error('[checkin] validation error:', e);
      updateStop(i, {
        status: 'gps_ok',
        error:  'Erreur de validation. Réessaie.',
      });
    }
  }

  // ── Derived state ─────────────────────────────────────────────

  const totalXp        = stopStates.reduce((sum, s) => sum + s.xp, 0);
  const anyDone        = stopStates.some(s => s.status === 'done');
  const allHandled     = stopStates.every(s => s.status === 'done' || s.status === 'skipped');
  const remainingCount = stopStates.filter(s => s.status !== 'done' && s.status !== 'skipped').length;

  function handleFinish() {
    if (anyDone) completeEscapade();
    resetEscapade();
    router.replace('/');
  }

  // ─────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.root}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.backText}>← Plan</Text>
          </TouchableOpacity>
          <View style={styles.headerRow}>
            <Text style={styles.title}>Check-in</Text>
            {totalXp > 0 && (
              <View style={styles.xpBadge}>
                <Text style={styles.xpBadgeText}>+{totalXp} XP</Text>
              </View>
            )}
          </View>
          <Text style={styles.subtitle}>Prouve ta présence pour tamponner ton carnet</Text>
        </View>

        {/* Stop cards */}
        <View style={styles.cards}>
          {stops.map((stop, i) => {
            const cfg    = STOP_CONFIG[i];
            const state  = stopStates[i];
            const dist   = distanceTo(stop);
            const isNear = dist !== null && dist <= CHECKIN_RADIUS;
            const isDone = state.status === 'done' || state.status === 'skipped';

            return (
              <View
                key={i}
                style={[
                  styles.card,
                  state.status === 'done'    && styles.cardDone,
                  state.status === 'skipped' && styles.cardSkipped,
                ]}
              >
                {/* Stop header */}
                <View style={styles.cardTop}>
                  <View style={[styles.bubble, { backgroundColor: cfg.color }]}>
                    <Text style={styles.bubbleText}>{i + 1}</Text>
                  </View>
                  <View style={styles.cardInfo}>
                    <Text style={[styles.cardLabel, { color: cfg.color }]}>
                      {cfg.emoji}  {cfg.label.toUpperCase()}
                    </Text>
                    <Text style={styles.cardName} numberOfLines={2}>{getName(stop)}</Text>
                    {getAddress(stop) && (
                      <Text style={styles.cardAddress} numberOfLines={1}>{getAddress(stop)}</Text>
                    )}
                  </View>
                  {state.status === 'done'    && <StampBadge emoji={cfg.stamp} color={cfg.color} />}
                  {state.status === 'skipped' && <Text style={styles.skippedIcon}>⏭</Text>}
                </View>

                {/* Distance indicator (info only) */}
                {!isDone && (
                  <View style={styles.distanceRow}>
                    <View style={[styles.distanceDot, { backgroundColor: isNear ? '#16A34A' : '#6b7280' }]} />
                    <Text style={[styles.distanceText, { color: isNear ? '#4ade80' : 'rgba(255,255,255,0.35)' }]}>
                      {dist === null
                        ? 'GPS non disponible'
                        : isNear
                          ? `À ${Math.round(dist)} m · Sur place ✓`
                          : `À ${Math.round(dist)} m`}
                    </Text>
                  </View>
                )}

                {/* Step feedback */}
                {state.status === 'gps_ok' && (
                  <Text style={styles.stepHint}>📷  Prends une photo sur place pour obtenir ton tampon</Text>
                )}
                {state.status === 'done' && (
                  <View style={{ gap: 4 }}>
                    <Text style={styles.xpFull}>+{state.xp} XP · Tampon ajouté à ton carnet 🎉</Text>
                    {state.geminiSaw && (
                      <Text style={styles.geminiSaw}>👁  {state.geminiSaw}</Text>
                    )}
                  </View>
                )}

                {/* Error */}
                {state.error && (
                  <View style={styles.errorBox}>
                    <Text style={styles.errorText}>{state.error}</Text>
                  </View>
                )}

                {/* Actions */}
                {!isDone && (
                  <View style={styles.actions}>

                    {state.status === 'pending' && (
                      <TouchableOpacity
                        style={[styles.gpsBtn, { borderColor: cfg.color }]}
                        onPress={() => handleGpsCheckin(i)}
                        activeOpacity={0.75}
                      >
                        <Text style={[styles.gpsBtnText, { color: cfg.color }]}>
                          📍  J'y suis
                        </Text>
                      </TouchableOpacity>
                    )}

                    {state.status === 'gps_ok' && (
                      <TouchableOpacity
                        style={[styles.photoBtn, { backgroundColor: cfg.color }]}
                        onPress={() => handlePhoto(i)}
                        activeOpacity={0.8}
                      >
                        <Text style={styles.photoBtnText}>
                          📷  Photo → Tampon (+{XP_GPS + XP_PHOTO} XP)
                        </Text>
                      </TouchableOpacity>
                    )}

                    {state.status === 'validating' && (
                      <View style={styles.validatingRow}>
                        <ActivityIndicator color="#a78bfa" size="small" />
                        <Text style={styles.validatingText}>Gemini analyse ta photo…</Text>
                      </View>
                    )}

                    {state.status !== 'validating' && (
                      <TouchableOpacity
                        style={styles.skipBtn}
                        onPress={() => updateStop(i, { status: 'skipped', error: null })}
                      >
                        <Text style={styles.skipText}>Passer cette étape</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}
              </View>
            );
          })}
        </View>

        {/* Dynamic itinerary */}
        {remainingCount > 0 && (
          <View style={styles.itinerary}>
            <Text style={styles.itineraryTitle}>
              {remainingCount === 1 ? 'Prochaine étape' : `${remainingCount} étapes restantes`} · Depuis ta position
            </Text>
            <View style={styles.itineraryBtns}>
              <TouchableOpacity style={styles.itineraryBtn} onPress={() => openRouteToRemaining('bicycling')}>
                <Text style={styles.itineraryIcon}>🚲</Text>
                <Text style={styles.itineraryText}>Vélo</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.itineraryBtn} onPress={() => openRouteToRemaining('transit')}>
                <Text style={styles.itineraryIcon}>🚇</Text>
                <Text style={styles.itineraryText}>Métro</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Finish CTA */}
        <View style={styles.cta}>
          {allHandled ? (
            <TouchableOpacity style={styles.finishBtn} onPress={handleFinish}>
              <Text style={styles.finishBtnText}>🎉  Escapade terminée · +{totalXp} XP</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.finishBtn, styles.finishBtnSecondary]}
              onPress={handleFinish}
              disabled={!anyDone}
            >
              <Text style={[styles.finishBtnText, !anyDone && styles.finishBtnTextDisabled]}>
                {anyDone ? `Terminer · +${totalXp} XP` : 'Valide au moins un lieu pour continuer'}
              </Text>
            </TouchableOpacity>
          )}
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

// ─────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root:   { flex: 1, backgroundColor: '#0a0a16' },
  scroll: { paddingBottom: 48 },

  header:      { padding: 20, gap: 4 },
  backBtn:     { marginBottom: 8 },
  backText:    { color: '#a78bfa', fontSize: 14 },
  headerRow:   { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title:       { color: '#fff', fontSize: 28, fontWeight: '900' },
  xpBadge:     { backgroundColor: '#7C3AED', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20 },
  xpBadgeText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  subtitle:    { color: 'rgba(255,255,255,0.4)', fontSize: 13 },

  cards: { paddingHorizontal: 16, gap: 14 },
  card: {
    backgroundColor: '#12122a', borderRadius: 20, padding: 16, gap: 12,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  cardDone:    { borderColor: 'rgba(74,222,128,0.25)', backgroundColor: '#0d1a12' },
  cardSkipped: { opacity: 0.45 },

  cardTop:     { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  bubble:      { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  bubbleText:  { color: '#fff', fontWeight: '900', fontSize: 16 },
  cardInfo:    { flex: 1, gap: 2 },
  cardLabel:   { fontSize: 10, fontWeight: '800', letterSpacing: 1.2 },
  cardName:    { color: '#fff', fontSize: 15, fontWeight: '700', lineHeight: 20 },
  cardAddress: { color: 'rgba(255,255,255,0.4)', fontSize: 12 },
  skippedIcon: { fontSize: 20 },

  // Passport stamp overlay
  stampBadge: {
    width: 58, height: 58, borderRadius: 29,
    borderWidth: 2.5, alignItems: 'center', justifyContent: 'center',
    transform: [{ rotate: '12deg' }],
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  stampInner: {
    width: 50, height: 50, borderRadius: 25,
    borderWidth: 1.5, borderStyle: 'dashed',
    alignItems: 'center', justifyContent: 'center', gap: 2,
  },
  stampEmoji: { fontSize: 18 },
  stampText:  { fontSize: 7, fontWeight: '900', letterSpacing: 1 },

  distanceRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  distanceDot: { width: 8, height: 8, borderRadius: 4 },
  distanceText:{ fontSize: 13, fontWeight: '600' },

  stepHint: { color: '#a78bfa', fontSize: 12, fontWeight: '700' },
  xpFull:    { color: '#4ade80', fontSize: 13, fontWeight: '800' },
  geminiSaw: { color: 'rgba(255,255,255,0.45)', fontSize: 12, fontStyle: 'italic', lineHeight: 16 },

  errorBox:  {
    backgroundColor: 'rgba(239,68,68,0.12)', borderRadius: 10, padding: 10,
    borderWidth: 1, borderColor: 'rgba(239,68,68,0.25)',
  },
  errorText: { color: '#f87171', fontSize: 13 },

  actions:       { gap: 8 },
  gpsBtn:        {
    borderWidth: 2, borderRadius: 14, paddingVertical: 14,
    alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.03)',
  },
  gpsBtnText:    { fontWeight: '800', fontSize: 16 },
  photoBtn:      { borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  photoBtnText:  { color: '#fff', fontWeight: '800', fontSize: 15 },
  validatingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 14 },
  validatingText:{ color: '#a78bfa', fontSize: 14, fontWeight: '600' },
  skipBtn:       { alignItems: 'center', paddingVertical: 6 },
  skipText:      { color: 'rgba(255,255,255,0.25)', fontSize: 13 },

  itinerary: {
    marginTop: 20, marginHorizontal: 16,
    backgroundColor: '#12122a', borderRadius: 16, padding: 16, gap: 12,
    borderWidth: 1, borderColor: 'rgba(124,58,237,0.2)',
  },
  itineraryTitle: { color: 'rgba(255,255,255,0.5)', fontSize: 12, fontWeight: '700', letterSpacing: 0.5 },
  itineraryBtns:  { flexDirection: 'row', gap: 10 },
  itineraryBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: 'rgba(124,58,237,0.15)', borderRadius: 12, paddingVertical: 12,
    borderWidth: 1, borderColor: 'rgba(124,58,237,0.3)',
  },
  itineraryIcon: { fontSize: 18 },
  itineraryText: { color: '#a78bfa', fontWeight: '700', fontSize: 14 },

  cta:                   { marginTop: 20, paddingHorizontal: 16 },
  finishBtn:             { backgroundColor: '#7C3AED', paddingVertical: 16, borderRadius: 16, alignItems: 'center' },
  finishBtnSecondary:    {
    backgroundColor: 'rgba(124,58,237,0.2)',
    borderWidth: 1, borderColor: 'rgba(124,58,237,0.4)',
  },
  finishBtnText:         { color: '#fff', fontWeight: '800', fontSize: 17 },
  finishBtnTextDisabled: { color: 'rgba(255,255,255,0.35)' },
});
