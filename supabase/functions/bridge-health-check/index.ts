import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, serviceKey);

  const bridgeUrl = Deno.env.get('FIREBIRD_API_BASE_URL');
  if (!bridgeUrl) {
    // Log as down if not configured
    await supabase.from('bridge_health_logs').insert({
      status: 'down',
      error_message: 'FIREBIRD_API_BASE_URL not configured',
    });
    return new Response(JSON.stringify({ status: 'down', error: 'Bridge URL not configured' }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const healthUrl = `${bridgeUrl}/api/v1/health`;
  const start = Date.now();
  let status: 'up' | 'down' | 'timeout' = 'down';
  let latencyMs = 0;
  let errorMessage: string | null = null;
  let bridgeVersion: string | null = null;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000); // 10s timeout

    const res = await fetch(healthUrl, {
      signal: controller.signal,
      headers: { 'Accept': 'application/json' },
    });
    clearTimeout(timeout);
    latencyMs = Date.now() - start;

    if (res.ok) {
      status = 'up';
      try {
        const body = await res.json();
        bridgeVersion = body.version || body.v || null;
      } catch { /* ignore parse errors */ }
    } else {
      status = 'down';
      errorMessage = `HTTP ${res.status}`;
    }
  } catch (err) {
    latencyMs = Date.now() - start;
    if (err instanceof Error && err.name === 'AbortError') {
      status = 'timeout';
      errorMessage = `Timeout after 10s`;
    } else {
      status = 'down';
      errorMessage = err instanceof Error ? err.message : 'Unknown error';
    }
  }

  // Persist to DB
  await supabase.from('bridge_health_logs').insert({
    status,
    latency_ms: latencyMs,
    error_message: errorMessage,
    bridge_version: bridgeVersion,
  });

  // Cleanup old logs (> 30 days) on ~1% of calls
  if (Math.random() < 0.01) {
    await supabase.rpc('cleanup_old_health_logs', { p_retention_days: 30 });
  }

  return new Response(JSON.stringify({ status, latency_ms: latencyMs, error: errorMessage, version: bridgeVersion }), {
    status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
