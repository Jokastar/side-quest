import { View, Text, FlatList, TouchableOpacity } from 'react-native';
import { useGameStore } from '../store/gameStore';
import { QuestWithCoords } from '../hooks/useNearbyQuests';

interface Props {
  onSelectQuest: (quest: QuestWithCoords) => void;
  onClose: () => void;
}

export default function QuestList({ onSelectQuest, onClose }: Props) {
  const { nearbyQuests, completedQuestIds } = useGameStore();
  const availableQuests = nearbyQuests.filter((q) => !completedQuestIds.includes(q.id));

  const renderQuest = ({ item }: { item: QuestWithCoords }) => (
    <View className="bg-white/10 rounded-2xl p-4 mb-3">
      <View className="flex-row justify-between items-start">
        <View className="flex-1 mr-3">
          <Text className="text-white font-bold text-base">{item.title}</Text>
          <Text className="text-white/60 text-sm mt-1">{item.description}</Text>
        </View>
        <Text className="text-purple-400 font-bold">+{item.xp_reward} XP</Text>
      </View>
      <TouchableOpacity
        className="mt-3 rounded-xl py-2 items-center bg-purple-600"
        onPress={() => onSelectQuest(item)}
      >
        <Text className="text-white font-semibold text-sm">Choisir cette quête</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <View
      className="absolute bottom-0 left-0 right-0 bg-black/80 rounded-t-3xl px-4 pt-4 pb-8"
      style={{ maxHeight: '70%' }}
    >
      {/* Header */}
      <View className="flex-row justify-between items-center mb-4">
        <View className="w-10 h-1 bg-white/30 rounded-full" />
        <Text className="text-white font-bold text-lg">
          {availableQuests.length} quêtes disponibles
        </Text>
        <TouchableOpacity onPress={onClose}>
          <Text className="text-white/60 text-2xl leading-none">×</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={availableQuests}
        keyExtractor={(item) => item.id}
        renderItem={renderQuest}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}
