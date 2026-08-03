-- Valor esperado da rubrica passa a ser média móvel dos últimos 6 pagamentos.
--
-- O valor fixo envelhece: aluguel reajusta, energia oscila com a estação, e a
-- faixa de tolerância vai ficando mentirosa até tudo cair na Mesa como desvio.
-- A rotina mensal recalcula a partir do que foi EFETIVAMENTE PAGO (nunca do
-- previsto, que é justamente o número sob suspeita) e guarda aqui a memória do
-- cálculo, para o admin saber de onde veio o número.
ALTER TABLE public.rubricas_autorizadas
  ADD COLUMN IF NOT EXISTS dados_media JSONB;

COMMENT ON COLUMN public.rubricas_autorizadas.dados_media IS
  'Memoria do ultimo recalculo do valor_esperado: {calculado_em, amostras, periodo, anterior}. Media dos ultimos 6 pagamentos efetivos; minimo de 3 amostras.';

NOTIFY pgrst, 'reload schema';
