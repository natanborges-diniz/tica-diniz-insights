-- Fase 4 — Fechamento semanal de comissões p/ RH
-- (docs/REVISAO_VENDAS_METAS.md §5.4 item 3 e §5.5).
-- Snapshot IMUTÁVEL: ao fechar a semana, taxas/prêmios/valores aplicados são
-- congelados aqui (mudanças futuras de configuração não alteram fechamentos).
-- Reabertura só admin, com log (reaberto_por/reaberto_em + status REABERTO).

CREATE TABLE public.fechamentos_comissao (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cod_empresa INTEGER NOT NULL,
  nome_empresa TEXT,
  ano INTEGER NOT NULL,
  mes INTEGER NOT NULL,
  semana_inicio DATE NOT NULL,
  semana_fim DATE NOT NULL,
  -- RECEBIDO (regime de caixa, padrão) | EMITIDO (escolha do gestor no ato)
  modo TEXT NOT NULL CHECK (modo IN ('RECEBIDO', 'EMITIDO')),
  status TEXT NOT NULL DEFAULT 'FECHADO' CHECK (status IN ('FECHADO', 'REABERTO')),

  -- congelados no ato do fechamento
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

  -- um fechamento vigente por loja × semana
  UNIQUE (cod_empresa, semana_inicio)
);

CREATE INDEX idx_fechamentos_semana ON public.fechamentos_comissao(semana_inicio);
CREATE INDEX idx_fechamentos_empresa ON public.fechamentos_comissao(cod_empresa, semana_inicio);

CREATE TABLE public.fechamentos_comissao_itens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fechamento_id UUID NOT NULL REFERENCES public.fechamentos_comissao(id) ON DELETE CASCADE,
  cod_vendedor INTEGER NOT NULL,
  vendedor_nome TEXT,

  meta_semana NUMERIC(14,2) NOT NULL DEFAULT 0,
  percentual_meta NUMERIC(8,2) NOT NULL DEFAULT 0,

  -- resumo por categoria de pagamento e por origem (camada a do relatório)
  base_por_categoria JSONB NOT NULL DEFAULT '{}'::jsonb,
  base_por_origem JSONB NOT NULL DEFAULT '{}'::jsonb,
  base_total NUMERIC(14,2) NOT NULL DEFAULT 0,
  restituicoes NUMERIC(14,2) NOT NULL DEFAULT 0,

  comissao NUMERIC(14,2) NOT NULL DEFAULT 0,
  premio_faixa JSONB,
  premio_sequencia JSONB,
  premio_valor NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_pagar NUMERIC(14,2) NOT NULL DEFAULT 0,

  -- camada b: linha a linha por OS/venda (numero, emissao, forma, valor,
  -- origem, comissao da linha) — congelado
  detalhe JSONB NOT NULL DEFAULT '[]'::jsonb,

  UNIQUE (fechamento_id, cod_vendedor)
);

CREATE INDEX idx_fechamentos_itens_fech ON public.fechamentos_comissao_itens(fechamento_id);

-- RLS: leitura admin/gestor; escrita admin/gestor (fechar) — a imutabilidade é
-- garantida pela aplicação (update só muda status via reabertura, admin);
-- service role p/ API de integração.
ALTER TABLE public.fechamentos_comissao ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fechamentos_comissao_itens ENABLE ROW LEVEL SECURITY;

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
