ALTER TABLE public.estoque_sincronizado
  ADD COLUMN IF NOT EXISTS preco_venda NUMERIC,
  ADD COLUMN IF NOT EXISTS dias_giro_medio NUMERIC,
  ADD COLUMN IF NOT EXISTS dias_giro_mediano NUMERIC,
  ADD COLUMN IF NOT EXISTS dias_giro_ultima_peca NUMERIC,
  ADD COLUMN IF NOT EXISTS pecas_giro_consideradas INTEGER;