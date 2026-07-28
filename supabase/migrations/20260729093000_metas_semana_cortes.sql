-- Cortes semanais EDITÁVEIS do mês comercial (Natan, 2026-07-28):
-- o sistema SUGERE as semanas (segunda→domingo dentro do período 21→20), mas o
-- gestor FINALIZA o corte manualmente. Quando há linhas aqui para (ano, mes),
-- a geração de metas semanais usa estes cortes em vez da sugestão automática.
-- Cortes são GLOBAIS (calendário comercial da rede), não por loja — os dias
-- úteis de cada corte continuam calculados por loja (calendário/exceções).

CREATE TABLE public.metas_semana_cortes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ano INTEGER NOT NULL,
  mes INTEGER NOT NULL,
  -- ordem do corte dentro do mês (1..n)
  ordem INTEGER NOT NULL,
  semana_inicio DATE NOT NULL,
  semana_fim DATE NOT NULL,
  atualizado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),

  UNIQUE (ano, mes, ordem),
  UNIQUE (ano, mes, semana_inicio),
  CHECK (semana_fim >= semana_inicio)
);

CREATE INDEX idx_metas_semana_cortes_ano_mes ON public.metas_semana_cortes(ano, mes);

ALTER TABLE public.metas_semana_cortes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read metas_semana_cortes"
  ON public.metas_semana_cortes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin gestor write metas_semana_cortes"
  ON public.metas_semana_cortes FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gestor'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gestor'));
CREATE POLICY "Service role full access metas_semana_cortes"
  ON public.metas_semana_cortes FOR ALL TO service_role USING (true) WITH CHECK (true);
