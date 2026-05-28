-- Fase 2.0 — D₂: Histórico de planos de compra gerados pelo Wizard
-- parametros: snapshot dos parâmetros usados (capacidade, pct_solar etc.)
-- plano_sugerido: alocação calculada automaticamente
-- plano_final: alocação após edição manual pelo usuário

CREATE TABLE public.plano_compra_historico (
  id              uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  cod_empresa     int         NOT NULL,
  data_geracao    timestamptz NOT NULL DEFAULT now(),
  parametros      jsonb,
  plano_sugerido  jsonb,
  plano_final     jsonb,
  total_sugerido  int,
  total_final     int,
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.plano_compra_historico ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow_all_authenticated" ON public.plano_compra_historico
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);
