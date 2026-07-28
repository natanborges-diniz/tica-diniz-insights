CREATE UNIQUE INDEX IF NOT EXISTS extrato_regras_classificacao_padrao_tipo_uk
  ON public.extrato_regras_classificacao (padrao_descricao, tipo)
  WHERE cod_empresa IS NULL;

CREATE INDEX IF NOT EXISTS extrato_regras_classificacao_ativo_idx
  ON public.extrato_regras_classificacao (ativo, tipo, padrao_descricao);