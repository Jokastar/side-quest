import { useEffect, useRef } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import MapView, { Marker, Circle, PROVIDER_DEFAULT } from 'react-native-maps';
import * as Location from 'expo-location';
import { useGameStore } from '../store/gameStore';
import { useNearbyQuests, QuestWithCoords } from '../hooks/useNearbyQuests';
import { colors } from '../constants/colors';
import { config } from '../constants/config';

interface Props {
  onQuestPress?: (quest: QuestWithCoords) => void;
}

export default function MapScreen({ onQuestPress }: Props) {
  const mapRef = useRef<MapView>(null);
  const { userLocation, setUserLocation, activeQuest, stage, completedQuestIds } = useGameStore();
  const { quests, isLoading, error: questError } = useNearbyQuests();

  const displayedQuests = stage === 'NAVIGATING' && activeQuest
    ? quests.filter((q) => q.id === activeQuest.id)
    : quests.filter((q) => !completedQuestIds.includes(q.id));

  // Ref so onPress callbacks always read the current quest — never a stale closure.
  const displayedQuestsRef = useRef(displayedQuests);
  displayedQuestsRef.current = displayedQuests;

  console.log('[MAP] displayedQuests:', displayedQuests.length, '| completedIds:', completedQuestIds, '| stage:', stage);

  useEffect(() => {
    let subscription: Location.LocationSubscription;

    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;

      const initial = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      setUserLocation({ latitude: initial.coords.latitude, longitude: initial.coords.longitude });

      subscription = await Location.watchPositionAsync(
        {
          accuracy: config.location.accuracy,
          distanceInterval: config.location.distanceInterval,
          timeInterval: config.location.timeInterval,
        },
        (loc) => {
          const coords = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
          setUserLocation(coords);
          mapRef.current?.animateToRegion({
            ...coords,
            latitudeDelta: config.map.initialRegionDelta,
            longitudeDelta: config.map.initialRegionDelta,
          });
        },
      );
    })();

    return () => subscription?.remove();
  }, []);

  if (!userLocation) {
    return (
      <View className="flex-1 items-center justify-center bg-black">
        <ActivityIndicator color={colors.primary} size="large" />
        <Text className="text-white mt-4">Localisation en cours...</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <MapView
        ref={mapRef}
        provider={PROVIDER_DEFAULT}
        style={{ flex: 1 }}
        initialRegion={{
          latitude: userLocation.latitude,
          longitude: userLocation.longitude,
          latitudeDelta: config.map.initialRegionDelta,
          longitudeDelta: config.map.initialRegionDelta,
        }}
        showsUserLocation
        showsMyLocationButton={false}
      >
        {displayedQuests.flatMap((quest) => {
          const { latitude, longitude } = quest;
          if (!latitude || !longitude) return [];
          const questId = quest.id;
          return [
            <Circle
              key={`c-${questId}-${stage}`}
              center={{ latitude, longitude }}
              radius={config.quest.checkInDistanceMeters}
              strokeColor={colors.primary}
              fillColor={`${colors.primary}30`}
            />,
            <Marker
              key={`m-${questId}-${stage}`}
              coordinate={{ latitude, longitude }}
              tracksViewChanges={false}
              onPress={() => {
                const current = displayedQuestsRef.current.find((q) => q.id === questId);
                if (current) onQuestPress?.(current);
              }}
              pinColor={activeQuest?.id === questId ? colors.secondary : colors.primary}
              title={quest.title}
              description={`+${quest.xp_reward} XP`}
            />,
          ];
        })}
      </MapView>

      {(isLoading || questError) && (
        <View className="absolute top-16 self-center bg-black/60 px-4 py-2 rounded-full">
          <Text className="text-white text-sm">
            {questError ? `Erreur: ${questError.message}` : 'Chargement des quêtes...'}
          </Text>
        </View>
      )}
    </View>
  );
}
