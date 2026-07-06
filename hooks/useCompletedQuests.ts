import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useGameStore } from '../store/gameStore';
import type { QuestWithCoords } from './useNearbyQuests';

// Type intermédiaire pour la jointure quest_submissions → quests
type SubmissionRow = {
  xp_earned: number;
  quests: {
    id: string;
    title: string;
    description: string | null;
    xp_reward: number;
    is_permanent: boolean;
    start_date: string | null;
    end_date: string | null;
    latitude: number;
    longitude: number;
  } | null;
};

// Récupère toutes les quêtes approuvées de l'utilisateur connecté
// en faisant une jointure entre quest_submissions et quests
async function fetchCompletedQuests(): Promise<QuestWithCoords[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('quest_submissions')
    .select(`
      xp_earned,
      quests (
        id, title, description, xp_reward,
        is_permanent, start_date, end_date,
        latitude, longitude
      )
    `)
    .eq('user_id', user.id)
    .eq('status', 'approved')
    .returns<SubmissionRow[]>();

  if (error) {
    console.error('[useCompletedQuests] error:', error.message);
    throw new Error(error.message);
  }

  // On utilise xp_earned (XP réellement gagné) plutôt que xp_reward (valeur de base de la quête)
  return (data ?? [])
    .filter((row): row is SubmissionRow & { quests: NonNullable<SubmissionRow['quests']> } =>
      row.quests !== null,
    )
    .map((row) => ({
      ...row.quests,
      xp_reward: row.xp_earned,
    }));
}

// Hook appelé au démarrage de l'app pour charger l'historique des quêtes complétées
// Cela permet d'empêcher l'utilisateur de refaire une quête déjà validée
// et d'afficher son profil avec le bon total XP dès l'ouverture
export function useCompletedQuests() {
  const setCompletedQuests = useGameStore((s) => s.setCompletedQuests);

  const { data, isLoading } = useQuery({
    queryKey: ['completedQuests'],
    queryFn: fetchCompletedQuests,
    staleTime: 1000 * 60 * 5, // 5 minutes de cache
  });

  // Synchronise les quêtes complétées dans le store Zustand dès qu'elles arrivent
  useEffect(() => {
    if (data) setCompletedQuests(data);
  }, [data]);

  return { isLoading };
}
