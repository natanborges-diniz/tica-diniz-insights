-- Fase 2.0 — D₂: Configurações por marca e loja
-- pct_solar: override do % Solar da capacidade_expositor (null = herda default)
-- estrategica: garante mix mínimo de 25 peças mesmo sem participação suficiente
-- recem_introduzida: marca nova, exclui do ranking de descontinuação

CREATE TABLE public.marca_config (
  id                uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  cod_empresa       int         NOT NULL,
  marca             text        NOT NULL,
  pct_solar         int         CHECK (pct_solar BETWEEN 0 AND 100),
  estrategica       boolean     NOT NULL DEFAULT false,
  recem_introduzida boolean     NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cod_empresa, marca)
);

ALTER TABLE public.marca_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow_all_authenticated" ON public.marca_config
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE TRIGGER marca_config_updated_at
  BEFORE UPDATE ON public.marca_config
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
