
-- Fix SECURITY DEFINER views: set to SECURITY INVOKER (default/safe)
ALTER VIEW public.sync_failures_summary SET (security_invoker = on);
ALTER VIEW public.sync_runs_recent SET (security_invoker = on);
