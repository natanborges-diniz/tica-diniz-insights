
-- F4.3: Cache table for Hoya product catalog with 24h TTL
CREATE TABLE public.hoya_catalogo_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  data JSONB NOT NULL,
  hoya_environment TEXT NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '24 hours'),
  produto_count INTEGER DEFAULT 0
);

-- Only one active cache per environment
CREATE UNIQUE INDEX idx_hoya_cache_env ON public.hoya_catalogo_cache(hoya_environment);

-- Enable RLS
ALTER TABLE public.hoya_catalogo_cache ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read cache
CREATE POLICY "Authenticated read hoya_catalogo_cache"
ON public.hoya_catalogo_cache
FOR SELECT
TO authenticated
USING (true);

-- Only service role can write
CREATE POLICY "Service role full access hoya_catalogo_cache"
ON public.hoya_catalogo_cache
FOR ALL
USING (true)
WITH CHECK (true);
