import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import type { UserPreferences } from '../types/database';

// ─────────────────────────────────────────────────────────────
// Persistance locale des préférences + flag d'onboarding.
// SecureStore sur mobile, localStorage sur web (comme lib/supabase.ts).
// Le payload est petit (< 300 octets), pas besoin de chunking.
// ─────────────────────────────────────────────────────────────

const KEY = 'spin_prefs_v1';

export const DEFAULT_PREFERENCES: UserPreferences = {
  maxPrice: 30,          // -30€/personne par défaut
  groupSize: 'duo',
  vibe: 'chill',
  distance: 'metro',
  defaultTiming: 'auto', // détection selon l'heure
};

interface StoredPrefs {
  preferences: UserPreferences;
  hasOnboarded: boolean;
}

async function read(): Promise<string | null> {
  if (Platform.OS === 'web') return localStorage.getItem(KEY);
  return SecureStore.getItemAsync(KEY);
}

async function write(value: string): Promise<void> {
  if (Platform.OS === 'web') { localStorage.setItem(KEY, value); return; }
  await SecureStore.setItemAsync(KEY, value);
}

// Charge les prefs stockées. Retourne les défauts si rien n'est stocké
// ou si le JSON est corrompu (jamais d'exception).
export async function loadStoredPrefs(): Promise<StoredPrefs> {
  try {
    const raw = await read();
    if (!raw) return { preferences: DEFAULT_PREFERENCES, hasOnboarded: false };
    const parsed = JSON.parse(raw) as Partial<StoredPrefs>;
    return {
      // merge avec les défauts : si on ajoute un champ plus tard,
      // les anciens utilisateurs récupèrent sa valeur par défaut
      preferences: { ...DEFAULT_PREFERENCES, ...(parsed.preferences ?? {}) },
      hasOnboarded: parsed.hasOnboarded ?? false,
    };
  } catch (e) {
    console.warn('[prefsStorage] load error:', e);
    return { preferences: DEFAULT_PREFERENCES, hasOnboarded: false };
  }
}

export async function saveStoredPrefs(prefs: StoredPrefs): Promise<void> {
  try {
    await write(JSON.stringify(prefs));
  } catch (e) {
    console.warn('[prefsStorage] save error:', e);
  }
}
