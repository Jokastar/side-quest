import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useGameStore } from '../store/gameStore';

// Type représentant une quête avec ses coordonnées GPS (extraites de la colonne PostGIS)
export interface QuestWithCoords {
  id: string;
  title: string;
  description: string | null;
  xp_reward: number;
  is_permanent: boolean;
  start_date: string | null;
  end_date: string | null;
  latitude: number;
  longitude: number;
}

// Récupère toutes les quêtes actives depuis Supabase :
// - les quêtes permanentes (is_permanent = true)
// - les quêtes temporaires dont la date de début et de fin encadrent aujourd'hui
async function fetchActiveQuests(): Promise<QuestWithCoords[]> {
  const { data, error } = await supabase
    .from('quests')
    .select('id, title, description, xp_reward, is_permanent, start_date, end_date, latitude, longitude')
    .or('is_permanent.eq.true,and(start_date.lte.now(),end_date.gte.now())');

  if (error) {
    console.error('[useNearbyQuests] error:', error.message);
    throw new Error(error.message);
  }
  console.log('[useNearbyQuests] fetched', data?.length ?? 0, 'quests', data?.[0]);
  return (data ?? []) as QuestWithCoords[];
}

// Hook qui charge les quêtes actives et les synchronise dans le store global
// Le cache React Query évite de recharger pendant 2 minutes si les données n'ont pas changé
export function useNearbyQuests() {
  const userLocation = useGameStore((s) => s.userLocation);
  const setNearbyQuests = useGameStore((s) => s.setNearbyQuests);

  const { data = [], isLoading, error } = useQuery({
    queryKey: ['quests'],
    queryFn: fetchActiveQuests,
    enabled: !!userLocation, // on attend d'avoir la position GPS avant de charger les quêtes
    staleTime: 1000 * 60 * 2, // 2 minutes de cache
  });

  // Dès que les quêtes arrivent, on les pousse dans le store Zustand
  // pour que tous les composants (MapScreen, QuestList, etc.) y aient accès
  useEffect(() => {
    if (data.length) setNearbyQuests(data);
  }, [data]);

  return { quests: data, isLoading, error };
}
