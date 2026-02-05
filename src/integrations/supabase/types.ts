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
      calendario_feriados: {
        Row: {
          cidade: string | null
          created_at: string
          data: string
          descricao: string
          id: string
          recorrente: boolean | null
          tipo: string
          uf: string | null
        }
        Insert: {
          cidade?: string | null
          created_at?: string
          data: string
          descricao: string
          id?: string
          recorrente?: boolean | null
          tipo?: string
          uf?: string | null
        }
        Update: {
          cidade?: string | null
          created_at?: string
          data?: string
          descricao?: string
          id?: string
          recorrente?: boolean | null
          tipo?: string
          uf?: string | null
        }
        Relationships: []
      }
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
      estoque_minimo_loja: {
        Row: {
          categoria: string
          cod_empresa: number
          created_at: string
          curva_abc: string
          id: string
          quantidade_minima: number
          updated_at: string
        }
        Insert: {
          categoria?: string
          cod_empresa: number
          created_at?: string
          curva_abc?: string
          id?: string
          quantidade_minima?: number
          updated_at?: string
        }
        Update: {
          categoria?: string
          cod_empresa?: number
          created_at?: string
          curva_abc?: string
          id?: string
          quantidade_minima?: number
          updated_at?: string
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
      fornecedor_marca: {
        Row: {
          created_at: string
          fornecedor: string
          id: string
          marca: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          fornecedor: string
          id?: string
          marca: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          fornecedor?: string
          id?: string
          marca?: string
          updated_at?: string
        }
        Relationships: []
      }
      lojas_configuracao: {
        Row: {
          abre_domingo: boolean | null
          abre_feriado: boolean | null
          cod_empresa: number
          created_at: string
          id: string
          num_vendedores: number | null
          percentual_aceitavel: number | null
          tipo_loja: string
          updated_at: string
        }
        Insert: {
          abre_domingo?: boolean | null
          abre_feriado?: boolean | null
          cod_empresa: number
          created_at?: string
          id?: string
          num_vendedores?: number | null
          percentual_aceitavel?: number | null
          tipo_loja?: string
          updated_at?: string
        }
        Update: {
          abre_domingo?: boolean | null
          abre_feriado?: boolean | null
          cod_empresa?: number
          created_at?: string
          id?: string
          num_vendedores?: number | null
          percentual_aceitavel?: number | null
          tipo_loja?: string
          updated_at?: string
        }
        Relationships: []
      }
      lojas_excecoes: {
        Row: {
          aberto: boolean
          cod_empresa: number
          created_at: string
          data: string
          id: string
          motivo: string | null
        }
        Insert: {
          aberto: boolean
          cod_empresa: number
          created_at?: string
          data: string
          id?: string
          motivo?: string | null
        }
        Update: {
          aberto?: boolean
          cod_empresa?: number
          created_at?: string
          data?: string
          id?: string
          motivo?: string | null
        }
        Relationships: []
      }
      metas_periodos: {
        Row: {
          ano: number
          created_at: string
          descricao: string | null
          dia_fim: number
          dia_inicio: number
          id: string
          mes: number
          mes_fim: number | null
          mes_inicio: number | null
          updated_at: string
        }
        Insert: {
          ano: number
          created_at?: string
          descricao?: string | null
          dia_fim?: number
          dia_inicio?: number
          id?: string
          mes: number
          mes_fim?: number | null
          mes_inicio?: number | null
          updated_at?: string
        }
        Update: {
          ano?: number
          created_at?: string
          descricao?: string | null
          dia_fim?: number
          dia_inicio?: number
          id?: string
          mes?: number
          mes_fim?: number | null
          mes_inicio?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      metas_vendas: {
        Row: {
          ano: number
          cod_referencia: number
          created_at: string
          dia_fim: number | null
          dia_inicio: number | null
          id: string
          mes: number
          meta_desconto_max: number | null
          meta_faturamento: number | null
          meta_qtd_vendas: number | null
          meta_ticket_medio: number | null
          nome_referencia: string | null
          num_vendedores: number | null
          percentual_aceitavel: number | null
          tipo: string
          updated_at: string
        }
        Insert: {
          ano: number
          cod_referencia: number
          created_at?: string
          dia_fim?: number | null
          dia_inicio?: number | null
          id?: string
          mes: number
          meta_desconto_max?: number | null
          meta_faturamento?: number | null
          meta_qtd_vendas?: number | null
          meta_ticket_medio?: number | null
          nome_referencia?: string | null
          num_vendedores?: number | null
          percentual_aceitavel?: number | null
          tipo: string
          updated_at?: string
        }
        Update: {
          ano?: number
          cod_referencia?: number
          created_at?: string
          dia_fim?: number | null
          dia_inicio?: number | null
          id?: string
          mes?: number
          meta_desconto_max?: number | null
          meta_faturamento?: number | null
          meta_qtd_vendas?: number | null
          meta_ticket_medio?: number | null
          nome_referencia?: string | null
          num_vendedores?: number | null
          percentual_aceitavel?: number | null
          tipo?: string
          updated_at?: string
        }
        Relationships: []
      }
      os_hub_receitas: {
        Row: {
          atraso_dias: number | null
          cache_loaded_at: string
          cliente: string | null
          cod_cliente: number | null
          cod_empresa: number
          cod_os: number
          data_emissao: string | null
          data_entrada: string | null
          data_previsao: string | null
          data_saida: string | null
          empresa: string | null
          etapa: string | null
          id: string
          imagem_armacao: string | null
          imagem_receita: string | null
          imagem_tracer: string | null
          numero_os: string | null
          observacao_lente: string | null
          observacao_os: string | null
          observacao_pendencia: string | null
          od_adicao: number | null
          od_altura: number | null
          od_dnp: number | null
          od_longe_cil: number | null
          od_longe_eixo: number | null
          od_longe_esf: number | null
          od_perto_cil: number | null
          od_perto_eixo: number | null
          od_perto_esf: number | null
          oe_adicao: number | null
          oe_altura: number | null
          oe_dnp: number | null
          oe_longe_cil: number | null
          oe_longe_eixo: number | null
          oe_longe_esf: number | null
          oe_perto_cil: number | null
          oe_perto_eixo: number | null
          oe_perto_esf: number | null
          prisma: string | null
          prisma1: string | null
          status_atraso: string | null
          telefone: string | null
          tem_imagem: boolean | null
          tem_receita: boolean | null
          total: number | null
          url_imagem_armacao: string | null
          url_imagem_receita: string | null
          usuario: string | null
        }
        Insert: {
          atraso_dias?: number | null
          cache_loaded_at?: string
          cliente?: string | null
          cod_cliente?: number | null
          cod_empresa: number
          cod_os: number
          data_emissao?: string | null
          data_entrada?: string | null
          data_previsao?: string | null
          data_saida?: string | null
          empresa?: string | null
          etapa?: string | null
          id?: string
          imagem_armacao?: string | null
          imagem_receita?: string | null
          imagem_tracer?: string | null
          numero_os?: string | null
          observacao_lente?: string | null
          observacao_os?: string | null
          observacao_pendencia?: string | null
          od_adicao?: number | null
          od_altura?: number | null
          od_dnp?: number | null
          od_longe_cil?: number | null
          od_longe_eixo?: number | null
          od_longe_esf?: number | null
          od_perto_cil?: number | null
          od_perto_eixo?: number | null
          od_perto_esf?: number | null
          oe_adicao?: number | null
          oe_altura?: number | null
          oe_dnp?: number | null
          oe_longe_cil?: number | null
          oe_longe_eixo?: number | null
          oe_longe_esf?: number | null
          oe_perto_cil?: number | null
          oe_perto_eixo?: number | null
          oe_perto_esf?: number | null
          prisma?: string | null
          prisma1?: string | null
          status_atraso?: string | null
          telefone?: string | null
          tem_imagem?: boolean | null
          tem_receita?: boolean | null
          total?: number | null
          url_imagem_armacao?: string | null
          url_imagem_receita?: string | null
          usuario?: string | null
        }
        Update: {
          atraso_dias?: number | null
          cache_loaded_at?: string
          cliente?: string | null
          cod_cliente?: number | null
          cod_empresa?: number
          cod_os?: number
          data_emissao?: string | null
          data_entrada?: string | null
          data_previsao?: string | null
          data_saida?: string | null
          empresa?: string | null
          etapa?: string | null
          id?: string
          imagem_armacao?: string | null
          imagem_receita?: string | null
          imagem_tracer?: string | null
          numero_os?: string | null
          observacao_lente?: string | null
          observacao_os?: string | null
          observacao_pendencia?: string | null
          od_adicao?: number | null
          od_altura?: number | null
          od_dnp?: number | null
          od_longe_cil?: number | null
          od_longe_eixo?: number | null
          od_longe_esf?: number | null
          od_perto_cil?: number | null
          od_perto_eixo?: number | null
          od_perto_esf?: number | null
          oe_adicao?: number | null
          oe_altura?: number | null
          oe_dnp?: number | null
          oe_longe_cil?: number | null
          oe_longe_eixo?: number | null
          oe_longe_esf?: number | null
          oe_perto_cil?: number | null
          oe_perto_eixo?: number | null
          oe_perto_esf?: number | null
          prisma?: string | null
          prisma1?: string | null
          status_atraso?: string | null
          telefone?: string | null
          tem_imagem?: boolean | null
          tem_receita?: boolean | null
          total?: number | null
          url_imagem_armacao?: string | null
          url_imagem_receita?: string | null
          usuario?: string | null
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
      vendas_agregado_diario: {
        Row: {
          atualizado_em: string | null
          cod_empresa: number
          data: string
          forma_pagamento: string
          id: string
          qtd_vendas: number | null
          total_bruto: number | null
          total_desconto: number | null
          total_vendido: number | null
          vendedor: string
        }
        Insert: {
          atualizado_em?: string | null
          cod_empresa: number
          data: string
          forma_pagamento: string
          id?: string
          qtd_vendas?: number | null
          total_bruto?: number | null
          total_desconto?: number | null
          total_vendido?: number | null
          vendedor: string
        }
        Update: {
          atualizado_em?: string | null
          cod_empresa?: number
          data?: string
          forma_pagamento?: string
          id?: string
          qtd_vendas?: number | null
          total_bruto?: number | null
          total_desconto?: number | null
          total_vendido?: number | null
          vendedor?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      executar_transformacao_dw: { Args: never; Returns: Json }
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
