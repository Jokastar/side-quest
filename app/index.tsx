import { useEffect, useRef, Fragment } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import MapView, { Marker, Circle, PROVIDER_DEFAULT } from 'react-native-maps';
import * as Location from 'expo-location';
import { useGameStore } from '../store/gameStore';
import { useNearbyQuests } from '../hooks/useNearbyQuests';
import { colors } from '../constants/colors';
import { config } from '../constants/config';

export default function MapScreen() {
  const mapRef = useRef<MapView>(null);
  const { userLocation, setUserLocation, activeQuest, setActiveQuest } = useGameStore();
  const { quests, isLoading, error: questError } = useNearbyQuests();

  useEffect(() => {
    let subscription: Location.LocationSubscription;

    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;

      // Get an immediate fix so the map shows without waiting for movement
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
          const coords = {
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
          };
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
    <View className="flex-1">
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
        {quests.map((quest) => {
          const { latitude, longitude } = quest;
          if (!latitude || !longitude) return null;

          return (
            <Fragment key={quest.id}>
              <Circle
                center={{ latitude, longitude }}
                radius={config.quest.checkInDistanceMeters}
                strokeColor={colors.primary}
                fillColor={`${colors.primary}30`}
              />
              <Marker
                coordinate={{ latitude, longitude }}
                onPress={() => setActiveQuest(quest)}
                pinColor={activeQuest?.id === quest.id ? colors.secondary : colors.primary}
                title={quest.title}
                description={`+${quest.xp_reward} XP`}
              />
            </Fragment>
          );
        })}
      </MapView>

      {/* Debug badge */}
      <View className="absolute top-16 right-4 bg-black/70 px-3 py-1 rounded-full">
        <Text className="text-white text-xs">{quests.length} quêtes</Text>
      </View>

      {/* Loading / error overlay */}
      {(isLoading || questError) && (
        <View className="absolute top-16 self-center bg-black/60 px-4 py-2 rounded-full">
          <Text className="text-white text-sm">
            {questError ? `Erreur: ${questError.message}` : 'Chargement des quêtes...'}
          </Text>
        </View>
      )}

      {/* Active quest card */}
      {activeQuest && (
        <View className="absolute bottom-8 left-4 right-4 bg-white rounded-2xl p-4 shadow-lg">
          <Text className="text-lg font-bold text-gray-900">{activeQuest.title}</Text>
          <Text className="text-gray-500 mt-1">{activeQuest.description}</Text>
          <Text className="text-purple-600 font-semibold mt-2">+{activeQuest.xp_reward} XP</Text>
          <TouchableOpacity
            className="mt-3 bg-purple-600 rounded-xl py-3 items-center"
            onPress={() => setActiveQuest(null)}
          >
            <Text className="text-white font-bold">Valider la quête</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}
