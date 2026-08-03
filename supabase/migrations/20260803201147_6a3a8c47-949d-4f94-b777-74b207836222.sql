ALTER TABLE public.rubricas_autorizadas
  ADD COLUMN IF NOT EXISTS dados_media JSONB;

COMMENT ON COLUMN public.rubricas_autorizadas.dados_media IS
  'Memoria do ultimo recalculo do valor_esperado: {calculado_em, amostras, periodo, anterior}. Media dos ultimos 6 pagamentos efetivos; minimo de 3 amostras.';

NOTIFY pgrst, 'reload schema';