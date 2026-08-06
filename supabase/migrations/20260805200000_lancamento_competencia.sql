-- Competência do lançamento — a data que o DRE usa.
--
-- O DRE é por competência, e competência não é uma data só. Para título do ERP
-- (boleto, nota) vale a data de emissão, que na prática é o mês do fato. Para
-- folha, o mês é escolhido e não coincide nem com a emissão nem com o
-- vencimento: julho é fechado e pago em agosto, e os encargos de julho vencem
-- no dia 7 e 20 de agosto — tudo isso é competência JULHO.
--
-- Até agora o DRE filtrava direto por `data_emissao`, com >= e <=. Em SQL isso
-- descarta NULL, e é exatamente esse o valor de data_emissao na folha e nas
-- provisões de rubrica: elas não têm emissão porque não existe documento
-- emitido. Resultado: nem apareciam no relatório — não caíam no grupo errado,
-- simplesmente sumiam.
--
-- Aqui a competência vira campo próprio, preenchido por trigger para que
-- nenhuma via de gravação fique de fora — as do ERP, as manuais, as que ainda
-- vão existir.

ALTER TABLE public.lancamentos_financeiros
  ADD COLUMN IF NOT EXISTS competencia TEXT;

COMMENT ON COLUMN public.lancamentos_financeiros.competencia IS
  'Mes de competencia (YYYY-MM) — e por ele que o DRE agrupa. Informado quando o mes e uma decisao (folha, provisao de rubrica); derivado da emissao, ou do vencimento na falta dela, quando e consequencia (titulo do ERP).';

-- ── Preenchimento automático ──
--
-- Trigger, e não default, porque a regra olha três colunas. E BEFORE INSERT OR
-- UPDATE porque corrigir a emissão de um título tem de corrigir a competência
-- junto — a não ser que alguém tenha decidido a competência explicitamente.
CREATE OR REPLACE FUNCTION public.fn_lancamento_competencia()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.competencia IS NULL OR NEW.competencia = '' THEN
    NEW.competencia := COALESCE(
      NEW.competencia_rubrica,
      to_char(NEW.data_emissao, 'YYYY-MM'),
      to_char(NEW.data_vencimento, 'YYYY-MM')
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lancamento_competencia ON public.lancamentos_financeiros;
CREATE TRIGGER trg_lancamento_competencia
  BEFORE INSERT OR UPDATE OF data_emissao, data_vencimento, competencia_rubrica, competencia
  ON public.lancamentos_financeiros
  FOR EACH ROW EXECUTE FUNCTION public.fn_lancamento_competencia();

-- ── Histórico ──
--
-- Mesma regra aplicada ao que já existe. Títulos do ERP passam a ter a
-- competência da emissão; folha e provisões, que estavam sem nada, ganham a
-- competência da rubrica ou, na falta dela, a do vencimento.
--
-- A folha já fechada fica com a competência do vencimento, que pode não ser a
-- correta (julho pago em agosto viraria agosto). São poucos registros e a tela
-- de folha sabe a competência certa — o ajuste fino é feito lá, não aqui, para
-- não escrever palpite em cima de dado de DRE.
UPDATE public.lancamentos_financeiros
SET competencia = COALESCE(
  competencia_rubrica,
  to_char(data_emissao, 'YYYY-MM'),
  to_char(data_vencimento, 'YYYY-MM')
)
WHERE competencia IS NULL;

-- Corrige a folha já fechada com a competência de verdade, que está na
-- competência da folha e não na data em que ela foi paga.
UPDATE public.lancamentos_financeiros l
SET competencia = f.competencia
FROM public.folha_competencias f
WHERE l.origem = 'FOLHA'
  AND (l.dados_extras->>'folha_competencia_id')::uuid = f.id
  AND l.competencia IS DISTINCT FROM f.competencia;

CREATE INDEX IF NOT EXISTS idx_lancamentos_competencia
  ON public.lancamentos_financeiros (cod_empresa, competencia);

NOTIFY pgrst, 'reload schema';
