-- ── 1. Limpa os ponteiros mortos ──
UPDATE public.lancamentos_financeiros l
SET btg_dda_id = NULL
WHERE l.btg_dda_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.btg_dda_titulos t WHERE t.id = l.btg_dda_id
  );

-- ── 4. Amarra ──
ALTER TABLE public.lancamentos_financeiros
  DROP CONSTRAINT IF EXISTS lancamentos_financeiros_btg_dda_id_fkey;

ALTER TABLE public.lancamentos_financeiros
  ADD CONSTRAINT lancamentos_financeiros_btg_dda_id_fkey
  FOREIGN KEY (btg_dda_id)
  REFERENCES public.btg_dda_titulos(id)
  ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_lancamentos_btg_dda_id
  ON public.lancamentos_financeiros (btg_dda_id)
  WHERE btg_dda_id IS NOT NULL;

COMMENT ON COLUMN public.lancamentos_financeiros.btg_dda_id IS
  'Titulo do DDA vinculado. FK com ON DELETE SET NULL: se o titulo sair do espelho do banco, o lancamento apenas perde o boleto — nunca fica com ponteiro morto.';

NOTIFY pgrst, 'reload schema';