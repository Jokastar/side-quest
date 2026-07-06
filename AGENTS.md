# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v56.0.0/ before writing any code.

Spin — Spécification complète

Concept

Application mobile (Expo / React Native) qui génère une soirée complète à Paris via une interface machine à sous à 3 reels. Chaque spin produit un lieu à visiter, un restaurant et une ambiance/sortie. L'utilisateur peut relancer un reel individuellement. L'app est gamifiée (XP, badges, streak) et vérifie que l'utilisateur s'est bien rendu sur place via GPS.

Tagline : "Paris en 3 secondes. Ce soir."

Disponibilité : Paris uniquement (rayon ~15km du centre). Hors zone → écran d'attente avec capture email.


Stack technique

CoucheTechnologieFrontendExpo (React Native)Backend / DBSupabase (Postgres + Auth + Storage + Edge Functions)GPSexpo-locationDistancegeolib (formule Haversine)ImagesSupabase Storage (compression via expo-image-manipulator avant upload)Mapsreact-native-mapsCronSupabase Edge Functions (refresh événements toutes les 6h)


User Flow

Onboarding (1 seule fois, 4 écrans)


Splash + valeur prop — animation slot machine, bouton "Commencer"
Permission GPS
Préférences rapides : Budget (€ / €€ / €€€), Vibe (Chill / Festif / Culturel), Distance (À pied / Métro / Peu importe)
Compte optionnel — "Continuer sans compte" possible (mode guest)


Core Flow (chaque soir)

Lancement
  → Vérification GPS (Paris ?)
      → Non : écran Hors zone Paris + capture email
      → Oui : Home — Machine à sous
          → SPIN (animation 1.5–2s, reels s'arrêtent 1 par 1)
          → Résultats — 3 cartes (Lieu · Restaurant · Ambiance)
              → Relancer un reel individuel (boucle vers SPIN, 1 reel à la fois)
              → Valider les 3 → Plan de soirée
                  → Timeline (ex: 20h Lieu → 21h30 Resto → 23h Ambiance)
                  → Carte interactive — 3 pins Paris
                  → Liens : Maps / Réserver / Site
                  → Bouton "Démarrer la soirée"
                      → Check-in GPS sur place (< 150m du lieu)
                          → 70% XP débloqué
                          → Photo optionnelle depuis caméra (pas galerie)
                              → +30% XP bonus
                      → XP + Badges + Streak mis à jour
                      → Journal / Profil

Mode guest


Autorisé : spins, plan de soirée, map, GPS check-in
Bloqué (mur doux contextuel) : sauvegarder, XP/badges, historique, partage



Les 3 Reels

ReelCatégorie DBSources🎭 Lieu à visiterlieuGoogle Places (museum, gallery, park) + Paris Open Data🍽️ RestaurantrestaurantGoogle Places (restaurant, food)🎶 Ambiance / SortieambianceEventbrite + Paris Open Data


APIs externes

Paris Open Data — Gratuit

GET https://opendata.paris.fr/api/explore/v2.1/catalog/datasets/que-faire-a-paris-/records
  ?where=date_start >= "2026-06-22"
  &limit=50

Google Places API — $200 crédit/mois gratuit


Types pour reel lieu : museum, art_gallery, park, tourist_attraction
Types pour reel restaurant : restaurant, food, cafe
Types pour reel ambiance : night_club, bar, concert_hall
Retourne : nom, adresse, lat/lng, horaires, rating, photo, price_level


Eventbrite API — Gratuit

GET https://www.eventbriteapi.com/v3/events/search/
  ?location.address=Paris
  &start_date.range_start=2026-06-22T17:00:00
  &categories=103  (musique)


Base de données (Supabase / PostgreSQL)

Table : users

sqlid              uuid        PK
email           text
username        text
avatar_url      text
xp              int4        default 0
level           int4        default 1
streak_count    int4        default 0
streak_freezes  int4        default 1
streak_last_checkin  timestamptz
created_at      timestamptz default now()

Table : venues (cache Google Places + lieux admin)

sqlid              uuid        PK
google_place_id text        UNIQUE
name            text
address         text
category        text        -- 'lieu' | 'restaurant' | 'ambiance'
lat             float8
lng             float8
price_level     int4        -- 1 à 3
rating          float8
photo_url       text
rarity          text        -- 'common' | 'rare' | 'epic' | 'legendary'
is_active       boolean     default true
cached_at       timestamptz

Table : events (cache APIs externes)

sqlid              uuid        PK
source          text        -- 'paris_opendata' | 'eventbrite'
external_id     text
title           text
description     text
category        text        -- 'lieu' | 'restaurant' | 'ambiance'
venue_name      text
lat             float8
lng             float8
start_date      timestamptz
end_date        timestamptz
price           int4        -- 0 = gratuit
url             text
cached_at       timestamptz
UNIQUE(external_id, source)

Table : soirees

sqlid              uuid        PK
user_id         uuid        FK → users.id
venue_id        uuid        FK → venues.id   (reel 1 : lieu)
restaurant_id   uuid        FK → venues.id   (reel 2 : resto)
event_id        uuid        FK → events.id   (reel 3 : ambiance)
status          text        -- 'generated' | 'accepted' | 'completed'
created_at      timestamptz default now()

Table : checkins

sqlid              uuid        PK
user_id         uuid        FK → users.id
soiree_id       uuid        FK → soirees.id
venue_id        uuid        FK → venues.id
gps_verified    boolean     default false
photo_url       text
rating          int4        -- 1 à 3
checked_in_at   timestamptz

Table : badges

sqlid              uuid        PK
name            text
description     text
icon            text
xp_reward       int4
condition_type  text        -- 'checkin_count' | 'streak' | 'arrondissement' | etc.
condition_value int4

Table : user_badges

sqlid              uuid        PK
user_id         uuid        FK → users.id
badge_id        uuid        FK → badges.id
earned_at       timestamptz


Gestion des événements

Refresh automatique (Supabase Edge Function cron)


Fréquence : toutes les 6h (0 */6 * * *)
Fetch Paris Open Data + Eventbrite
Normaliser vers le format commun
upsert en DB (onConflict: external_id, source)
Supprimer les événements périmés : DELETE WHERE end_date < now()


Fallback si APIs down


Toujours servir depuis le cache Supabase
Afficher la date du dernier refresh sur la fiche événement


Signalement lieu fermé


Bouton "Signaler un problème" sur chaque fiche
3 signalements identiques en 24h → retrait automatique + flag admin
User qui signale reçoit +20 XP



Algorithme de sélection aléatoire (Weighted Random)

Les 4 phases

Phase 1 — Filtre

javascriptconst candidates = await supabase
  .from('events')
  .select('*')
  .eq('category', reel_category)
  .gte('start_date', tonight_start)   // après 17h
  .lte('start_date', tonight_end)     // avant 3h
  .lte('price', user.budget_max)
  .not('id', 'in', session.recently_shown)  // anti-repeat (10 derniers)

Phase 2 — Score (poids)

javascriptfunction scoreEvent(event, user) {
  let score = 0

  // Rareté
  const rarityWeights = { common: 10, rare: 30, epic: 70, legendary: 150 }
  score += rarityWeights[event.rarity] ?? 10

  // Distance
  const km = haversine(user.lat, user.lng, event.lat, event.lng)
  if (km < 1) score += 40
  else if (km < 3) score += 20
  else if (km < 5) score += 10
  else if (km > 10) score -= 20

  // Rating Google
  if (event.rating) score += event.rating * 5   // max +25

  // Gratuit
  if (event.price === 0) score += 15

  // Préférences user
  if (user.vibe === 'culturel' && event.category === 'expo') score += 25
  if (user.vibe === 'festif'   && event.category === 'club') score += 25

  return Math.max(score, 1)
}

Phase 3 — Weighted random

javascriptfunction weightedRandom(candidates) {
  const total = candidates.reduce((sum, c) => sum + c.score, 0)
  let r = Math.random() * total
  for (const c of candidates) {
    r -= c.score
    if (r <= 0) return c
  }
  return candidates[candidates.length - 1]
}

Phase 4 — Anti-repeat (session)

javascriptconst session = { recently_shown: [], MAX: 10 }

function addToMemory(id) {
  session.recently_shown.push(id)
  if (session.recently_shown.length > session.MAX)
    session.recently_shown.shift()
}

Fonction complète par reel

javascriptasync function spinReel(category, user, session) {
  const { data } = await supabase.from('events').select('*')
    .eq('category', category)
    .gte('start_date', tonight_start)
    .lte('price', user.budget_max)
    .not('id', 'in', session.recently_shown)

  // Fallback si aucun résultat : ignorer filtres
  if (!data?.length) return spinReel(category, user, { recently_shown: [] })

  const scored = data.map(e => ({ ...e, score: scoreEvent(e, user) }))
  const selected = weightedRandom(scored)
  addToMemory(selected.id)
  return selected
}

Distribution de rareté recommandée

Rareté% des venuesPoidsFréquence d'apparitionCommon60%10~1 spin sur 3Rare25%30~1 spin sur 6Épique12%70~1 spin sur 15Légendaire3%150~1 spin sur 40


Vérification de soirée (2 niveaux)

Niveau 1 — GPS (70% XP)


L'user appuie "J'y suis" dans l'app
Vérification : position GPS < 150m du lieu
Heure cohérente (17h–3h)
Fonctionne offline (sync au retour réseau)


Niveau 2 — Photo (30% XP bonus)


Forcer l'ouverture caméra (pas galerie) pour éviter triche
Upload vers Supabase Storage
Path : checkins/{user_id}/{soiree_id}/photo.jpg
Compresser avant upload (expo-image-manipulator, cible < 600KB)



Gamification

XP et niveaux

ActionXPSoirée complétée+100Lieu rare+200Photo ajoutée+303 soirées en 1 semaine+150 bonusSignalement validé+20

Niveaux : Explorateur → Aventurier → Flâneur → Noctambule → Légende de Paris

Système Streak (inspiré Duolingo)


Règle : 1 check-in validé par nuit entre 17h et 3h = streak maintenu
Streak freeze : 1 disponible par semaine, se régénère chaque lundi
Notification à 23h30 si streak en danger
Mode Voyage : streak en pause si GPS hors Paris (settings)
Ton si streak cassé : encourageant, jamais punitif


Paliers streak

StreakRécompense3 joursBadge Lancé7 jours+200 XP + Badge Semainier14 joursAccès lieux épiques garantis30 joursBadge Légende + skin slot machine100 joursBadge Légendaire (ultra rare)

Passeport d'arrondissements


Un tampon par arrondissement visité
Objectif caché : "Conquérir les 20 arrondissements"


Badges principaux

BadgeConditionPremier SpinPremière utilisationGlobe Trotter5 cuisines différentesNoctambuleSortir après minuit 3 foisCoup de DésAccepter sans relancer aucun reelExplorateur10 arrondissements différentsStreak x77 jours consécutifsLégendaireTomber sur un lieu légendaire


Notifications push

MomentMessage18h chaque soir"Paris t'attend ce soir 🎰"23h30 si streak danger"Ton streak de X jours expire à minuit"Badge débloqué"Nouveau badge : [nom]"Lieu fermé signalé"Le spot de ta soirée a changé"

Règle : max 1 notification par jour par défaut. Réglable dans settings.


Partage social

Carte de soirée générée automatiquement après check-in :


Format story 9:16 ou carré
Contenu : 3 lieux, niveau XP, badge éventuel, logo Spin
Partagée APRÈS la soirée (plus authentique)



Edge cases à gérer

CasSolutionAucun résultat pour un reelÉlargir rayon automatiquement puis fallback venue permanenteÉvénement annulé entre spin et soiréeWarning temps réel + proposer relance reelLieu fermé le lundi soirVérifier horaires Google Places avant injection en reel5 relances du même reelProposer un filtre rapide (Jazz ? Sushi ? Rooftop ?)GPS mauvais signal (cave, sous-sol)Check-in offline, sync au retour réseauLieu fermé exceptionnellementBouton "Ce lieu est fermé" → retrait 24h + remplacementGPS valide depuis métro qui passeRayon à calibrer à 80-100m en zone densePhoto depuis galerie (triche)Forcer ouverture caméra directeStreak cassé involontairement1 freeze/semaine, ton doux, relance immédiate proposéeXP sans soirée complèteXP par lieu checké, bonus pour soirée complèteUser hors Paris en déplacementMode Voyage : streak en pause, historique accessibleAPIs externes downToujours servir depuis cache Supabase


Roadmap

Phase 1 — MVP Paris


Slot machine + 3 reels
Paris Open Data + Google Places + Eventbrite
Plan de soirée + carte
Check-in GPS + photo
Journal basique


Phase 2 — Gamification


XP + niveaux + badges
Passeport d'arrondissements
Streak système complet
Challenges hebdomadaires


Phase 3 — Social


Partage carte de soirée
Feed communautaire


Phase 4 — Expansion


Section Outdoor / Sports (OpenStreetMap Overpass + Manawa affiliate)
Section Micro-adventures (activités courtes, sortie de zone de confort)
Autres villes françaises



Monétisation

ModèleDétailFreemium3 spins/jour gratuits, illimité en PremiumPremium (~4,99€/mois)Spins illimités + filtres avancés + lieux légendaires garantisAffiliateCommission sur réservations via Manawa / GetYourGuideVenues sponsoriséesUn lieu paie pour apparaître plus souvent dans les reels