
-- Fase 3: Tabela de Cobranças / Boletos BTG
CREATE TABLE public.btg_cobrancas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cod_empresa integer NOT NULL,
  btg_receivable_id text,
  valor numeric NOT NULL,
  data_vencimento date NOT NULL,
  sacado_nome text,
  sacado_documento text,
  linha_digitavel text,
  url_boleto text,
  status text NOT NULL DEFAULT 'EMITIDO',
  data_pagamento date,
  valor_pago numeric,
  parcela_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.btg_cobrancas ENABLE ROW LEVEL SECURITY;

-- Admin full access
CREATE POLICY "Admin full access btg_cobrancas"
  ON public.btg_cobrancas FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

-- Service role full access
CREATE POLICY "Service role full access btg_cobrancas"
  ON public.btg_cobrancas FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Tenant read
CREATE POLICY "Tenant read btg_cobrancas"
  ON public.btg_cobrancas FOR SELECT
  TO authenticated
  USING (cod_empresa IN (
    SELECT uep.cod_empresa FROM user_empresa_permissions uep WHERE uep.user_id = auth.uid()
  ));

-- Trigger updated_at
CREATE TRIGGER update_btg_cobrancas_updated_at
  BEFORE UPDATE ON public.btg_cobrancas
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
