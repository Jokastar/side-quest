export const config = {
  app: {
    name: 'SideQuest',
    version: '1.0.0',
  },

  quest: {
    defaultRadiusMeters: 100,
    maxRadiusMeters: 1000,
    nearbyRadiusMeters: 5000,
    checkInDistanceMeters: 50,
  },

  xp: {
    baseQuestReward: 50,
    levelMultiplier: 100, // XP needed = level * levelMultiplier
  },

  map: {
    defaultZoom: 15,
    initialRegionDelta: 0.01,
  },

  location: {
    // Expo location accuracy
    accuracy: 4, // Location.Accuracy.High = 4
    distanceInterval: 10, // meters before location update
    timeInterval: 5000,   // ms between updates
  },
} as const;
