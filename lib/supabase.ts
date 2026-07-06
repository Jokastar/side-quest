import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { Database } from '../types/database';

// SecureStore a une limite de 2048 octets par clé
// La session Supabase (JWT + refresh token) dépasse souvent cette limite
// On la découpe donc en morceaux de 1800 octets pour rester sous la limite
const CHUNK_SIZE = 1800;

// Adaptateur de stockage natif avec découpage en chunks pour iOS/Android
const nativeStorage = {
  getItem: async (key: string): Promise<string | null> => {
    // On vérifie d'abord s'il existe des chunks (clé __n = nombre de chunks)
    const countStr = await SecureStore.getItemAsync(`${key}__n`);
    if (!countStr) return SecureStore.getItemAsync(key); // ancienne clé non découpée
    const count = parseInt(countStr, 10);
    const chunks = await Promise.all(
      Array.from({ length: count }, (_, i) => SecureStore.getItemAsync(`${key}__${i}`))
    );
    return chunks.every(Boolean) ? chunks.join('') : null;
  },
  setItem: async (key: string, value: string): Promise<void> => {
    if (value.length <= CHUNK_SIZE) {
      await SecureStore.setItemAsync(key, value);
      return;
    }
    // Découpe la valeur en morceaux et stocke chaque morceau séparément
    const chunks: string[] = [];
    for (let i = 0; i < value.length; i += CHUNK_SIZE) {
      chunks.push(value.slice(i, i + CHUNK_SIZE));
    }
    await SecureStore.setItemAsync(`${key}__n`, String(chunks.length));
    await Promise.all(chunks.map((chunk, i) => SecureStore.setItemAsync(`${key}__${i}`, chunk)));
  },
  removeItem: async (key: string): Promise<void> => {
    const countStr = await SecureStore.getItemAsync(`${key}__n`);
    if (countStr) {
      // Supprime tous les chunks + la clé de comptage
      const count = parseInt(countStr, 10);
      await Promise.all([
        SecureStore.deleteItemAsync(`${key}__n`),
        ...Array.from({ length: count }, (_, i) => SecureStore.deleteItemAsync(`${key}__${i}`)),
      ]);
    } else {
      await SecureStore.deleteItemAsync(key);
    }
  },
};

// Sur le web, SecureStore n'est pas disponible → on utilise localStorage
const storage = Platform.OS === 'web'
  ? {
      getItem: (key: string) => Promise.resolve(localStorage.getItem(key)),
      setItem: (key: string, value: string) => { localStorage.setItem(key, value); return Promise.resolve(); },
      removeItem: (key: string) => { localStorage.removeItem(key); return Promise.resolve(); },
    }
  : nativeStorage;

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabasePublishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

// Client Supabase unique pour toute l'app
// - storage : session persistée de façon sécurisée sur l'appareil
// - autoRefreshToken : renouvelle le JWT automatiquement avant expiration
// - detectSessionInUrl : désactivé car inutile en React Native (pas d'URL de callback OAuth)
export const supabase = createClient<Database>(supabaseUrl, supabasePublishableKey, {
  auth: {
    storage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
