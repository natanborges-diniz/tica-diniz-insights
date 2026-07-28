-- Fase 2 — Metas semanais (docs/REVISAO_VENDAS_METAS.md §5.2/§5.3, decisões §7)
-- Meta primária = LOJA (mensal, metas_vendas). Semanas geradas por dias úteis;
-- vendedor derivado por divisao_semanal; gerente = total loja; supervisor =
-- grupo de lojas. Taxas de comissão e prêmios são CONFIGURAÇÃO (master),
-- nunca hardcoded no código.

-- ============================================================
-- metas_semanais — metas por semana comercial (segunda-feira)
-- ============================================================
CREATE TABLE public.metas_semanais (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- LOJA | VENDEDOR | GERENTE | SUPERVISOR
  tipo TEXT NOT NULL CHECK (tipo IN ('LOJA', 'VENDEDOR', 'GERENTE', 'SUPERVISOR')),
  -- LOJA/GERENTE: cod_empresa · VENDEDOR: cod_vendedor real (PESSOA) ·
  -- SUPERVISOR: cod_grupo de grupos_lojas
  cod_referencia INTEGER NOT NULL,
  nome_referencia TEXT,
  -- p/ VENDEDOR e GERENTE, a loja de contexto (facilita filtros); LOJA = igual
  -- a cod_referencia; SUPERVISOR = NULL
  cod_empresa INTEGER,
  ano INTEGER NOT NULL,
  mes INTEGER NOT NULL,
  -- segunda-feira da semana comercial
  semana_inicio DATE NOT NULL,
  semana_fim DATE NOT NULL,
  meta_valor NUMERIC(14,2) NOT NULL DEFAULT 0,
  dias_uteis INTEGER NOT NULL DEFAULT 0,
  -- AUTO = gerada; AJUSTADA = editada manualmente (preservada em regeração)
  origem TEXT NOT NULL DEFAULT 'AUTO' CHECK (origem IN ('AUTO', 'AJUSTADA')),
  atualizado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),

  UNIQUE (tipo, cod_referencia, semana_inicio)
);

CREATE INDEX idx_metas_semanais_semana ON public.metas_semanais(semana_inicio);
CREATE INDEX idx_metas_semanais_empresa_semana
  ON public.metas_semanais(cod_empresa, semana_inicio);
CREATE INDEX idx_metas_semanais_ano_mes ON public.metas_semanais(ano, mes);

-- ============================================================
-- divisao_semanal — parâmetros de derivação vendedor por (loja, semana)
-- meta_vendedor = meta_loja(semana) × percentual_divisao/100 ÷ num_vendedores
-- ============================================================
CREATE TABLE public.divisao_semanal (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cod_empresa INTEGER NOT NULL,
  semana_inicio DATE NOT NULL,
  -- fração da meta da loja distribuída aos vendedores (%)
  percentual_divisao NUMERIC(6,2) NOT NULL DEFAULT 100,
  num_vendedores INTEGER NOT NULL DEFAULT 1 CHECK (num_vendedores >= 1),
  atualizado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),

  UNIQUE (cod_empresa, semana_inicio)
);

CREATE INDEX idx_divisao_semanal_semana ON public.divisao_semanal(semana_inicio);

-- ============================================================
-- grupos_lojas — grupos para metas/visão de supervisor
-- ============================================================
CREATE TABLE public.grupos_lojas (
  cod_grupo SERIAL PRIMARY KEY,
  nome TEXT NOT NULL,
  atualizado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE public.grupos_lojas_membros (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cod_grupo INTEGER NOT NULL REFERENCES public.grupos_lojas(cod_grupo) ON DELETE CASCADE,
  cod_empresa INTEGER NOT NULL,
  UNIQUE (cod_grupo, cod_empresa)
);

-- ============================================================
-- comissao_taxas — % por categoria de pagamento (config do MASTER)
-- Seeds = regra vigente 2026-07-28 (Natan); mapeamento de categorias validado
-- contra o banco real (recebimentos_detalhe.sql).
-- ============================================================
CREATE TABLE public.comissao_taxas (
  forma_categoria TEXT PRIMARY KEY,
  percentual NUMERIC(6,3) NOT NULL DEFAULT 0,
  atualizado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

INSERT INTO public.comissao_taxas (forma_categoria, percentual) VALUES
  ('CARTAO_CREDITO', 2),
  ('AVISTA',         3),
  ('PIX',            3),
  ('CARTAO_DEBITO',  3),
  ('CHEQUE',         1),
  ('CREDIARIO',      1),
  ('CONVENIO',       1),
  ('CREDITOS',       0),
  ('OUTROS',         0);

-- ============================================================
-- premios_config — faixas de prêmio por atingimento + sequência (MASTER)
-- tipo FAIXA: atingiu >= percentual_meta_min → prêmio percentual_premio
-- tipo SEQUENCIA: semanas_consecutivas atingidas no mês → prêmio extra
-- Exemplos entram DESATIVADOS (ativo = false) até o master configurar.
-- ============================================================
CREATE TABLE public.premios_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo TEXT NOT NULL CHECK (tipo IN ('FAIXA', 'SEQUENCIA')),
  percentual_meta_min NUMERIC(6,2),
  percentual_premio NUMERIC(6,3) NOT NULL DEFAULT 0,
  semanas_consecutivas INTEGER,
  ativo BOOLEAN NOT NULL DEFAULT false,
  atualizado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

INSERT INTO public.premios_config (tipo, percentual_meta_min, percentual_premio, semanas_consecutivas, ativo) VALUES
  ('FAIXA', 100, 0.5, NULL, false),
  ('FAIXA', 110, 1.0, NULL, false),
  ('SEQUENCIA', NULL, 1.0, 4, false);

-- ============================================================
-- RLS — leitura autenticada; escrita: metas/divisão/grupos = admin|gestor;
-- taxas e prêmios = SÓ admin (master). Service role sempre liberado.
-- Mesmo padrão da metas_vendas (migration 20260212164408).
-- ============================================================
ALTER TABLE public.metas_semanais ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.divisao_semanal ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grupos_lojas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grupos_lojas_membros ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comissao_taxas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.premios_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read metas_semanais"
  ON public.metas_semanais FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin gestor write metas_semanais"
  ON public.metas_semanais FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gestor'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gestor'));
CREATE POLICY "Service role full access metas_semanais"
  ON public.metas_semanais FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated read divisao_semanal"
  ON public.divisao_semanal FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin gestor write divisao_semanal"
  ON public.divisao_semanal FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gestor'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gestor'));
CREATE POLICY "Service role full access divisao_semanal"
  ON public.divisao_semanal FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated read grupos_lojas"
  ON public.grupos_lojas FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin gestor write grupos_lojas"
  ON public.grupos_lojas FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gestor'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gestor'));
CREATE POLICY "Service role full access grupos_lojas"
  ON public.grupos_lojas FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated read grupos_lojas_membros"
  ON public.grupos_lojas_membros FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin gestor write grupos_lojas_membros"
  ON public.grupos_lojas_membros FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gestor'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gestor'));
CREATE POLICY "Service role full access grupos_lojas_membros"
  ON public.grupos_lojas_membros FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Taxas e prêmios: escrita EXCLUSIVA do master (admin)
CREATE POLICY "Authenticated read comissao_taxas"
  ON public.comissao_taxas FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin write comissao_taxas"
  ON public.comissao_taxas FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Service role full access comissao_taxas"
  ON public.comissao_taxas FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated read premios_config"
  ON public.premios_config FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin write premios_config"
  ON public.premios_config FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Service role full access premios_config"
  ON public.premios_config FOR ALL TO service_role USING (true) WITH CHECK (true);
