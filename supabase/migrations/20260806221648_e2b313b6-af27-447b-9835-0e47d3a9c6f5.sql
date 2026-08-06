ALTER TABLE public.folha_competencias
  ADD COLUMN IF NOT EXISTS sequencia INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS complementar BOOLEAN NOT NULL DEFAULT false;

DROP INDEX IF EXISTS uniq_folha_competencia;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_folha_competencia
  ON public.folha_competencias (cod_empresa, competencia, evento, sequencia)
  WHERE status <> 'CANCELADA';