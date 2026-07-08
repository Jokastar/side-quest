// ─────────────────────────────────────────────────────────────
// Profile screen — carnet de voyage
//
// Shows XP progress, stats, and the user's stamp collection.
// Each stamp is rendered as a postage stamp: perforated frame,
// venue photo, arrondissement postmark, date, rarity accents.
// Data comes straight from the `stamps` table (one row = one stamp).
// ─────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Image,
  StyleSheet, SafeAreaView, ActivityIndicator, Dimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../lib/supabase';
import type { User, Stamp } from '../types/database';

const SCREEN_WIDTH = Dimensions.get('window').width;
// 2 columns of stamps, 16px screen padding, 12px gap between them
const STAMP_WIDTH  = (SCREEN_WIDTH - 32 - 12) / 2;
const STAMP_HEIGHT = STAMP_WIDTH * 1.25;   // classic portrait stamp ratio

// ── XP levels ─────────────────────────────────────────────────

const LEVELS = [
  { name: 'Explorateur',      min: 0,    color: '#6b7280', emoji: '🗺️' },
  { name: 'Aventurier',       min: 200,  color: '#3b82f6', emoji: '⚔️' },
  { name: 'Flâneur',          min: 500,  color: '#8b5cf6', emoji: '🌙' },
  { name: 'Noctambule',       min: 1000, color: '#ec4899', emoji: '🌃' },
  { name: 'Légende de Paris', min: 2000, color: '#f59e0b', emoji: '👑' },
];

function getLevelInfo(xp: number) {
  const level    = LEVELS.findLast(l => xp >= l.min) ?? LEVELS[0];
  const next     = LEVELS[LEVELS.indexOf(level) + 1];
  const progress = next ? (xp - level.min) / (next.min - level.min) : 1;
  return { level, next, progress: Math.min(progress, 1) };
}

// ── Stamp design tokens ───────────────────────────────────────

// Encre du tampon selon le slot de l'étape.
// Les clés legacy (lieu/restaurant/ambiance) restent pour les tampons
// frappés avant la migration vers le modèle unifié.
const SLOT_INK: Record<string, { color: string; emoji: string; label: string }> = {
  activite:   { color: '#7C3AED', emoji: '🏛️', label: 'ACTIVITÉ' },
  table:      { color: '#EA580C', emoji: '🍽️', label: 'TABLE' },
  sortie:     { color: '#DB2777', emoji: '🎶', label: 'SORTIE' },
  // legacy
  lieu:       { color: '#7C3AED', emoji: '🏛️', label: 'LIEU' },
  restaurant: { color: '#EA580C', emoji: '🍽️', label: 'TABLE' },
  ambiance:   { color: '#DB2777', emoji: '🎶', label: 'SORTIE' },
};

// Rarity drives the paper + frame treatment of the stamp
const RARITY_STYLE: Record<string, { paper: string; frame: string; tag: string | null }> = {
  common:    { paper: '#f5f0e6', frame: 'transparent', tag: null },
  rare:      { paper: '#eef3f8', frame: '#3b82f6',     tag: 'RARE' },
  epic:      { paper: '#f4effa', frame: '#8b5cf6',     tag: 'ÉPIQUE' },
  legendary: { paper: '#fdf6e3', frame: '#f59e0b',     tag: 'LÉGENDAIRE' },
};

// ── Perforated edge ───────────────────────────────────────────
// A row/column of small dark dots that "cut" into the stamp paper,
// mimicking the torn perforation holes of a real postage stamp.

function Perforation({ horizontal, count }: { horizontal: boolean; count: number }) {
  return (
    <View style={[styles.perfRow, horizontal ? styles.perfH : styles.perfV]}>
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={styles.perfHole} />
      ))}
    </View>
  );
}

// ── The postage stamp itself ──────────────────────────────────

function StampCard({ stamp }: { stamp: Stamp }) {
  const ink    = SLOT_INK[stamp.slot] ?? SLOT_INK.activite;
  const rarity = RARITY_STYLE[stamp.rarity] ?? RARITY_STYLE.common;
  const date   = new Date(stamp.earned_at).toLocaleDateString('fr-FR', {
    day: '2-digit', month: 'short', year: '2-digit',
  });

  return (
    <View style={styles.stampWrap}>
      {/* Paper with perforated edges */}
      <View style={[styles.stampPaper, { backgroundColor: rarity.paper }]}>
        <Perforation horizontal count={9} />

        <View style={styles.stampBody}>
          <Perforation horizontal={false} count={11} />

          {/* Inner printed area */}
          <View style={[styles.stampPrint, rarity.frame !== 'transparent' && { borderColor: rarity.frame, borderWidth: 2 }]}>

            {/* Header row : category + "value" like a stamp denomination */}
            <View style={styles.stampHeader}>
              <Text style={[styles.stampCategory, { color: ink.color }]}>{ink.label}</Text>
              <Text style={[styles.stampValue, { color: ink.color }]}>
                {stamp.arrondissement ? `${stamp.arrondissement}e` : 'PARIS'}
              </Text>
            </View>

            {/* Illustration : venue photo, or category emoji as fallback */}
            {stamp.photo_url ? (
              <Image source={{ uri: stamp.photo_url }} style={styles.stampImage} resizeMode="cover" />
            ) : (
              <View style={[styles.stampImageFallback, { backgroundColor: ink.color + '15' }]}>
                <Text style={styles.stampImageEmoji}>{ink.emoji}</Text>
              </View>
            )}

            {/* Venue name — the "country" line of the stamp */}
            <Text style={[styles.stampVenue, { color: ink.color }]} numberOfLines={2}>
              {stamp.venue_name.toUpperCase()}
            </Text>

            {/* Rarity tag for rare+ stamps */}
            {rarity.tag && (
              <Text style={[styles.rarityTag, { color: rarity.frame }]}>★ {rarity.tag}</Text>
            )}
          </View>

          <Perforation horizontal={false} count={11} />
        </View>

        <Perforation horizontal count={9} />
      </View>

      {/* Postmark : circular cancel over the corner with the date */}
      <View style={styles.postmark}>
        <Text style={styles.postmarkCity}>PARIS</Text>
        <Text style={styles.postmarkDate}>{date}</Text>
        {stamp.arrondissement && (
          <Text style={styles.postmarkArr}>750{String(stamp.arrondissement).padStart(2, '0')}</Text>
        )}
      </View>
    </View>
  );
}

function StatTile({ value, label, emoji }: { value: number | string; label: string; emoji: string }) {
  return (
    <View style={styles.statTile}>
      <Text style={styles.statEmoji}>{emoji}</Text>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────
// Main screen
// ─────────────────────────────────────────────────────────────

export default function ProfileScreen() {
  const router = useRouter();

  const [loading,  setLoading]  = useState(true);
  const [userData, setUserData] = useState<User | null>(null);
  const [stamps,   setStamps]   = useState<Stamp[]>([]);

  useEffect(() => { loadProfile(); }, []);

  async function loadProfile() {
    setLoading(true);
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) return;

      // Ensure the users row exists (first visit)
      await supabase
        .from('users')
        .upsert({ id: authUser.id, email: authUser.email ?? null }, { onConflict: 'id', ignoreDuplicates: true });

      const [profileRes, stampsRes] = await Promise.all([
        supabase.from('users').select('*').eq('id', authUser.id).single(),
        supabase.from('stamps').select('*').eq('user_id', authUser.id).order('earned_at', { ascending: false }),
      ]);

      if (profileRes.data) setUserData(profileRes.data as User);
      if (stampsRes.data)  setStamps(stampsRes.data as Stamp[]);
    } catch (e) {
      console.warn('[profile] load error:', e);
    } finally {
      setLoading(false);
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.replace('/login');
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.root}>
        <ActivityIndicator color="#7C3AED" style={{ flex: 1 }} />
      </SafeAreaView>
    );
  }

  const xp = userData?.xp ?? 0;
  const { level, next, progress } = getLevelInfo(xp);
  const displayName = userData?.username ?? userData?.email?.split('@')[0] ?? 'Anonyme';
  const memberSince = userData?.created_at
    ? new Date(userData.created_at).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
    : null;

  // Arrondissement passport progress : distinct arrondissements stamped
  const arrondissements = new Set(stamps.map(s => s.arrondissement).filter(Boolean));
  // Distinct escapades that produced at least one stamp
  const escapadeCount = new Set(stamps.map(s => s.escapade_id).filter(Boolean)).size;

  return (
    <SafeAreaView style={styles.root}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.backText}>← Retour</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Profil</Text>
        </View>

        {/* Identity */}
        <View style={styles.identityCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarEmoji}>{level.emoji}</Text>
          </View>
          <View style={styles.identityInfo}>
            <Text style={styles.displayName}>{displayName}</Text>
            {memberSince && <Text style={styles.memberSince}>Membre depuis {memberSince}</Text>}
            <View style={[styles.levelBadge, { backgroundColor: level.color + '22' }]}>
              <Text style={[styles.levelBadgeText, { color: level.color }]}>
                {level.emoji}  {level.name}
              </Text>
            </View>
          </View>
          {(userData?.streak_count ?? 0) > 0 && (
            <View style={styles.streakBubble}>
              <Text style={styles.streakFire}>🔥</Text>
              <Text style={styles.streakCount}>{userData!.streak_count}</Text>
            </View>
          )}
        </View>

        {/* XP */}
        <View style={styles.xpCard}>
          <View style={styles.xpRow}>
            <Text style={styles.xpLabel}>XP TOTAL</Text>
            <Text style={styles.xpValue}>{xp.toLocaleString('fr-FR')} XP</Text>
          </View>
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${progress * 100}%`, backgroundColor: level.color }]} />
          </View>
          <View style={styles.progressLabels}>
            <Text style={styles.progressFrom}>{level.name}</Text>
            {next && <Text style={styles.progressTo}>{next.min - xp} XP → {next.name}</Text>}
          </View>
        </View>

        {/* Stats */}
        <View style={styles.statsRow}>
          <StatTile value={stamps.length}          label="tampons"  emoji="📮" />
          <StatTile value={escapadeCount}            label="escapades"  emoji="🎰" />
          <StatTile value={`${arrondissements.size}/20`} label="arrond."  emoji="🗼" />
        </View>

        {/* Carnet de voyage */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Carnet de voyage</Text>

          {stamps.length === 0 ? (
            <View style={styles.emptyStamps}>
              <Text style={styles.emptyEmoji}>📮</Text>
              <Text style={styles.emptyText}>Pas encore de tampons</Text>
              <Text style={styles.emptySubtext}>
                Valide ta présence avec une photo pour collectionner les lieux de Paris
              </Text>
            </View>
          ) : (
            <View style={styles.stampGrid}>
              {stamps.map(stamp => (
                <StampCard key={stamp.id} stamp={stamp} />
              ))}
            </View>
          )}
        </View>

        {/* Logout */}
        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
          <Text style={styles.logoutText}>Se déconnecter</Text>
        </TouchableOpacity>

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

  header:   { padding: 20, gap: 4 },
  backBtn:  { marginBottom: 4 },
  backText: { color: '#a78bfa', fontSize: 14 },
  title:    { color: '#fff', fontSize: 28, fontWeight: '900' },

  // Identity
  identityCard: {
    marginHorizontal: 16, marginBottom: 12,
    backgroundColor: '#12122a', borderRadius: 20, padding: 16,
    flexDirection: 'row', alignItems: 'center', gap: 14,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  avatar:        { width: 60, height: 60, borderRadius: 30, backgroundColor: '#1e1e3a', alignItems: 'center', justifyContent: 'center' },
  avatarEmoji:   { fontSize: 28 },
  identityInfo:  { flex: 1, gap: 4 },
  displayName:   { color: '#fff', fontSize: 18, fontWeight: '800' },
  memberSince:   { color: 'rgba(255,255,255,0.35)', fontSize: 12 },
  levelBadge:    { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, marginTop: 4 },
  levelBadgeText:{ fontSize: 11, fontWeight: '800' },
  streakBubble:  { alignItems: 'center', gap: 2, backgroundColor: 'rgba(234,88,12,0.15)', borderRadius: 12, padding: 10 },
  streakFire:    { fontSize: 20 },
  streakCount:   { color: '#fb923c', fontWeight: '900', fontSize: 15 },

  // XP
  xpCard: {
    marginHorizontal: 16, marginBottom: 12,
    backgroundColor: '#12122a', borderRadius: 20, padding: 16, gap: 10,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  xpRow:          { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  xpLabel:        { color: 'rgba(255,255,255,0.4)', fontSize: 11, fontWeight: '800', letterSpacing: 1.2 },
  xpValue:        { color: '#a78bfa', fontSize: 20, fontWeight: '900' },
  progressBar:    { height: 8, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 4, overflow: 'hidden' },
  progressFill:   { height: '100%', borderRadius: 4 },
  progressLabels: { flexDirection: 'row', justifyContent: 'space-between' },
  progressFrom:   { color: 'rgba(255,255,255,0.3)', fontSize: 11 },
  progressTo:     { color: 'rgba(255,255,255,0.3)', fontSize: 11 },

  // Stats
  statsRow: { flexDirection: 'row', marginHorizontal: 16, marginBottom: 16, gap: 10 },
  statTile: {
    flex: 1, backgroundColor: '#12122a', borderRadius: 16, paddingVertical: 16,
    alignItems: 'center', gap: 4, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  statEmoji: { fontSize: 22 },
  statValue: { color: '#fff', fontSize: 20, fontWeight: '900' },
  statLabel: { color: 'rgba(255,255,255,0.35)', fontSize: 11, fontWeight: '600' },

  // Section
  section:      { marginHorizontal: 16, marginBottom: 16 },
  sectionTitle: { color: '#fff', fontSize: 16, fontWeight: '800', marginBottom: 12 },

  // ── Stamp grid ───────────────────────────────────────────────
  stampGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },

  stampWrap: { width: STAMP_WIDTH, height: STAMP_HEIGHT },

  // Cream paper base — perforations "cut" holes into its edges
  stampPaper: {
    flex: 1, borderRadius: 3,
    paddingVertical: 2,
    // subtle shadow so the stamp lifts off the dark page
    shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 6, shadowOffset: { width: 0, height: 3 },
    elevation: 5,
  },
  stampBody: { flex: 1, flexDirection: 'row', paddingHorizontal: 2 },

  // Perforation holes — dark dots matching the page background
  perfRow:  { justifyContent: 'space-evenly', alignItems: 'center' },
  perfH:    { flexDirection: 'row', height: 8 },
  perfV:    { flexDirection: 'column', width: 8 },
  perfHole: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#0a0a16' },

  // Printed area inside the perforations
  stampPrint: {
    flex: 1, margin: 2, padding: 8, gap: 6,
    borderWidth: 1, borderColor: 'rgba(0,0,0,0.15)',
    alignItems: 'center',
  },
  stampHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignSelf: 'stretch',
  },
  stampCategory: { fontSize: 9,  fontWeight: '900', letterSpacing: 1.5 },
  stampValue:    { fontSize: 13, fontWeight: '900' },

  stampImage: {
    alignSelf: 'stretch', flex: 1, borderRadius: 2,
    backgroundColor: 'rgba(0,0,0,0.08)',
  },
  stampImageFallback: {
    alignSelf: 'stretch', flex: 1, borderRadius: 2,
    alignItems: 'center', justifyContent: 'center',
  },
  stampImageEmoji: { fontSize: 36 },

  stampVenue: { fontSize: 9, fontWeight: '800', letterSpacing: 0.5, textAlign: 'center', lineHeight: 12 },
  rarityTag:  { fontSize: 8, fontWeight: '900', letterSpacing: 1 },

  // Circular cancel postmark over the top-right corner
  postmark: {
    position: 'absolute', top: -8, right: -8,
    width: 62, height: 62, borderRadius: 31,
    borderWidth: 2, borderColor: 'rgba(30,30,60,0.55)',
    alignItems: 'center', justifyContent: 'center',
    transform: [{ rotate: '-14deg' }],
    backgroundColor: 'rgba(245,240,230,0.15)',
  },
  postmarkCity: { fontSize: 8,  fontWeight: '900', color: 'rgba(30,30,60,0.75)', letterSpacing: 1 },
  postmarkDate: { fontSize: 8,  fontWeight: '700', color: 'rgba(30,30,60,0.75)' },
  postmarkArr:  { fontSize: 7,  fontWeight: '700', color: 'rgba(30,30,60,0.6)' },

  // Empty state
  emptyStamps: {
    backgroundColor: '#12122a', borderRadius: 20, padding: 32,
    alignItems: 'center', gap: 8,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  emptyEmoji:   { fontSize: 40 },
  emptyText:    { color: 'rgba(255,255,255,0.5)', fontSize: 15, fontWeight: '700' },
  emptySubtext: { color: 'rgba(255,255,255,0.25)', fontSize: 12, textAlign: 'center' },

  // Logout
  logoutBtn:  { marginHorizontal: 16, alignItems: 'center', paddingVertical: 12 },
  logoutText: { color: 'rgba(255,255,255,0.2)', fontSize: 14 },
});
