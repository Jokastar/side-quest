import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { useGameStore } from '../store/gameStore';
import { getDistance } from '../hooks/useProximityCheck';
import { config } from '../constants/config';

export default function NavigationHUD() {
  const { activeQuest, userLocation, cancelNavigation, setUserLocation, enterValidation } = useGameStore();

  if (!activeQuest) return null;

  const distance = userLocation
    ? Math.round(getDistance(
        userLocation.latitude, userLocation.longitude,
        activeQuest.latitude, activeQuest.longitude,
      ))
    : null;

  const isClose = distance !== null && distance <= config.quest.checkInDistanceMeters * 2;

  return (
    <View className="absolute bottom-0 left-0 right-0 bg-black/90 rounded-t-3xl pt-4" style={{ maxHeight: '60%' }}>
    <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }} showsVerticalScrollIndicator={false}>
      <View className="w-10 h-1 bg-white/30 rounded-full self-center mb-4" />

      <View className="flex-row justify-between items-center mb-1">
        <Text className="text-purple-400 text-xs font-semibold uppercase tracking-widest">
          En navigation
        </Text>
        <Text className="text-purple-400 font-bold">+{activeQuest.xp_reward} XP</Text>
      </View>

      <Text className="text-white font-bold text-xl mb-1">{activeQuest.title}</Text>
      <Text className="text-white/60 text-sm mb-4">{activeQuest.description}</Text>

      {distance !== null && (
        <View className={`rounded-xl px-4 py-2 mb-4 self-start ${isClose ? 'bg-green-600/30' : 'bg-white/10'}`}>
          <Text className={`font-bold text-sm ${isClose ? 'text-green-400' : 'text-white'}`}>
            {distance < 1000 ? `${distance} m` : `${(distance / 1000).toFixed(1)} km`}
            {isClose ? '  — Approche !' : '  restants'}
          </Text>
        </View>
      )}

      <TouchableOpacity
        style={{ backgroundColor: 'rgba(234,179,8,0.2)', borderWidth: 1, borderColor: '#EAB308', borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginBottom: 12 }}
        onPress={() => {
          setUserLocation({ latitude: activeQuest.latitude, longitude: activeQuest.longitude });
          enterValidation();
        }}
      >
        <Text style={{ color: '#EAB308', fontWeight: '600' }}>🧪 Simuler arrivée</Text>
      </TouchableOpacity>

      <TouchableOpacity
        className="bg-white/10 rounded-xl py-3 items-center"
        onPress={cancelNavigation}
      >
        <Text className="text-white font-semibold">Annuler la navigation</Text>
      </TouchableOpacity>
    </ScrollView>
    </View>
  );
}
