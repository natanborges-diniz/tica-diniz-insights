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
    await supabase.from('bridge_health_logs').insert({
      status: 'down',
      error_message: 'FIREBIRD_API_BASE_URL not configured',
    });
    return new Response(JSON.stringify({ status: 'down', error: 'Bridge URL not configured' }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const baseUrl = bridgeUrl.replace(/\/+$/, '');

  // =============================================
  // STEP 1: Liveness check — GET /health
  // Verifica se o processo Node está respondendo HTTP
  // =============================================
  let processAlive = false;
  const livenessUrl = `${baseUrl}/health`;
  console.log(`[health-check] Liveness: ${livenessUrl}`);

  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 5000);
    const res = await fetch(livenessUrl, { signal: ctrl.signal, headers: { 'Accept': 'application/json' }, redirect: 'follow' });
    clearTimeout(t);
    processAlive = res.ok;
    console.log(`[health-check] Liveness response: ${res.status} → ${processAlive ? 'alive' : 'dead'}`);
  } catch (err) {
    console.log(`[health-check] Liveness failed: ${err instanceof Error ? err.message : 'unknown'}`);
    processAlive = false;
  }

  // Se o processo nem responde, é down total
  if (!processAlive) {
    const start = Date.now();
    // Tenta readiness mesmo assim para capturar latência
    let latencyMs = 0;
    let errorMessage = 'Process not responding (liveness failed)';

    try {
      const ctrl2 = new AbortController();
      const t2 = setTimeout(() => ctrl2.abort(), 10000);
      await fetch(`${baseUrl}/api/v1/health`, { signal: ctrl2.signal, headers: { 'Accept': 'application/json' } });
      clearTimeout(t2);
      latencyMs = Date.now() - start;
    } catch {
      latencyMs = Date.now() - start;
    }

    await supabase.from('bridge_health_logs').insert({
      status: 'down',
      latency_ms: latencyMs,
      error_message: errorMessage,
    });

    if (Math.random() < 0.01) {
      await supabase.rpc('cleanup_old_health_logs', { p_retention_days: 30 });
    }

    return new Response(JSON.stringify({ status: 'down', latency_ms: latencyMs, error: errorMessage, version: null }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // =============================================
  // STEP 2: Readiness check — GET /api/v1/health
  // Verifica se o serviço está operacional com DB
  // =============================================
  const readinessUrl = `${baseUrl}/api/v1/health`;
  console.log(`[health-check] Readiness: ${readinessUrl}`);
  const start = Date.now();
  let status: 'up' | 'degraded' | 'down' | 'timeout' = 'down';
  let latencyMs = 0;
  let errorMessage: string | null = null;
  let bridgeVersion: string | null = null;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const res = await fetch(readinessUrl, {
      signal: controller.signal,
      headers: { 'Accept': 'application/json' },
      redirect: 'follow',
    });
    clearTimeout(timeout);
    latencyMs = Date.now() - start;

    console.log(`[health-check] Readiness response: ${res.status}`);

    try {
      const body = await res.json();
      bridgeVersion = body.version || body.v || null;

      if (res.ok && (body.status === 'ok' || body.status === 'up')) {
        // 200 + status: "ok" → up
        status = 'up';
      } else if (res.status === 503 && body.status === 'degraded') {
        // 503 + status: "degraded" → degraded (processo OK, DB com problema)
        status = 'degraded';
        errorMessage = body.error || 'Bridge degraded (Firebird DB disconnected)';
      } else if (body.error) {
        // Qualquer outro erro com payload estruturado
        status = 'down';
        errorMessage = body.error || `HTTP ${res.status}`;
      } else {
        status = res.ok ? 'up' : 'down';
        if (!res.ok) errorMessage = `HTTP ${res.status}`;
      }
    } catch {
      // Body não é JSON
      status = res.ok ? 'up' : 'down';
      if (!res.ok) errorMessage = `HTTP ${res.status}`;
    }
  } catch (err) {
    latencyMs = Date.now() - start;
    if (err instanceof Error && err.name === 'AbortError') {
      status = 'timeout';
      errorMessage = 'Timeout after 10s';
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

  // Cleanup old logs on ~1% of calls
  if (Math.random() < 0.01) {
    await supabase.rpc('cleanup_old_health_logs', { p_retention_days: 30 });
  }

  return new Response(JSON.stringify({ status, latency_ms: latencyMs, error: errorMessage, version: bridgeVersion }), {
    status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
