ALTER TABLE public.rubricas_autorizadas
  DROP CONSTRAINT IF EXISTS chk_rubrica_status;

ALTER TABLE public.rubricas_autorizadas
  ADD CONSTRAINT chk_rubrica_status
  CHECK (status IN ('RASCUNHO', 'ATIVA', 'SUSPENSA', 'CANCELADA'));

ALTER TABLE public.rubricas_autorizadas
  ADD COLUMN IF NOT EXISTS cancelada_por UUID,
  ADD COLUMN IF NOT EXISTS cancelada_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelamento_motivo TEXT;

COMMENT ON COLUMN public.rubricas_autorizadas.cancelamento_motivo IS
  'Por que a rubrica saiu de circulacao. Cancelar nao apaga: o historico de pagamentos aponta para ela, e um DRE sem a referencia do que autorizou a despesa deixa de ser auditavel.';

CREATE TABLE IF NOT EXISTS public.rubricas_edicoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rubrica_id UUID NOT NULL REFERENCES public.rubricas_autorizadas(id) ON DELETE CASCADE,
  editado_por UUID,
  editado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  alteracoes JSONB NOT NULL,
  exigiu_reaprovacao BOOLEAN NOT NULL DEFAULT false,
  motivo TEXT
);

CREATE INDEX IF NOT EXISTS idx_rubricas_edicoes_rubrica
  ON public.rubricas_edicoes (rubrica_id, editado_em DESC);

COMMENT ON TABLE public.rubricas_edicoes IS
  'Historico de alteracoes das rubricas. Sem isto, trocar o teto de uma rubrica aprovada seria a porta dos fundos da aprovacao: ninguem saberia que mudou nem quem mudou.';

GRANT SELECT ON public.rubricas_edicoes TO authenticated;
GRANT ALL ON public.rubricas_edicoes TO service_role;

ALTER TABLE public.rubricas_edicoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access rubricas_edicoes"
  ON public.rubricas_edicoes FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Admin master le rubricas_edicoes"
  ON public.rubricas_edicoes FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'master'::app_role));

CREATE INDEX IF NOT EXISTS idx_rubricas_empresa_evento_doc
  ON public.rubricas_autorizadas (cod_empresa, folha_evento, favorecido_documento)
  WHERE status <> 'CANCELADA';

NOTIFY pgrst, 'reload schema';