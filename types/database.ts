export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

// ============================================================
// Schéma Supabase — App Spin
//
// Modèle unifié : la table `items` contient tout ce qui est
// "spinnable" à Paris — lieux permanents ET événements éphémères.
//   nature   : permanent (resto, musée, bar) | ephemere (concert, expo)
//   slot     : dans quel rouleau de la machine ça peut tomber
//   category : ce que c'est vraiment (classification riche)
// ============================================================

// ── Enums du modèle ──────────────────────────────────────────

// Un item existe tous les jours, ou bien il a des dates
export type ItemNature = 'permanent' | 'ephemere';

// Routage : le rouleau de la machine à sous
// activite = "découvre un endroit" · table = "mange" · sortie = "finis la soirée"
export type Slot = 'activite' | 'table' | 'sortie';

// Classification riche — extensible sans toucher à la machine
export type Category =
  | 'culture'    // musées, expos, monuments, théâtre        → activite
  | 'loisir'     // bowling, escape game, karaoké            → activite
  | 'plein_air'  // parcs, balades, guinguettes              → activite
  | 'food'       // restos, brunchs, crêperies               → table
  | 'bar'        // bars, rooftops, caves à vin              → sortie
  | 'club'       // boîtes, dancefloors                      → sortie
  | 'concert';   // musique live, festivals, spectacles      → sortie

export type ItemStatus = 'pending' | 'approved' | 'rejected';
export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';

export interface Database {
  public: {
    Tables: {

      // Profil utilisateur avec XP, niveau et streak
      users: {
        Row: {
          id: string;
          email: string | null;
          username: string | null;
          avatar_url: string | null;
          xp: number;
          level: number;
          streak_count: number;
          streak_freezes: number;
          streak_last_checkin: string | null;
          is_admin: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          email?: string | null;
          username?: string | null;
          avatar_url?: string | null;
          xp?: number;
          level?: number;
          streak_count?: number;
          streak_freezes?: number;
          streak_last_checkin?: string | null;
          created_at?: string;
        };
        Update: {
          email?: string | null;
          username?: string | null;
          avatar_url?: string | null;
          xp?: number;
          level?: number;
          streak_count?: number;
          streak_freezes?: number;
          streak_last_checkin?: string | null;
        };
        Relationships: [];
      };

      // ═══ LA table : tout ce qui peut sortir d'un spin ═══════
      items: {
        Row: {
          id: string;
          nature: ItemNature;
          slot: Slot;
          category: Category;

          name: string;
          description: string | null;
          photo_url: string | null;

          address: string | null;
          arrondissement: number | null;   // 1 à 20
          lat: number | null;
          lng: number | null;
          transport: string | null;        // "Métro · 8 : Chemin Vert (272m)…"

          price: number | null;            // en euros (éphémères, 0 = gratuit)
          price_level: number | null;      // 1-3 (permanents)
          rating: number | null;
          schedule_text: string | null;    // horaires en clair
          access_type: string | null;      // 'obligatoire' | 'conseillé' | null
          access_link: string | null;      // lien de réservation
          url: string | null;
          is_indoor: boolean;
          tags: string | null;             // labels source bruts "Expo;Histoire"

          // Temporel — éphémères uniquement (null pour les permanents)
          start_date: string | null;
          end_date: string | null;
          occurrences: string | null;      // "start_end;start_end;…"

          // Curation & jeu
          status: ItemStatus;
          rarity: Rarity;
          is_active: boolean;

          // Traçabilité
          source: 'admin' | 'paris_opendata' | 'google_places';
          external_id: string | null;      // UNIQUE(source, external_id)
          cached_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          nature: ItemNature;
          slot: Slot;
          category: Category;
          name: string;
          description?: string | null;
          photo_url?: string | null;
          address?: string | null;
          arrondissement?: number | null;
          lat?: number | null;
          lng?: number | null;
          transport?: string | null;
          price?: number | null;
          price_level?: number | null;
          rating?: number | null;
          schedule_text?: string | null;
          access_type?: string | null;
          access_link?: string | null;
          url?: string | null;
          is_indoor?: boolean;
          tags?: string | null;
          start_date?: string | null;
          end_date?: string | null;
          occurrences?: string | null;
          status?: ItemStatus;
          rarity?: Rarity;
          is_active?: boolean;
          source: 'admin' | 'paris_opendata' | 'google_places';
          external_id?: string | null;
          cached_at?: string;
          created_at?: string;
        };
        Update: {
          nature?: ItemNature;
          slot?: Slot;
          category?: Category;
          name?: string;
          description?: string | null;
          photo_url?: string | null;
          address?: string | null;
          arrondissement?: number | null;
          lat?: number | null;
          lng?: number | null;
          transport?: string | null;
          price?: number | null;
          price_level?: number | null;
          rating?: number | null;
          schedule_text?: string | null;
          access_type?: string | null;
          access_link?: string | null;
          url?: string | null;
          is_indoor?: boolean;
          tags?: string | null;
          start_date?: string | null;
          end_date?: string | null;
          occurrences?: string | null;
          status?: ItemStatus;
          rarity?: Rarity;
          is_active?: boolean;
          cached_at?: string;
        };
        Relationships: [];
      };

      // Une escapade validée. Ses étapes vivent dans escapade_items
      // (modèle flexible : 3 stops aujourd'hui, N demain, curées, partagées…)
      escapades: {
        Row: {
          id: string;
          user_id: string;
          title: string | null;        // pour les escapades curées/partagées
          is_curated: boolean;         // créée par l'admin, mise en avant
          status: 'generated' | 'accepted' | 'completed';
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          title?: string | null;
          is_curated?: boolean;
          status?: 'generated' | 'accepted' | 'completed';
          created_at?: string;
        };
        Update: {
          title?: string | null;
          status?: 'generated' | 'accepted' | 'completed';
        };
        Relationships: [];
      };

      // Les étapes d'une escapade, ordonnées
      escapade_items: {
        Row: {
          id: string;
          escapade_id: string;
          item_id: string;
          position: number;            // 1, 2, 3…
        };
        Insert: {
          id?: string;
          escapade_id: string;
          item_id: string;
          position: number;
        };
        Update: {
          position?: number;
        };
        Relationships: [];
      };

      // Tampons collectionnés (carnet de voyage)
      // Créé UNIQUEMENT après validation complète : GPS + photo + Gemini
      // Les infos sont dénormalisées : le tampon survit à la suppression de l'item
      stamps: {
        Row: {
          id: string;
          user_id: string;
          escapade_id: string | null;
          item_id: string | null;          // soft ref (l'item peut disparaître)
          slot: Slot;                      // pilote le design du tampon
          venue_name: string;
          arrondissement: number | null;   // 1 à 20
          rarity: Rarity;
          photo_url: string | null;
          earned_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          escapade_id?: string | null;
          item_id?: string | null;
          slot: Slot;
          venue_name: string;
          arrondissement?: number | null;
          rarity?: Rarity;
          photo_url?: string | null;
          earned_at?: string;
        };
        // Un tampon ne se modifie jamais
        Update: Record<string, never>;
        Relationships: [];
      };

      // Définition des badges disponibles dans l'app
      badges: {
        Row: {
          id: string;
          name: string;
          description: string;
          icon: string;
          xp_reward: number;
          condition_type: 'checkin_count' | 'streak' | 'arrondissement' | 'cuisine' | 'rarity' | 'time';
          condition_value: number;
        };
        Insert: {
          id?: string;
          name: string;
          description: string;
          icon: string;
          xp_reward?: number;
          condition_type: 'checkin_count' | 'streak' | 'arrondissement' | 'cuisine' | 'rarity' | 'time';
          condition_value: number;
        };
        Update: {
          name?: string;
          description?: string;
          icon?: string;
          xp_reward?: number;
        };
        Relationships: [];
      };

      // Badges débloqués par chaque utilisateur
      user_badges: {
        Row: {
          id: string;
          user_id: string;
          badge_id: string;
          earned_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          badge_id: string;
          earned_at?: string;
        };
        Update: Record<string, never>;
        Relationships: [];
      };

    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
}

// ── Raccourcis pour les types les plus utilisés ──────────────
export type User = Database['public']['Tables']['users']['Row'];
export type Item = Database['public']['Tables']['items']['Row'];
export type Escapade = Database['public']['Tables']['escapades']['Row'];
export type EscapadeItem = Database['public']['Tables']['escapade_items']['Row'];
export type Stamp = Database['public']['Tables']['stamps']['Row'];
export type Badge = Database['public']['Tables']['badges']['Row'];
export type UserBadge = Database['public']['Tables']['user_badges']['Row'];

// Mapping catégorie → rouleau (dérivation automatique à la création)
export const CATEGORY_TO_SLOT: Record<Category, Slot> = {
  culture:   'activite',
  loisir:    'activite',
  plein_air: 'activite',
  food:      'table',
  bar:       'sortie',
  club:      'sortie',
  concert:   'sortie',
};

// Préférences utilisateur (persistées en SecureStore, définies à l'onboarding)
export type Vibe = 'chill' | 'festif' | 'culturel';
export type Distance = 'apied' | 'metro' | 'nImporte';

// Prix max par personne : 0 = gratuit uniquement, null = peu importe
export type MaxPrice = 0 | 15 | 30 | null;

// Taille du groupe — en buckets, pas en nombre exact
export type GroupSize = 'solo' | 'duo' | 'groupe' | 'bande';

// Créneau par défaut choisi à l'onboarding
// 'auto' = détection selon l'heure actuelle (detectMode)
export type DefaultTiming = 'auto' | 'midi' | 'journee' | 'soiree';

export interface UserPreferences {
  maxPrice: MaxPrice;
  groupSize: GroupSize;
  vibe: Vibe;
  distance: Distance;
  defaultTiming: DefaultTiming;
}
