DELETE FROM public.borderos b
WHERE b.status = 'MONTAGEM'
  AND NOT EXISTS (
    SELECT 1 FROM public.lancamentos_financeiros l WHERE l.bordero_id = b.id
  );