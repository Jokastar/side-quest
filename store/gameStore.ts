import { create } from 'zustand';
import type { Item, UserPreferences } from '../types/database';
import type { SpinMode } from '../lib/timing';

// ============================================================
// Machine à états finis (FSM) — App Spin
// ============================================================
//
//  ONBOARDING → HOME → PLAN → CHECKIN → COMPLETED
//                 ▲
//                 └──────────── resetEscapade (depuis n'importe où)
//
//  ONBOARDING  → premier lancement, choix des préférences
//  HOME        → composer son escapade (3 rangées swipables)
//  PLAN        → plan d'escapade : timeline + carte + liens
//  CHECKIN     → validation sur place + tampons
//  COMPLETED   → escapade terminée
//
// (Les étapes SPINNING/RESULTS ont disparu avec la machine à sous :
//  la sélection se fait directement sur l'accueil.)

export type AppStage =
  | 'ONBOARDING'
  | 'HOME'
  | 'PLAN'
  | 'CHECKIN'
  | 'COMPLETED';

// Index des 3 rangées : 0 = activité, 1 = table, 2 = sortie
export type ReelIndex = 0 | 1 | 2;

// La sélection d'une rangée : un item (permanent ou éphémère), ou rien
export type ReelResult = Item | null;

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

  // ── Sélection des 3 rangées ───────────────────────────────
  reelResults: [ReelResult, ReelResult, ReelResult];
  setReelResult: (index: ReelIndex, result: ReelResult) => void;

  // Créneau de l'escapade en cours (fixé à la validation) —
  // lu par plan.tsx pour afficher la bonne timeline
  spinMode: SpinMode;
  setSpinMode: (mode: SpinMode) => void;

  // ID de l'escapade créée en DB à la validation
  currentEscapadeId: string | null;
  setCurrentEscapadeId: (id: string) => void;

  // ── FSM ───────────────────────────────────────────────────
  stage: AppStage;

  finishOnboarding: () => void;   // ONBOARDING → HOME
  goToPlan: () => void;           // HOME → PLAN
  startCheckin: () => void;       // PLAN → CHECKIN
  completeEscapade: () => void;   // CHECKIN → COMPLETED
  resetEscapade: () => void;      // n'importe où → HOME (nouvelle escapade)
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

  // ── Sélection ─────────────────────────────────────────────
  reelResults: [null, null, null],
  setReelResult: (index, result) =>
    set((state) => {
      const updated = [...state.reelResults] as [ReelResult, ReelResult, ReelResult];
      updated[index] = result;
      return { reelResults: updated };
    }),

  spinMode: 'soiree',
  setSpinMode: (mode) => set({ spinMode: mode }),

  currentEscapadeId: null,
  setCurrentEscapadeId: (id) => set({ currentEscapadeId: id }),

  // ── FSM ───────────────────────────────────────────────────
  stage: 'ONBOARDING',

  finishOnboarding: () => set({ stage: 'HOME' }),

  // L'utilisateur valide sa sélection → plan d'escapade
  goToPlan: () => set((state) => {
    if (state.stage !== 'HOME') return state;
    return { stage: 'PLAN' };
  }),

  // L'utilisateur démarre son escapade → écran de check-in
  startCheckin: () => set((state) => {
    if (state.stage !== 'PLAN') return state;
    return { stage: 'CHECKIN' };
  }),

  // Au moins un tampon frappé → escapade terminée
  completeEscapade: () => set((state) => {
    if (state.stage !== 'CHECKIN') return state;
    return { stage: 'COMPLETED' };
  }),

  // Réinitialise pour une nouvelle escapade
  resetEscapade: () => set({
    stage: 'HOME',
    reelResults: [null, null, null],
    currentEscapadeId: null,
  }),
}));
