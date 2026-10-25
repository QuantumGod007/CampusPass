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
      get_student_account: { Args: Record<PropertyKey, never>; Returns: Json };
      save_student_profile: {
        Args: {
          p_academic_year: Database["public"]["Enums"]["academic_year"];
          p_department: Database["public"]["Enums"]["student_department"];
          p_display_name: string;
          p_prn: string;
        };
        Returns: Json;
      };
    };
    Enums: {
      academic_year:
        "First year" | "Second year" | "Third year" | "Fourth year";
      account_role: "student" | "organizer" | "admin";
      membership_status: "pending" | "active" | "revoked";
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
      membership_status: ["pending", "active", "revoked"],
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
