
-- Fase 4: Tabela DDA — Débito Direto Autorizado
CREATE TABLE public.btg_dda_titulos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cod_empresa integer NOT NULL,
  btg_dda_id text,
  emissor text,
  documento_emissor text,
  numero_documento text,
  valor numeric NOT NULL,
  data_vencimento date NOT NULL,
  linha_digitavel text,
  status text NOT NULL DEFAULT 'PENDENTE',
  conciliado boolean NOT NULL DEFAULT false,
  parcela_id uuid,
  pagamento_id uuid REFERENCES public.btg_pagamentos(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Índices para conciliação automática
CREATE INDEX idx_btg_dda_conciliacao ON public.btg_dda_titulos (cod_empresa, valor, data_vencimento, documento_emissor, numero_documento);
CREATE INDEX idx_btg_dda_status ON public.btg_dda_titulos (status, conciliado);

-- RLS
ALTER TABLE public.btg_dda_titulos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin full access btg_dda_titulos"
  ON public.btg_dda_titulos FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Service role full access btg_dda_titulos"
  ON public.btg_dda_titulos FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Tenant read btg_dda_titulos"
  ON public.btg_dda_titulos FOR SELECT
  TO authenticated
  USING (cod_empresa IN (
    SELECT uep.cod_empresa FROM user_empresa_permissions uep WHERE uep.user_id = auth.uid()
  ));

-- Trigger updated_at
CREATE TRIGGER update_btg_dda_titulos_updated_at
  BEFORE UPDATE ON public.btg_dda_titulos
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
