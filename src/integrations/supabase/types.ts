export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      game_rooms: {
        Row: {
          created_at: string
          current_turn: string | null
          exit_pos: Json
          grid: Json
          guest_id: string | null
          host_id: string
          host_role: string
          id: string
          invite_code: string
          jerry_pos: Json
          join_policy: string
          last_jerry_direction: Json | null
          last_jerry_streak: number
          status: string
          tom_move_count: number
          tom_pos: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          current_turn?: string | null
          exit_pos?: Json
          grid: Json
          guest_id?: string | null
          host_id: string
          host_role?: string
          id?: string
          invite_code?: string
          jerry_pos?: Json
          join_policy?: string
          last_jerry_direction?: Json | null
          last_jerry_streak?: number
          status?: string
          tom_move_count?: number
          tom_pos?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          current_turn?: string | null
          exit_pos?: Json
          grid?: Json
          guest_id?: string | null
          host_id?: string
          host_role?: string
          id?: string
          invite_code?: string
          jerry_pos?: Json
          join_policy?: string
          last_jerry_direction?: Json | null
          last_jerry_streak?: number
          status?: string
          tom_move_count?: number
          tom_pos?: Json
          updated_at?: string
        }
        Relationships: []
      }
      game_invites: {
        Row: {
          id: string
          room_id: string
          from_user_id: string
          to_user_id: string
          created_at: string
        }
        Insert: {
          id?: string
          room_id: string
          from_user_id: string
          to_user_id: string
          created_at?: string
        }
        Update: {
          id?: string
          room_id?: string
          from_user_id?: string
          to_user_id?: string
          created_at?: string
        }
        Relationships: []
      }
      memory_match_progress: {
        Row: {
          user_id: string
          difficulty: string
          max_stage_completed: number
          updated_at: string
        }
        Insert: {
          user_id: string
          difficulty: string
          max_stage_completed?: number
          updated_at?: string
        }
        Update: {
          user_id?: string
          difficulty?: string
          max_stage_completed?: number
          updated_at?: string
        }
        Relationships: []
      }
      memory_match_rooms: {
        Row: {
          id: string
          host_id: string
          guest_id: string | null
          deck: Json
          revealed_indices: Json
          matched_indices: Json
          host_score: number
          guest_score: number
          current_turn: string | null
          join_policy: string
          status: string
          invite_code: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          host_id: string
          guest_id?: string | null
          deck: Json
          revealed_indices?: Json
          matched_indices?: Json
          host_score?: number
          guest_score?: number
          current_turn?: string | null
          join_policy?: string
          status?: string
          invite_code?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          host_id?: string
          guest_id?: string | null
          deck?: Json
          revealed_indices?: Json
          matched_indices?: Json
          host_score?: number
          guest_score?: number
          current_turn?: string | null
          join_policy?: string
          status?: string
          invite_code?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      memory_match_invites: {
        Row: {
          id: string
          room_id: string
          from_user_id: string
          to_user_id: string
          created_at: string
        }
        Insert: {
          id?: string
          room_id: string
          from_user_id: string
          to_user_id: string
          created_at?: string
        }
        Update: {
          id?: string
          room_id?: string
          from_user_id?: string
          to_user_id?: string
          created_at?: string
        }
        Relationships: []
      }
      quiz_battle_progress: {
        Row: {
          user_id: string
          difficulty: string
          max_stage_completed: number
          updated_at: string
        }
        Insert: {
          user_id: string
          difficulty: string
          max_stage_completed?: number
          updated_at?: string
        }
        Update: {
          user_id?: string
          difficulty?: string
          max_stage_completed?: number
          updated_at?: string
        }
        Relationships: []
      }
      quiz_battle_rooms: {
        Row: {
          id: string
          host_id: string
          guest_id: string | null
          questions: Json
          current_question_index: number
          host_score: number
          guest_score: number
          host_answer_index: number | null
          guest_answer_index: number | null
          host_answered_at: string | null
          guest_answered_at: string | null
          question_started_at: string
          status: string
          join_policy: string
          invite_code: string
          created_at: string
          updated_at: string
          category_id: number | null
        }
        Insert: {
          id?: string
          host_id: string
          guest_id?: string | null
          questions: Json
          current_question_index?: number
          host_score?: number
          guest_score?: number
          host_answer_index?: number | null
          guest_answer_index?: number | null
          host_answered_at?: string | null
          guest_answered_at?: string | null
          question_started_at?: string
          status?: string
          join_policy?: string
          invite_code?: string
          created_at?: string
          updated_at?: string
          category_id?: number | null
        }
        Update: {
          id?: string
          host_id?: string
          guest_id?: string | null
          questions?: Json
          current_question_index?: number
          host_score?: number
          guest_score?: number
          host_answer_index?: number | null
          guest_answer_index?: number | null
          host_answered_at?: string | null
          guest_answered_at?: string | null
          question_started_at?: string
          status?: string
          join_policy?: string
          invite_code?: string
          created_at?: string
          updated_at?: string
          category_id?: number | null
        }
        Relationships: []
      }
      quiz_battle_invites: {
        Row: {
          id: string
          room_id: string
          from_user_id: string
          to_user_id: string
          created_at: string
        }
        Insert: {
          id?: string
          room_id: string
          from_user_id: string
          to_user_id: string
          created_at?: string
        }
        Update: {
          id?: string
          room_id?: string
          from_user_id?: string
          to_user_id?: string
          created_at?: string
        }
        Relationships: []
      }
      tom_jerry_progress: {
        Row: {
          user_id: string
          difficulty: string
          max_stage_completed: number
          updated_at: string
        }
        Insert: {
          user_id: string
          difficulty: string
          max_stage_completed?: number
          updated_at?: string
        }
        Update: {
          user_id?: string
          difficulty?: string
          max_stage_completed?: number
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string
          id: string
          total_xp: number
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string
          id?: string
          total_xp?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string
          id?: string
          total_xp?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_game_stats: {
        Row: {
          user_id: string
          game_id: string
          xp: number
          wins: number
          plays: number
          created_at: string
          updated_at: string
        }
        Insert: {
          user_id: string
          game_id: string
          xp?: number
          wins?: number
          plays?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          user_id?: string
          game_id?: string
          xp?: number
          wins?: number
          plays?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
