ALTER TABLE public.lancamentos_financeiros
  ADD COLUMN IF NOT EXISTS lancamento_pai_id UUID
    REFERENCES public.lancamentos_financeiros(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_lancamentos_pai
  ON public.lancamentos_financeiros (lancamento_pai_id)
  WHERE lancamento_pai_id IS NOT NULL;

COMMENT ON COLUMN public.lancamentos_financeiros.lancamento_pai_id IS
  'Lancamento pagador deste componente. Componentes tem status AGRUPADO, nao entram em bordero e sao baixados em cascata pelo pagador.';

ALTER TABLE public.lancamentos_financeiros
  ADD COLUMN IF NOT EXISTS valor_original NUMERIC;

ALTER TABLE public.lancamentos_financeiros
  ADD COLUMN IF NOT EXISTS valor_editado_por UUID;

ALTER TABLE public.lancamentos_financeiros
  ADD COLUMN IF NOT EXISTS valor_editado_em TIMESTAMPTZ;

COMMENT ON COLUMN public.lancamentos_financeiros.valor_original IS
  'Valor como veio da origem (ERP/DDA/manual) antes da primeira edicao. NULL = nunca editado.';

NOTIFY pgrst, 'reload schema';