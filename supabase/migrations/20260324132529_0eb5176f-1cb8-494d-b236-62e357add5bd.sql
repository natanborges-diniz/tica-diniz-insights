ALTER TABLE public.adquirentes_config 
  ADD COLUMN IF NOT EXISTS merchant_id_production text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS integration_key_production text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS pv_matriz_production text DEFAULT NULL;