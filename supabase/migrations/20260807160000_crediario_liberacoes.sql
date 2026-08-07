-- Crediário Loja (SPEC_CREDIARIO_LOJA.md) — triangulação:
-- financeiro LIBERA o CPF (valores/parcelas travados) → a LOJA só DISPARA a
-- emissão → boletos saem no BTG exatamente como aprovados → retorno na tela.

CREATE TABLE IF NOT EXISTS public.crediario_liberacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cod_empresa INTEGER NOT NULL,             -- loja que pode disparar
  cpf TEXT NOT NULL,                        -- 11 dígitos (sanitizado)
  cliente_nome TEXT NOT NULL,
  valor_total NUMERIC NOT NULL CHECK (valor_total > 0),
  parcelas INTEGER NOT NULL CHECK (parcelas BETWEEN 1 AND 36),
  valor_parcela NUMERIC NOT NULL CHECK (valor_parcela > 0),
  primeiro_vencimento DATE NOT NULL,
  validade DATE,                            -- liberação expira (NULL = não expira)
  status TEXT NOT NULL DEFAULT 'LIBERADO',  -- LIBERADO | BOLETOS_EMITIDOS | BOLETOS_PARCIAL | CANCELADO
  observacao TEXT,
  imprimir BOOLEAN NOT NULL DEFAULT false,  -- financeiro marca necessidade de impressão
  impresso_em TIMESTAMPTZ,
  liberado_por UUID NOT NULL,               -- financeiro/admin que aprovou a consulta
  disparado_por UUID,                       -- usuário da loja que disparou
  disparado_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crediario_lib_empresa_status
  ON public.crediario_liberacoes (cod_empresa, status);
CREATE INDEX IF NOT EXISTS idx_crediario_lib_cpf
  ON public.crediario_liberacoes (cpf);

-- Boleto emitido aponta para a liberação que o originou
ALTER TABLE public.btg_cobrancas
  ADD COLUMN IF NOT EXISTS liberacao_id UUID,
  ADD COLUMN IF NOT EXISTS parcela_numero INTEGER;
CREATE INDEX IF NOT EXISTS idx_btg_cobrancas_liberacao
  ON public.btg_cobrancas (liberacao_id);

ALTER TABLE public.crediario_liberacoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full crediario"
  ON public.crediario_liberacoes FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Admin (financeiro) gerencia tudo
CREATE POLICY "Admin full crediario"
  ON public.crediario_liberacoes FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Loja LÊ as liberações das empresas onde tem permissão.
-- Escrita da loja NÃO existe via tabela: o disparo passa pela edge function
-- (service role), que valida status/validade e emite com os valores travados.
CREATE POLICY "Loja le crediario da sua empresa"
  ON public.crediario_liberacoes FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.user_empresa_permissions uep
      WHERE uep.user_id = auth.uid()
        AND uep.cod_empresa = crediario_liberacoes.cod_empresa
    )
  );

-- Loja também precisa VER os boletos emitidos da sua empresa
DROP POLICY IF EXISTS "Admin full access btg_cobrancas" ON public.btg_cobrancas;
CREATE POLICY "Admin full access btg_cobrancas"
  ON public.btg_cobrancas FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Loja le cobrancas da sua empresa"
  ON public.btg_cobrancas FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_empresa_permissions uep
      WHERE uep.user_id = auth.uid()
        AND uep.cod_empresa = btg_cobrancas.cod_empresa
    )
  );

NOTIFY pgrst, 'reload schema';
