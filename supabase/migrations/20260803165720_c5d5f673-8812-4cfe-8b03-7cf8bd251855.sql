UPDATE public.btg_dda_titulos t
SET status = 'ARQUIVADO'
WHERE t.data_vencimento < current_date - 90
  AND t.status NOT IN ('ARQUIVADO', 'PAGO', 'IGNORADO')
  AND NOT EXISTS (
    SELECT 1 FROM public.lancamentos_financeiros l WHERE l.btg_dda_id = t.id
  );

COMMENT ON COLUMN public.btg_dda_titulos.status IS
  'PENDENTE · CONCILIADO · PAGAMENTO_PENDENTE · PAGO · IGNORADO (decisao humana) · ARQUIVADO (envelhecido sem par, automatico).';

NOTIFY pgrst, 'reload schema';