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
      bridge_health_logs: {
        Row: {
          bridge_version: string | null
          checked_at: string
          error_message: string | null
          id: string
          latency_ms: number | null
          status: string
        }
        Insert: {
          bridge_version?: string | null
          checked_at?: string
          error_message?: string | null
          id?: string
          latency_ms?: number | null
          status: string
        }
        Update: {
          bridge_version?: string | null
          checked_at?: string
          error_message?: string | null
          id?: string
          latency_ms?: number | null
          status?: string
        }
        Relationships: []
      }
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
          ativa: boolean
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
          ativa?: boolean
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
          ativa?: boolean
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
      fornecedor_configuracao: {
        Row: {
          ambiente: string
          api_key: string | null
          api_key_production: string | null
          api_key_staging: string | null
          ativo: boolean
          base_url_production: string | null
          base_url_staging: string | null
          created_at: string
          fornecedor: string
          id: string
          updated_at: string
        }
        Insert: {
          ambiente?: string
          api_key?: string | null
          api_key_production?: string | null
          api_key_staging?: string | null
          ativo?: boolean
          base_url_production?: string | null
          base_url_staging?: string | null
          created_at?: string
          fornecedor: string
          id?: string
          updated_at?: string
        }
        Update: {
          ambiente?: string
          api_key?: string | null
          api_key_production?: string | null
          api_key_staging?: string | null
          ativo?: boolean
          base_url_production?: string | null
          base_url_staging?: string | null
          created_at?: string
          fornecedor?: string
          id?: string
          updated_at?: string
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
      fornecedor_produto_depara: {
        Row: {
          codigo_fornecedor: number | null
          created_at: string
          descricao_local: string
          fornecedor: string
          id: string
          nome_fornecedor: string | null
          sku_fornecedor: string | null
          updated_at: string
        }
        Insert: {
          codigo_fornecedor?: number | null
          created_at?: string
          descricao_local: string
          fornecedor?: string
          id?: string
          nome_fornecedor?: string | null
          sku_fornecedor?: string | null
          updated_at?: string
        }
        Update: {
          codigo_fornecedor?: number | null
          created_at?: string
          descricao_local?: string
          fornecedor?: string
          id?: string
          nome_fornecedor?: string | null
          sku_fornecedor?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      hoya_catalogo_cache: {
        Row: {
          data: Json
          expires_at: string
          fetched_at: string
          hoya_environment: string
          id: string
          produto_count: number | null
        }
        Insert: {
          data: Json
          expires_at?: string
          fetched_at?: string
          hoya_environment: string
          id?: string
          produto_count?: number | null
        }
        Update: {
          data?: Json
          expires_at?: string
          fetched_at?: string
          hoya_environment?: string
          id?: string
          produto_count?: number | null
        }
        Relationships: []
      }
      hoya_empresa_config: {
        Row: {
          alias: string | null
          ativo: boolean
          cnpj: string | null
          cod_cliente_hoya: string | null
          cod_empresa: number
          created_at: string
          id: string
          updated_at: string
        }
        Insert: {
          alias?: string | null
          ativo?: boolean
          cnpj?: string | null
          cod_cliente_hoya?: string | null
          cod_empresa: number
          created_at?: string
          id?: string
          updated_at?: string
        }
        Update: {
          alias?: string | null
          ativo?: boolean
          cnpj?: string | null
          cod_cliente_hoya?: string | null
          cod_empresa?: number
          created_at?: string
          id?: string
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
          lente_od_descricao: string | null
          lente_oe_descricao: string | null
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
          lente_od_descricao?: string | null
          lente_oe_descricao?: string | null
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
          lente_od_descricao?: string | null
          lente_oe_descricao?: string | null
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
      pedido_status_history: {
        Row: {
          checked_at: string
          id: string
          observacao: string | null
          pedido_fornecedor_id: string
          rastreio: string | null
          status: string
          status_producao: string | null
        }
        Insert: {
          checked_at?: string
          id?: string
          observacao?: string | null
          pedido_fornecedor_id: string
          rastreio?: string | null
          status: string
          status_producao?: string | null
        }
        Update: {
          checked_at?: string
          id?: string
          observacao?: string | null
          pedido_fornecedor_id?: string
          rastreio?: string | null
          status?: string
          status_producao?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pedido_status_history_pedido_fornecedor_id_fkey"
            columns: ["pedido_fornecedor_id"]
            isOneToOne: false
            referencedRelation: "pedidos_fornecedor"
            referencedColumns: ["id"]
          },
        ]
      }
      pedidos_fornecedor: {
        Row: {
          cod_empresa: number
          cod_os: number
          created_at: string
          fornecedor: string
          hoya_environment: string | null
          id: string
          idempotency_key: string | null
          numero_pedido: string | null
          payload: Json | null
          requested_at: string | null
          requested_by: string | null
          response: Json | null
          status: string | null
          updated_at: string
        }
        Insert: {
          cod_empresa: number
          cod_os: number
          created_at?: string
          fornecedor?: string
          hoya_environment?: string | null
          id?: string
          idempotency_key?: string | null
          numero_pedido?: string | null
          payload?: Json | null
          requested_at?: string | null
          requested_by?: string | null
          response?: Json | null
          status?: string | null
          updated_at?: string
        }
        Update: {
          cod_empresa?: number
          cod_os?: number
          created_at?: string
          fornecedor?: string
          hoya_environment?: string | null
          id?: string
          idempotency_key?: string | null
          numero_pedido?: string | null
          payload?: Json | null
          requested_at?: string | null
          requested_by?: string | null
          response?: Json | null
          status?: string | null
          updated_at?: string
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
      profiles: {
        Row: {
          cod_empresa: number
          created_at: string | null
          email: string | null
          id: string
          nome: string | null
          updated_at: string | null
        }
        Insert: {
          cod_empresa?: number
          created_at?: string | null
          email?: string | null
          id: string
          nome?: string | null
          updated_at?: string | null
        }
        Update: {
          cod_empresa?: number
          created_at?: string | null
          email?: string | null
          id?: string
          nome?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      rate_limits: {
        Row: {
          called_at: string
          function_name: string
          id: string
          user_id: string
        }
        Insert: {
          called_at?: string
          function_name: string
          id?: string
          user_id: string
        }
        Update: {
          called_at?: string
          function_name?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      sync_jobs: {
        Row: {
          cod_empresa: number | null
          created_at: string
          data_fim: string
          data_inicio: string
          duracao_ms: number | null
          entidade: string
          erro: string | null
          finished_at: string | null
          id: string
          paginas_processadas: number | null
          registros_deletados: number | null
          registros_inseridos: number | null
          registros_processados: number | null
          run_id: string
          started_at: string | null
          status: Database["public"]["Enums"]["sync_run_status"]
        }
        Insert: {
          cod_empresa?: number | null
          created_at?: string
          data_fim: string
          data_inicio: string
          duracao_ms?: number | null
          entidade: string
          erro?: string | null
          finished_at?: string | null
          id?: string
          paginas_processadas?: number | null
          registros_deletados?: number | null
          registros_inseridos?: number | null
          registros_processados?: number | null
          run_id: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["sync_run_status"]
        }
        Update: {
          cod_empresa?: number | null
          created_at?: string
          data_fim?: string
          data_inicio?: string
          duracao_ms?: number | null
          entidade?: string
          erro?: string | null
          finished_at?: string | null
          id?: string
          paginas_processadas?: number | null
          registros_deletados?: number | null
          registros_inseridos?: number | null
          registros_processados?: number | null
          run_id?: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["sync_run_status"]
        }
        Relationships: [
          {
            foreignKeyName: "sync_jobs_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "sync_failures_summary"
            referencedColumns: ["run_id"]
          },
          {
            foreignKeyName: "sync_jobs_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "sync_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sync_jobs_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "sync_runs_recent"
            referencedColumns: ["run_id"]
          },
        ]
      }
      sync_locks: {
        Row: {
          acquired_at: string | null
          created_at: string | null
          expires_at: string | null
          id: string
          lock_key: string
        }
        Insert: {
          acquired_at?: string | null
          created_at?: string | null
          expires_at?: string | null
          id?: string
          lock_key: string
        }
        Update: {
          acquired_at?: string | null
          created_at?: string | null
          expires_at?: string | null
          id?: string
          lock_key?: string
        }
        Relationships: []
      }
      sync_runs: {
        Row: {
          competencia: string | null
          created_at: string
          data_fim: string
          data_inicio: string
          duracao_ms: number | null
          empresas: number[] | null
          entidades: string[]
          erro_resumo: string | null
          error_code: string | null
          error_message: string | null
          error_step: string | null
          finished_at: string | null
          id: string
          is_auto_triggered: boolean | null
          modo: string
          request_reason: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["sync_run_status"]
          total_erros: number | null
          total_registros: number | null
          trigger_type: string
          triggered_by: string | null
        }
        Insert: {
          competencia?: string | null
          created_at?: string
          data_fim: string
          data_inicio: string
          duracao_ms?: number | null
          empresas?: number[] | null
          entidades?: string[]
          erro_resumo?: string | null
          error_code?: string | null
          error_message?: string | null
          error_step?: string | null
          finished_at?: string | null
          id?: string
          is_auto_triggered?: boolean | null
          modo?: string
          request_reason?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["sync_run_status"]
          total_erros?: number | null
          total_registros?: number | null
          trigger_type?: string
          triggered_by?: string | null
        }
        Update: {
          competencia?: string | null
          created_at?: string
          data_fim?: string
          data_inicio?: string
          duracao_ms?: number | null
          empresas?: number[] | null
          entidades?: string[]
          erro_resumo?: string | null
          error_code?: string | null
          error_message?: string | null
          error_step?: string | null
          finished_at?: string | null
          id?: string
          is_auto_triggered?: boolean | null
          modo?: string
          request_reason?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["sync_run_status"]
          total_erros?: number | null
          total_registros?: number | null
          trigger_type?: string
          triggered_by?: string | null
        }
        Relationships: []
      }
      user_empresa_permissions: {
        Row: {
          cod_empresa: number
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          cod_empresa: number
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          cod_empresa?: number
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      user_module_permissions: {
        Row: {
          access_level: string
          created_at: string
          id: string
          module: string
          updated_at: string
          user_id: string
        }
        Insert: {
          access_level?: string
          created_at?: string
          id?: string
          module: string
          updated_at?: string
          user_id: string
        }
        Update: {
          access_level?: string
          created_at?: string
          id?: string
          module?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
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
      sync_failures_summary: {
        Row: {
          created_at: string | null
          data_fim: string | null
          data_inicio: string | null
          error_code: string | null
          error_message: string | null
          error_step: string | null
          failed_jobs: number | null
          modo: string | null
          run_id: string | null
          status: Database["public"]["Enums"]["sync_run_status"] | null
          total_erros: number | null
          triggered_by: string | null
        }
        Relationships: []
      }
      sync_runs_recent: {
        Row: {
          created_at: string | null
          duracao_ms: number | null
          empresas: number[] | null
          entidades: string[] | null
          error_code: string | null
          error_message: string | null
          error_step: string | null
          finished_at: string | null
          is_auto_triggered: boolean | null
          modo: string | null
          run_id: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["sync_run_status"] | null
          total_erros: number | null
          total_registros: number | null
          trigger_type: string | null
        }
        Insert: {
          created_at?: string | null
          duracao_ms?: number | null
          empresas?: number[] | null
          entidades?: string[] | null
          error_code?: string | null
          error_message?: string | null
          error_step?: string | null
          finished_at?: string | null
          is_auto_triggered?: boolean | null
          modo?: string | null
          run_id?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["sync_run_status"] | null
          total_erros?: number | null
          total_registros?: number | null
          trigger_type?: string | null
        }
        Update: {
          created_at?: string | null
          duracao_ms?: number | null
          empresas?: number[] | null
          entidades?: string[] | null
          error_code?: string | null
          error_message?: string | null
          error_step?: string | null
          finished_at?: string | null
          is_auto_triggered?: boolean | null
          modo?: string | null
          run_id?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["sync_run_status"] | null
          total_erros?: number | null
          total_registros?: number | null
          trigger_type?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      acquire_sync_lock: {
        Args: { p_lock_key: string; p_timeout_minutes?: number }
        Returns: boolean
      }
      cleanup_old_health_logs: {
        Args: { p_retention_days?: number }
        Returns: number
      }
      cleanup_old_sync_logs: {
        Args: { p_retention_days?: number }
        Returns: {
          deleted_jobs: number
          deleted_locks: number
          deleted_runs: number
        }[]
      }
      cleanup_rate_limits: { Args: never; Returns: undefined }
      executar_transformacao_dw: { Args: never; Returns: Json }
      get_user_empresa: { Args: { _user_id: string }; Returns: number }
      has_module_access: {
        Args: { _module: string; _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      release_sync_lock: { Args: { p_lock_key: string }; Returns: undefined }
    }
    Enums: {
      app_role: "admin" | "gestor" | "vendedor"
      sync_run_status:
        | "pending"
        | "running"
        | "completed"
        | "failed"
        | "partial"
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
      app_role: ["admin", "gestor", "vendedor"],
      sync_run_status: ["pending", "running", "completed", "failed", "partial"],
    },
  },
} as const
