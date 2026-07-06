export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

// ============================================================
// Schéma Supabase — App Spin
// ============================================================

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

      // Cache des lieux Google Places (musées, restos, bars, etc.)
      // Chaque venue appartient à un reel : 'lieu' | 'restaurant' | 'ambiance'
      venues: {
        Row: {
          id: string;
          google_place_id: string;
          name: string;
          address: string;
          category: 'lieu' | 'restaurant' | 'ambiance';
          lat: number;
          lng: number;
          price_level: number | null;   // 1 = €, 2 = €€, 3 = €€€
          rating: number | null;
          photo_url: string | null;
          rarity: 'common' | 'rare' | 'epic' | 'legendary';
          is_active: boolean;
          cached_at: string;
        };
        Insert: {
          id?: string;
          google_place_id: string;
          name: string;
          address: string;
          category: 'lieu' | 'restaurant' | 'ambiance';
          lat: number;
          lng: number;
          price_level?: number | null;
          rating?: number | null;
          photo_url?: string | null;
          rarity?: 'common' | 'rare' | 'epic' | 'legendary';
          is_active?: boolean;
          cached_at?: string;
        };
        Update: {
          name?: string;
          address?: string;
          price_level?: number | null;
          rating?: number | null;
          photo_url?: string | null;
          rarity?: 'common' | 'rare' | 'epic' | 'legendary';
          is_active?: boolean;
          cached_at?: string;
        };
        Relationships: [];
      };

      // Cache des événements Paris Open Data + Eventbrite
      // Rafraîchi toutes les 6h par une Supabase Edge Function
      events: {
        Row: {
          id: string;
          source: 'paris_opendata' | 'eventbrite';
          external_id: string;
          title: string;
          description: string | null;
          category: 'lieu' | 'restaurant' | 'ambiance';
          venue_name: string | null;
          lat: number | null;
          lng: number | null;
          start_date: string;
          end_date: string | null;
          price: number;              // 0 = gratuit
          url: string | null;
          photo_url: string | null;
          cached_at: string;
        };
        Insert: {
          id?: string;
          source: 'paris_opendata' | 'eventbrite';
          external_id: string;
          title: string;
          description?: string | null;
          category: 'lieu' | 'restaurant' | 'ambiance';
          venue_name?: string | null;
          lat?: number | null;
          lng?: number | null;
          start_date: string;
          end_date?: string | null;
          price?: number;
          url?: string | null;
          photo_url?: string | null;
          cached_at?: string;
        };
        Update: {
          title?: string;
          description?: string | null;
          venue_name?: string | null;
          start_date?: string;
          end_date?: string | null;
          price?: number;
          url?: string | null;
          photo_url?: string | null;
          cached_at?: string;
        };
        Relationships: [];
      };

      // Une escapade générée = 1 lieu + 1 restaurant + 1 ambiance
      // status : generated (affiché) → accepted (validé par user) → completed (check-in fait)
      escapades: {
        Row: {
          id: string;
          user_id: string;
          venue_id: string;       // reel 1 : lieu à visiter
          restaurant_id: string;  // reel 2 : restaurant
          event_id: string;       // reel 3 : ambiance / sortie
          status: 'generated' | 'accepted' | 'completed';
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          venue_id: string;
          restaurant_id: string;
          event_id: string;
          status?: 'generated' | 'accepted' | 'completed';
          created_at?: string;
        };
        Update: {
          status?: 'generated' | 'accepted' | 'completed';
        };
        Relationships: [];
      };

      // Check-in GPS sur place pour valider une escapade
      // gps_verified = true si l'user était à < 150m du lieu
      // photo_url remplie si l'user a pris une photo (+30% XP)
      checkins: {
        Row: {
          id: string;
          user_id: string;
          escapade_id: string;
          venue_id: string;
          gps_verified: boolean;
          photo_url: string | null;
          rating: number | null;   // note 1 à 3
          checked_in_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          escapade_id?: string | null;
          venue_id?: string | null;
          gps_verified?: boolean;
          photo_url?: string | null;
          rating?: number | null;
          checked_in_at?: string;
        };
        Update: {
          gps_verified?: boolean;
          photo_url?: string | null;
          rating?: number | null;
        };
        Relationships: [];
      };

      // Tampons collectionnés par l'utilisateur (carnet de voyage)
      // Créé UNIQUEMENT après validation complète : GPS + photo + Gemini
      // Les infos du lieu sont dénormalisées : le tampon survit à la suppression du venue
      stamps: {
        Row: {
          id: string;
          user_id: string;
          escapade_id: string | null;
          venue_id: string | null;
          category: 'lieu' | 'restaurant' | 'ambiance';
          venue_name: string;
          arrondissement: number | null;   // 1 à 20
          rarity: 'common' | 'rare' | 'epic' | 'legendary';
          photo_url: string | null;
          earned_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          escapade_id?: string | null;
          venue_id?: string | null;
          category: 'lieu' | 'restaurant' | 'ambiance';
          venue_name: string;
          arrondissement?: number | null;
          rarity?: 'common' | 'rare' | 'epic' | 'legendary';
          photo_url?: string | null;
          earned_at?: string;
        };
        // Un tampon ne se modifie jamais — Record<string, never> plutôt que never
        // pour rester compatible avec la contrainte GenericTable de supabase-js
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
export type Venue = Database['public']['Tables']['venues']['Row'];
export type SpinEvent = Database['public']['Tables']['events']['Row'];
export type Escapade = Database['public']['Tables']['escapades']['Row'];
export type Checkin = Database['public']['Tables']['checkins']['Row'];
export type Stamp = Database['public']['Tables']['stamps']['Row'];
export type Badge = Database['public']['Tables']['badges']['Row'];
export type UserBadge = Database['public']['Tables']['user_badges']['Row'];

// Préférences utilisateur (stockées localement + en DB)
export type Budget = 1 | 2 | 3;             // 1=€, 2=€€, 3=€€€
export type Vibe = 'chill' | 'festif' | 'culturel';
export type Distance = 'apied' | 'metro' | 'nImporte';

export interface UserPreferences {
  budget: Budget;
  vibe: Vibe;
  distance: Distance;
}
