import { useEffect } from 'react';
import * as Location from 'expo-location';
import { useGameStore } from '../store/gameStore';

export function useUserLocation() {
  const setUserLocation = useGameStore((s) => s.setUserLocation);

  useEffect(() => {
    let subscription: Location.LocationSubscription;

    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;

      // Position initiale immédiate
      const initial = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      setUserLocation({
        latitude: initial.coords.latitude,
        longitude: initial.coords.longitude,
      });

      // Mise à jour en continu
      subscription = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, distanceInterval: 20 },
        (loc) => setUserLocation({
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
        }),
      );
    })();

    return () => subscription?.remove();
  }, []);
}
