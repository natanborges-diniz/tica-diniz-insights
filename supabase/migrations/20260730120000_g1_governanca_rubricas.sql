-- G1 — Governança de pagamentos (SPEC_P2_5_GOVERNANCA_PAGAMENTOS.md §2/§3)
-- Papéis analista/master, rubricas autorizadas e lastro nos lançamentos.

-- ─── 1. Papéis ───────────────────────────────────────────────
-- PG12+: ADD VALUE pode rodar em transação desde que o valor novo não seja
-- usado na mesma transação (aqui só criamos).
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'analista';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'master';

-- ─── 2. Rubricas autorizadas (lastro B) ──────────────────────
CREATE TABLE public.rubricas_autorizadas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cod_empresa INTEGER,                          -- NULL = todas as lojas
  descricao TEXT NOT NULL,
  favorecido_nome TEXT NOT NULL,
  favorecido_documento TEXT,                    -- CNPJ/CPF
  favorecido_chave TEXT,                        -- chave PIX ou conta — EXATA
  conta_numero TEXT NOT NULL,                   -- dre_plano_contas (natureza/categoria derivadas)
  periodicidade TEXT NOT NULL DEFAULT 'MENSAL', -- MENSAL | SEMANAL | ANUAL | AVULSA_RECORRENTE
  valor_esperado NUMERIC,
  tolerancia_pct NUMERIC NOT NULL DEFAULT 10,
  valor_teto NUMERIC NOT NULL,
  vigencia_inicio DATE NOT NULL DEFAULT current_date,
  vigencia_fim DATE,
  status TEXT NOT NULL DEFAULT 'RASCUNHO',      -- RASCUNHO | ATIVA | SUSPENSA
  criado_por UUID NOT NULL,
  aprovado_por UUID,
  aprovado_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Separação de funções: quem cria não aprova (vale para master também)
  CONSTRAINT chk_rubrica_criador_aprovador CHECK (aprovado_por IS NULL OR aprovado_por <> criado_por),
  CONSTRAINT chk_rubrica_status CHECK (status IN ('RASCUNHO','ATIVA','SUSPENSA')),
  CONSTRAINT chk_rubrica_teto CHECK (valor_teto > 0)
);

CREATE INDEX idx_rubricas_empresa_status ON public.rubricas_autorizadas (cod_empresa, status);
CREATE INDEX idx_rubricas_favorecido ON public.rubricas_autorizadas (favorecido_documento);

ALTER TABLE public.rubricas_autorizadas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access rubricas"
  ON public.rubricas_autorizadas FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- admin e master gerenciam; analista cria/edita rascunho (aprovação só via
-- edge function na G2, que valida papel master + criador<>aprovador)
CREATE POLICY "Admin master full rubricas"
  ON public.rubricas_autorizadas FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'master'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'master'::app_role));

CREATE POLICY "Authenticated read rubricas"
  ON public.rubricas_autorizadas FOR SELECT TO authenticated USING (true);

-- Segurança da rubrica: alterar favorecido_chave, favorecido_documento ou
-- valor_teto de rubrica ATIVA → volta a RASCUNHO e exige re-aprovação
-- (ataque clássico: trocar a chave PIX do aluguel).
CREATE OR REPLACE FUNCTION public.fn_rubrica_reaprovacao()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  NEW.updated_at := now();
  IF OLD.status = 'ATIVA' AND (
       NEW.favorecido_chave    IS DISTINCT FROM OLD.favorecido_chave
    OR NEW.favorecido_documento IS DISTINCT FROM OLD.favorecido_documento
    OR NEW.valor_teto           IS DISTINCT FROM OLD.valor_teto
  ) THEN
    NEW.status := 'RASCUNHO';
    NEW.aprovado_por := NULL;
    NEW.aprovado_em := NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_rubrica_reaprovacao
  BEFORE UPDATE ON public.rubricas_autorizadas
  FOR EACH ROW EXECUTE FUNCTION public.fn_rubrica_reaprovacao();

-- ─── 3. Lastro nos lançamentos ───────────────────────────────
ALTER TABLE public.lancamentos_financeiros
  ADD COLUMN IF NOT EXISTS lastro TEXT,          -- ERP | RUBRICA | EXCECAO | NF (P3)
  ADD COLUMN IF NOT EXISTS rubrica_id UUID REFERENCES public.rubricas_autorizadas(id),
  ADD COLUMN IF NOT EXISTS justificativa TEXT;   -- obrigatória p/ EXCECAO (validada na G2)

CREATE INDEX IF NOT EXISTS idx_lanc_lastro ON public.lancamentos_financeiros (cod_empresa, lastro)
  WHERE lastro IS NOT NULL;

-- Backfill: títulos vindos do ERP com chave dura têm lastro A por definição
UPDATE public.lancamentos_financeiros
SET lastro = 'ERP'
WHERE origem = 'ERP' AND erp_parcela_id IS NOT NULL AND lastro IS NULL;
