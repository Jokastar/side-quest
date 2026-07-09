# TODO — Spin (nom à changer)

État au 8 juillet 2026, après le pivot swipe + modèle unifié `items`.
Ordre = priorité recommandée pour un MVP portfolio.

## ✅ Fait récemment

- ~~Table unifiée `items` (nature · slot · category), escapade_items, migration~~
- ~~UI swipe : 3 rangées à la place de la machine à sous, scoring = ordre des cartes~~
- ~~Vibe branchée dans le scoring~~
- ~~Créneaux : filtre temporel + chips désactivées si passées~~
- ~~Admin : queue sur items, filtres nature, selects slot + catégorie~~
- ~~Gemini fail-open sur 5xx (le tampon n'est plus bloqué par une panne Google)~~

## 🎯 Prochaine session

- [ ] **Lieux curés (permanents)** — remplacer les placeholders Google par ta liste
  - Formulaire "➕ Ajouter un lieu" dans l'admin : insert `items` avec `nature: 'permanent'`, `source: 'admin'`
  - Champs : nom, adresse, catégorie, photo, description, price_level, **rarity** (tout est common → les cartes/tampons épiques et légendaires n'apparaissent jamais)
  - Retirer le fetch Google Places de l'Edge Function une fois ~15 lieux créés
- [ ] **groupSize dans le scoring** — collecté mais toujours ignoré (grande bande → pénaliser les lieux intimes)
- [ ] **Filtrage par occurrences** — un récurrent dont le seul créneau du jour est 20h peut encore sortir en "Aprem" (le filtre utilise la plage globale). Filtrer post-fetch dans useItemLists avec le champ `occurrences`.

## 📋 Backlog MVP

- [ ] **Rebranding** — "Spin" et le 🎰 ne collent plus au pivot swipe. Nouveau nom + thème à trouver, puis renommer : titre home, tagline, onboarding splash, admin, doc.
- [ ] **Gemini : restaurer la vraie validation** — le prompt accepte tout (mode test). CATEGORY_HINTS déjà à jour avec les 7 catégories. Décider aussi du fail-open (accepter mais marquer le tampon `validated: false` ?).
- [ ] **États d'erreur / vides** — GPS refusé, rangées vides, hors ligne. Les reviewers testent toujours ça.
- [ ] **Pull-to-refresh** sur les rangées de l'accueil (aujourd'hui il faut changer de créneau pour refetch)
- [ ] **Horaires d'ouverture des permanents** — jamais vérifiés (un resto fermé le lundi peut sortir un lundi). Champ schedule/opening_hours à saisir dans l'admin + filtre.
- [ ] **Badges (3-4)** — tables prêtes, il manque le seed + le check d'attribution après check-in.
- [ ] **Streak système** — colonnes users prêtes, zéro logique. Check-in 17h-3h = streak maintenu, freeze régénéré le lundi.
- [ ] **README portfolio** — GIF démo 30s, diagramme d'archi (Expo → Supabase → Edge Function cron → Gemini), roadmap des features coupées.

## 🧹 Dette technique

- [ ] Renommer la fonction Supabase `sync-data-` → `sync-data` (typo héritée ; client, cron et admin pointent sur le tiret)
- [ ] Changer le mot de passe admin + créer `.env.example` avant de rendre le repo public
- [ ] Mettre à jour le walkthrough (artifact) : il décrit encore la machine à sous et les tables venues/events
- [ ] LLM fallback horaires — pour les items sans `schedule_text` : Edge Function qui fetch l'`url` et demande à Gemini d'extraire les horaires (bouton "✨ Extraire" dans l'admin)

## 🚀 Plus tard (post-MVP)

- [ ] Escapades curées par l'admin (`is_curated`, mises en avant dans l'app) — le modèle est prêt
- [ ] Escapades créées/partagées par les users — le modèle est prêt
- [ ] Mode invité (Supabase anonymous auth)
- [ ] Sync des préférences cross-device (colonne dans `users`)
- [ ] Scoring météo (`is_indoor` déjà stocké)
- [ ] Notifications push (18h + streak en danger)
- [ ] Partage social (carte d'escapade post check-in)
