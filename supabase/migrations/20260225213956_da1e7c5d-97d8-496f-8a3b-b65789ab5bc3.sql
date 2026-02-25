
-- Tabela de pagamentos BTG (Fase 2)
CREATE TABLE public.btg_pagamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cod_empresa integer NOT NULL,
  btg_payment_id text,
  tipo text NOT NULL, -- PIX_KEY, BANKSLIP, TED, DARF, etc
  valor numeric NOT NULL,
  beneficiario text,
  dados_pagamento jsonb DEFAULT '{}',
  status text NOT NULL DEFAULT 'RASCUNHO', -- RASCUNHO, APROVADO_INTERNO, ENVIADO_BTG, AGUARDANDO_APROVACAO_BTG, PAGO, REJEITADO, CANCELADO
  parcela_id uuid,
  solicitado_por uuid,
  aprovado_por uuid,
  aprovado_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Índices
CREATE INDEX idx_btg_pagamentos_cod_empresa ON public.btg_pagamentos(cod_empresa);
CREATE INDEX idx_btg_pagamentos_status ON public.btg_pagamentos(status);

-- Trigger para updated_at
CREATE TRIGGER trg_btg_pagamentos_updated_at
  BEFORE UPDATE ON public.btg_pagamentos
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS
ALTER TABLE public.btg_pagamentos ENABLE ROW LEVEL SECURITY;

-- Admin pode ler e escrever
CREATE POLICY "Admin full access btg_pagamentos"
  ON public.btg_pagamentos FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

-- Usuários com permissão na empresa podem ler
CREATE POLICY "Tenant read btg_pagamentos"
  ON public.btg_pagamentos FOR SELECT
  TO authenticated
  USING (
    cod_empresa IN (
      SELECT uep.cod_empresa FROM user_empresa_permissions uep WHERE uep.user_id = auth.uid()
    )
  );

-- Service role full access
CREATE POLICY "Service role full access btg_pagamentos"
  ON public.btg_pagamentos FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
