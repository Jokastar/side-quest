import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useGameStore } from '../store/gameStore';

export interface QuestWithCoords {
  id: string;
  title: string;
  description: string;
  xp_reward: number;
  is_permanent: boolean;
  start_date: string | null;
  end_date: string | null;
  latitude: number;
  longitude: number;
}

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

export function useNearbyQuests() {
  const userLocation = useGameStore((s) => s.userLocation);
  const setNearbyQuests = useGameStore((s) => s.setNearbyQuests);

  const { data = [], isLoading, error } = useQuery({
    queryKey: ['quests'],
    queryFn: fetchActiveQuests,
    enabled: !!userLocation,
    staleTime: 1000 * 60 * 2,
  });

  useEffect(() => {
    if (data.length) setNearbyQuests(data);
  }, [data]);

  return { quests: data, isLoading, error };
}
