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
//  HOME        → composer son escapade (jusqu'à 3 items, tous types)
//  PLAN        → plan d'escapade : timeline + carte + liens
//  CHECKIN     → validation sur place + tampons
//  COMPLETED   → escapade terminée
//

export type AppStage =
  | 'ONBOARDING'
  | 'HOME'
  | 'PLAN'
  | 'CHECKIN'
  | 'COMPLETED';

// Nombre max d'étapes dans une escapade (libre : n'importe quel mix de types)
export const MAX_SELECTION = 3;

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

  // ── Sélection libre (jusqu'à MAX_SELECTION items, tous types) ──
  selection: Item[];
  addToSelection: (item: Item) => void;      // ignoré si plein ou déjà présent
  removeFromSelection: (id: string) => void;
  isSelected: (id: string) => boolean;

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

export const useGameStore = create<GameState>((set, get) => ({
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
  selection: [],
  addToSelection: (item) =>
    set((state) => {
      // Refuse les doublons et le dépassement de la limite
      if (state.selection.length >= MAX_SELECTION) return state;
      if (state.selection.some(i => i.id === item.id)) return state;
      return { selection: [...state.selection, item] };
    }),
  removeFromSelection: (id) =>
    set((state) => ({ selection: state.selection.filter(i => i.id !== id) })),
  isSelected: (id) => get().selection.some(i => i.id === id),

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
    selection: [],
    currentEscapadeId: null,
  }),
}));
