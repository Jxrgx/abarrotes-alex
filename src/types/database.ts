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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      branch_hours: {
        Row: {
          branch_id: string
          closing_time: string | null
          day_of_week: number
          id: string
          is_closed: boolean
          opening_time: string | null
        }
        Insert: {
          branch_id: string
          closing_time?: string | null
          day_of_week: number
          id?: string
          is_closed?: boolean
          opening_time?: string | null
        }
        Update: {
          branch_id?: string
          closing_time?: string | null
          day_of_week?: number
          id?: string
          is_closed?: boolean
          opening_time?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "branch_hours_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      branch_products: {
        Row: {
          branch_id: string
          created_at: string
          id: string
          is_available: boolean
          price: number
          product_id: string
          updated_at: string
        }
        Insert: {
          branch_id: string
          created_at?: string
          id?: string
          is_available?: boolean
          price: number
          product_id: string
          updated_at?: string
        }
        Update: {
          branch_id?: string
          created_at?: string
          id?: string
          is_available?: boolean
          price?: number
          product_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "branch_products_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "branch_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      branches: {
        Row: {
          address: string | null
          created_at: string
          id: string
          is_active: boolean
          latitude: number | null
          longitude: number | null
          name: string
          phone: string | null
          updated_at: string
          whatsapp_number: string | null
        }
        Insert: {
          address?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          latitude?: number | null
          longitude?: number | null
          name: string
          phone?: string | null
          updated_at?: string
          whatsapp_number?: string | null
        }
        Update: {
          address?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          latitude?: number | null
          longitude?: number | null
          name?: string
          phone?: string | null
          updated_at?: string
          whatsapp_number?: string | null
        }
        Relationships: []
      }
      brands: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      categories: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      order_items: {
        Row: {
          created_at: string
          id: string
          order_id: string
          product_id: string
          product_name: string
          pricing_type: Database["public"]["Enums"]["pricing_type"] | null
          product_presentation: string | null
          quantity: number
          subtotal: number
          unit_price: number
        }
        Insert: {
          created_at?: string
          id?: string
          order_id: string
          product_id: string
          pricing_type?: Database["public"]["Enums"]["pricing_type"] | null
          product_name: string
          product_presentation?: string | null
          quantity: number
          subtotal: number
          unit_price: number
        }
        Update: {
          created_at?: string
          id?: string
          order_id?: string
          product_id?: string
          pricing_type?: Database["public"]["Enums"]["pricing_type"] | null
          product_name?: string
          product_presentation?: string | null
          quantity?: number
          subtotal?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      order_status_history: {
        Row: {
          changed_by: string | null
          created_at: string
          id: string
          new_status: Database["public"]["Enums"]["order_status"]
          order_id: string
          previous_status: Database["public"]["Enums"]["order_status"] | null
        }
        Insert: {
          changed_by?: string | null
          created_at?: string
          id?: string
          new_status: Database["public"]["Enums"]["order_status"]
          order_id: string
          previous_status?: Database["public"]["Enums"]["order_status"] | null
        }
        Update: {
          changed_by?: string | null
          created_at?: string
          id?: string
          new_status?: Database["public"]["Enums"]["order_status"]
          order_id?: string
          previous_status?: Database["public"]["Enums"]["order_status"] | null
        }
        Relationships: [
          {
            foreignKeyName: "order_status_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_status_history_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          address: string | null
          address_references: string | null
          branch_id: string
          cash_amount: number | null
          client_request_id: string | null
          created_at: string
          customer_name: string
          customer_name_search: string | null
          customer_notes: string | null
          customer_phone: string
          delivery_type: Database["public"]["Enums"]["delivery_type"]
          folio: string
          id: string
          neighborhood: string | null
          payment_method: Database["public"]["Enums"]["payment_method"]
          shipping_cost: number | null
          status: Database["public"]["Enums"]["order_status"]
          subtotal: number
          total: number
          updated_at: string
        }
        Insert: {
          address?: string | null
          address_references?: string | null
          branch_id: string
          cash_amount?: number | null
          client_request_id?: string | null
          created_at?: string
          customer_name: string
          customer_name_search?: string | null
          customer_notes?: string | null
          customer_phone: string
          delivery_type: Database["public"]["Enums"]["delivery_type"]
          folio?: string
          id?: string
          neighborhood?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"]
          shipping_cost?: number | null
          status?: Database["public"]["Enums"]["order_status"]
          subtotal: number
          total: number
          updated_at?: string
        }
        Update: {
          address?: string | null
          address_references?: string | null
          branch_id?: string
          cash_amount?: number | null
          client_request_id?: string | null
          created_at?: string
          customer_name?: string
          customer_name_search?: string | null
          customer_notes?: string | null
          customer_phone?: string
          delivery_type?: Database["public"]["Enums"]["delivery_type"]
          folio?: string
          id?: string
          neighborhood?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"]
          shipping_cost?: number | null
          status?: Database["public"]["Enums"]["order_status"]
          subtotal?: number
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          brand_id: string | null
          created_at: string
          id: string
          image_path: string | null
          is_active: boolean
          is_featured: boolean
          name: string
          presentation: number | null
          sale_type: Database["public"]["Enums"]["sale_type"]
          search_name: string | null
          slug: string
          subcategory_id: string
          unit: Database["public"]["Enums"]["product_unit"] | null
          updated_at: string
        }
        Insert: {
          brand_id?: string | null
          created_at?: string
          id?: string
          image_path?: string | null
          is_active?: boolean
          is_featured?: boolean
          name: string
          presentation?: number | null
          sale_type?: Database["public"]["Enums"]["sale_type"]
          search_name?: string | null
          slug: string
          subcategory_id: string
          unit?: Database["public"]["Enums"]["product_unit"] | null
          updated_at?: string
        }
        Update: {
          brand_id?: string | null
          created_at?: string
          id?: string
          image_path?: string | null
          is_active?: boolean
          is_featured?: boolean
          name?: string
          presentation?: number | null
          sale_type?: Database["public"]["Enums"]["sale_type"]
          search_name?: string | null
          slug?: string
          subcategory_id?: string
          unit?: Database["public"]["Enums"]["product_unit"] | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_subcategory_id_fkey"
            columns: ["subcategory_id"]
            isOneToOne: false
            referencedRelation: "subcategories"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string | null
          id: string
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          full_name?: string | null
          id: string
          role: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          full_name?: string | null
          id?: string
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          last_failure_at: string | null
          last_success_at: string | null
          p256dh: string
          updated_at: string
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          last_failure_at?: string | null
          last_success_at?: string | null
          p256dh: string
          updated_at?: string
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          last_failure_at?: string | null
          last_success_at?: string | null
          p256dh?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      promotions: {
        Row: {
          branch_product_id: string
          created_at: string
          ends_at: string | null
          id: string
          is_active: boolean
          promotional_price: number
          starts_at: string | null
          updated_at: string
        }
        Insert: {
          branch_product_id: string
          created_at?: string
          ends_at?: string | null
          id?: string
          is_active?: boolean
          promotional_price: number
          starts_at?: string | null
          updated_at?: string
        }
        Update: {
          branch_product_id?: string
          created_at?: string
          ends_at?: string | null
          id?: string
          is_active?: boolean
          promotional_price?: number
          starts_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "promotions_branch_product_id_fkey"
            columns: ["branch_product_id"]
            isOneToOne: false
            referencedRelation: "branch_products"
            referencedColumns: ["id"]
          },
        ]
      }
      subcategories: {
        Row: {
          category_id: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          category_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          category_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subcategories_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      wholesale_prices: {
        Row: {
          branch_product_id: string
          created_at: string
          id: string
          max_quantity: number | null
          min_quantity: number
          unit_price: number
          updated_at: string
        }
        Insert: {
          branch_product_id: string
          created_at?: string
          id?: string
          max_quantity?: number | null
          min_quantity: number
          unit_price: number
          updated_at?: string
        }
        Update: {
          branch_product_id?: string
          created_at?: string
          id?: string
          max_quantity?: number | null
          min_quantity?: number
          unit_price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "wholesale_prices_branch_product_id_fkey"
            columns: ["branch_product_id"]
            isOneToOne: false
            referencedRelation: "branch_products"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      catalog_items: {
        Row: {
          brand_id: string | null
          brand_name: string | null
          brand_slug: string | null
          branch_id: string
          category_id: string
          category_name: string
          category_slug: string
          category_sort_order: number
          effective_price: number
          id: string
          image_path: string | null
          is_available: boolean
          is_featured: boolean
          name: string
          presentation: number | null
          price: number
          product_id: string
          promo_price: number | null
          sale_type: Database["public"]["Enums"]["sale_type"]
          search_name: string | null
          slug: string
          subcategory_id: string
          subcategory_name: string
          subcategory_slug: string
          subcategory_sort_order: number
          unit: Database["public"]["Enums"]["product_unit"] | null
          /** [{ min, max, price }] por cantidad mínima; null si no hay mayoreo. */
          wholesale_tiers: Json | null
        }
        Relationships: []
      }
    }
    Functions: {
      admin_dashboard: {
        Args: {
          p_branch_id: string
          p_pending_statuses: Database["public"]["Enums"]["order_status"][]
          p_recent_limit?: number
          p_time_zone: string
          p_top_days?: number
          p_top_limit?: number
        }
        Returns: Json
      }
      admin_save_product: {
        Args: {
          p_branches: Json
          p_brand_id: string
          p_is_active: boolean
          p_is_featured: boolean
          p_name: string
          p_presentation: number
          p_product_id: string
          p_sale_type: Database["public"]["Enums"]["sale_type"]
          p_slug: string
          p_subcategory_id: string
          p_unit: Database["public"]["Enums"]["product_unit"]
        }
        Returns: string
      }
      claim_order_push: {
        Args: { p_order_id: string; p_secret: string }
        Returns: Json
      }
      create_order: {
        Args: {
          p_address?: string
          p_address_references?: string
          p_branch_id: string
          p_cash_amount?: number
          p_client_request_id: string
          p_customer_name: string
          p_customer_notes?: string
          p_customer_phone: string
          p_delivery_type: Database["public"]["Enums"]["delivery_type"]
          p_expected_subtotal?: number
          p_items: Json
          p_neighborhood?: string
          p_payment_method?: Database["public"]["Enums"]["payment_method"]
        }
        Returns: Json
      }
      finish_order_push: {
        Args: {
          p_failed_endpoints: string[]
          p_gone_endpoints: string[]
          p_ok_endpoints: string[]
          p_order_id: string
          p_secret: string
        }
        Returns: undefined
      }
      next_order_folio: { Args: never; Returns: string }
      save_push_subscription: {
        Args: { p_auth: string; p_endpoint: string; p_p256dh: string }
        Returns: undefined
      }
      update_order_status: {
        Args: {
          p_expected_status: Database["public"]["Enums"]["order_status"]
          p_new_status: Database["public"]["Enums"]["order_status"]
          p_order_id: string
        }
        Returns: Database["public"]["Enums"]["order_status"]
      }
    }
    Enums: {
      delivery_type: "delivery" | "pickup"
      order_status:
        | "new"
        | "confirmed"
        | "preparing"
        | "ready"
        | "on_the_way"
        | "ready_for_pickup"
        | "delivered"
        | "cancelled"
      payment_method: "cash"
      pricing_type: "normal" | "promotion" | "wholesale"
      product_unit: "ml" | "L" | "g" | "kg" | "pieza"
      sale_type: "unit" | "weight"
      user_role: "admin" | "employee"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      delivery_type: ["delivery", "pickup"],
      order_status: [
        "new",
        "confirmed",
        "preparing",
        "ready",
        "on_the_way",
        "ready_for_pickup",
        "delivered",
        "cancelled",
      ],
      payment_method: ["cash"],
      pricing_type: ["normal", "promotion", "wholesale"],
      product_unit: ["ml", "L", "g", "kg", "pieza"],
      sale_type: ["unit", "weight"],
      user_role: ["admin", "employee"],
    },
  },
} as const
