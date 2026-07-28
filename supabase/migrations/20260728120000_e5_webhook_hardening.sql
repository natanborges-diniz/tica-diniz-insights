-- E5 — Hardening de btg_webhook_events (SPEC_P1_CONCILIACAO_3VIAS.md §5.1)
-- Idempotência: eventos BTG que trazem id único no payload não duplicam.
CREATE UNIQUE INDEX IF NOT EXISTS uq_btg_webhook_events_payload_id
  ON public.btg_webhook_events ((payload->>'id'))
  WHERE payload->>'id' IS NOT NULL;

-- Diagnóstico do reprocessamento (btg-poll-status reprocessa processed=false)
ALTER TABLE public.btg_webhook_events
  ADD COLUMN IF NOT EXISTS erro TEXT,
  ADD COLUMN IF NOT EXISTS tentativas INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_btg_webhook_events_pendentes
  ON public.btg_webhook_events (created_at)
  WHERE processed = false;
