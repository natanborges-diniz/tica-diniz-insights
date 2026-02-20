
ALTER TABLE public.fornecedor_configuracao
  ADD COLUMN IF NOT EXISTS api_key_staging text,
  ADD COLUMN IF NOT EXISTS api_key_production text;

-- Migra o valor atual de api_key para ambos os campos como ponto de partida
UPDATE public.fornecedor_configuracao
SET
  api_key_staging = api_key,
  api_key_production = api_key
WHERE api_key IS NOT NULL;
