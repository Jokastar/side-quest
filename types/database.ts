export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: {
      quests: {
        Row: {
          id: string;
          title: string;
          description: string | null;
          xp_reward: number;
          location: any; // PostGIS geometry
          is_permanent: boolean;
          start_date: string | null;
          end_date: string | null;
        };
        Insert: {
          id?: string;
          title: string;
          description?: string | null;
          xp_reward?: number;
          location: any;
          is_permanent?: boolean;
          start_date?: string | null;
          end_date?: string | null;
        };
        Update: {
          title?: string;
          description?: string | null;
          xp_reward?: number;
          location?: any;
          is_permanent?: boolean;
          start_date?: string | null;
          end_date?: string | null;
        };
      };
      quest_submissions: {
        Row: {
          id: string;
          user_id: string;
          quest_id: string;
          photo_url: string | null;
          status: 'pending' | 'approved' | 'rejected';
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          quest_id: string;
          photo_url?: string | null;
          status?: 'pending' | 'approved' | 'rejected';
          created_at?: string;
        };
        Update: {
          photo_url?: string | null;
          status?: 'pending' | 'approved' | 'rejected';
        };
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
}

// Convenience row types
export type Quest = Database['public']['Tables']['quests']['Row'];
export type QuestSubmission = Database['public']['Tables']['quest_submissions']['Row'];
export type SubmissionStatus = QuestSubmission['status'];
