import { View, Text, TouchableOpacity, Pressable } from 'react-native';
import { useGameStore } from '../store/gameStore';

export default function CompletionModal() {
  const { activeQuest, completedQuests, dismissCompletion } = useGameStore();

  if (!activeQuest) return null;

  const totalXp = completedQuests.reduce((sum, q) => sum + q.xp_reward, 0);

  return (
    <Pressable className="absolute inset-0 bg-black/80 items-center justify-center px-6">
      <Pressable onPress={(e) => e.stopPropagation()}>
      <View className="bg-gray-900 rounded-3xl p-8 w-full items-center">
        <Text style={{ fontSize: 56, marginBottom: 8 }}>🎉</Text>

        <Text className="text-green-400 text-xs font-semibold uppercase tracking-widest mb-2">
          Quête accomplie !
        </Text>

        <Text className="text-white font-bold text-2xl text-center mb-6">
          {activeQuest.title}
        </Text>

        <View className="bg-purple-600/20 rounded-2xl px-8 py-5 mb-4 items-center w-full">
          <Text className="text-purple-400/70 text-sm mb-1">Points gagnés</Text>
          <Text className="text-purple-400 font-bold" style={{ fontSize: 48, lineHeight: 56 }}>
            +{activeQuest.xp_reward}
          </Text>
          <Text className="text-purple-400 text-xs">XP</Text>
        </View>

        <View className="bg-white/5 rounded-xl px-6 py-3 mb-8 items-center w-full">
          <Text className="text-white/50 text-xs mb-1">Total accumulé</Text>
          <Text className="text-white font-semibold text-lg">{totalXp} XP</Text>
        </View>

        <TouchableOpacity
          className="bg-green-500 rounded-xl py-4 items-center w-full"
          onPress={dismissCompletion}
        >
          <Text className="text-white font-bold text-base">Continuer l'aventure</Text>
        </TouchableOpacity>
      </View>
      </Pressable>
    </Pressable>
  );
}
