
CREATE TABLE public.parcelas_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cod_empresa integer NOT NULL,
  empresa_nome text,
  tipo_lancamento text NOT NULL DEFAULT 'RECEBER',
  documento text,
  pessoa_nome text,
  data_vencimento date,
  data_emissao date,
  data_pagamento date,
  valor numeric NOT NULL DEFAULT 0,
  valor_pago numeric DEFAULT 0,
  situacao text NOT NULL DEFAULT 'EM ABERTO',
  conta_numero text,
  conta_descricao text,
  forma_pagamento_tipo text,
  cache_loaded_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cod_empresa, tipo_lancamento, documento, data_vencimento, valor)
);

ALTER TABLE public.parcelas_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access parcelas_cache"
  ON public.parcelas_cache FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Tenant or admin read parcelas_cache"
  ON public.parcelas_cache FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR cod_empresa IN (
      SELECT uep.cod_empresa FROM user_empresa_permissions uep WHERE uep.user_id = auth.uid()
    )
  );

CREATE INDEX idx_parcelas_cache_empresa ON public.parcelas_cache (cod_empresa);
CREATE INDEX idx_parcelas_cache_vencimento ON public.parcelas_cache (data_vencimento);
CREATE INDEX idx_parcelas_cache_situacao ON public.parcelas_cache (situacao);
