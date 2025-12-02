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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      empresa: {
        Row: {
          cidade: string | null
          cnpj: string | null
          cod_empresa: number
          id: string
          nome_fantasia: string | null
          razao_social: string | null
          stg_loaded_at: string | null
          stg_source: string | null
          uf: string | null
        }
        Insert: {
          cidade?: string | null
          cnpj?: string | null
          cod_empresa: number
          id?: string
          nome_fantasia?: string | null
          razao_social?: string | null
          stg_loaded_at?: string | null
          stg_source?: string | null
          uf?: string | null
        }
        Update: {
          cidade?: string | null
          cnpj?: string | null
          cod_empresa?: number
          id?: string
          nome_fantasia?: string | null
          razao_social?: string | null
          stg_loaded_at?: string | null
          stg_source?: string | null
          uf?: string | null
        }
        Relationships: []
      }
      etl_controle: {
        Row: {
          atualizado_em: string | null
          entidade: string
          id: string
          pagina_atual: number | null
          ultima_data: string | null
        }
        Insert: {
          atualizado_em?: string | null
          entidade: string
          id?: string
          pagina_atual?: number | null
          ultima_data?: string | null
        }
        Update: {
          atualizado_em?: string | null
          entidade?: string
          id?: string
          pagina_atual?: number | null
          ultima_data?: string | null
        }
        Relationships: []
      }
      pessoa: {
        Row: {
          ativo: boolean | null
          cidade: string | null
          cod_pessoa: number
          email: string | null
          id: string
          identificador: string | null
          nome: string | null
          stg_loaded_at: string | null
          stg_source: string | null
          telefone: string | null
          tipo: string | null
          uf: string | null
          vendedor: boolean | null
        }
        Insert: {
          ativo?: boolean | null
          cidade?: string | null
          cod_pessoa: number
          email?: string | null
          id?: string
          identificador?: string | null
          nome?: string | null
          stg_loaded_at?: string | null
          stg_source?: string | null
          telefone?: string | null
          tipo?: string | null
          uf?: string | null
          vendedor?: boolean | null
        }
        Update: {
          ativo?: boolean | null
          cidade?: string | null
          cod_pessoa?: number
          email?: string | null
          id?: string
          identificador?: string | null
          nome?: string | null
          stg_loaded_at?: string | null
          stg_source?: string | null
          telefone?: string | null
          tipo?: string | null
          uf?: string | null
          vendedor?: boolean | null
        }
        Relationships: []
      }
      produto: {
        Row: {
          ativo: boolean | null
          categoria: string | null
          cod_produto: number
          descricao: string | null
          id: string
          preco_custo: number | null
          preco_venda: number | null
          referencia: string | null
          stg_loaded_at: string | null
          stg_source: string | null
        }
        Insert: {
          ativo?: boolean | null
          categoria?: string | null
          cod_produto: number
          descricao?: string | null
          id?: string
          preco_custo?: number | null
          preco_venda?: number | null
          referencia?: string | null
          stg_loaded_at?: string | null
          stg_source?: string | null
        }
        Update: {
          ativo?: boolean | null
          categoria?: string | null
          cod_produto?: number
          descricao?: string | null
          id?: string
          preco_custo?: number | null
          preco_venda?: number | null
          referencia?: string | null
          stg_loaded_at?: string | null
          stg_source?: string | null
        }
        Relationships: []
      }
      venda: {
        Row: {
          cliente_nome: string | null
          cod_empresa: number | null
          cod_pessoa: number | null
          cod_vendedor: number | null
          data_emissao: string | null
          data_lancamento: string | null
          id: string
          id_venda: number
          loja_nome: string | null
          numero: string | null
          status: string | null
          stg_loaded_at: string | null
          stg_source: string | null
          total: number | null
          vendedor_nome: string | null
        }
        Insert: {
          cliente_nome?: string | null
          cod_empresa?: number | null
          cod_pessoa?: number | null
          cod_vendedor?: number | null
          data_emissao?: string | null
          data_lancamento?: string | null
          id?: string
          id_venda: number
          loja_nome?: string | null
          numero?: string | null
          status?: string | null
          stg_loaded_at?: string | null
          stg_source?: string | null
          total?: number | null
          vendedor_nome?: string | null
        }
        Update: {
          cliente_nome?: string | null
          cod_empresa?: number | null
          cod_pessoa?: number | null
          cod_vendedor?: number | null
          data_emissao?: string | null
          data_lancamento?: string | null
          id?: string
          id_venda?: number
          loja_nome?: string | null
          numero?: string | null
          status?: string | null
          stg_loaded_at?: string | null
          stg_source?: string | null
          total?: number | null
          vendedor_nome?: string | null
        }
        Relationships: []
      }
      venda_item: {
        Row: {
          cod_produto: number | null
          id: string
          id_venda: number
          quantidade: number | null
          seq_item: number
          stg_loaded_at: string | null
          valor_desconto: number | null
          valor_total: number | null
          valor_unitario: number | null
        }
        Insert: {
          cod_produto?: number | null
          id?: string
          id_venda: number
          quantidade?: number | null
          seq_item: number
          stg_loaded_at?: string | null
          valor_desconto?: number | null
          valor_total?: number | null
          valor_unitario?: number | null
        }
        Update: {
          cod_produto?: number | null
          id?: string
          id_venda?: number
          quantidade?: number | null
          seq_item?: number
          stg_loaded_at?: string | null
          valor_desconto?: number | null
          valor_total?: number | null
          valor_unitario?: number | null
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
