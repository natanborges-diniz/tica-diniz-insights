
-- FASE 1.3: Audit columns for reprocessing
ALTER TABLE public.sync_runs
ADD COLUMN IF NOT EXISTS request_reason TEXT,
ADD COLUMN IF NOT EXISTS competencia TEXT; -- formato YYYY-MM
