ALTER TABLE public.borderos
  ADD COLUMN IF NOT EXISTS pendencia_dispensada_em timestamptz,
  ADD COLUMN IF NOT EXISTS pendencia_dispensada_por uuid,
  ADD COLUMN IF NOT EXISTS pendencia_dispensada_status text,
  ADD COLUMN IF NOT EXISTS pendencia_dispensada_motivo text;