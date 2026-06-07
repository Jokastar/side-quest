import { create } from 'zustand';
import type { Quest } from '../types/database';

interface LocationCoords {
  latitude: number;
  longitude: number;
}

interface GameState {
  // Location
  userLocation: LocationCoords | null;
  setUserLocation: (location: LocationCoords) => void;

  // Quests
  nearbyQuests: Quest[];
  activeQuest: Quest | null;
  completedQuestIds: string[];
  setNearbyQuests: (quests: Quest[]) => void;
  setActiveQuest: (quest: Quest | null) => void;
  markQuestCompleted: (questId: string) => void;
  isQuestCompleted: (questId: string) => boolean;
}

export const useGameStore = create<GameState>((set, get) => ({
  userLocation: null,
  setUserLocation: (location) => set({ userLocation: location }),

  nearbyQuests: [],
  activeQuest: null,
  completedQuestIds: [],

  setNearbyQuests: (quests) => set({ nearbyQuests: quests }),
  setActiveQuest: (quest) => set({ activeQuest: quest }),

  markQuestCompleted: (questId) =>
    set((state) => ({
      completedQuestIds: [...state.completedQuestIds, questId],
      activeQuest: state.activeQuest?.id === questId ? null : state.activeQuest,
    })),

  isQuestCompleted: (questId) => get().completedQuestIds.includes(questId),
}));
