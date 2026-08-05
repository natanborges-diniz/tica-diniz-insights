-- Rubrica passa a ter cancelamento e trilha de edição.
--
-- Até agora só dava para criar, aprovar e suspender. Errou o teto ou a conta do
-- favorecido? Não havia como corrigir — a saída era suspender e criar outra, o
-- que espalha rubricas mortas e faz a média dos últimos meses perder o histórico
-- da pessoa.
--
-- Duas coisas aqui:
--   1. CANCELADA como status terminal, com motivo e autoria.
--   2. Trilha de quem mudou o quê — rubrica é autorização de pagamento, e
--      alteração sem rastro num objeto desses é o tipo de coisa que só aparece
--      na auditoria.

-- ── 1. Novo status ──
-- O CHECK original só admitia RASCUNHO/ATIVA/SUSPENSA.
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

-- ── 2. Trilha de edição ──
CREATE TABLE IF NOT EXISTS public.rubricas_edicoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rubrica_id UUID NOT NULL REFERENCES public.rubricas_autorizadas(id) ON DELETE CASCADE,
  editado_por UUID,
  editado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Só os campos que mudaram, com antes e depois.
  alteracoes JSONB NOT NULL,
  -- Edicao em campo sensivel derruba a rubrica para RASCUNHO.
  exigiu_reaprovacao BOOLEAN NOT NULL DEFAULT false,
  motivo TEXT
);

CREATE INDEX IF NOT EXISTS idx_rubricas_edicoes_rubrica
  ON public.rubricas_edicoes (rubrica_id, editado_em DESC);

COMMENT ON TABLE public.rubricas_edicoes IS
  'Historico de alteracoes das rubricas. Sem isto, trocar o teto de uma rubrica aprovada seria a porta dos fundos da aprovacao: ninguem saberia que mudou nem quem mudou.';

ALTER TABLE public.rubricas_edicoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access rubricas_edicoes"
  ON public.rubricas_edicoes FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Leitura para quem administra; a escrita passa pela edge function.
CREATE POLICY "Admin master le rubricas_edicoes"
  ON public.rubricas_edicoes FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'master'::app_role));

GRANT SELECT ON public.rubricas_edicoes TO authenticated;
GRANT ALL ON public.rubricas_edicoes TO service_role;

-- ── 3. Rubrica cancelada nao deve mais aparecer como lastro possivel ──
CREATE INDEX IF NOT EXISTS idx_rubricas_empresa_evento_doc
  ON public.rubricas_autorizadas (cod_empresa, folha_evento, favorecido_documento)
  WHERE status <> 'CANCELADA';

NOTIFY pgrst, 'reload schema';
