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
      annual_objectives: {
        Row: {
          created_at: string
          id: string
          notes: string | null
          revenue_target: number
          user_id: string
          year: number
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string | null
          revenue_target: number
          user_id: string
          year: number
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string | null
          revenue_target?: number
          user_id?: string
          year?: number
        }
        Relationships: []
      }
      bank_accounts: {
        Row: {
          created_at: string
          current_balance: number | null
          id: string
          last_updated: string | null
          name: string
          user_id: string
        }
        Insert: {
          created_at?: string
          current_balance?: number | null
          id?: string
          last_updated?: string | null
          name: string
          user_id: string
        }
        Update: {
          created_at?: string
          current_balance?: number | null
          id?: string
          last_updated?: string | null
          name?: string
          user_id?: string
        }
        Relationships: []
      }
      categories: {
        Row: {
          color: string | null
          created_at: string
          emoji: string | null
          id: string
          is_default: boolean | null
          name: string
          sort_order: number | null
          type: string
          user_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          emoji?: string | null
          id?: string
          is_default?: boolean | null
          name: string
          sort_order?: number | null
          type: string
          user_id: string
        }
        Update: {
          color?: string | null
          created_at?: string
          emoji?: string | null
          id?: string
          is_default?: boolean | null
          name?: string
          sort_order?: number | null
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      import_batches: {
        Row: {
          created_at: string
          error_message: string | null
          filename: string
          id: string
          row_count: number | null
          status: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          filename: string
          id?: string
          row_count?: number | null
          status?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          filename?: string
          id?: string
          row_count?: number | null
          status?: string | null
          user_id?: string
        }
        Relationships: []
      }
      invoices: {
        Row: {
          amount: number
          category_id: string | null
          client_name: string
          created_at: string
          date_due: string | null
          date_issued: string
          description: string | null
          id: string
          notes: string | null
          paid_date: string | null
          status: string | null
          user_id: string
        }
        Insert: {
          amount: number
          category_id?: string | null
          client_name: string
          created_at?: string
          date_due?: string | null
          date_issued: string
          description?: string | null
          id?: string
          notes?: string | null
          paid_date?: string | null
          status?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          category_id?: string | null
          client_name?: string
          created_at?: string
          date_due?: string | null
          date_issued?: string
          description?: string | null
          id?: string
          notes?: string | null
          paid_date?: string | null
          status?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      monthly_objectives: {
        Row: {
          created_at: string
          expense_budget: number | null
          id: string
          month: string
          notes: string | null
          revenue_target: number | null
          user_id: string
        }
        Insert: {
          created_at?: string
          expense_budget?: number | null
          id?: string
          month: string
          notes?: string | null
          revenue_target?: number | null
          user_id: string
        }
        Update: {
          created_at?: string
          expense_budget?: number | null
          id?: string
          month?: string
          notes?: string | null
          revenue_target?: number | null
          user_id?: string
        }
        Relationships: []
      }
      monthly_signed_revenue: {
        Row: {
          created_at: string
          id: string
          month: number
          total_signed: number
          updated_at: string
          user_id: string
          year: number
        }
        Insert: {
          created_at?: string
          id?: string
          month: number
          total_signed?: number
          updated_at?: string
          user_id: string
          year: number
        }
        Update: {
          created_at?: string
          id?: string
          month?: number
          total_signed?: number
          updated_at?: string
          user_id?: string
          year?: number
        }
        Relationships: []
      }
      monthly_signed_revenue_details: {
        Row: {
          amount: number
          created_at: string
          id: string
          label: string | null
          monthly_signed_id: string
          offer_id: string | null
          user_id: string
        }
        Insert: {
          amount?: number
          created_at?: string
          id?: string
          label?: string | null
          monthly_signed_id: string
          offer_id?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          label?: string | null
          monthly_signed_id?: string
          offer_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "monthly_signed_revenue_details_monthly_signed_id_fkey"
            columns: ["monthly_signed_id"]
            isOneToOne: false
            referencedRelation: "monthly_signed_revenue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "monthly_signed_revenue_details_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "offers"
            referencedColumns: ["id"]
          },
        ]
      }
      offers: {
        Row: {
          billing_type: string
          created_at: string
          emoji: string | null
          id: string
          is_active: boolean | null
          name: string
          recurring_duration: number | null
          sort_order: number | null
          unit_price: number
          user_id: string
        }
        Insert: {
          billing_type: string
          created_at?: string
          emoji?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          recurring_duration?: number | null
          sort_order?: number | null
          unit_price: number
          user_id: string
        }
        Update: {
          billing_type?: string
          created_at?: string
          emoji?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          recurring_duration?: number | null
          sort_order?: number | null
          unit_price?: number
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
        }
        Relationships: []
      }
      quarterly_objectives: {
        Row: {
          created_at: string
          id: string
          notes: string | null
          offer_id: string
          quarter: number
          target_new_clients: number
          user_id: string
          year: number
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string | null
          offer_id: string
          quarter: number
          target_new_clients?: number
          user_id: string
          year: number
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string | null
          offer_id?: string
          quarter?: number
          target_new_clients?: number
          user_id?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "quarterly_objectives_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "offers"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          amount: number
          category_id: string | null
          created_at: string
          date: string
          id: string
          import_batch_id: string | null
          is_validated: boolean | null
          label: string
          notes: string | null
          source: string | null
          subcategory: string | null
          user_id: string
        }
        Insert: {
          amount: number
          category_id?: string | null
          created_at?: string
          date: string
          id?: string
          import_batch_id?: string | null
          is_validated?: boolean | null
          label: string
          notes?: string | null
          source?: string | null
          subcategory?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          category_id?: string | null
          created_at?: string
          date?: string
          id?: string
          import_batch_id?: string | null
          is_validated?: boolean | null
          label?: string
          notes?: string | null
          source?: string | null
          subcategory?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_import_batch_id_fkey"
            columns: ["import_batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
        ]
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
