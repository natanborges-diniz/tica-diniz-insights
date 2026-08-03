-- lancamentos_financeiros.btg_dda_id: text sem FK → uuid com FK.
--
-- Incidente 04/08/2026: a limpeza do "espelho" do DDA apagou títulos por bug de
-- normalização, e 718 lançamentos ficaram apontando para linhas que não existem
-- mais. O banco não impediu porque a coluna é TEXT e não há chave estrangeira —
-- do ponto de vista do Postgres, era só um texto qualquer.
--
-- Com FK e ON DELETE SET NULL, o mesmo acidente vira apenas "o boleto foi
-- desanexado": o vínculo some junto com o título, sem deixar ponteiro morto. E
-- passa a ser impossível gravar um id que não existe.
--
-- Efeito colateral bem-vindo: some a necessidade de cast (t.id::text = btg_dda_id)
-- em toda consulta que cruza as duas tabelas.

-- ── 1. Limpa os ponteiros mortos ──
UPDATE public.lancamentos_financeiros l
SET btg_dda_id = NULL
WHERE l.btg_dda_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.btg_dda_titulos t WHERE t.id::text = l.btg_dda_id
  );

-- ── 2. Limpa o que não é sequer um uuid ──
-- Defensivo: coluna text aceitou qualquer coisa ao longo do tempo, e um valor
-- malformado aborta o ALTER inteiro.
UPDATE public.lancamentos_financeiros
SET btg_dda_id = NULL
WHERE btg_dda_id IS NOT NULL
  AND btg_dda_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

-- ── 3. Converte o tipo ──
ALTER TABLE public.lancamentos_financeiros
  ALTER COLUMN btg_dda_id TYPE UUID USING btg_dda_id::uuid;

-- ── 4. Amarra ──
ALTER TABLE public.lancamentos_financeiros
  DROP CONSTRAINT IF EXISTS lancamentos_financeiros_btg_dda_id_fkey;

ALTER TABLE public.lancamentos_financeiros
  ADD CONSTRAINT lancamentos_financeiros_btg_dda_id_fkey
  FOREIGN KEY (btg_dda_id)
  REFERENCES public.btg_dda_titulos(id)
  ON DELETE SET NULL;

-- FK sem índice no lado filho torna lenta toda exclusão de título.
CREATE INDEX IF NOT EXISTS idx_lancamentos_btg_dda_id
  ON public.lancamentos_financeiros (btg_dda_id)
  WHERE btg_dda_id IS NOT NULL;

COMMENT ON COLUMN public.lancamentos_financeiros.btg_dda_id IS
  'Titulo do DDA vinculado. FK com ON DELETE SET NULL: se o titulo sair do espelho do banco, o lancamento apenas perde o boleto — nunca fica com ponteiro morto.';

NOTIFY pgrst, 'reload schema';
