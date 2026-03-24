
-- Fase 1: Tabelas para plataforma de adquirentes

-- 1. adquirentes_config
CREATE TABLE public.adquirentes_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cod_empresa integer NOT NULL,
  adquirente text NOT NULL DEFAULT 'REDE',
  ambiente text NOT NULL DEFAULT 'sandbox',
  merchant_id text,
  integration_key_encrypted text,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.adquirentes_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin full access adquirentes_config" ON public.adquirentes_config FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "Service role full access adquirentes_config" ON public.adquirentes_config FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 2. vendas_cartao
CREATE TABLE public.vendas_cartao (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cod_empresa integer NOT NULL,
  adquirente text NOT NULL DEFAULT 'REDE',
  nsu text,
  autorizacao text,
  tid text,
  bandeira text,
  tipo text NOT NULL DEFAULT 'CREDITO',
  parcelas integer NOT NULL DEFAULT 1,
  valor_bruto numeric NOT NULL DEFAULT 0,
  valor_liquido numeric NOT NULL DEFAULT 0,
  taxa_percentual numeric,
  taxa_valor numeric,
  data_venda date NOT NULL,
  data_prevista_credito date,
  status text NOT NULL DEFAULT 'APROVADA',
  origem_venda_id text,
  lancamento_id uuid,
  dados_extras jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.vendas_cartao ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin full access vendas_cartao" ON public.vendas_cartao FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "Service role full access vendas_cartao" ON public.vendas_cartao FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Tenant read vendas_cartao" ON public.vendas_cartao FOR SELECT TO authenticated USING (cod_empresa IN (SELECT uep.cod_empresa FROM user_empresa_permissions uep WHERE uep.user_id = auth.uid()));

-- 3. payment_links
CREATE TABLE public.payment_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cod_empresa integer NOT NULL,
  adquirente text NOT NULL DEFAULT 'REDE',
  valor numeric NOT NULL,
  descricao text NOT NULL,
  parcelas_max integer DEFAULT 1,
  expira_em timestamptz,
  url_pagamento text,
  qr_code_pix text,
  status text NOT NULL DEFAULT 'ATIVO',
  tid text,
  cliente_nome text,
  cliente_documento text,
  cliente_telefone text,
  lancamento_id uuid,
  origem text NOT NULL DEFAULT 'MANUAL',
  origem_ref text,
  dados_extras jsonb DEFAULT '{}'::jsonb,
  webhook_payload jsonb,
  pago_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.payment_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin full access payment_links" ON public.payment_links FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "Service role full access payment_links" ON public.payment_links FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Tenant read payment_links" ON public.payment_links FOR SELECT TO authenticated USING (cod_empresa IN (SELECT uep.cod_empresa FROM user_empresa_permissions uep WHERE uep.user_id = auth.uid()));
CREATE POLICY "Tenant insert payment_links" ON public.payment_links FOR INSERT TO authenticated WITH CHECK (cod_empresa IN (SELECT uep.cod_empresa FROM user_empresa_permissions uep WHERE uep.user_id = auth.uid()) OR has_role(auth.uid(), 'admin'));
CREATE POLICY "Tenant update payment_links" ON public.payment_links FOR UPDATE TO authenticated USING (cod_empresa IN (SELECT uep.cod_empresa FROM user_empresa_permissions uep WHERE uep.user_id = auth.uid()) OR has_role(auth.uid(), 'admin')) WITH CHECK (cod_empresa IN (SELECT uep.cod_empresa FROM user_empresa_permissions uep WHERE uep.user_id = auth.uid()) OR has_role(auth.uid(), 'admin'));

-- 4. conciliacao_vendas
CREATE TABLE public.conciliacao_vendas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cod_empresa integer NOT NULL,
  venda_erp_id text,
  venda_cartao_id uuid REFERENCES public.vendas_cartao(id),
  status text NOT NULL DEFAULT 'PENDENTE_ADQ',
  diferenca_valor numeric DEFAULT 0,
  observacao text,
  conciliado_por uuid,
  conciliado_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.conciliacao_vendas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin full access conciliacao_vendas" ON public.conciliacao_vendas FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "Service role full access conciliacao_vendas" ON public.conciliacao_vendas FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Tenant read conciliacao_vendas" ON public.conciliacao_vendas FOR SELECT TO authenticated USING (cod_empresa IN (SELECT uep.cod_empresa FROM user_empresa_permissions uep WHERE uep.user_id = auth.uid()));

-- 5. Alter recebiveis_cartao: add adquirente_source
ALTER TABLE public.recebiveis_cartao ADD COLUMN IF NOT EXISTS adquirente_source text DEFAULT 'REDE';

-- 6. Updated_at triggers
CREATE TRIGGER update_adquirentes_config_updated_at BEFORE UPDATE ON public.adquirentes_config FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_vendas_cartao_updated_at BEFORE UPDATE ON public.vendas_cartao FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_payment_links_updated_at BEFORE UPDATE ON public.payment_links FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
