-- Enable RLS on realtime.messages (Broadcast/Presence channel) and block non-service roles.
-- postgres_changes uses WAL publications and is NOT affected by this.
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "No broadcast for users" ON realtime.messages;
DROP POLICY IF EXISTS "Service role realtime full access" ON realtime.messages;

CREATE POLICY "No broadcast for users"
  ON realtime.messages
  FOR ALL
  TO authenticated, anon
  USING (false)
  WITH CHECK (false);

CREATE POLICY "Service role realtime full access"
  ON realtime.messages
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);