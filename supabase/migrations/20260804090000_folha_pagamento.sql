-- Módulo de Folha de Pagamento.
--
-- Desenho, e o porquê de cada escolha:
--
-- 1. COMPETÊNCIA + EVENTO como unidade. A API do BTG define o tipo de pagamento
--    no LOTE, não no item (2=salário, 9=férias, 11=rescisão, 24=comissão...).
--    Logo, "salário de agosto" e "férias de agosto" são remessas distintas por
--    imposição do banco — e a tabela reflete isso em vez de brigar com ele.
--
-- 2. ITENS ABERTOS no contas a pagar. Cada colaborador vira um lançamento
--    visível, como um fornecedor. Foi decisão da casa; o padrão de mercado
--    segrega por sigilo salarial, e se um dia isso mudar o caminho é somar RLS
--    em folha_itens e consolidar os lançamentos — a estrutura já permite.
--
-- 3. ENCARGOS como títulos próprios. INSS, FGTS e IRRF têm vencimento e conta
--    de DRE diferentes do líquido. Gerá-los no fechamento faz o custo real do
--    mês aparecer no DRE mesmo antes de a guia ser emitida.
--
-- 4. O líquido NÃO exige conta BTG: o item do lote aceita banco/agência/conta
--    de qualquer instituição.

-- ── Competência: um evento de folha de uma loja num mês ──
CREATE TABLE IF NOT EXISTS public.folha_competencias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cod_empresa INTEGER NOT NULL,
  competencia TEXT NOT NULL,                 -- 'YYYY-MM'
  evento TEXT NOT NULL,                      -- SALARIO | ADIANTAMENTO | FERIAS | DECIMO_TERCEIRO | RESCISAO | PLR | COMISSAO | PROLABORE | BOLSA_ESTAGIO | BENEFICIO | REEMBOLSO | PREMIO
  descricao TEXT,
  data_pagamento DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'RASCUNHO',   -- RASCUNHO | FECHADA | ENVIADA | PROCESSADA | CANCELADA
  rubrica_id UUID REFERENCES public.rubricas_autorizadas(id),

  qtd_colaboradores INTEGER NOT NULL DEFAULT 0,
  total_bruto NUMERIC NOT NULL DEFAULT 0,
  total_descontos NUMERIC NOT NULL DEFAULT 0,
  total_liquido NUMERIC NOT NULL DEFAULT 0,

  btg_request_id TEXT,
  btg_payment_id TEXT,
  btg_status TEXT,

  criado_por UUID,
  fechado_por UUID,
  fechado_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Uma folha por (loja, competência, evento). Reimportar corrige, não duplica.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_folha_competencia
  ON public.folha_competencias (cod_empresa, competencia, evento)
  WHERE status <> 'CANCELADA';

-- ── Itens: uma linha por colaborador ──
CREATE TABLE IF NOT EXISTS public.folha_itens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  competencia_id UUID NOT NULL REFERENCES public.folha_competencias(id) ON DELETE CASCADE,

  nome TEXT NOT NULL,
  cpf TEXT NOT NULL,
  matricula TEXT,

  banco TEXT,
  agencia TEXT,
  conta TEXT,
  tipo_conta TEXT DEFAULT 'CC',              -- CC | PG | PP
  chave_pix TEXT,

  valor_bruto NUMERIC NOT NULL DEFAULT 0,
  descontos NUMERIC NOT NULL DEFAULT 0,
  valor_liquido NUMERIC NOT NULL,

  -- Lançamento gerado no contas a pagar (preenchido no fechamento).
  lancamento_id UUID REFERENCES public.lancamentos_financeiros(id) ON DELETE SET NULL,
  observacao TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_folha_itens_competencia ON public.folha_itens (competencia_id);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_folha_item_cpf ON public.folha_itens (competencia_id, cpf);

-- ── Encargos: INSS, FGTS, IRRF e outros ──
CREATE TABLE IF NOT EXISTS public.folha_encargos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  competencia_id UUID NOT NULL REFERENCES public.folha_competencias(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL,                        -- INSS | FGTS | IRRF | OUTRO
  descricao TEXT,
  valor NUMERIC NOT NULL,
  data_vencimento DATE NOT NULL,
  conta_numero TEXT,                         -- conta do DRE
  lancamento_id UUID REFERENCES public.lancamentos_financeiros(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_folha_encargos_competencia ON public.folha_encargos (competencia_id);

-- ── Borderô passa a distinguir folha de pagamento comum ──
--
-- Não é firula: o lote de folha vai para outro endpoint, com outro escopo, e
-- carrega o tipo de pagamento no cabeçalho. Misturar boleto e salário na mesma
-- remessa é impossível do lado do banco.
ALTER TABLE public.borderos ADD COLUMN IF NOT EXISTS tipo TEXT NOT NULL DEFAULT 'PAGAMENTOS';
ALTER TABLE public.borderos DROP CONSTRAINT IF EXISTS borderos_tipo_check;
ALTER TABLE public.borderos ADD CONSTRAINT borderos_tipo_check CHECK (tipo IN ('PAGAMENTOS', 'FOLHA'));
ALTER TABLE public.borderos ADD COLUMN IF NOT EXISTS folha_competencia_id UUID REFERENCES public.folha_competencias(id);

COMMENT ON COLUMN public.borderos.tipo IS
  'PAGAMENTOS: /banking/payments (boleto, pix, ted). FOLHA: /banking/payroll/payments, com paymentType no lote.';

-- ── Rubrica declara o evento de folha que representa ──
-- Assim "Salários", "Comissões" e "Pró-labore" continuam sendo rubricas
-- autorizadas, com favorecido, teto e conta de DRE, e passam a saber em que
-- tipo de lote do BTG entram.
ALTER TABLE public.rubricas_autorizadas ADD COLUMN IF NOT EXISTS folha_evento TEXT;

COMMENT ON COLUMN public.rubricas_autorizadas.folha_evento IS
  'Quando preenchida, a rubrica representa um evento de folha (SALARIO, FERIAS, COMISSAO...) e define o paymentType do lote no BTG.';

-- ── RLS: mesmo padrão das demais tabelas financeiras ──
ALTER TABLE public.folha_competencias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.folha_itens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.folha_encargos ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['folha_competencias', 'folha_itens', 'folha_encargos'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Auth read %1$s" ON public.%1$s', t);
    EXECUTE format(
      'CREATE POLICY "Auth read %1$s" ON public.%1$s FOR SELECT USING (auth.uid() IS NOT NULL)', t);

    EXECUTE format('DROP POLICY IF EXISTS "Admin write %1$s" ON public.%1$s', t);
    EXECUTE format(
      'CREATE POLICY "Admin write %1$s" ON public.%1$s FOR ALL '
      'USING (has_role(auth.uid(), ''admin''::app_role)) '
      'WITH CHECK (has_role(auth.uid(), ''admin''::app_role))', t);

    EXECUTE format('DROP POLICY IF EXISTS "Service role %1$s" ON public.%1$s', t);
    EXECUTE format(
      'CREATE POLICY "Service role %1$s" ON public.%1$s FOR ALL USING (true) WITH CHECK (true)', t);
  END LOOP;
END $$;

DROP TRIGGER IF EXISTS set_updated_at_folha_competencias ON public.folha_competencias;
CREATE TRIGGER set_updated_at_folha_competencias
  BEFORE UPDATE ON public.folha_competencias
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

NOTIFY pgrst, 'reload schema';
