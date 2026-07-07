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
      adquirentes_config: {
        Row: {
          adquirente: string
          ambiente: string
          ativo: boolean
          cod_empresa: number
          created_at: string
          gv_approved_at: string | null
          gv_last_healthcheck_at: string | null
          gv_last_healthcheck_message: string | null
          gv_last_healthcheck_status: string | null
          gv_optin_external_id: string | null
          gv_optin_mirrored_from: number | null
          gv_optin_reference: string | null
          gv_optin_request_payload: Json | null
          gv_optin_requested_at: string | null
          gv_optin_response: Json | null
          gv_optin_status: string | null
          id: string
          integration_key_encrypted: string | null
          integration_key_production: string | null
          merchant_id: string | null
          merchant_id_production: string | null
          pv_matriz: string | null
          pv_matriz_production: string | null
          pvs_matriz_production: string[]
          updated_at: string
        }
        Insert: {
          adquirente?: string
          ambiente?: string
          ativo?: boolean
          cod_empresa: number
          created_at?: string
          gv_approved_at?: string | null
          gv_last_healthcheck_at?: string | null
          gv_last_healthcheck_message?: string | null
          gv_last_healthcheck_status?: string | null
          gv_optin_external_id?: string | null
          gv_optin_mirrored_from?: number | null
          gv_optin_reference?: string | null
          gv_optin_request_payload?: Json | null
          gv_optin_requested_at?: string | null
          gv_optin_response?: Json | null
          gv_optin_status?: string | null
          id?: string
          integration_key_encrypted?: string | null
          integration_key_production?: string | null
          merchant_id?: string | null
          merchant_id_production?: string | null
          pv_matriz?: string | null
          pv_matriz_production?: string | null
          pvs_matriz_production?: string[]
          updated_at?: string
        }
        Update: {
          adquirente?: string
          ambiente?: string
          ativo?: boolean
          cod_empresa?: number
          created_at?: string
          gv_approved_at?: string | null
          gv_last_healthcheck_at?: string | null
          gv_last_healthcheck_message?: string | null
          gv_last_healthcheck_status?: string | null
          gv_optin_external_id?: string | null
          gv_optin_mirrored_from?: number | null
          gv_optin_reference?: string | null
          gv_optin_request_payload?: Json | null
          gv_optin_requested_at?: string | null
          gv_optin_response?: Json | null
          gv_optin_status?: string | null
          id?: string
          integration_key_encrypted?: string | null
          integration_key_production?: string | null
          merchant_id?: string | null
          merchant_id_production?: string | null
          pv_matriz?: string | null
          pv_matriz_production?: string | null
          pvs_matriz_production?: string[]
          updated_at?: string
        }
        Relationships: []
      }
      borderos: {
        Row: {
          aprovado_em: string | null
          aprovado_por: string | null
          btg_batch_id: string | null
          cod_empresa: number
          created_at: string
          criado_por: string | null
          descricao: string | null
          id: string
          qtd_lancamentos: number
          status: string
          total_valor: number
          updated_at: string
        }
        Insert: {
          aprovado_em?: string | null
          aprovado_por?: string | null
          btg_batch_id?: string | null
          cod_empresa: number
          created_at?: string
          criado_por?: string | null
          descricao?: string | null
          id?: string
          qtd_lancamentos?: number
          status?: string
          total_valor?: number
          updated_at?: string
        }
        Update: {
          aprovado_em?: string | null
          aprovado_por?: string | null
          btg_batch_id?: string | null
          cod_empresa?: number
          created_at?: string
          criado_por?: string | null
          descricao?: string | null
          id?: string
          qtd_lancamentos?: number
          status?: string
          total_valor?: number
          updated_at?: string
        }
        Relationships: []
      }
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
      btg_cobrancas: {
        Row: {
          btg_receivable_id: string | null
          cod_empresa: number
          created_at: string
          data_pagamento: string | null
          data_vencimento: string
          id: string
          linha_digitavel: string | null
          parcela_id: string | null
          sacado_documento: string | null
          sacado_nome: string | null
          status: string
          updated_at: string
          url_boleto: string | null
          valor: number
          valor_pago: number | null
        }
        Insert: {
          btg_receivable_id?: string | null
          cod_empresa: number
          created_at?: string
          data_pagamento?: string | null
          data_vencimento: string
          id?: string
          linha_digitavel?: string | null
          parcela_id?: string | null
          sacado_documento?: string | null
          sacado_nome?: string | null
          status?: string
          updated_at?: string
          url_boleto?: string | null
          valor: number
          valor_pago?: number | null
        }
        Update: {
          btg_receivable_id?: string | null
          cod_empresa?: number
          created_at?: string
          data_pagamento?: string | null
          data_vencimento?: string
          id?: string
          linha_digitavel?: string | null
          parcela_id?: string | null
          sacado_documento?: string | null
          sacado_nome?: string | null
          status?: string
          updated_at?: string
          url_boleto?: string | null
          valor?: number
          valor_pago?: number | null
        }
        Relationships: []
      }
      btg_contas_bancarias: {
        Row: {
          account_id: string | null
          agencia: string | null
          ativa: boolean
          cnpj: string | null
          cod_empresa: number
          company_id: string | null
          conta: string | null
          created_at: string
          id: string
        }
        Insert: {
          account_id?: string | null
          agencia?: string | null
          ativa?: boolean
          cnpj?: string | null
          cod_empresa: number
          company_id?: string | null
          conta?: string | null
          created_at?: string
          id?: string
        }
        Update: {
          account_id?: string | null
          agencia?: string | null
          ativa?: boolean
          cnpj?: string | null
          cod_empresa?: number
          company_id?: string | null
          conta?: string | null
          created_at?: string
          id?: string
        }
        Relationships: []
      }
      btg_dda_titulos: {
        Row: {
          banco_emissor: string | null
          btg_dda_id: string | null
          cod_empresa: number
          conciliado: boolean
          created_at: string
          data_vencimento: string
          documento_emissor: string | null
          emissor: string | null
          id: string
          linha_digitavel: string | null
          numero_documento: string | null
          pagamento_id: string | null
          parcela_id: string | null
          status: string
          updated_at: string
          valor: number
        }
        Insert: {
          banco_emissor?: string | null
          btg_dda_id?: string | null
          cod_empresa: number
          conciliado?: boolean
          created_at?: string
          data_vencimento: string
          documento_emissor?: string | null
          emissor?: string | null
          id?: string
          linha_digitavel?: string | null
          numero_documento?: string | null
          pagamento_id?: string | null
          parcela_id?: string | null
          status?: string
          updated_at?: string
          valor: number
        }
        Update: {
          banco_emissor?: string | null
          btg_dda_id?: string | null
          cod_empresa?: number
          conciliado?: boolean
          created_at?: string
          data_vencimento?: string
          documento_emissor?: string | null
          emissor?: string | null
          id?: string
          linha_digitavel?: string | null
          numero_documento?: string | null
          pagamento_id?: string | null
          parcela_id?: string | null
          status?: string
          updated_at?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "btg_dda_titulos_pagamento_id_fkey"
            columns: ["pagamento_id"]
            isOneToOne: false
            referencedRelation: "btg_pagamentos"
            referencedColumns: ["id"]
          },
        ]
      }
      btg_extrato: {
        Row: {
          cod_empresa: number
          conciliado: boolean
          created_at: string
          data_lancamento: string
          descricao: string | null
          id: string
          natureza: string | null
          referencia_id: string | null
          saldo_apos: number | null
          tipo: string
          updated_at: string
          valor: number
        }
        Insert: {
          cod_empresa: number
          conciliado?: boolean
          created_at?: string
          data_lancamento: string
          descricao?: string | null
          id?: string
          natureza?: string | null
          referencia_id?: string | null
          saldo_apos?: number | null
          tipo?: string
          updated_at?: string
          valor: number
        }
        Update: {
          cod_empresa?: number
          conciliado?: boolean
          created_at?: string
          data_lancamento?: string
          descricao?: string | null
          id?: string
          natureza?: string | null
          referencia_id?: string | null
          saldo_apos?: number | null
          tipo?: string
          updated_at?: string
          valor?: number
        }
        Relationships: []
      }
      btg_pagamentos: {
        Row: {
          aprovado_em: string | null
          aprovado_por: string | null
          beneficiario: string | null
          btg_payment_id: string | null
          cod_empresa: number
          created_at: string
          dados_pagamento: Json | null
          id: string
          parcela_id: string | null
          solicitado_por: string | null
          status: string
          tipo: string
          updated_at: string
          valor: number
        }
        Insert: {
          aprovado_em?: string | null
          aprovado_por?: string | null
          beneficiario?: string | null
          btg_payment_id?: string | null
          cod_empresa: number
          created_at?: string
          dados_pagamento?: Json | null
          id?: string
          parcela_id?: string | null
          solicitado_por?: string | null
          status?: string
          tipo: string
          updated_at?: string
          valor: number
        }
        Update: {
          aprovado_em?: string | null
          aprovado_por?: string | null
          beneficiario?: string | null
          btg_payment_id?: string | null
          cod_empresa?: number
          created_at?: string
          dados_pagamento?: Json | null
          id?: string
          parcela_id?: string | null
          solicitado_por?: string | null
          status?: string
          tipo?: string
          updated_at?: string
          valor?: number
        }
        Relationships: []
      }
      btg_tokens: {
        Row: {
          access_token: string
          cod_empresa: number
          expires_at: string
          id: string
          refresh_token: string | null
          scopes: string[] | null
          updated_at: string
        }
        Insert: {
          access_token: string
          cod_empresa: number
          expires_at: string
          id?: string
          refresh_token?: string | null
          scopes?: string[] | null
          updated_at?: string
        }
        Update: {
          access_token?: string
          cod_empresa?: number
          expires_at?: string
          id?: string
          refresh_token?: string | null
          scopes?: string[] | null
          updated_at?: string
        }
        Relationships: []
      }
      btg_webhook_events: {
        Row: {
          created_at: string
          event_type: string
          id: string
          payload: Json
          processed: boolean
          processed_at: string | null
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          payload?: Json
          processed?: boolean
          processed_at?: string | null
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          payload?: Json
          processed?: boolean
          processed_at?: string | null
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
      capacidade_expositor: {
        Row: {
          capacidade_total: number
          cod_empresa: number
          created_at: string
          id: string
          percentual_solar: number
          updated_at: string
        }
        Insert: {
          capacidade_total: number
          cod_empresa: number
          created_at?: string
          id?: string
          percentual_solar: number
          updated_at?: string
        }
        Update: {
          capacidade_total?: number
          cod_empresa?: number
          created_at?: string
          id?: string
          percentual_solar?: number
          updated_at?: string
        }
        Relationships: []
      }
      conciliacao_vendas: {
        Row: {
          cod_empresa: number
          conciliado_em: string | null
          conciliado_por: string | null
          created_at: string
          diferenca_valor: number | null
          id: string
          observacao: string | null
          status: string
          venda_cartao_id: string | null
          venda_erp_id: string | null
        }
        Insert: {
          cod_empresa: number
          conciliado_em?: string | null
          conciliado_por?: string | null
          created_at?: string
          diferenca_valor?: number | null
          id?: string
          observacao?: string | null
          status?: string
          venda_cartao_id?: string | null
          venda_erp_id?: string | null
        }
        Update: {
          cod_empresa?: number
          conciliado_em?: string | null
          conciliado_por?: string | null
          created_at?: string
          diferenca_valor?: number | null
          id?: string
          observacao?: string | null
          status?: string
          venda_cartao_id?: string | null
          venda_erp_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conciliacao_vendas_venda_cartao_id_fkey"
            columns: ["venda_cartao_id"]
            isOneToOne: false
            referencedRelation: "vendas_cartao"
            referencedColumns: ["id"]
          },
        ]
      }
      dre_plano_contas: {
        Row: {
          ativo: boolean
          categoria: string
          conta_descricao: string
          conta_numero: string
          created_at: string
          grupo_dre: string
          id: string
          sinal: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          categoria: string
          conta_descricao: string
          conta_numero: string
          created_at?: string
          grupo_dre: string
          id?: string
          sinal?: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          categoria?: string
          conta_descricao?: string
          conta_numero?: string
          created_at?: string
          grupo_dre?: string
          id?: string
          sinal?: string
          updated_at?: string
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
      estoque_sincronizado: {
        Row: {
          acao_sugerida: string | null
          atualizado_em: string | null
          categoria: string | null
          cod_barras_interno: string | null
          cod_empresa: number
          cod_produto_tipo: number | null
          cod_sku: number
          custo_ultima_compra: number | null
          data_ultima_compra: string | null
          data_ultima_entrada: string | null
          data_ultima_venda: string | null
          desconto_sugerido: number | null
          descricao: string | null
          dias_desde_ultima_venda: number | null
          dias_em_estoque: number | null
          dias_giro_mediano: number | null
          dias_giro_medio: number | null
          dias_giro_ultima_peca: number | null
          ean: string | null
          faixa_saneamento: string | null
          fornecedor: string | null
          id: string
          is_dead_stock: boolean | null
          marca: string | null
          origem_custo: string | null
          pecas_giro_consideradas: number | null
          preco_venda: number | null
          qtd_vendidos_180d: number | null
          quantidade_estoque: number
          subcategoria: string | null
          valor_estoque_custo: number | null
        }
        Insert: {
          acao_sugerida?: string | null
          atualizado_em?: string | null
          categoria?: string | null
          cod_barras_interno?: string | null
          cod_empresa: number
          cod_produto_tipo?: number | null
          cod_sku: number
          custo_ultima_compra?: number | null
          data_ultima_compra?: string | null
          data_ultima_entrada?: string | null
          data_ultima_venda?: string | null
          desconto_sugerido?: number | null
          descricao?: string | null
          dias_desde_ultima_venda?: number | null
          dias_em_estoque?: number | null
          dias_giro_mediano?: number | null
          dias_giro_medio?: number | null
          dias_giro_ultima_peca?: number | null
          ean?: string | null
          faixa_saneamento?: string | null
          fornecedor?: string | null
          id?: string
          is_dead_stock?: boolean | null
          marca?: string | null
          origem_custo?: string | null
          pecas_giro_consideradas?: number | null
          preco_venda?: number | null
          qtd_vendidos_180d?: number | null
          quantidade_estoque: number
          subcategoria?: string | null
          valor_estoque_custo?: number | null
        }
        Update: {
          acao_sugerida?: string | null
          atualizado_em?: string | null
          categoria?: string | null
          cod_barras_interno?: string | null
          cod_empresa?: number
          cod_produto_tipo?: number | null
          cod_sku?: number
          custo_ultima_compra?: number | null
          data_ultima_compra?: string | null
          data_ultima_entrada?: string | null
          data_ultima_venda?: string | null
          desconto_sugerido?: number | null
          descricao?: string | null
          dias_desde_ultima_venda?: number | null
          dias_em_estoque?: number | null
          dias_giro_mediano?: number | null
          dias_giro_medio?: number | null
          dias_giro_ultima_peca?: number | null
          ean?: string | null
          faixa_saneamento?: string | null
          fornecedor?: string | null
          id?: string
          is_dead_stock?: boolean | null
          marca?: string | null
          origem_custo?: string | null
          pecas_giro_consideradas?: number | null
          preco_venda?: number | null
          qtd_vendidos_180d?: number | null
          quantidade_estoque?: number
          subcategoria?: string | null
          valor_estoque_custo?: number | null
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
          api_user_production: string | null
          api_user_staging: string | null
          ativo: boolean
          base_url_production: string | null
          base_url_staging: string | null
          created_at: string
          fornecedor: string
          id: string
          redirect_uri_production: string | null
          redirect_uri_staging: string | null
          updated_at: string
        }
        Insert: {
          ambiente?: string
          api_key?: string | null
          api_key_production?: string | null
          api_key_staging?: string | null
          api_user_production?: string | null
          api_user_staging?: string | null
          ativo?: boolean
          base_url_production?: string | null
          base_url_staging?: string | null
          created_at?: string
          fornecedor: string
          id?: string
          redirect_uri_production?: string | null
          redirect_uri_staging?: string | null
          updated_at?: string
        }
        Update: {
          ambiente?: string
          api_key?: string | null
          api_key_production?: string | null
          api_key_staging?: string | null
          api_user_production?: string | null
          api_user_staging?: string | null
          ativo?: boolean
          base_url_production?: string | null
          base_url_staging?: string | null
          created_at?: string
          fornecedor?: string
          id?: string
          redirect_uri_production?: string | null
          redirect_uri_staging?: string | null
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
      haytek_empresa_config: {
        Row: {
          address_id: string | null
          alias: string | null
          ambiente_override: string | null
          api_key_production: string | null
          ativo: boolean | null
          cnpj: string | null
          cod_empresa: number
          created_at: string | null
          id: string
          store_id: string | null
          updated_at: string | null
        }
        Insert: {
          address_id?: string | null
          alias?: string | null
          ambiente_override?: string | null
          api_key_production?: string | null
          ativo?: boolean | null
          cnpj?: string | null
          cod_empresa: number
          created_at?: string | null
          id?: string
          store_id?: string | null
          updated_at?: string | null
        }
        Update: {
          address_id?: string | null
          alias?: string | null
          ambiente_override?: string | null
          api_key_production?: string | null
          ativo?: boolean | null
          cnpj?: string | null
          cod_empresa?: number
          created_at?: string | null
          id?: string
          store_id?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      haytek_produtos: {
        Row: {
          adicao_maxima: number | null
          adicao_minima: number | null
          cilindrico_maximo: number | null
          created_at: string | null
          design: string | null
          diametro: string | null
          esferico_maximo: number | null
          esferico_minimo: number | null
          id: string
          linha: string | null
          material: string | null
          nome_comercial: string | null
          product_id: string
        }
        Insert: {
          adicao_maxima?: number | null
          adicao_minima?: number | null
          cilindrico_maximo?: number | null
          created_at?: string | null
          design?: string | null
          diametro?: string | null
          esferico_maximo?: number | null
          esferico_minimo?: number | null
          id?: string
          linha?: string | null
          material?: string | null
          nome_comercial?: string | null
          product_id: string
        }
        Update: {
          adicao_maxima?: number | null
          adicao_minima?: number | null
          cilindrico_maximo?: number | null
          created_at?: string | null
          design?: string | null
          diametro?: string | null
          esferico_maximo?: number | null
          esferico_minimo?: number | null
          id?: string
          linha?: string | null
          material?: string | null
          nome_comercial?: string | null
          product_id?: string
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
      lancamentos_financeiros: {
        Row: {
          adquirente: string | null
          autorizado_em: string | null
          autorizado_por: string | null
          baixado_em: string | null
          baixado_por: string | null
          bandeira: string | null
          bordero_id: string | null
          btg_cobranca_id: string | null
          btg_dda_id: string | null
          btg_extrato_id: string | null
          btg_pagamento_id: string | null
          categoria: string | null
          cod_empresa: number
          created_at: string
          criado_por: string | null
          dados_extras: Json | null
          data_baixa: string | null
          data_emissao: string | null
          data_pagamento: string | null
          data_vencimento: string
          descricao: string
          forma_pagamento: string | null
          id: string
          natureza: string | null
          numero_parcela: number | null
          observacao: string | null
          origem: string
          origem_id: string | null
          pessoa_documento: string | null
          pessoa_nome: string | null
          recebivel_cartao_id: string | null
          recorrencia_tipo: string | null
          recorrente: boolean | null
          requer_validacao: boolean | null
          status: string
          subcategoria: string | null
          tipo: string
          total_parcelas: number | null
          updated_at: string
          valor: number
          valor_pago: number | null
        }
        Insert: {
          adquirente?: string | null
          autorizado_em?: string | null
          autorizado_por?: string | null
          baixado_em?: string | null
          baixado_por?: string | null
          bandeira?: string | null
          bordero_id?: string | null
          btg_cobranca_id?: string | null
          btg_dda_id?: string | null
          btg_extrato_id?: string | null
          btg_pagamento_id?: string | null
          categoria?: string | null
          cod_empresa: number
          created_at?: string
          criado_por?: string | null
          dados_extras?: Json | null
          data_baixa?: string | null
          data_emissao?: string | null
          data_pagamento?: string | null
          data_vencimento: string
          descricao: string
          forma_pagamento?: string | null
          id?: string
          natureza?: string | null
          numero_parcela?: number | null
          observacao?: string | null
          origem?: string
          origem_id?: string | null
          pessoa_documento?: string | null
          pessoa_nome?: string | null
          recebivel_cartao_id?: string | null
          recorrencia_tipo?: string | null
          recorrente?: boolean | null
          requer_validacao?: boolean | null
          status?: string
          subcategoria?: string | null
          tipo: string
          total_parcelas?: number | null
          updated_at?: string
          valor: number
          valor_pago?: number | null
        }
        Update: {
          adquirente?: string | null
          autorizado_em?: string | null
          autorizado_por?: string | null
          baixado_em?: string | null
          baixado_por?: string | null
          bandeira?: string | null
          bordero_id?: string | null
          btg_cobranca_id?: string | null
          btg_dda_id?: string | null
          btg_extrato_id?: string | null
          btg_pagamento_id?: string | null
          categoria?: string | null
          cod_empresa?: number
          created_at?: string
          criado_por?: string | null
          dados_extras?: Json | null
          data_baixa?: string | null
          data_emissao?: string | null
          data_pagamento?: string | null
          data_vencimento?: string
          descricao?: string
          forma_pagamento?: string | null
          id?: string
          natureza?: string | null
          numero_parcela?: number | null
          observacao?: string | null
          origem?: string
          origem_id?: string | null
          pessoa_documento?: string | null
          pessoa_nome?: string | null
          recebivel_cartao_id?: string | null
          recorrencia_tipo?: string | null
          recorrente?: boolean | null
          requer_validacao?: boolean | null
          status?: string
          subcategoria?: string | null
          tipo?: string
          total_parcelas?: number | null
          updated_at?: string
          valor?: number
          valor_pago?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_lancamentos_bordero"
            columns: ["bordero_id"]
            isOneToOne: false
            referencedRelation: "borderos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_lancamentos_recebivel"
            columns: ["recebivel_cartao_id"]
            isOneToOne: false
            referencedRelation: "recebiveis_cartao"
            referencedColumns: ["id"]
          },
        ]
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
      marca_config: {
        Row: {
          cod_empresa: number
          created_at: string
          estrategica: boolean
          id: string
          marca: string
          pct_solar: number | null
          recem_introduzida: boolean
          updated_at: string
        }
        Insert: {
          cod_empresa: number
          created_at?: string
          estrategica?: boolean
          id?: string
          marca: string
          pct_solar?: number | null
          recem_introduzida?: boolean
          updated_at?: string
        }
        Update: {
          cod_empresa?: number
          created_at?: string
          estrategica?: boolean
          id?: string
          marca?: string
          pct_solar?: number | null
          recem_introduzida?: boolean
          updated_at?: string
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
      optview_empresa_config: {
        Row: {
          alias: string | null
          ativo: boolean
          cnpj: string | null
          cod_empresa: number
          codigo_cadastral_optview: string | null
          created_at: string
          id: string
          login_restrito: string | null
          login_site: string | null
          senha_site: string | null
          updated_at: string
        }
        Insert: {
          alias?: string | null
          ativo?: boolean
          cnpj?: string | null
          cod_empresa: number
          codigo_cadastral_optview?: string | null
          created_at?: string
          id?: string
          login_restrito?: string | null
          login_site?: string | null
          senha_site?: string | null
          updated_at?: string
        }
        Update: {
          alias?: string | null
          ativo?: boolean
          cnpj?: string | null
          cod_empresa?: number
          codigo_cadastral_optview?: string | null
          created_at?: string
          id?: string
          login_restrito?: string | null
          login_site?: string | null
          senha_site?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      optview_modelos_aro: {
        Row: {
          ativo: boolean
          codigo_modelo_aro: string
          created_at: string
          id: string
          nome_modelo_aro: string
          observacao: string | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          codigo_modelo_aro: string
          created_at?: string
          id?: string
          nome_modelo_aro: string
          observacao?: string | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          codigo_modelo_aro?: string
          created_at?: string
          id?: string
          nome_modelo_aro?: string
          observacao?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      optview_produtos: {
        Row: {
          ativo: boolean
          codigo_produto: string
          created_at: string
          desenho: string | null
          id: string
          material: string | null
          nome_produto: string
          observacao: string | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          codigo_produto: string
          created_at?: string
          desenho?: string | null
          id?: string
          material?: string | null
          nome_produto: string
          observacao?: string | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          codigo_produto?: string
          created_at?: string
          desenho?: string | null
          id?: string
          material?: string | null
          nome_produto?: string
          observacao?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      optview_servicos: {
        Row: {
          ativo: boolean
          categoria_servico: string | null
          codigo_servico: string
          created_at: string
          id: string
          nome_servico: string
          observacao: string | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          categoria_servico?: string | null
          codigo_servico: string
          created_at?: string
          id?: string
          nome_servico: string
          observacao?: string | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          categoria_servico?: string | null
          codigo_servico?: string
          created_at?: string
          id?: string
          nome_servico?: string
          observacao?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      optview_tipos_armacao: {
        Row: {
          ativo: boolean
          codigo_tipo_armacao: string
          created_at: string
          id: string
          nome_tipo_armacao: string
          observacao: string | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          codigo_tipo_armacao: string
          created_at?: string
          id?: string
          nome_tipo_armacao: string
          observacao?: string | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          codigo_tipo_armacao?: string
          created_at?: string
          id?: string
          nome_tipo_armacao?: string
          observacao?: string | null
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
      parcelas_cache: {
        Row: {
          cache_loaded_at: string
          cod_empresa: number
          conta_descricao: string | null
          conta_numero: string | null
          data_emissao: string | null
          data_pagamento: string | null
          data_vencimento: string | null
          documento: string | null
          empresa_nome: string | null
          forma_pagamento_tipo: string | null
          id: string
          pessoa_nome: string | null
          situacao: string
          tipo_lancamento: string
          valor: number
          valor_pago: number | null
        }
        Insert: {
          cache_loaded_at?: string
          cod_empresa: number
          conta_descricao?: string | null
          conta_numero?: string | null
          data_emissao?: string | null
          data_pagamento?: string | null
          data_vencimento?: string | null
          documento?: string | null
          empresa_nome?: string | null
          forma_pagamento_tipo?: string | null
          id?: string
          pessoa_nome?: string | null
          situacao?: string
          tipo_lancamento?: string
          valor?: number
          valor_pago?: number | null
        }
        Update: {
          cache_loaded_at?: string
          cod_empresa?: number
          conta_descricao?: string | null
          conta_numero?: string | null
          data_emissao?: string | null
          data_pagamento?: string | null
          data_vencimento?: string | null
          documento?: string | null
          empresa_nome?: string | null
          forma_pagamento_tipo?: string | null
          id?: string
          pessoa_nome?: string | null
          situacao?: string
          tipo_lancamento?: string
          valor?: number
          valor_pago?: number | null
        }
        Relationships: []
      }
      payment_links: {
        Row: {
          adquirente: string
          cliente_documento: string | null
          cliente_nome: string | null
          cliente_telefone: string | null
          cod_empresa: number
          created_at: string
          dados_extras: Json | null
          descricao: string
          expira_em: string | null
          id: string
          lancamento_id: string | null
          origem: string
          origem_ref: string | null
          pago_em: string | null
          parcelas_fixas: number | null
          parcelas_max: number | null
          qr_code_pix: string | null
          status: string
          tid: string | null
          updated_at: string
          url_pagamento: string | null
          valor: number
          webhook_payload: Json | null
        }
        Insert: {
          adquirente?: string
          cliente_documento?: string | null
          cliente_nome?: string | null
          cliente_telefone?: string | null
          cod_empresa: number
          created_at?: string
          dados_extras?: Json | null
          descricao: string
          expira_em?: string | null
          id?: string
          lancamento_id?: string | null
          origem?: string
          origem_ref?: string | null
          pago_em?: string | null
          parcelas_fixas?: number | null
          parcelas_max?: number | null
          qr_code_pix?: string | null
          status?: string
          tid?: string | null
          updated_at?: string
          url_pagamento?: string | null
          valor: number
          webhook_payload?: Json | null
        }
        Update: {
          adquirente?: string
          cliente_documento?: string | null
          cliente_nome?: string | null
          cliente_telefone?: string | null
          cod_empresa?: number
          created_at?: string
          dados_extras?: Json | null
          descricao?: string
          expira_em?: string | null
          id?: string
          lancamento_id?: string | null
          origem?: string
          origem_ref?: string | null
          pago_em?: string | null
          parcelas_fixas?: number | null
          parcelas_max?: number | null
          qr_code_pix?: string | null
          status?: string
          tid?: string | null
          updated_at?: string
          url_pagamento?: string | null
          valor?: number
          webhook_payload?: Json | null
        }
        Relationships: []
      }
      pedido_alertas: {
        Row: {
          acknowledged: boolean
          acknowledged_at: string | null
          acknowledged_by: string | null
          cod_empresa: number
          created_at: string
          id: string
          pedido_fornecedor_id: string
          status_detectado: string
        }
        Insert: {
          acknowledged?: boolean
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          cod_empresa: number
          created_at?: string
          id?: string
          pedido_fornecedor_id: string
          status_detectado: string
        }
        Update: {
          acknowledged?: boolean
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          cod_empresa?: number
          created_at?: string
          id?: string
          pedido_fornecedor_id?: string
          status_detectado?: string
        }
        Relationships: [
          {
            foreignKeyName: "pedido_alertas_pedido_fornecedor_id_fkey"
            columns: ["pedido_fornecedor_id"]
            isOneToOne: false
            referencedRelation: "pedidos_fornecedor"
            referencedColumns: ["id"]
          },
        ]
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
      plano_compra_historico: {
        Row: {
          cod_empresa: number
          created_at: string
          data_geracao: string
          id: string
          parametros: Json | null
          plano_final: Json | null
          plano_sugerido: Json | null
          total_final: number | null
          total_sugerido: number | null
        }
        Insert: {
          cod_empresa: number
          created_at?: string
          data_geracao?: string
          id?: string
          parametros?: Json | null
          plano_final?: Json | null
          plano_sugerido?: Json | null
          total_final?: number | null
          total_sugerido?: number | null
        }
        Update: {
          cod_empresa?: number
          created_at?: string
          data_geracao?: string
          id?: string
          parametros?: Json | null
          plano_final?: Json | null
          plano_sugerido?: Json | null
          total_final?: number | null
          total_sugerido?: number | null
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
      recebiveis_cartao: {
        Row: {
          adquirente: string | null
          adquirente_source: string | null
          bandeira: string | null
          btg_extrato_id: string | null
          btg_receivable_id: string | null
          cod_empresa: number
          created_at: string
          data_vencimento: string
          id: string
          status: string
          taxa_percentual: number | null
          taxa_valor: number | null
          updated_at: string
          valor_bruto: number
          valor_liquido: number
        }
        Insert: {
          adquirente?: string | null
          adquirente_source?: string | null
          bandeira?: string | null
          btg_extrato_id?: string | null
          btg_receivable_id?: string | null
          cod_empresa: number
          created_at?: string
          data_vencimento: string
          id?: string
          status?: string
          taxa_percentual?: number | null
          taxa_valor?: number | null
          updated_at?: string
          valor_bruto?: number
          valor_liquido?: number
        }
        Update: {
          adquirente?: string | null
          adquirente_source?: string | null
          bandeira?: string | null
          btg_extrato_id?: string | null
          btg_receivable_id?: string | null
          cod_empresa?: number
          created_at?: string
          data_vencimento?: string
          id?: string
          status?: string
          taxa_percentual?: number | null
          taxa_valor?: number | null
          updated_at?: string
          valor_bruto?: number
          valor_liquido?: number
        }
        Relationships: []
      }
      recebiveis_cartao_parcelas: {
        Row: {
          id: string
          lancamento_id: string
          numero_parcela: number | null
          recebivel_id: string
          valor_parcela: number | null
        }
        Insert: {
          id?: string
          lancamento_id: string
          numero_parcela?: number | null
          recebivel_id: string
          valor_parcela?: number | null
        }
        Update: {
          id?: string
          lancamento_id?: string
          numero_parcela?: number | null
          recebivel_id?: string
          valor_parcela?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "recebiveis_cartao_parcelas_lancamento_id_fkey"
            columns: ["lancamento_id"]
            isOneToOne: false
            referencedRelation: "lancamentos_financeiros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recebiveis_cartao_parcelas_recebivel_id_fkey"
            columns: ["recebivel_id"]
            isOneToOne: false
            referencedRelation: "recebiveis_cartao"
            referencedColumns: ["id"]
          },
        ]
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
      user_page_permissions: {
        Row: {
          granted_at: string
          granted_by: string | null
          page_key: string
          user_id: string
        }
        Insert: {
          granted_at?: string
          granted_by?: string | null
          page_key: string
          user_id: string
        }
        Update: {
          granted_at?: string
          granted_by?: string | null
          page_key?: string
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
      vendas_cartao: {
        Row: {
          adquirente: string
          autorizacao: string | null
          bandeira: string | null
          cod_empresa: number
          created_at: string
          dados_extras: Json | null
          data_prevista_credito: string | null
          data_venda: string
          id: string
          lancamento_id: string | null
          nsu: string | null
          origem_venda_id: string | null
          parcelas: number
          status: string
          taxa_percentual: number | null
          taxa_valor: number | null
          tid: string | null
          tipo: string
          updated_at: string
          valor_bruto: number
          valor_liquido: number
        }
        Insert: {
          adquirente?: string
          autorizacao?: string | null
          bandeira?: string | null
          cod_empresa: number
          created_at?: string
          dados_extras?: Json | null
          data_prevista_credito?: string | null
          data_venda: string
          id?: string
          lancamento_id?: string | null
          nsu?: string | null
          origem_venda_id?: string | null
          parcelas?: number
          status?: string
          taxa_percentual?: number | null
          taxa_valor?: number | null
          tid?: string | null
          tipo?: string
          updated_at?: string
          valor_bruto?: number
          valor_liquido?: number
        }
        Update: {
          adquirente?: string
          autorizacao?: string | null
          bandeira?: string | null
          cod_empresa?: number
          created_at?: string
          dados_extras?: Json | null
          data_prevista_credito?: string | null
          data_venda?: string
          id?: string
          lancamento_id?: string | null
          nsu?: string | null
          origem_venda_id?: string | null
          parcelas?: number
          status?: string
          taxa_percentual?: number | null
          taxa_valor?: number | null
          tid?: string | null
          tipo?: string
          updated_at?: string
          valor_bruto?: number
          valor_liquido?: number
        }
        Relationships: []
      }
      voucher_cliente: {
        Row: {
          cliente_nome: string | null
          cod_empresa: number | null
          cpf: string
          created_at: string
          id: string
          numero_pedido: string | null
          updated_at: string
          voucher: string
        }
        Insert: {
          cliente_nome?: string | null
          cod_empresa?: number | null
          cpf: string
          created_at?: string
          id?: string
          numero_pedido?: string | null
          updated_at?: string
          voucher: string
        }
        Update: {
          cliente_nome?: string | null
          cod_empresa?: number | null
          cpf?: string
          created_at?: string
          id?: string
          numero_pedido?: string | null
          updated_at?: string
          voucher?: string
        }
        Relationships: []
      }
      zeiss_empresa_config: {
        Row: {
          alias: string | null
          ativo: boolean
          cnpj: string | null
          cod_cliente_sao: string | null
          cod_empresa: number
          created_at: string
          id: string
          updated_at: string
        }
        Insert: {
          alias?: string | null
          ativo?: boolean
          cnpj?: string | null
          cod_cliente_sao?: string | null
          cod_empresa: number
          created_at?: string
          id?: string
          updated_at?: string
        }
        Update: {
          alias?: string | null
          ativo?: boolean
          cnpj?: string | null
          cod_cliente_sao?: string | null
          cod_empresa?: number
          created_at?: string
          id?: string
          updated_at?: string
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
      v_conciliacao_loja_resumo: {
        Row: {
          ambiente: string | null
          cod_empresa: number | null
          gv_last_healthcheck_status: string | null
          gv_optin_status: string | null
          nome_fantasia: string | null
          qtd_conciliado: number | null
          qtd_divergente: number | null
          qtd_pendente: number | null
          qtd_pvs: number | null
          qtd_vendas: number | null
          total_bruto: number | null
          total_liquido: number | null
          total_taxas: number | null
          ultima_sync: string | null
          ultima_venda: string | null
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
      has_module_edit_access: {
        Args: { _module: string; _user_id: string }
        Returns: boolean
      }
      has_page_access: {
        Args: { _module: string; _page_key: string; _user_id: string }
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
