ALTER TABLE public.borderos
  ADD COLUMN IF NOT EXISTS observacao TEXT,
  ADD COLUMN IF NOT EXISTS encerrado_por UUID,
  ADD COLUMN IF NOT EXISTS encerrado_em TIMESTAMPTZ;

COMMENT ON COLUMN public.borderos.observacao IS
  'Por que o bordero foi encerrado sem passar pelo banco. Distingue o PROCESSADO que liquidou no BTG do que foi encerrado porque os titulos ja constavam pagos no ERP.';

NOTIFY pgrst, 'reload schema';