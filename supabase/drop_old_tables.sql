-- Supprime toutes les anciennes tables de l'app side-quest
drop table if exists public.quest_submissions cascade;
drop table if exists public.quests cascade;
drop table if exists public.user_progress cascade;

-- Note : spatial_ref_sys est une table système PostGIS, ne pas la supprimer
