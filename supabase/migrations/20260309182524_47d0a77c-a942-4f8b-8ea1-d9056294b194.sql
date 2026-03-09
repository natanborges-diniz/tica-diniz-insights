ALTER TABLE public.fornecedor_configuracao
  ADD COLUMN IF NOT EXISTS redirect_uri_staging TEXT,
  ADD COLUMN IF NOT EXISTS redirect_uri_production TEXT;