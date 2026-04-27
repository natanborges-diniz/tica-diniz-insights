ALTER TABLE public.adquirentes_config
  ADD COLUMN IF NOT EXISTS gv_optin_request_payload jsonb,
  ADD COLUMN IF NOT EXISTS gv_optin_response jsonb,
  ADD COLUMN IF NOT EXISTS gv_optin_external_id text;