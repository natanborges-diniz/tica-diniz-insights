
ALTER TABLE public.adquirentes_config
  ADD COLUMN IF NOT EXISTS gv_optin_status text,
  ADD COLUMN IF NOT EXISTS gv_optin_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS gv_optin_reference text,
  ADD COLUMN IF NOT EXISTS gv_approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS gv_last_healthcheck_at timestamptz,
  ADD COLUMN IF NOT EXISTS gv_last_healthcheck_status text,
  ADD COLUMN IF NOT EXISTS gv_last_healthcheck_message text;
