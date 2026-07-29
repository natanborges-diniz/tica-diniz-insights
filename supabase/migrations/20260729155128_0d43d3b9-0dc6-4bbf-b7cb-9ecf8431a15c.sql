-- 20260729120000_fechamentos_comissao.sql
INSERT INTO public.comissao_taxas (forma_categoria, percentual)
VALUES ('EMITIDO', 0)
ON CONFLICT (forma_categoria) DO NOTHING;

CREATE TABLE public.fechamentos_comissao (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cod_empresa INTEGER NOT NULL,
  nome_empresa TEXT,
  ano INTEGER NOT NULL,
  mes INTEGER NOT NULL,
  semana_inicio DATE NOT NULL,
  semana_fim DATE NOT NULL,
  modo TEXT NOT NULL CHECK (modo IN ('RECEBIDO', 'EMITIDO')),
  status TEXT NOT NULL DEFAULT 'FECHADO' CHECK (status IN ('FECHADO', 'REABERTO')),
  taxas_aplicadas JSONB NOT NULL DEFAULT '{}'::jsonb,
  premios_aplicados JSONB NOT NULL DEFAULT '[]'::jsonb,
  total_base NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_restituicoes NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_comissao NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_premio NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_pagar NUMERIC(14,2) NOT NULL DEFAULT 0,
  criado_por UUID,
  criado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  reaberto_por UUID,
  reaberto_em TIMESTAMP WITH TIME ZONE,
  UNIQUE (cod_empresa, semana_inicio)
);

CREATE INDEX idx_fechamentos_semana ON public.fechamentos_comissao(semana_inicio);
CREATE INDEX idx_fechamentos_empresa ON public.fechamentos_comissao(cod_empresa, semana_inicio);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fechamentos_comissao TO authenticated;
GRANT ALL ON public.fechamentos_comissao TO service_role;

ALTER TABLE public.fechamentos_comissao ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin gestor read fechamentos"
  ON public.fechamentos_comissao FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gestor'));
CREATE POLICY "Admin gestor insert fechamentos"
  ON public.fechamentos_comissao FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gestor'));
CREATE POLICY "Admin update fechamentos"
  ON public.fechamentos_comissao FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin delete fechamentos"
  ON public.fechamentos_comissao FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Service role full access fechamentos"
  ON public.fechamentos_comissao FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE public.fechamentos_comissao_itens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fechamento_id UUID NOT NULL REFERENCES public.fechamentos_comissao(id) ON DELETE CASCADE,
  cod_vendedor INTEGER NOT NULL,
  vendedor_nome TEXT,
  meta_semana NUMERIC(14,2) NOT NULL DEFAULT 0,
  percentual_meta NUMERIC(8,2) NOT NULL DEFAULT 0,
  base_por_categoria JSONB NOT NULL DEFAULT '{}'::jsonb,
  base_por_origem JSONB NOT NULL DEFAULT '{}'::jsonb,
  base_total NUMERIC(14,2) NOT NULL DEFAULT 0,
  restituicoes NUMERIC(14,2) NOT NULL DEFAULT 0,
  comissao NUMERIC(14,2) NOT NULL DEFAULT 0,
  premio_faixa JSONB,
  premio_sequencia JSONB,
  premio_valor NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_pagar NUMERIC(14,2) NOT NULL DEFAULT 0,
  detalhe JSONB NOT NULL DEFAULT '[]'::jsonb,
  UNIQUE (fechamento_id, cod_vendedor)
);

CREATE INDEX idx_fechamentos_itens_fech ON public.fechamentos_comissao_itens(fechamento_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fechamentos_comissao_itens TO authenticated;
GRANT ALL ON public.fechamentos_comissao_itens TO service_role;

ALTER TABLE public.fechamentos_comissao_itens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin gestor read fechamentos_itens"
  ON public.fechamentos_comissao_itens FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gestor'));
CREATE POLICY "Admin gestor insert fechamentos_itens"
  ON public.fechamentos_comissao_itens FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gestor'));
CREATE POLICY "Admin delete fechamentos_itens"
  ON public.fechamentos_comissao_itens FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Service role full access fechamentos_itens"
  ON public.fechamentos_comissao_itens FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 20260729130000_premios_valor_fixo.sql
ALTER TABLE public.premios_config
  ADD COLUMN IF NOT EXISTS tipo_valor TEXT NOT NULL DEFAULT 'PERCENTUAL'
    CHECK (tipo_valor IN ('PERCENTUAL', 'FIXO')),
  ADD COLUMN IF NOT EXISTS valor_fixo NUMERIC(14,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.premios_config.tipo_valor IS
  'PERCENTUAL = percentual_premio % sobre a base da semana; FIXO = valor_fixo em R$';