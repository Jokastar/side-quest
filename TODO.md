# TODO — Spin

État au 8 juillet 2026. Ordre = priorité recommandée pour un MVP portfolio.

## 🎯 Prochaine session

- [ ] **Venues curées** — remplacer les venues Google Places (placeholders vides) par une liste curée de lieux parisiens
  - Onglet "Venues" dans l'admin : créer / éditer / désactiver un lieu
  - Champs : nom, adresse, catégorie, photo, description, **rarity** (common/rare/epic/legendary — aujourd'hui tout est common, les tampons épiques/légendaires n'apparaissent jamais)
  - Retirer le fetch Google Places de l'Edge Function une fois la liste prête
- [ ] **Scoring : vibe + groupSize** — les préférences sont collectées mais `scoreCandidate` les ignore
  - culturel → boost expos/musées · festif → boost clubs/concerts
  - grande bande → pénaliser les petits lieux intimes
- [ ] **Filtrage par occurrences** — un événement récurrent dont le seul créneau du jour est 20h peut encore sortir en "Aprem" (le filtre utilise la plage globale, pas les occurrences). Filtrer post-fetch avec le champ `occurrences`.

## 📋 Backlog MVP

- [ ] **Gemini : restaurer la vraie validation** — le prompt accepte tout (mode test). Remettre la validation par catégorie (CATEGORY_HINTS existe déjà dans checkin.tsx) avant de montrer l'app.
- [ ] **États d'erreur / vides** — GPS refusé, reels vides, hors ligne. Les reviewers testent toujours ça.
- [ ] **Badges (3-4)** — "Premier Spin", "Coup de Dés", "Streak x3". Tables prêtes, il manque le seed + le check d'attribution après check-in.
- [ ] **Streak système** — colonnes users prêtes (streak_count, streak_freezes), zéro logique. Check-in entre 17h-3h = streak maintenu, freeze régénéré le lundi.
- [ ] **Spin rework UI** — nouvelle animation + interactions de la machine à sous (session UI dédiée).
- [ ] **README portfolio** — GIF démo 30s, diagramme d'archi (Expo → Supabase → Edge Function cron → Gemini), section roadmap pour les features coupées.

## 🧹 Dette technique

- [ ] Renommer la fonction Supabase `sync-data-` → `sync-data` (tiret final hérité d'une typo ; le client et le cron pointent sur le nom avec tiret)
- [ ] SafeAreaView : migrer de `react-native` (déprécié) vers `react-native-safe-area-context` sur tous les écrans
- [ ] Changer le mot de passe admin (`SpinAdmin2026!` a transité par le terminal) + créer `.env.example` avant de rendre le repo public
- [ ] LLM fallback horaires — pour les events sans `schedule_text` : Edge Function qui fetch l'`url`, strip le HTML, demande à Gemini d'extraire les horaires (bouton "✨ Extraire" dans l'admin)

## 🚀 Plus tard (post-MVP)

- [ ] Mode invité (Supabase anonymous auth)
- [ ] Sync des préférences cross-device (colonne dans `users`)
- [ ] Enrichissement admin : éditer photo/description/avis d'un event approuvé
- [ ] Scoring météo (`is_indoor` est déjà stocké)
- [ ] Escapades créées par les users, partage + sauvegarde (table `escapades` prête)
- [ ] Notifications push (18h + streak en danger)
- [ ] Partage social (carte de soirée post check-in)
