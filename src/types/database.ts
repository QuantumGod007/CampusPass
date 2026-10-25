// Generated from the migrated PostgreSQL schema by npm run db:types. Do not edit.
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      audit_log: {
        Row: {
          action: string;
          actor_user_id: string | null;
          created_at: string;
          database_actor: string;
          details: NonNullable<Json>;
          id: number;
          institution_id: string | null;
          operator_label: string | null;
          subject_id: string;
        };
        ComputedFields: never;
        Insert: {
          action: string;
          actor_user_id?: string | null;
          created_at?: string;
          database_actor?: string;
          details?: NonNullable<Json>;
          id?: never;
          institution_id?: string | null;
          operator_label?: string | null;
          subject_id: string;
        };
        Update: {
          action?: string;
          actor_user_id?: string | null;
          created_at?: string;
          database_actor?: string;
          details?: NonNullable<Json>;
          id?: never;
          institution_id?: string | null;
          operator_label?: string | null;
          subject_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "audit_log_institution_id_fkey";
            columns: ["institution_id"];
            isOneToOne: false;
            referencedRelation: "institutions";
            referencedColumns: ["id"];
          },
        ];
      };
      booking_requests: {
        Row: {
          booking_id: string;
          created_at: string;
          event_id: string;
          request_id: string;
          student_id: string;
        };
        ComputedFields: never;
        Insert: {
          booking_id: string;
          created_at?: string;
          event_id: string;
          request_id: string;
          student_id: string;
        };
        Update: {
          booking_id?: string;
          created_at?: string;
          event_id?: string;
          request_id?: string;
          student_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "booking_requests_booking_id_fkey";
            columns: ["booking_id"];
            isOneToOne: false;
            referencedRelation: "bookings";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "booking_requests_event_id_fkey";
            columns: ["event_id"];
            isOneToOne: false;
            referencedRelation: "events";
            referencedColumns: ["id"];
          },
        ];
      };
      bookings: {
        Row: {
          cancellation_reason: string | null;
          cancelled_at: string | null;
          created_at: string;
          event_id: string;
          id: string;
          reference: string;
          status: Database["public"]["Enums"]["booking_status"];
          student_id: string;
        };
        ComputedFields: never;
        Insert: {
          cancellation_reason?: string | null;
          cancelled_at?: string | null;
          created_at?: string;
          event_id: string;
          id?: string;
          reference?: string;
          status?: Database["public"]["Enums"]["booking_status"];
          student_id: string;
        };
        Update: {
          cancellation_reason?: string | null;
          cancelled_at?: string | null;
          created_at?: string;
          event_id?: string;
          id?: string;
          reference?: string;
          status?: Database["public"]["Enums"]["booking_status"];
          student_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "bookings_event_id_fkey";
            columns: ["event_id"];
            isOneToOne: false;
            referencedRelation: "events";
            referencedColumns: ["id"];
          },
        ];
      };
      events: {
        Row: {
          capacity: number;
          category: Database["public"]["Enums"]["event_category"];
          created_at: string;
          description: string;
          ends_at: string;
          id: string;
          institution_id: string;
          organizer_id: string;
          revision: number;
          starts_at: string;
          status: Database["public"]["Enums"]["event_status"];
          theme: Database["public"]["Enums"]["poster_theme"];
          title: string;
          updated_at: string;
          venue: string;
        };
        ComputedFields: never;
        Insert: {
          capacity: number;
          category: Database["public"]["Enums"]["event_category"];
          created_at?: string;
          description: string;
          ends_at: string;
          id?: string;
          institution_id: string;
          organizer_id: string;
          revision?: number;
          starts_at: string;
          status?: Database["public"]["Enums"]["event_status"];
          theme?: Database["public"]["Enums"]["poster_theme"];
          title: string;
          updated_at?: string;
          venue: string;
        };
        Update: {
          capacity?: number;
          category?: Database["public"]["Enums"]["event_category"];
          created_at?: string;
          description?: string;
          ends_at?: string;
          id?: string;
          institution_id?: string;
          organizer_id?: string;
          revision?: number;
          starts_at?: string;
          status?: Database["public"]["Enums"]["event_status"];
          theme?: Database["public"]["Enums"]["poster_theme"];
          title?: string;
          updated_at?: string;
          venue?: string;
        };
        Relationships: [
          {
            foreignKeyName: "events_institution_id_fkey";
            columns: ["institution_id"];
            isOneToOne: false;
            referencedRelation: "institutions";
            referencedColumns: ["id"];
          },
        ];
      };
      institution_memberships: {
        Row: {
          approved_at: string | null;
          created_at: string;
          expires_at: string | null;
          id: string;
          institution_id: string;
          provisioned_by: string | null;
          revoked_at: string | null;
          role: Database["public"]["Enums"]["account_role"];
          status: Database["public"]["Enums"]["membership_status"];
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          approved_at?: string | null;
          created_at?: string;
          expires_at?: string | null;
          id?: string;
          institution_id: string;
          provisioned_by?: string | null;
          revoked_at?: string | null;
          role?: Database["public"]["Enums"]["account_role"];
          status?: Database["public"]["Enums"]["membership_status"];
          updated_at?: string;
          user_id: string;
        };
        Update: {
          approved_at?: string | null;
          created_at?: string;
          expires_at?: string | null;
          id?: string;
          institution_id?: string;
          provisioned_by?: string | null;
          revoked_at?: string | null;
          role?: Database["public"]["Enums"]["account_role"];
          status?: Database["public"]["Enums"]["membership_status"];
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "institution_memberships_institution_id_fkey";
            columns: ["institution_id"];
            isOneToOne: false;
            referencedRelation: "institutions";
            referencedColumns: ["id"];
          },
        ];
      };
      institutions: {
        Row: {
          created_at: string;
          id: string;
          is_active: boolean;
          membership_policy: string;
          name: string;
          public_metadata: NonNullable<Json>;
          slug: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: string;
          is_active?: boolean;
          membership_policy?: string;
          name: string;
          public_metadata?: NonNullable<Json>;
          slug: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          is_active?: boolean;
          membership_policy?: string;
          name?: string;
          public_metadata?: NonNullable<Json>;
          slug?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      student_profiles: {
        Row: {
          academic_year: Database["public"]["Enums"]["academic_year"];
          created_at: string;
          department: Database["public"]["Enums"]["student_department"];
          display_name: string;
          institution_id: string | null;
          prn: string;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          academic_year: Database["public"]["Enums"]["academic_year"];
          created_at?: string;
          department: Database["public"]["Enums"]["student_department"];
          display_name: string;
          institution_id?: string | null;
          prn: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          academic_year?: Database["public"]["Enums"]["academic_year"];
          created_at?: string;
          department?: Database["public"]["Enums"]["student_department"];
          display_name?: string;
          institution_id?: string | null;
          prn?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "student_profiles_user_id_institution_id_fkey";
            columns: ["user_id", "institution_id"];
            isOneToOne: false;
            referencedRelation: "institution_memberships";
            referencedColumns: ["user_id", "institution_id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      book_campus_event: {
        Args: { p_event_id: string; p_request_id: string };
        Returns: Json;
      };
      cancel_campus_booking: { Args: { p_booking_id: string }; Returns: Json };
      create_campus_event: {
        Args: {
          p_capacity: number;
          p_category: Database["public"]["Enums"]["event_category"];
          p_description: string;
          p_ends_at: string;
          p_starts_at: string;
          p_theme: Database["public"]["Enums"]["poster_theme"];
          p_title: string;
          p_venue: string;
        };
        Returns: Json;
      };
      get_campus_access: { Args: Record<PropertyKey, never>; Returns: Json };
      get_campus_event: { Args: { p_event_id: string }; Returns: Json };
      get_student_account: { Args: Record<PropertyKey, never>; Returns: Json };
      list_campus_attendees: { Args: { p_event_id: string }; Returns: Json };
      list_campus_events: { Args: { p_owned?: boolean }; Returns: Json };
      list_my_campus_bookings: {
        Args: Record<PropertyKey, never>;
        Returns: Json;
      };
      save_campus_event: {
        Args: {
          p_capacity: number;
          p_category: Database["public"]["Enums"]["event_category"];
          p_description: string;
          p_ends_at: string;
          p_event_id: string;
          p_expected_revision: number;
          p_starts_at: string;
          p_theme: Database["public"]["Enums"]["poster_theme"];
          p_title: string;
          p_venue: string;
        };
        Returns: Json;
      };
      save_student_profile: {
        Args: {
          p_academic_year: Database["public"]["Enums"]["academic_year"];
          p_department: Database["public"]["Enums"]["student_department"];
          p_display_name: string;
          p_prn: string;
        };
        Returns: Json;
      };
      set_campus_event_status: {
        Args: {
          p_event_id: string;
          p_expected_revision: number;
          p_status: Database["public"]["Enums"]["event_status"];
        };
        Returns: Json;
      };
    };
    Enums: {
      academic_year:
        "First year" | "Second year" | "Third year" | "Fourth year";
      account_role: "student" | "organizer" | "admin";
      booking_status: "confirmed" | "cancelled";
      event_category:
        | "Technology"
        | "Hackathons"
        | "Workshops"
        | "Cultural"
        | "Sports"
        | "Entrepreneurship"
        | "Design";
      event_status: "draft" | "published" | "cancelled";
      membership_status: "pending" | "active" | "revoked";
      poster_theme:
        | "build"
        | "design"
        | "ai"
        | "startup"
        | "coffee"
        | "film"
        | "robot"
        | "photo"
        | "source"
        | "music"
        | "product"
        | "sport";
      student_department:
        | "Computer Science"
        | "Information Technology"
        | "Electronics & Telecommunication"
        | "Mechanical Engineering"
        | "Civil Engineering"
        | "Business & Management"
        | "Design & Arts"
        | "Other";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  "public"
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      academic_year: ["First year", "Second year", "Third year", "Fourth year"],
      account_role: ["student", "organizer", "admin"],
      booking_status: ["confirmed", "cancelled"],
      event_category: [
        "Technology",
        "Hackathons",
        "Workshops",
        "Cultural",
        "Sports",
        "Entrepreneurship",
        "Design",
      ],
      event_status: ["draft", "published", "cancelled"],
      membership_status: ["pending", "active", "revoked"],
      poster_theme: [
        "build",
        "design",
        "ai",
        "startup",
        "coffee",
        "film",
        "robot",
        "photo",
        "source",
        "music",
        "product",
        "sport",
      ],
      student_department: [
        "Computer Science",
        "Information Technology",
        "Electronics & Telecommunication",
        "Mechanical Engineering",
        "Civil Engineering",
        "Business & Management",
        "Design & Arts",
        "Other",
      ],
    },
  },
} as const;
