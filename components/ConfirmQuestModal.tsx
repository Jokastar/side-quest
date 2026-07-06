import { View, Text, TouchableOpacity, Pressable } from 'react-native';
import { QuestWithCoords } from '../hooks/useNearbyQuests';

interface Props {
  quest: QuestWithCoords;
  onConfirm: (quest: QuestWithCoords) => void;
  onCancel: () => void;
}

export default function ConfirmQuestModal({ quest, onConfirm, onCancel }: Props) {
  return (
    <Pressable className="absolute inset-0 bg-black/60 items-center justify-end pb-8 px-4" onPress={onCancel}>
      <Pressable onPress={(e) => e.stopPropagation()}>
      <View className="bg-gray-900 rounded-3xl p-6 w-full">
        <Text className="text-purple-400 text-xs font-semibold uppercase tracking-widest mb-2">
          Confirmer la quête
        </Text>
        <Text className="text-white font-bold text-xl mb-1">{quest.title}</Text>
        <Text className="text-white/60 text-sm mb-6">{quest.description}</Text>

        <View className="bg-purple-600/20 rounded-2xl p-4 mb-6 items-center">
          <Text className="text-purple-400 text-2xl font-bold">+{quest.xp_reward} XP</Text>
          <Text className="text-purple-400/60 text-sm mt-1">à gagner</Text>
        </View>

        <TouchableOpacity
          className="bg-purple-600 rounded-xl py-4 items-center mb-3"
          onPress={() => onConfirm(quest)}
        >
          <Text className="text-white font-bold text-base">Lancer la navigation</Text>
        </TouchableOpacity>

        <TouchableOpacity
          className="bg-white/10 rounded-xl py-3 items-center"
          onPress={onCancel}
        >
          <Text className="text-white/60 text-sm">Annuler</Text>
        </TouchableOpacity>
      </View>
      </Pressable>
    </Pressable>
  );
}
