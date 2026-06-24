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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      client_files: {
        Row: {
          category: Database["public"]["Enums"]["file_category"]
          client_id: string
          file_name: string
          file_size: number | null
          id: string
          mime_type: string | null
          storage_path: string
          uploaded_at: string
        }
        Insert: {
          category?: Database["public"]["Enums"]["file_category"]
          client_id: string
          file_name: string
          file_size?: number | null
          id?: string
          mime_type?: string | null
          storage_path: string
          uploaded_at?: string
        }
        Update: {
          category?: Database["public"]["Enums"]["file_category"]
          client_id?: string
          file_name?: string
          file_size?: number | null
          id?: string
          mime_type?: string | null
          storage_path?: string
          uploaded_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_files_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          address: string | null
          business_name: string | null
          client_name: string
          company_id: string
          contact_person: string | null
          created_at: string
          email: string | null
          gst_number: string | null
          id: string
          mobile: string | null
          notes: string | null
          status: Database["public"]["Enums"]["client_status"]
          updated_at: string
          whatsapp: string | null
        }
        Insert: {
          address?: string | null
          business_name?: string | null
          client_name: string
          company_id: string
          contact_person?: string | null
          created_at?: string
          email?: string | null
          gst_number?: string | null
          id?: string
          mobile?: string | null
          notes?: string | null
          status?: Database["public"]["Enums"]["client_status"]
          updated_at?: string
          whatsapp?: string | null
        }
        Update: {
          address?: string | null
          business_name?: string | null
          client_name?: string
          company_id?: string
          contact_person?: string | null
          created_at?: string
          email?: string | null
          gst_number?: string | null
          id?: string
          mobile?: string | null
          notes?: string | null
          status?: Database["public"]["Enums"]["client_status"]
          updated_at?: string
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clients_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          address: string | null
          bank_account: string | null
          bank_ifsc: string | null
          bank_name: string | null
          city: string | null
          created_at: string
          email: string | null
          gst_number: string | null
          id: string
          invoice_prefix: string
          invoice_terms: string | null
          legal_name: string | null
          logo_url: string | null
          name: string
          pan_number: string | null
          phone: string | null
          pincode: string | null
          renewal_reminder_days: number
          signature_url: string | null
          state: string | null
          updated_at: string
          website: string | null
          whatsapp_template: string | null
        }
        Insert: {
          address?: string | null
          bank_account?: string | null
          bank_ifsc?: string | null
          bank_name?: string | null
          city?: string | null
          created_at?: string
          email?: string | null
          gst_number?: string | null
          id?: string
          invoice_prefix?: string
          invoice_terms?: string | null
          legal_name?: string | null
          logo_url?: string | null
          name: string
          pan_number?: string | null
          phone?: string | null
          pincode?: string | null
          renewal_reminder_days?: number
          signature_url?: string | null
          state?: string | null
          updated_at?: string
          website?: string | null
          whatsapp_template?: string | null
        }
        Update: {
          address?: string | null
          bank_account?: string | null
          bank_ifsc?: string | null
          bank_name?: string | null
          city?: string | null
          created_at?: string
          email?: string | null
          gst_number?: string | null
          id?: string
          invoice_prefix?: string
          invoice_terms?: string | null
          legal_name?: string | null
          logo_url?: string | null
          name?: string
          pan_number?: string | null
          phone?: string | null
          pincode?: string | null
          renewal_reminder_days?: number
          signature_url?: string | null
          state?: string | null
          updated_at?: string
          website?: string | null
          whatsapp_template?: string | null
        }
        Relationships: []
      }
      deliverables: {
        Row: {
          completed: number
          created_at: string
          id: string
          month: string
          monthly_target: number
          name: string
          package_id: string
          updated_at: string
        }
        Insert: {
          completed?: number
          created_at?: string
          id?: string
          month?: string
          monthly_target?: number
          name: string
          package_id: string
          updated_at?: string
        }
        Update: {
          completed?: number
          created_at?: string
          id?: string
          month?: string
          monthly_target?: number
          name?: string
          package_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "deliverables_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "packages"
            referencedColumns: ["id"]
          },
        ]
      }
      employees: {
        Row: {
          bank_account: string | null
          basic: number
          company_id: string
          conveyance: number
          created_at: string
          department: string | null
          designation: string | null
          email: string | null
          employee_code: string | null
          hra: number
          id: string
          is_active: boolean
          joining_date: string | null
          medical: number
          mobile: string | null
          name: string
          pan: string | null
          uan: string | null
          updated_at: string
        }
        Insert: {
          bank_account?: string | null
          basic?: number
          company_id: string
          conveyance?: number
          created_at?: string
          department?: string | null
          designation?: string | null
          email?: string | null
          employee_code?: string | null
          hra?: number
          id?: string
          is_active?: boolean
          joining_date?: string | null
          medical?: number
          mobile?: string | null
          name: string
          pan?: string | null
          uan?: string | null
          updated_at?: string
        }
        Update: {
          bank_account?: string | null
          basic?: number
          company_id?: string
          conveyance?: number
          created_at?: string
          department?: string | null
          designation?: string | null
          email?: string | null
          employee_code?: string | null
          hra?: number
          id?: string
          is_active?: boolean
          joining_date?: string | null
          medical?: number
          mobile?: string | null
          name?: string
          pan?: string | null
          uan?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employees_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount: number
          category: Database["public"]["Enums"]["expense_category"]
          company_id: string
          created_at: string
          description: string | null
          expense_date: string
          expense_kind: Database["public"]["Enums"]["expense_kind"]
          id: string
          method: Database["public"]["Enums"]["payment_method"] | null
          recurring_id: string | null
          title: string | null
          updated_at: string
          vendor: string | null
        }
        Insert: {
          amount: number
          category?: Database["public"]["Enums"]["expense_category"]
          company_id: string
          created_at?: string
          description?: string | null
          expense_date?: string
          expense_kind?: Database["public"]["Enums"]["expense_kind"]
          id?: string
          method?: Database["public"]["Enums"]["payment_method"] | null
          recurring_id?: string | null
          title?: string | null
          updated_at?: string
          vendor?: string | null
        }
        Update: {
          amount?: number
          category?: Database["public"]["Enums"]["expense_category"]
          company_id?: string
          created_at?: string
          description?: string | null
          expense_date?: string
          expense_kind?: Database["public"]["Enums"]["expense_kind"]
          id?: string
          method?: Database["public"]["Enums"]["payment_method"] | null
          recurring_id?: string | null
          title?: string | null
          updated_at?: string
          vendor?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expenses_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_recurring_id_fkey"
            columns: ["recurring_id"]
            isOneToOne: false
            referencedRelation: "recurring_expenses"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_items: {
        Row: {
          amount: number
          created_at: string
          description: string
          id: string
          invoice_id: string
          position: number
          quantity: number
          rate: number
        }
        Insert: {
          amount?: number
          created_at?: string
          description: string
          id?: string
          invoice_id: string
          position?: number
          quantity?: number
          rate?: number
        }
        Update: {
          amount?: number
          created_at?: string
          description?: string
          id?: string
          invoice_id?: string
          position?: number
          quantity?: number
          rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_reminders: {
        Row: {
          channel: string
          created_at: string
          id: string
          invoice_id: string
          message: string | null
          reminder_no: number
          sent_at: string
          template: string
        }
        Insert: {
          channel?: string
          created_at?: string
          id?: string
          invoice_id: string
          message?: string | null
          reminder_no: number
          sent_at?: string
          template: string
        }
        Update: {
          channel?: string
          created_at?: string
          id?: string
          invoice_id?: string
          message?: string | null
          reminder_no?: number
          sent_at?: string
          template?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_reminders_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          amount_paid: number
          client_id: string
          company_id: string
          created_at: string
          discount: number
          due_date: string | null
          gst_amount: number
          gst_rate: number
          id: string
          invoice_date: string
          invoice_number: string
          invoice_sent_at: string | null
          invoice_type: Database["public"]["Enums"]["invoice_type"]
          last_reminder_at: string | null
          notes: string | null
          reminder_days: number | null
          reminders_sent: number
          status: Database["public"]["Enums"]["invoice_status"]
          subtotal: number
          terms: string | null
          total: number
          updated_at: string
        }
        Insert: {
          amount_paid?: number
          client_id: string
          company_id: string
          created_at?: string
          discount?: number
          due_date?: string | null
          gst_amount?: number
          gst_rate?: number
          id?: string
          invoice_date?: string
          invoice_number: string
          invoice_sent_at?: string | null
          invoice_type?: Database["public"]["Enums"]["invoice_type"]
          last_reminder_at?: string | null
          notes?: string | null
          reminder_days?: number | null
          reminders_sent?: number
          status?: Database["public"]["Enums"]["invoice_status"]
          subtotal?: number
          terms?: string | null
          total?: number
          updated_at?: string
        }
        Update: {
          amount_paid?: number
          client_id?: string
          company_id?: string
          created_at?: string
          discount?: number
          due_date?: string | null
          gst_amount?: number
          gst_rate?: number
          id?: string
          invoice_date?: string
          invoice_number?: string
          invoice_sent_at?: string | null
          invoice_type?: Database["public"]["Enums"]["invoice_type"]
          last_reminder_at?: string | null
          notes?: string | null
          reminder_days?: number | null
          reminders_sent?: number
          status?: Database["public"]["Enums"]["invoice_status"]
          subtotal?: number
          terms?: string | null
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      packages: {
        Row: {
          client_id: string
          created_at: string
          end_date: string | null
          id: string
          monthly_amount: number
          name: string
          notes: string | null
          renewal_date: string | null
          start_date: string
          status: Database["public"]["Enums"]["package_status"]
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          end_date?: string | null
          id?: string
          monthly_amount?: number
          name: string
          notes?: string | null
          renewal_date?: string | null
          start_date?: string
          status?: Database["public"]["Enums"]["package_status"]
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          end_date?: string | null
          id?: string
          monthly_amount?: number
          name?: string
          notes?: string | null
          renewal_date?: string | null
          start_date?: string
          status?: Database["public"]["Enums"]["package_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "packages_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          created_at: string
          id: string
          invoice_id: string
          method: Database["public"]["Enums"]["payment_method"]
          notes: string | null
          payment_date: string
          reference: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          invoice_id: string
          method?: Database["public"]["Enums"]["payment_method"]
          notes?: string | null
          payment_date?: string
          reference?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          invoice_id?: string
          method?: Database["public"]["Enums"]["payment_method"]
          notes?: string | null
          payment_date?: string
          reference?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      quotation_items: {
        Row: {
          amount: number
          created_at: string
          description: string | null
          gst_rate: number
          id: string
          item_name: string
          position: number
          quantity: number
          quotation_id: string
          unit_price: number
        }
        Insert: {
          amount?: number
          created_at?: string
          description?: string | null
          gst_rate?: number
          id?: string
          item_name: string
          position?: number
          quantity?: number
          quotation_id: string
          unit_price?: number
        }
        Update: {
          amount?: number
          created_at?: string
          description?: string | null
          gst_rate?: number
          id?: string
          item_name?: string
          position?: number
          quantity?: number
          quotation_id?: string
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "quotation_items_quotation_id_fkey"
            columns: ["quotation_id"]
            isOneToOne: false
            referencedRelation: "quotations"
            referencedColumns: ["id"]
          },
        ]
      }
      quotations: {
        Row: {
          client_id: string | null
          company_id: string
          converted_invoice_id: string | null
          created_at: string
          discount: number
          gst_amount: number
          gst_rate: number
          id: string
          notes: string | null
          quotation_date: string
          quotation_number: string
          status: Database["public"]["Enums"]["quotation_status"]
          subtotal: number
          terms: string | null
          total: number
          updated_at: string
          valid_until: string | null
        }
        Insert: {
          client_id?: string | null
          company_id: string
          converted_invoice_id?: string | null
          created_at?: string
          discount?: number
          gst_amount?: number
          gst_rate?: number
          id?: string
          notes?: string | null
          quotation_date?: string
          quotation_number: string
          status?: Database["public"]["Enums"]["quotation_status"]
          subtotal?: number
          terms?: string | null
          total?: number
          updated_at?: string
          valid_until?: string | null
        }
        Update: {
          client_id?: string | null
          company_id?: string
          converted_invoice_id?: string | null
          created_at?: string
          discount?: number
          gst_amount?: number
          gst_rate?: number
          id?: string
          notes?: string | null
          quotation_date?: string
          quotation_number?: string
          status?: Database["public"]["Enums"]["quotation_status"]
          subtotal?: number
          terms?: string | null
          total?: number
          updated_at?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quotations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotations_converted_invoice_id_fkey"
            columns: ["converted_invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      recurring_expenses: {
        Row: {
          amount: number
          category: Database["public"]["Enums"]["expense_category"]
          company_id: string
          created_at: string
          cycle: Database["public"]["Enums"]["recurring_cycle"]
          day_of_month: number
          end_date: string | null
          id: string
          is_active: boolean
          last_generated_on: string | null
          method: Database["public"]["Enums"]["payment_method"] | null
          next_due_date: string | null
          notes: string | null
          start_date: string
          title: string
          updated_at: string
        }
        Insert: {
          amount: number
          category?: Database["public"]["Enums"]["expense_category"]
          company_id: string
          created_at?: string
          cycle?: Database["public"]["Enums"]["recurring_cycle"]
          day_of_month?: number
          end_date?: string | null
          id?: string
          is_active?: boolean
          last_generated_on?: string | null
          method?: Database["public"]["Enums"]["payment_method"] | null
          next_due_date?: string | null
          notes?: string | null
          start_date?: string
          title: string
          updated_at?: string
        }
        Update: {
          amount?: number
          category?: Database["public"]["Enums"]["expense_category"]
          company_id?: string
          created_at?: string
          cycle?: Database["public"]["Enums"]["recurring_cycle"]
          day_of_month?: number
          end_date?: string | null
          id?: string
          is_active?: boolean
          last_generated_on?: string | null
          method?: Database["public"]["Enums"]["payment_method"] | null
          next_due_date?: string | null
          notes?: string | null
          start_date?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "recurring_expenses_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      salary_slips: {
        Row: {
          basic: number
          bonus: number
          company_id: string
          conveyance: number
          created_at: string
          employee_id: string
          esi: number
          gross: number
          hra: number
          id: string
          incentives: number
          medical: number
          month: number
          net: number
          notes: string | null
          other_deductions: number
          overtime: number
          paid_on: string | null
          pf: number
          prof_tax: number
          status: Database["public"]["Enums"]["salary_status"]
          tds: number
          total_deductions: number
          updated_at: string
          year: number
        }
        Insert: {
          basic?: number
          bonus?: number
          company_id: string
          conveyance?: number
          created_at?: string
          employee_id: string
          esi?: number
          gross?: number
          hra?: number
          id?: string
          incentives?: number
          medical?: number
          month: number
          net?: number
          notes?: string | null
          other_deductions?: number
          overtime?: number
          paid_on?: string | null
          pf?: number
          prof_tax?: number
          status?: Database["public"]["Enums"]["salary_status"]
          tds?: number
          total_deductions?: number
          updated_at?: string
          year: number
        }
        Update: {
          basic?: number
          bonus?: number
          company_id?: string
          conveyance?: number
          created_at?: string
          employee_id?: string
          esi?: number
          gross?: number
          hra?: number
          id?: string
          incentives?: number
          medical?: number
          month?: number
          net?: number
          notes?: string | null
          other_deductions?: number
          overtime?: number
          paid_on?: string | null
          pf?: number
          prof_tax?: number
          status?: Database["public"]["Enums"]["salary_status"]
          tds?: number
          total_deductions?: number
          updated_at?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "salary_slips_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "salary_slips_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
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
      generate_recurring_expenses: { Args: never; Returns: number }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: never; Returns: boolean }
      next_invoice_number: {
        Args: {
          _company_id: string
          _type: Database["public"]["Enums"]["invoice_type"]
        }
        Returns: string
      }
      next_quotation_number: { Args: { _company_id: string }; Returns: string }
      recalc_invoice_status: {
        Args: { _invoice_id: string }
        Returns: undefined
      }
      recalc_invoice_totals: {
        Args: { _invoice_id: string }
        Returns: undefined
      }
      recalc_quotation_totals: { Args: { _id: string }; Returns: undefined }
    }
    Enums: {
      app_role: "admin" | "user"
      client_status: "active" | "on_hold" | "completed" | "cancelled"
      expense_category:
        | "facebook_ads"
        | "instagram_ads"
        | "google_ads"
        | "employee_salary"
        | "software_subscriptions"
        | "internet"
        | "office"
        | "travel"
        | "other"
        | "office_rent"
        | "electricity"
        | "miscellaneous"
      expense_kind: "fixed" | "variable"
      file_category: "agreement" | "invoice" | "branding" | "content" | "other"
      invoice_status:
        | "draft"
        | "pending"
        | "partially_paid"
        | "paid"
        | "overdue"
        | "cancelled"
      invoice_type: "gst" | "proforma"
      package_status: "active" | "paused" | "expired" | "cancelled"
      payment_method:
        | "cash"
        | "bank_transfer"
        | "upi"
        | "card"
        | "cheque"
        | "other"
      quotation_status: "draft" | "sent" | "accepted" | "rejected"
      recurring_cycle: "monthly" | "quarterly" | "half_yearly" | "yearly"
      salary_status: "draft" | "paid"
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
      app_role: ["admin", "user"],
      client_status: ["active", "on_hold", "completed", "cancelled"],
      expense_category: [
        "facebook_ads",
        "instagram_ads",
        "google_ads",
        "employee_salary",
        "software_subscriptions",
        "internet",
        "office",
        "travel",
        "other",
        "office_rent",
        "electricity",
        "miscellaneous",
      ],
      expense_kind: ["fixed", "variable"],
      file_category: ["agreement", "invoice", "branding", "content", "other"],
      invoice_status: [
        "draft",
        "pending",
        "partially_paid",
        "paid",
        "overdue",
        "cancelled",
      ],
      invoice_type: ["gst", "proforma"],
      package_status: ["active", "paused", "expired", "cancelled"],
      payment_method: [
        "cash",
        "bank_transfer",
        "upi",
        "card",
        "cheque",
        "other",
      ],
      quotation_status: ["draft", "sent", "accepted", "rejected"],
      recurring_cycle: ["monthly", "quarterly", "half_yearly", "yearly"],
      salary_status: ["draft", "paid"],
    },
  },
} as const
