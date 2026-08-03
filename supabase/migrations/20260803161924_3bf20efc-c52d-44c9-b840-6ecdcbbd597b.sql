UPDATE public.lancamentos_financeiros
SET status = 'PREVISTO', updated_at = now()
WHERE origem = 'ERP'
  AND status = 'CLASSIFICADO'
  AND updated_at >= '2026-08-03 16:00:00+00';