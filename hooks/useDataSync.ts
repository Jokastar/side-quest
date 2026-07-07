import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

// ─────────────────────────────────────────────────────────────
// La synchronisation des données (Paris Open Data + Google Places)
// tourne côté serveur dans l'Edge Function `sync-data` :
//   - cron Supabase toutes les 6h
//   - déclenchée ici en secours si le cache est périmé au lancement
//
// Le client ne fait plus AUCUNE écriture sur events/venues :
// les clés API restent côté serveur et le cache partagé est protégé.
// ─────────────────────────────────────────────────────────────

const STALE_AFTER_MS = 6 * 60 * 60 * 1000; // 6h

// Vérifie si les données sont périmées (dernière sync > 6h)
async function isDataStale(): Promise<boolean> {
  const { data } = await supabase
    .from('events')
    .select('cached_at')
    .order('cached_at', { ascending: false })
    .limit(1)
    .single();

  if (!data) return true; // table vide → périmée

  const lastSync = new Date(data.cached_at).getTime();
  return Date.now() - lastSync > STALE_AFTER_MS;
}

export function useDataSync() {
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    async function run() {
      setSyncing(true);
      setSyncError(null);

      try {
        const stale = await isDataStale();

        if (stale) {
          console.log('[useDataSync] cache périmé → invocation de sync-data...');
          // NB : la fonction est déployée sous le nom 'sync-data-' (tiret final)
          // sur Supabase — le cron pointe aussi vers ce nom
          const { data, error } = await supabase.functions.invoke('sync-data-');
          if (error) throw new Error(error.message);
          console.log('[useDataSync] sync-data:', JSON.stringify(data));
        } else {
          console.log('[useDataSync] données récentes, pas de sync nécessaire');
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        console.error('[useDataSync] erreur:', message);
        setSyncError(message);
      } finally {
        setSyncing(false);
        setReady(true); // prêt même en cas d'erreur (on sert le cache)
      }
    }

    run();
  }, []);

  return { syncing, syncError, ready };
}
