import { useEffect } from 'react';
import * as Location from 'expo-location';
import { useGameStore } from '../store/gameStore';

// ─────────────────────────────────────────────────────────────
// Suivi GPS continu → store.
//
// Monté une fois par l'écran d'accueil. À partir de là :
//   1. demande la permission (déjà accordée à l'onboarding en général)
//   2. pousse une première position immédiatement
//   3. s'abonne aux mises à jour (à chaque déplacement de ~20 m)
//
// Tous les écrans lisent ensuite `userLocation` dans le store :
// le scoring par distance (useItemLists), les itinéraires (plan),
// la proximité du check-in.
// ─────────────────────────────────────────────────────────────

export function useUserLocation() {
  const setUserLocation = useGameStore((s) => s.setUserLocation);

  useEffect(() => {
    let subscription: Location.LocationSubscription;

    (async () => {
      // 1. Permission — si refusée, userLocation reste null et l'app
      //    dégrade proprement (scoring sans distance, pas d'origine d'itinéraire)
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;

      // 2. Position initiale immédiate (sans attendre le premier déplacement)
      const initial = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      setUserLocation({
        latitude: initial.coords.latitude,
        longitude: initial.coords.longitude,
      });

      // 3. Mises à jour en continu — distanceInterval évite de spammer
      //    le store à chaque micro-variation du GPS
      subscription = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, distanceInterval: 20 },
        (loc) => setUserLocation({
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
        }),
      );
    })();

    // Nettoyage au démontage : on coupe l'abonnement GPS
    return () => subscription?.remove();
  }, []);
}
