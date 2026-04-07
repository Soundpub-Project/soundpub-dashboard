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
      app_settings: {
        Row: {
          created_at: string | null
          id: string
          key: string
          updated_at: string | null
          value: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          key: string
          updated_at?: string | null
          value?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          key?: string
          updated_at?: string | null
          value?: string | null
        }
        Relationships: []
      }
      artist_profiles: {
        Row: {
          artist_name: string
          artist_type: string
          bio: string | null
          created_at: string | null
          genre: string | null
          id: string
          social_links: Json | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          artist_name: string
          artist_type?: string
          bio?: string | null
          created_at?: string | null
          genre?: string | null
          id?: string
          social_links?: Json | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          artist_name?: string
          artist_type?: string
          bio?: string | null
          created_at?: string | null
          genre?: string | null
          id?: string
          social_links?: Json | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      artists: {
        Row: {
          created_at: string | null
          id: string
          label_id: string
          name: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          label_id: string
          name: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          label_id?: string
          name?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "artists_label_id_fkey"
            columns: ["label_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_id: string
          created_at: string
          details: Json | null
          id: string
          ip_address: string | null
          target_id: string | null
          target_type: string | null
        }
        Insert: {
          action: string
          actor_id: string
          created_at?: string
          details?: Json | null
          id?: string
          ip_address?: string | null
          target_id?: string | null
          target_type?: string | null
        }
        Update: {
          action?: string
          actor_id?: string
          created_at?: string
          details?: Json | null
          id?: string
          ip_address?: string | null
          target_id?: string | null
          target_type?: string | null
        }
        Relationships: []
      }
      composer_royalties: {
        Row: {
          composer_id: string
          composer_name: string
          created_at: string
          id: string
          period: string | null
          total_net_royalti: number
          updated_at: string
          upload_id: string | null
        }
        Insert: {
          composer_id: string
          composer_name: string
          created_at?: string
          id?: string
          period?: string | null
          total_net_royalti?: number
          updated_at?: string
          upload_id?: string | null
        }
        Update: {
          composer_id?: string
          composer_name?: string
          created_at?: string
          id?: string
          period?: string | null
          total_net_royalti?: number
          updated_at?: string
          upload_id?: string | null
        }
        Relationships: []
      }
      payout_requests: {
        Row: {
          account_holder_name: string
          account_number: string
          amount: number
          bank_name: string
          created_at: string | null
          id: string
          notes: string | null
          processed_at: string | null
          processed_by: string | null
          status: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          account_holder_name: string
          account_number: string
          amount: number
          bank_name: string
          created_at?: string | null
          id?: string
          notes?: string | null
          processed_at?: string | null
          processed_by?: string | null
          status?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          account_holder_name?: string
          account_number?: string
          amount?: number
          bank_name?: string
          created_at?: string | null
          id?: string
          notes?: string | null
          processed_at?: string | null
          processed_by?: string | null
          status?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payout_requests_processed_by_fkey"
            columns: ["processed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payout_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          address: string | null
          artist_profile_completed: boolean | null
          artist_revenue: number
          avatar_url: string | null
          balance: number
          composer_code: string | null
          created_at: string | null
          email: string
          full_name: string
          id: string
          label_revenue: number
          logo_url: string | null
          logo_url_dark: string | null
          logo_url_light: string | null
          parent_label_id: string | null
          password_set: boolean | null
          phone: string | null
          sso_provider: string | null
          status: string
          subscription_status: string | null
          subscription_upgraded_at: string | null
          updated_at: string | null
        }
        Insert: {
          address?: string | null
          artist_profile_completed?: boolean | null
          artist_revenue?: number
          avatar_url?: string | null
          balance?: number
          composer_code?: string | null
          created_at?: string | null
          email: string
          full_name: string
          id: string
          label_revenue?: number
          logo_url?: string | null
          logo_url_dark?: string | null
          logo_url_light?: string | null
          parent_label_id?: string | null
          password_set?: boolean | null
          phone?: string | null
          sso_provider?: string | null
          status?: string
          subscription_status?: string | null
          subscription_upgraded_at?: string | null
          updated_at?: string | null
        }
        Update: {
          address?: string | null
          artist_profile_completed?: boolean | null
          artist_revenue?: number
          avatar_url?: string | null
          balance?: number
          composer_code?: string | null
          created_at?: string | null
          email?: string
          full_name?: string
          id?: string
          label_revenue?: number
          logo_url?: string | null
          logo_url_dark?: string | null
          logo_url_light?: string | null
          parent_label_id?: string | null
          password_set?: boolean | null
          phone?: string | null
          sso_provider?: string | null
          status?: string
          subscription_status?: string | null
          subscription_upgraded_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_parent_label_id_fkey"
            columns: ["parent_label_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      releases: {
        Row: {
          archived_at: string | null
          artist_name: string
          artist_user_id: string | null
          cover_url: string | null
          created_at: string | null
          created_by: string | null
          genre: string | null
          id: string
          label_id: string
          release_date: string | null
          release_type: string | null
          status: string
          title: string
          upc: string | null
          updated_at: string | null
        }
        Insert: {
          archived_at?: string | null
          artist_name: string
          artist_user_id?: string | null
          cover_url?: string | null
          created_at?: string | null
          created_by?: string | null
          genre?: string | null
          id?: string
          label_id: string
          release_date?: string | null
          release_type?: string | null
          status?: string
          title: string
          upc?: string | null
          updated_at?: string | null
        }
        Update: {
          archived_at?: string | null
          artist_name?: string
          artist_user_id?: string | null
          cover_url?: string | null
          created_at?: string | null
          created_by?: string | null
          genre?: string | null
          id?: string
          label_id?: string
          release_date?: string | null
          release_type?: string | null
          status?: string
          title?: string
          upc?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "releases_artist_user_id_fkey"
            columns: ["artist_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "releases_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "releases_label_id_fkey"
            columns: ["label_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      royalties: {
        Row: {
          artist: string | null
          artist_user_id: string | null
          country: string
          created_at: string | null
          id: string
          isrc: string
          label_name: string
          net_revenue: number
          period: string
          platform: string
          sales_type: string | null
          sales_unit: number
          title: string | null
          upc: string
          upload_id: string
        }
        Insert: {
          artist?: string | null
          artist_user_id?: string | null
          country: string
          created_at?: string | null
          id?: string
          isrc: string
          label_name: string
          net_revenue?: number
          period: string
          platform: string
          sales_type?: string | null
          sales_unit?: number
          title?: string | null
          upc: string
          upload_id: string
        }
        Update: {
          artist?: string | null
          artist_user_id?: string | null
          country?: string
          created_at?: string | null
          id?: string
          isrc?: string
          label_name?: string
          net_revenue?: number
          period?: string
          platform?: string
          sales_type?: string | null
          sales_unit?: number
          title?: string | null
          upc?: string
          upload_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "royalties_upload_id_fkey"
            columns: ["upload_id"]
            isOneToOne: false
            referencedRelation: "royalty_uploads"
            referencedColumns: ["id"]
          },
        ]
      }
      royalty_uploads: {
        Row: {
          created_at: string | null
          error_message: string | null
          filename: string
          id: string
          inserted_records: number
          original_filename: string
          status: string
          summary: Json | null
          total_records: number
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          error_message?: string | null
          filename: string
          id?: string
          inserted_records?: number
          original_filename: string
          status: string
          summary?: Json | null
          total_records?: number
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          error_message?: string | null
          filename?: string
          id?: string
          inserted_records?: number
          original_filename?: string
          status?: string
          summary?: Json | null
          total_records?: number
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "royalty_uploads_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tracks: {
        Row: {
          artist_name: string
          artist_user_id: string | null
          artists: Json | null
          audio_url: string | null
          clip_url: string | null
          composer: string | null
          contributors: Json | null
          created_at: string | null
          duration: number | null
          explicit_lyrics: boolean | null
          genre: string | null
          id: string
          isrc: string | null
          lyricist: string | null
          lyrics: string | null
          release_id: string
          title: string
          updated_at: string | null
          video_url: string | null
        }
        Insert: {
          artist_name: string
          artist_user_id?: string | null
          artists?: Json | null
          audio_url?: string | null
          clip_url?: string | null
          composer?: string | null
          contributors?: Json | null
          created_at?: string | null
          duration?: number | null
          explicit_lyrics?: boolean | null
          genre?: string | null
          id?: string
          isrc?: string | null
          lyricist?: string | null
          lyrics?: string | null
          release_id: string
          title: string
          updated_at?: string | null
          video_url?: string | null
        }
        Update: {
          artist_name?: string
          artist_user_id?: string | null
          artists?: Json | null
          audio_url?: string | null
          clip_url?: string | null
          composer?: string | null
          contributors?: Json | null
          created_at?: string | null
          duration?: number | null
          explicit_lyrics?: boolean | null
          genre?: string | null
          id?: string
          isrc?: string | null
          lyricist?: string | null
          lyrics?: string | null
          release_id?: string
          title?: string
          updated_at?: string | null
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tracks_artist_user_id_fkey"
            columns: ["artist_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tracks_release_id_fkey"
            columns: ["release_id"]
            isOneToOne: false
            referencedRelation: "releases"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_artist_user_id_by_name: {
        Args: { _artist_name: string; _label_id?: string }
        Returns: string
      }
      get_royalty_artist_breakdown: {
        Args: { _limit?: number; _period?: string }
        Returns: {
          admin_share: number
          artist_name: string
          artist_share: number
          is_soundpub: boolean
          label_share: number
          revenue: number
          streams: number
          track_count: number
        }[]
      }
      get_royalty_comparison: {
        Args: { _current_periods: string[]; _previous_periods: string[] }
        Returns: {
          data_type: string
          period: string
          revenue: number
          streams: number
        }[]
      }
      get_royalty_country_summary: {
        Args: { _limit?: number }
        Returns: {
          country: string
          revenue: number
          streams: number
        }[]
      }
      get_royalty_label_breakdown: {
        Args: { _period?: string }
        Returns: {
          admin_share: number
          artist_share: number
          label_name: string
          label_share: number
          revenue: number
          streams: number
        }[]
      }
      get_royalty_monthly_summary: {
        Args: never
        Returns: {
          period: string
          revenue: number
          streams: number
        }[]
      }
      get_royalty_period_summary: {
        Args: never
        Returns: {
          growth: number
          period: string
          revenue: number
          streams: number
          top_country: string
          top_platform: string
          unique_artists: number
          unique_labels: number
          unique_tracks: number
        }[]
      }
      get_royalty_periods: {
        Args: never
        Returns: {
          period: string
        }[]
      }
      get_royalty_platform_summary: {
        Args: { _limit?: number }
        Returns: {
          platform: string
          revenue: number
          streams: number
        }[]
      }
      get_royalty_stats: {
        Args: never
        Returns: {
          total_revenue: number
          total_streams: number
          unique_artists: number
          unique_labels: number
          unique_platforms: number
          unique_tracks: number
        }[]
      }
      get_royalty_top_performers: {
        Args: {
          _current_periods: string[]
          _group_by?: string
          _limit?: number
          _previous_periods: string[]
        }
        Returns: {
          growth: number
          name: string
          revenue: number
          streams: number
        }[]
      }
      get_royalty_track_breakdown: {
        Args: { _period?: string }
        Returns: {
          admin_share: number
          artist_name: string
          artist_share: number
          country_count: number
          is_soundpub: boolean
          isrc: string
          label: string
          label_share: number
          platform_count: number
          revenue: number
          streams: number
          title: string
        }[]
      }
      get_user_full_name: { Args: { _user_id: string }; Returns: string }
      get_user_parent_label_id: { Args: { _user_id: string }; Returns: string }
      get_user_release_label_ids: {
        Args: { _user_id: string }
        Returns: string[]
      }
      get_user_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      is_whitelabel: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      app_role:
        | "superadmin"
        | "admin"
        | "label"
        | "artist"
        | "user"
        | "copyright"
        | "whitelabel"
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
    Enums: {
      app_role: [
        "superadmin",
        "admin",
        "label",
        "artist",
        "user",
        "copyright",
        "whitelabel",
      ],
    },
  },
} as const
