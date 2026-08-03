CREATE TABLE IF NOT EXISTS public.folha_competencias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cod_empresa INTEGER NOT NULL,
  competencia TEXT NOT NULL,
  evento TEXT NOT NULL,
  descricao TEXT,
  data_pagamento DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'RASCUNHO',
  rubrica_id UUID REFERENCES public.rubricas_autorizadas(id),
  qtd_colaboradores INTEGER NOT NULL DEFAULT 0,
  total_bruto NUMERIC NOT NULL DEFAULT 0,
  total_descontos NUMERIC NOT NULL DEFAULT 0,
  total_liquido NUMERIC NOT NULL DEFAULT 0,
  btg_request_id TEXT,
  btg_payment_id TEXT,
  btg_status TEXT,
  criado_por UUID,
  fechado_por UUID,
  fechado_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.folha_competencias TO authenticated;
GRANT ALL ON public.folha_competencias TO service_role;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_folha_competencia
  ON public.folha_competencias (cod_empresa, competencia, evento)
  WHERE status <> 'CANCELADA';

CREATE TABLE IF NOT EXISTS public.folha_itens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  competencia_id UUID NOT NULL REFERENCES public.folha_competencias(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  cpf TEXT NOT NULL,
  matricula TEXT,
  banco TEXT,
  agencia TEXT,
  conta TEXT,
  tipo_conta TEXT DEFAULT 'CC',
  chave_pix TEXT,
  valor_bruto NUMERIC NOT NULL DEFAULT 0,
  descontos NUMERIC NOT NULL DEFAULT 0,
  valor_liquido NUMERIC NOT NULL,
  lancamento_id UUID REFERENCES public.lancamentos_financeiros(id) ON DELETE SET NULL,
  observacao TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.folha_itens TO authenticated;
GRANT ALL ON public.folha_itens TO service_role;

CREATE INDEX IF NOT EXISTS idx_folha_itens_competencia ON public.folha_itens (competencia_id);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_folha_item_cpf ON public.folha_itens (competencia_id, cpf);

CREATE TABLE IF NOT EXISTS public.folha_encargos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  competencia_id UUID NOT NULL REFERENCES public.folha_competencias(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL,
  descricao TEXT,
  valor NUMERIC NOT NULL,
  data_vencimento DATE NOT NULL,
  conta_numero TEXT,
  lancamento_id UUID REFERENCES public.lancamentos_financeiros(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.folha_encargos TO authenticated;
GRANT ALL ON public.folha_encargos TO service_role;

CREATE INDEX IF NOT EXISTS idx_folha_encargos_competencia ON public.folha_encargos (competencia_id);

ALTER TABLE public.borderos ADD COLUMN IF NOT EXISTS tipo TEXT NOT NULL DEFAULT 'PAGAMENTOS';
ALTER TABLE public.borderos DROP CONSTRAINT IF EXISTS borderos_tipo_check;
ALTER TABLE public.borderos ADD CONSTRAINT borderos_tipo_check CHECK (tipo IN ('PAGAMENTOS', 'FOLHA'));
ALTER TABLE public.borderos ADD COLUMN IF NOT EXISTS folha_competencia_id UUID REFERENCES public.folha_competencias(id);

COMMENT ON COLUMN public.borderos.tipo IS
  'PAGAMENTOS: /banking/payments (boleto, pix, ted). FOLHA: /banking/payroll/payments, com paymentType no lote.';

ALTER TABLE public.rubricas_autorizadas ADD COLUMN IF NOT EXISTS folha_evento TEXT;

COMMENT ON COLUMN public.rubricas_autorizadas.folha_evento IS
  'Quando preenchida, a rubrica representa um evento de folha (SALARIO, FERIAS, COMISSAO...) e define o paymentType do lote no BTG.';

ALTER TABLE public.folha_competencias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.folha_itens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.folha_encargos ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['folha_competencias', 'folha_itens', 'folha_encargos'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Auth read %1$s" ON public.%1$s', t);
    EXECUTE format(
      'CREATE POLICY "Auth read %1$s" ON public.%1$s AS PERMISSIVE FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL)', t);

    EXECUTE format('DROP POLICY IF EXISTS "Admin write %1$s" ON public.%1$s', t);
    EXECUTE format(
      'CREATE POLICY "Admin write %1$s" ON public.%1$s AS PERMISSIVE FOR ALL TO authenticated '
      'USING (has_role(auth.uid(), ''admin''::app_role)) '
      'WITH CHECK (has_role(auth.uid(), ''admin''::app_role))', t);
  END LOOP;
END $$;

DROP TRIGGER IF EXISTS set_updated_at_folha_competencias ON public.folha_competencias;
CREATE TRIGGER set_updated_at_folha_competencias
  BEFORE UPDATE ON public.folha_competencias
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

NOTIFY pgrst, 'reload schema';