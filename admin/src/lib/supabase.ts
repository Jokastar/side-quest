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

export interface AdminEvent {
  id: string;
  source: string;
  title: string;
  description: string | null;
  category: 'lieu' | 'restaurant' | 'ambiance';
  venue_name: string | null;
  start_date: string;
  end_date: string | null;
  price: number;
  url: string | null;
  photo_url: string | null;
  tags: string | null;          // types source, ex: "Expo;Histoire"
  occurrences: string | null;   // créneaux "start_end;start_end;…"
  schedule_text: string | null; // horaires en clair ("dimanche de 11h à 20h…")
  address: string | null;       // adresse complète avec code postal
  transport: string | null;     // "Métro -> 8 : Chemin Vert (272m)…"
  access_type: string | null;   // 'obligatoire' | 'conseillé' | null
  access_link: string | null;   // lien de réservation
  is_indoor: boolean;
  status: 'pending' | 'approved' | 'rejected';
  cached_at: string;
}

export type EventStatus = AdminEvent['status'];
