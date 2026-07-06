import { View, Text, TouchableOpacity, FlatList } from 'react-native';
import { useGameStore } from '../store/gameStore';
import type { QuestWithCoords } from '../hooks/useNearbyQuests';

const XP_PER_LEVEL = 500;

interface Props {
  onClose: () => void;
}

export default function ProfilePanel({ onClose }: Props) {
  const completedQuests = useGameStore((s) => s.completedQuests);

  const totalXp = completedQuests.reduce((sum, q) => sum + q.xp_reward, 0);
  const level = Math.floor(totalXp / XP_PER_LEVEL) + 1;
  const xpIntoLevel = totalXp % XP_PER_LEVEL;
  const progress = xpIntoLevel / XP_PER_LEVEL;

  const renderQuest = ({ item }: { item: QuestWithCoords }) => (
    <View className="flex-row items-center bg-white/5 rounded-xl px-4 py-3 mb-2">
      <Text className="text-green-400 mr-3 text-base">✓</Text>
      <Text className="text-white flex-1 text-sm" numberOfLines={1}>{item.title}</Text>
      <Text className="text-purple-400 font-bold text-sm">+{item.xp_reward} XP</Text>
    </View>
  );

  return (
    <View
      className="absolute bottom-0 left-0 right-0 bg-gray-950 rounded-t-3xl px-5 pt-5 pb-10"
      style={{ maxHeight: '75%' }}
    >
      {/* Handle + header */}
      <View className="items-center mb-5">
        <View className="w-10 h-1 bg-white/20 rounded-full mb-4" />
        <View className="flex-row justify-between items-center w-full">
          <Text className="text-white font-bold text-xl">Mon profil</Text>
          <TouchableOpacity onPress={onClose}>
            <Text className="text-white/40 text-2xl leading-none">×</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Level card */}
      <View className="bg-purple-600/20 rounded-2xl p-5 mb-5">
        <View className="flex-row justify-between items-center mb-3">
          <View>
            <Text className="text-purple-400/70 text-xs uppercase tracking-widest">Niveau</Text>
            <Text className="text-white font-bold" style={{ fontSize: 40, lineHeight: 48 }}>
              {level}
            </Text>
          </View>
          <View className="items-end">
            <Text className="text-purple-400/70 text-xs uppercase tracking-widest mb-1">Total XP</Text>
            <Text className="text-purple-400 font-bold text-2xl">{totalXp}</Text>
          </View>
        </View>

        {/* Progress bar */}
        <View className="bg-white/10 rounded-full h-2 overflow-hidden">
          <View
            className="bg-purple-400 h-2 rounded-full"
            style={{ width: `${Math.round(progress * 100)}%` }}
          />
        </View>
        <Text className="text-white/40 text-xs mt-2 text-right">
          {xpIntoLevel} / {XP_PER_LEVEL} XP → niveau {level + 1}
        </Text>
      </View>

      {/* Completed quests */}
      <Text className="text-white/50 text-xs uppercase tracking-widest mb-3">
        Quêtes accomplies ({completedQuests.length})
      </Text>

      {completedQuests.length === 0 ? (
        <View className="items-center py-8">
          <Text className="text-white/30 text-sm">Aucune quête complétée pour l'instant</Text>
        </View>
      ) : (
        <FlatList
          data={[...completedQuests].reverse()}
          keyExtractor={(item, index) => `${item.id}-${index}`}
          renderItem={renderQuest}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}
