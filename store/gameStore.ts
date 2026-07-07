import { create } from 'zustand';
import type { Venue, SpinEvent, UserPreferences } from '../types/database';
import type { SpinMode } from '../components/SlotMachine';

// ============================================================
// Machine à états finis (FSM) — App Spin
// ============================================================
//
//  ONBOARDING → HOME → SPINNING → RESULTS → PLAN → CHECKIN → COMPLETED
//                 ▲       │           │        │
//                 │       │     (re-spin reel) │
//                 │       └──────────►◄────────┘
//                 └──────────────────────────────── resetEscapade
//
//  ONBOARDING  → premier lancement, choix des préférences
//  HOME        → écran principal, machine à sous prête
//  SPINNING    → animation des reels en cours (1.5-2s)
//  RESULTS     → 3 cartes affichées, l'user peut relancer un reel
//  PLAN        → plan d'escapade : timeline + carte + liens
//  CHECKIN     → vérification GPS sur place + photo optionnelle
//  COMPLETED   → escapade validée, affichage des XP gagnés

export type AppStage =
  | 'ONBOARDING'
  | 'HOME'
  | 'SPINNING'
  | 'RESULTS'
  | 'PLAN'
  | 'CHECKIN'
  | 'COMPLETED';

// Un reel peut être en train de spinner indépendamment des autres
export type ReelIndex = 0 | 1 | 2; // 0 = lieu, 1 = restaurant, 2 = ambiance

// Résultat d'un spin : venue (Google Places) ou event (Paris Open Data / Eventbrite)
export type ReelResult = Venue | SpinEvent | null;

interface LocationCoords {
  latitude: number;
  longitude: number;
}

interface GameState {
  // ── Position GPS ──────────────────────────────────────────
  userLocation: LocationCoords | null;
  setUserLocation: (location: LocationCoords) => void;

  // ── Préférences utilisateur ───────────────────────────────
  preferences: UserPreferences;
  setPreferences: (prefs: Partial<UserPreferences>) => void;

  // Onboarding : null = pas encore chargé depuis le stockage,
  // false = à faire, true = terminé
  hasOnboarded: boolean | null;
  setHasOnboarded: (done: boolean) => void;

  // ── Résultats des 3 reels ─────────────────────────────────
  // Index 0 = lieu, 1 = restaurant, 2 = ambiance
  reelResults: [ReelResult, ReelResult, ReelResult];
  setReelResult: (index: ReelIndex, result: ReelResult) => void;

  // Quel reel est en train de spinner (null = aucun)
  spinningReel: ReelIndex | null;
  setSpinningReel: (index: ReelIndex | null) => void;

  // Créneau du spin en cours (fixé au moment du spin) —
  // lu par plan.tsx pour afficher la bonne timeline (midi/aprem/soirée)
  spinMode: SpinMode;
  setSpinMode: (mode: SpinMode) => void;

  // ID de l'escapade créée en DB après que l'user valide les 3 reels
  currentEscapadeId: string | null;
  setCurrentEscapadeId: (id: string) => void;

  // ── FSM ───────────────────────────────────────────────────
  stage: AppStage;

  // Transitions
  finishOnboarding: () => void;          // ONBOARDING → HOME
  startSpin: (reel?: ReelIndex) => void; // HOME/RESULTS → SPINNING
  showResults: () => void;               // SPINNING → RESULTS
  goToPlan: () => void;                  // RESULTS → PLAN
  startCheckin: () => void;              // PLAN → CHECKIN
  completeEscapade: () => void;           // CHECKIN → COMPLETED
  resetEscapade: () => void;               // COMPLETED/n'importe → HOME (nouvelle escapade)
}

export const useGameStore = create<GameState>((set) => ({
  // ── Position GPS ──────────────────────────────────────────
  userLocation: null,
  setUserLocation: (location) => set({ userLocation: location }),

  // ── Préférences par défaut ────────────────────────────────
  // Écrasées au démarrage par celles du SecureStore (voir _layout.tsx)
  preferences: {
    maxPrice: 30,
    groupSize: 'duo',
    vibe: 'chill',
    distance: 'metro',
    defaultTiming: 'auto',
  },
  setPreferences: (prefs) =>
    set((state) => ({ preferences: { ...state.preferences, ...prefs } })),

  hasOnboarded: null,
  setHasOnboarded: (done) => set({ hasOnboarded: done }),

  // ── Reels ─────────────────────────────────────────────────
  reelResults: [null, null, null],
  setReelResult: (index, result) =>
    set((state) => {
      const updated = [...state.reelResults] as [ReelResult, ReelResult, ReelResult];
      updated[index] = result;
      return { reelResults: updated };
    }),

  spinningReel: null,
  setSpinningReel: (index) => set({ spinningReel: index }),

  spinMode: 'soiree',
  setSpinMode: (mode) => set({ spinMode: mode }),

  currentEscapadeId: null,
  setCurrentEscapadeId: (id) => set({ currentEscapadeId: id }),

  // ── FSM ───────────────────────────────────────────────────
  stage: 'ONBOARDING',

  // L'onboarding est terminé → on arrive sur l'écran principal
  finishOnboarding: () => set({ stage: 'HOME' }),

  // Lance un spin :
  // - sans paramètre → spin des 3 reels depuis HOME
  // - avec un index  → re-spin d'un seul reel depuis RESULTS
  startSpin: (reel) => set((state) => {
    if (state.stage !== 'HOME' && state.stage !== 'RESULTS') return state;
    return {
      stage: 'SPINNING',
      spinningReel: reel ?? null,
    };
  }),

  // Animation terminée → on affiche les 3 cartes résultats
  showResults: () => set((state) => {
    if (state.stage !== 'SPINNING') return state;
    return { stage: 'RESULTS', spinningReel: null };
  }),

  // L'user valide les 3 reels → plan d'escapade
  goToPlan: () => set((state) => {
    if (state.stage !== 'RESULTS') return state;
    return { stage: 'PLAN' };
  }),

  // L'user démarre son escapade → écran de check-in GPS
  startCheckin: () => set((state) => {
    if (state.stage !== 'PLAN') return state;
    return { stage: 'CHECKIN' };
  }),

  // Check-in validé → modal de récompense XP
  completeEscapade: () => set((state) => {
    if (state.stage !== 'CHECKIN') return state;
    return { stage: 'COMPLETED' };
  }),

  // Réinitialise pour une nouvelle escapade
  resetEscapade: () => set({
    stage: 'HOME',
    reelResults: [null, null, null],
    spinningReel: null,
    currentEscapadeId: null,
  }),
}));
