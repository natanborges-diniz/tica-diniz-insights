CREATE TABLE public.metas_semanais (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo TEXT NOT NULL CHECK (tipo IN ('LOJA', 'VENDEDOR', 'GERENTE', 'SUPERVISOR')),
  cod_referencia INTEGER NOT NULL,
  nome_referencia TEXT,
  cod_empresa INTEGER,
  ano INTEGER NOT NULL,
  mes INTEGER NOT NULL,
  semana_inicio DATE NOT NULL,
  semana_fim DATE NOT NULL,
  meta_valor NUMERIC(14,2) NOT NULL DEFAULT 0,
  dias_uteis INTEGER NOT NULL DEFAULT 0,
  origem TEXT NOT NULL DEFAULT 'AUTO' CHECK (origem IN ('AUTO', 'AJUSTADA')),
  atualizado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (tipo, cod_referencia, semana_inicio)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.metas_semanais TO authenticated;
GRANT ALL ON public.metas_semanais TO service_role;

CREATE INDEX idx_metas_semanais_semana ON public.metas_semanais(semana_inicio);
CREATE INDEX idx_metas_semanais_empresa_semana ON public.metas_semanais(cod_empresa, semana_inicio);
CREATE INDEX idx_metas_semanais_ano_mes ON public.metas_semanais(ano, mes);

CREATE TABLE public.divisao_semanal (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cod_empresa INTEGER NOT NULL,
  semana_inicio DATE NOT NULL,
  percentual_divisao NUMERIC(6,2) NOT NULL DEFAULT 100,
  num_vendedores INTEGER NOT NULL DEFAULT 1 CHECK (num_vendedores >= 1),
  atualizado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (cod_empresa, semana_inicio)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.divisao_semanal TO authenticated;
GRANT ALL ON public.divisao_semanal TO service_role;
CREATE INDEX idx_divisao_semanal_semana ON public.divisao_semanal(semana_inicio);

CREATE TABLE public.grupos_lojas (
  cod_grupo SERIAL PRIMARY KEY,
  nome TEXT NOT NULL,
  atualizado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.grupos_lojas TO authenticated;
GRANT ALL ON public.grupos_lojas TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.grupos_lojas_cod_grupo_seq TO authenticated;

CREATE TABLE public.grupos_lojas_membros (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cod_grupo INTEGER NOT NULL REFERENCES public.grupos_lojas(cod_grupo) ON DELETE CASCADE,
  cod_empresa INTEGER NOT NULL,
  UNIQUE (cod_grupo, cod_empresa)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.grupos_lojas_membros TO authenticated;
GRANT ALL ON public.grupos_lojas_membros TO service_role;

CREATE TABLE public.comissao_taxas (
  forma_categoria TEXT PRIMARY KEY,
  percentual NUMERIC(6,3) NOT NULL DEFAULT 0,
  atualizado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.comissao_taxas TO authenticated;
GRANT ALL ON public.comissao_taxas TO service_role;

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

CREATE TABLE public.premios_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo TEXT NOT NULL CHECK (tipo IN ('FAIXA', 'SEQUENCIA')),
  percentual_meta_min NUMERIC(6,2),
  percentual_premio NUMERIC(6,3) NOT NULL DEFAULT 0,
  semanas_consecutivas INTEGER,
  ativo BOOLEAN NOT NULL DEFAULT false,
  atualizado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.premios_config TO authenticated;
GRANT ALL ON public.premios_config TO service_role;

INSERT INTO public.premios_config (tipo, percentual_meta_min, percentual_premio, semanas_consecutivas, ativo) VALUES
  ('FAIXA', 100, 0.5, NULL, false),
  ('FAIXA', 110, 1.0, NULL, false),
  ('SEQUENCIA', NULL, 1.0, 4, false);

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