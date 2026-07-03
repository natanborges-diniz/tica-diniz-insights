-- E1 — Conciliação 3 vias: fundação (docs/SPEC_P1_CONCILIACAO_3VIAS.md)
-- 1) Novas colunas em btg_extrato (dedup + estado de conciliação)
-- 2) Dedup heurístico do legado (duplicatas de reimportação → tabela de backup)
-- 3) dedupe_key determinística + índice único
-- 4) Tabela conciliacao_extrato (alocações N:1 extrato → alvo tipado)
-- 5) Tabela extrato_regras_classificacao + seeds de tarifas
-- 6) Backfill de status e alocações retroativas

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ─── 1. Novas colunas ────────────────────────────────────────
ALTER TABLE public.btg_extrato
  ADD COLUMN IF NOT EXISTS transaction_id TEXT,
  ADD COLUMN IF NOT EXISTS dedupe_key TEXT,
  ADD COLUMN IF NOT EXISTS status_conciliacao TEXT NOT NULL DEFAULT 'PENDENTE',
  ADD COLUMN IF NOT EXISTS metodo_conciliacao TEXT,
  ADD COLUMN IF NOT EXISTS conciliado_por UUID,
  ADD COLUMN IF NOT EXISTS conciliado_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS dados_extras JSONB NOT NULL DEFAULT '{}'::jsonb;

-- ─── 2. Dedup do legado ──────────────────────────────────────
-- Heurística: mesma (empresa, data, valor, tipo, descricao, saldo_apos) = reimportação.
-- Dois PIX legítimos idênticos no mesmo dia têm saldo_apos distinto e sobrevivem.
-- Duplicatas vão para backup (não são apagadas às cegas); vence a mais antiga,
-- preferindo a que já estava conciliada.
CREATE TABLE IF NOT EXISTS public.btg_extrato_dedup_backup
  (LIKE public.btg_extrato INCLUDING DEFAULTS);

ALTER TABLE public.btg_extrato_dedup_backup ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access btg_extrato_dedup_backup"
  ON public.btg_extrato_dedup_backup FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Admin read btg_extrato_dedup_backup"
  ON public.btg_extrato_dedup_backup FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

DO $$
DECLARE
  v_dups INTEGER;
  v_pendentes_revisao INTEGER;
BEGIN
  CREATE TEMP TABLE tmp_extrato_dups ON COMMIT DROP AS
  SELECT id FROM (
    SELECT id, row_number() OVER (
      PARTITION BY cod_empresa, data_lancamento, valor, tipo,
                   coalesce(descricao, ''), coalesce(saldo_apos::text, '')
      ORDER BY conciliado DESC, created_at ASC, id
    ) AS rn
    FROM public.btg_extrato
  ) r WHERE r.rn > 1;

  SELECT count(*) INTO v_dups FROM tmp_extrato_dups;

  INSERT INTO public.btg_extrato_dedup_backup
  SELECT e.* FROM public.btg_extrato e
  WHERE e.id IN (SELECT id FROM tmp_extrato_dups);

  DELETE FROM public.btg_extrato
  WHERE id IN (SELECT id FROM tmp_extrato_dups);

  RAISE NOTICE 'E1 dedup: % linhas duplicadas movidas para btg_extrato_dedup_backup', v_dups;

  -- Relatório (item 7.3 da spec): lançamentos auto-criados pelo conciliar_auto antigo
  SELECT count(*) INTO v_pendentes_revisao
  FROM public.lancamentos_financeiros
  WHERE origem = 'EXTRATO' AND requer_validacao = true;

  RAISE NOTICE 'E1 revisão pendente: % lancamentos_financeiros com origem=EXTRATO e requer_validacao=true (revisar manualmente, não tocados)', v_pendentes_revisao;
END $$;

-- ─── 3. dedupe_key determinística ────────────────────────────
-- Formato: sha256(cod_empresa|YYYY-MM-DD|valor 2 casas|tipo|descricao|n)
-- n = índice de ocorrência da mesma combinação no dia (0,1,2...).
-- DEVE espelhar exatamente o cálculo em supabase/functions/btg-extrato/index.ts.
WITH numbered AS (
  SELECT id,
    row_number() OVER (
      PARTITION BY cod_empresa, data_lancamento, valor, tipo, coalesce(descricao, '')
      ORDER BY created_at, id
    ) - 1 AS n
  FROM public.btg_extrato
)
UPDATE public.btg_extrato e
SET dedupe_key = encode(extensions.digest(
  e.cod_empresa::text || '|' ||
  to_char(e.data_lancamento, 'YYYY-MM-DD') || '|' ||
  to_char(e.valor, 'FM999999999990.00') || '|' ||
  e.tipo || '|' ||
  coalesce(e.descricao, '') || '|' ||
  numbered.n::text,
  'sha256'), 'hex')
FROM numbered
WHERE numbered.id = e.id AND e.dedupe_key IS NULL;

ALTER TABLE public.btg_extrato ALTER COLUMN dedupe_key SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_btg_extrato_dedupe
  ON public.btg_extrato (dedupe_key);

CREATE INDEX IF NOT EXISTS idx_btg_extrato_status
  ON public.btg_extrato (cod_empresa, status_conciliacao);

-- ─── 4. conciliacao_extrato ──────────────────────────────────
CREATE TABLE public.conciliacao_extrato (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cod_empresa INTEGER NOT NULL,
  extrato_id UUID NOT NULL REFERENCES public.btg_extrato(id) ON DELETE CASCADE,
  alvo_tipo TEXT NOT NULL,          -- LANCAMENTO | PAGAMENTO_BTG | COBRANCA_BTG | RECEBIVEL_CARTAO | TARIFA
  alvo_id UUID,                     -- NULL apenas para TARIFA criada por regra
  valor_alocado NUMERIC NOT NULL,
  metodo TEXT NOT NULL,             -- EXATO | TOLERANCIA | AGRUPADO | REGRA | MANUAL
  score NUMERIC,
  observacao TEXT,
  criado_por UUID,                  -- NULL = motor automático
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_conc_extrato_extrato ON public.conciliacao_extrato (extrato_id);
CREATE INDEX idx_conc_extrato_alvo ON public.conciliacao_extrato (alvo_tipo, alvo_id);
CREATE INDEX idx_conc_extrato_empresa ON public.conciliacao_extrato (cod_empresa);

ALTER TABLE public.conciliacao_extrato ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access conciliacao_extrato"
  ON public.conciliacao_extrato FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Admin full access conciliacao_extrato"
  ON public.conciliacao_extrato FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Tenant read conciliacao_extrato"
  ON public.conciliacao_extrato FOR SELECT
  USING (cod_empresa IN (
    SELECT uep.cod_empresa FROM user_empresa_permissions uep WHERE uep.user_id = auth.uid()
  ));

-- ─── 5. extrato_regras_classificacao ─────────────────────────
CREATE TABLE public.extrato_regras_classificacao (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cod_empresa INTEGER,              -- NULL = regra global
  padrao_descricao TEXT NOT NULL,   -- regex JS (case-insensitive), aplicada pelo motor conciliar-extrato em btg_extrato.descricao
  tipo TEXT NOT NULL,               -- CREDITO | DEBITO
  natureza TEXT NOT NULL,
  categoria TEXT,
  auto_conciliar BOOLEAN NOT NULL DEFAULT true,
  valor_max NUMERIC,                -- regra só aplica até este valor (NULL = sem teto)
  ativo BOOLEAN NOT NULL DEFAULT true,
  criado_por UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.extrato_regras_classificacao ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access extrato_regras"
  ON public.extrato_regras_classificacao FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Admin full access extrato_regras"
  ON public.extrato_regras_classificacao FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Authenticated read extrato_regras"
  ON public.extrato_regras_classificacao FOR SELECT
  TO authenticated USING (true);

INSERT INTO public.extrato_regras_classificacao
  (cod_empresa, padrao_descricao, tipo, natureza, categoria, auto_conciliar, valor_max)
VALUES
  (NULL, 'TARIFA|TAR\.|MANUTENCAO CONTA|MANUTENÇÃO CONTA', 'DEBITO', 'DESPESAS_FINANCEIRAS', 'TARIFA_BANCARIA', true, 500),
  (NULL, '\bIOF\b',                                        'DEBITO', 'DESPESAS_FINANCEIRAS', 'TARIFA_BANCARIA', true, 500),
  (NULL, '\bJUROS\b',                                      'DEBITO', 'DESPESAS_FINANCEIRAS', 'JUROS',           true, 500);

-- ─── 6. Backfill de status e alocações retroativas ───────────
-- Linhas conciliadas no fluxo antigo (checkbox) viram CONCILIADO_MANUAL.
UPDATE public.btg_extrato
SET status_conciliacao = 'CONCILIADO_MANUAL',
    metodo_conciliacao = 'MANUAL'
WHERE conciliado = true;

-- Quem tinha referencia_id apontando para um lançamento ganha alocação retroativa.
INSERT INTO public.conciliacao_extrato
  (cod_empresa, extrato_id, alvo_tipo, alvo_id, valor_alocado, metodo, observacao)
SELECT e.cod_empresa, e.id, 'LANCAMENTO', e.referencia_id, e.valor, 'MANUAL',
       'Backfill E1 — conciliação legada'
FROM public.btg_extrato e
WHERE e.conciliado = true
  AND e.referencia_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM public.lancamentos_financeiros l WHERE l.id = e.referencia_id);

-- Conciliado sem referência resolvível: marca a origem para auditoria futura.
UPDATE public.btg_extrato e
SET dados_extras = e.dados_extras || '{"backfill_e1": "legado_sem_referencia"}'::jsonb
WHERE e.conciliado = true
  AND NOT EXISTS (SELECT 1 FROM public.conciliacao_extrato c WHERE c.extrato_id = e.id);
