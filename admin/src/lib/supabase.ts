import { createClient } from '@supabase/supabase-js';

// Même projet Supabase que l'app mobile — l'admin est juste
// un deuxième client sur le même backend.
// La clé publishable est safe côté navigateur : ce sont les policies
// RLS (is_admin) qui protègent les écritures, pas la clé.
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_KEY,
);

// ── Types minimaux (miroir de types/database.ts côté app) ─────

export type Slot = 'activite' | 'table' | 'sortie';
export type Category = 'culture' | 'loisir' | 'plein_air' | 'food' | 'bar' | 'club' | 'concert';
export type ItemStatus = 'pending' | 'approved' | 'rejected';

export interface AdminItem {
  id: string;
  nature: 'permanent' | 'ephemere';
  slot: Slot;
  category: Category;
  source: string;
  name: string;
  description: string | null;
  start_date: string | null;
  end_date: string | null;
  price: number | null;         // euros (éphémères)
  price_level: number | null;   // 1-3 (permanents)
  rating: number | null;
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
  url: string | null;
  photo_url: string | null;
  tags: string | null;          // labels source, ex: "Expo;Histoire"
  occurrences: string | null;   // créneaux "start_end;start_end;…"
  schedule_text: string | null; // horaires en clair ("dimanche de 11h à 20h…")
  address: string | null;       // adresse complète avec code postal
  transport: string | null;     // "Métro -> 8 : Chemin Vert (272m)…"
  access_type: string | null;   // 'obligatoire' | 'conseillé' | null
  access_link: string | null;   // lien de réservation
  is_indoor: boolean;
  is_active: boolean;
  status: ItemStatus;
  cached_at: string;
}
