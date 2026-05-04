ALTER TABLE public.haytek_empresa_config
  ADD COLUMN IF NOT EXISTS api_key_production text,
  ADD COLUMN IF NOT EXISTS ambiente_override text
    CHECK (ambiente_override IN ('staging','production'));