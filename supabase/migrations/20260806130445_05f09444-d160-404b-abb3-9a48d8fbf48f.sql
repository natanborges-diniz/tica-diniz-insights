ALTER TABLE public.lancamentos_financeiros
  ADD COLUMN IF NOT EXISTS competencia TEXT;

COMMENT ON COLUMN public.lancamentos_financeiros.competencia IS
  'Mes de competencia (YYYY-MM) — e por ele que o DRE agrupa. Informado quando o mes e uma decisao (folha, provisao de rubrica); derivado da emissao, ou do vencimento na falta dela, quando e consequencia (titulo do ERP).';

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

UPDATE public.lancamentos_financeiros
SET competencia = COALESCE(
  competencia_rubrica,
  to_char(data_emissao, 'YYYY-MM'),
  to_char(data_vencimento, 'YYYY-MM')
)
WHERE competencia IS NULL;

UPDATE public.lancamentos_financeiros l
SET competencia = f.competencia
FROM public.folha_competencias f
WHERE l.origem = 'FOLHA'
  AND (l.dados_extras->>'folha_competencia_id')::uuid = f.id
  AND l.competencia IS DISTINCT FROM f.competencia;

CREATE INDEX IF NOT EXISTS idx_lancamentos_competencia
  ON public.lancamentos_financeiros (cod_empresa, competencia);

NOTIFY pgrst, 'reload schema';