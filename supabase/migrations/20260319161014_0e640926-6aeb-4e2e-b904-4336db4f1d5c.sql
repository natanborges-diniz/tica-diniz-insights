
-- =============================================================
-- Sprint 1: Core financial tables
-- =============================================================

-- 1. lancamentos_financeiros (central ledger)
CREATE TABLE public.lancamentos_financeiros (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cod_empresa integer NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('PAGAR', 'RECEBER')),
  status text NOT NULL DEFAULT 'PREVISTO',
  
  -- Classificacao contabil (DRE)
  natureza text,
  categoria text,
  subcategoria text,
  
  -- Dados do lancamento
  descricao text NOT NULL,
  pessoa_nome text,
  pessoa_documento text,
  valor numeric NOT NULL,
  valor_pago numeric,
  data_emissao date,
  data_vencimento date NOT NULL,
  data_pagamento date,
  data_baixa date,
  
  -- Forma de pagamento e cartao
  forma_pagamento text,
  adquirente text,
  bandeira text,
  numero_parcela integer,
  total_parcelas integer,
  
  -- Vinculos
  origem text NOT NULL DEFAULT 'MANUAL',
  origem_id text,
  bordero_id uuid,
  recebivel_cartao_id uuid,
  btg_pagamento_id uuid,
  btg_cobranca_id uuid,
  btg_dda_id uuid,
  btg_extrato_id uuid,
  
  -- Controle de aprovacao
  autorizado_por uuid,
  autorizado_em timestamptz,
  baixado_por uuid,
  baixado_em timestamptz,
  criado_por uuid,
  
  -- Recorrencia
  recorrente boolean DEFAULT false,
  recorrencia_tipo text,
  
  -- Metadados
  observacao text,
  dados_extras jsonb DEFAULT '{}',
  requer_validacao boolean DEFAULT false,
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_lanc_empresa_tipo_status ON public.lancamentos_financeiros (cod_empresa, tipo, status);
CREATE INDEX idx_lanc_vencimento ON public.lancamentos_financeiros (data_vencimento);
CREATE INDEX idx_lanc_origem ON public.lancamentos_financeiros (origem, origem_id);
CREATE INDEX idx_lanc_bordero ON public.lancamentos_financeiros (bordero_id) WHERE bordero_id IS NOT NULL;

-- Updated_at trigger
CREATE TRIGGER set_updated_at_lancamentos
  BEFORE UPDATE ON public.lancamentos_financeiros
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS
ALTER TABLE public.lancamentos_financeiros ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin full access lancamentos"
  ON public.lancamentos_financeiros FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Tenant read lancamentos"
  ON public.lancamentos_financeiros FOR SELECT TO authenticated
  USING (cod_empresa IN (SELECT uep.cod_empresa FROM user_empresa_permissions uep WHERE uep.user_id = auth.uid()));

CREATE POLICY "Service role full access lancamentos"
  ON public.lancamentos_financeiros FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- 2. borderos (payment batches)
CREATE TABLE public.borderos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cod_empresa integer NOT NULL,
  status text NOT NULL DEFAULT 'MONTAGEM',
  descricao text,
  total_valor numeric NOT NULL DEFAULT 0,
  qtd_lancamentos integer NOT NULL DEFAULT 0,
  
  criado_por uuid,
  aprovado_por uuid,
  aprovado_em timestamptz,
  btg_batch_id text,
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_borderos_empresa_status ON public.borderos (cod_empresa, status);

CREATE TRIGGER set_updated_at_borderos
  BEFORE UPDATE ON public.borderos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.borderos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin full access borderos"
  ON public.borderos FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Tenant read borderos"
  ON public.borderos FOR SELECT TO authenticated
  USING (cod_empresa IN (SELECT uep.cod_empresa FROM user_empresa_permissions uep WHERE uep.user_id = auth.uid()));

CREATE POLICY "Service role full access borderos"
  ON public.borderos FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- FK from lancamentos to borderos
ALTER TABLE public.lancamentos_financeiros
  ADD CONSTRAINT fk_lancamentos_bordero FOREIGN KEY (bordero_id) REFERENCES public.borderos(id);

-- 3. recebiveis_cartao (acquirer receivables agenda)
CREATE TABLE public.recebiveis_cartao (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cod_empresa integer NOT NULL,
  adquirente text,
  bandeira text,
  data_vencimento date NOT NULL,
  valor_bruto numeric NOT NULL DEFAULT 0,
  valor_liquido numeric NOT NULL DEFAULT 0,
  taxa_percentual numeric,
  taxa_valor numeric,
  status text NOT NULL DEFAULT 'PREVISTO',
  btg_receivable_id text,
  btg_extrato_id uuid,
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_recebiveis_empresa_status ON public.recebiveis_cartao (cod_empresa, status);
CREATE INDEX idx_recebiveis_vencimento ON public.recebiveis_cartao (data_vencimento);

CREATE TRIGGER set_updated_at_recebiveis
  BEFORE UPDATE ON public.recebiveis_cartao
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.recebiveis_cartao ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin full access recebiveis_cartao"
  ON public.recebiveis_cartao FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Tenant read recebiveis_cartao"
  ON public.recebiveis_cartao FOR SELECT TO authenticated
  USING (cod_empresa IN (SELECT uep.cod_empresa FROM user_empresa_permissions uep WHERE uep.user_id = auth.uid()));

CREATE POLICY "Service role full access recebiveis_cartao"
  ON public.recebiveis_cartao FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- FK from lancamentos to recebiveis
ALTER TABLE public.lancamentos_financeiros
  ADD CONSTRAINT fk_lancamentos_recebivel FOREIGN KEY (recebivel_cartao_id) REFERENCES public.recebiveis_cartao(id);

-- 4. recebiveis_cartao_parcelas (M:N link)
CREATE TABLE public.recebiveis_cartao_parcelas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recebivel_id uuid NOT NULL REFERENCES public.recebiveis_cartao(id) ON DELETE CASCADE,
  lancamento_id uuid NOT NULL REFERENCES public.lancamentos_financeiros(id) ON DELETE CASCADE,
  valor_parcela numeric,
  numero_parcela integer
);

CREATE INDEX idx_rcp_recebivel ON public.recebiveis_cartao_parcelas (recebivel_id);
CREATE INDEX idx_rcp_lancamento ON public.recebiveis_cartao_parcelas (lancamento_id);

ALTER TABLE public.recebiveis_cartao_parcelas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin full access rcp"
  ON public.recebiveis_cartao_parcelas FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Service role full access rcp"
  ON public.recebiveis_cartao_parcelas FOR ALL TO service_role
  USING (true) WITH CHECK (true);
