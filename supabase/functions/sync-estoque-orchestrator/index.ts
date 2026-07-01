// supabase/functions/sync-estoque-orchestrator/index.ts
// Orquestra sync-estoque-loja para as 12 empresas ativas em background.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

const EMPRESAS_ATIVAS = [1, 2, 4, 6, 9, 10, 13, 14, 15, 16, 17, 18];
const THROTTLE_MS = 30_000;
const PER_LOJA_TIMEOUT_MS = 120_000;

async function runOrchestration(runId: string, startedAt: string) {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, serviceKey);

  const t0 = Date.now();
  const resultados: Array<{
    empresa: number;
    ok: boolean;
    total_registros: number;
    total_erros: number;
    duracao_ms: number;
    erro?: string | null;
  }> = [];

  for (let i = 0; i < EMPRESAS_ATIVAS.length; i++) {
    const empresa = EMPRESAS_ATIVAS[i];
    const lojaStart = Date.now();
    console.log(`[orchestrator] run=${runId} empresa=${empresa} iniciando (${i + 1}/${EMPRESAS_ATIVAS.length})`);

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), PER_LOJA_TIMEOUT_MS);

    try {
      const resp = await fetch(
        `${supabaseUrl}/functions/v1/sync-estoque-loja?empresa=${empresa}`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${serviceKey}`,
            'Content-Type': 'application/json',
          },
          signal: ctrl.signal,
        },
      );
      const text = await resp.text();
      let data: any = {};
      try { data = JSON.parse(text); } catch { data = { raw: text.slice(0, 300) }; }

      resultados.push({
        empresa,
        ok: !!data.ok,
        total_registros: data.total_registros ?? 0,
        total_erros: data.total_erros ?? (data.ok ? 0 : 1),
        duracao_ms: Date.now() - lojaStart,
        erro: data.erro ?? null,
      });

      console.log(`[orchestrator] run=${runId} empresa=${empresa} ok=${!!data.ok} reg=${data.total_registros ?? 0} err=${data.total_erros ?? 0}`);
    } catch (e: any) {
      const msg = e?.name === 'AbortError' ? `timeout ${PER_LOJA_TIMEOUT_MS}ms` : (e?.message ?? String(e));
      resultados.push({
        empresa, ok: false, total_registros: 0, total_erros: 1,
        duracao_ms: Date.now() - lojaStart, erro: msg,
      });
      console.error(`[orchestrator] run=${runId} empresa=${empresa} ERRO: ${msg}`);
    } finally {
      clearTimeout(timer);
    }

    if (i < EMPRESAS_ATIVAS.length - 1) {
      await new Promise((r) => setTimeout(r, THROTTLE_MS));
    }
  }

  const finishedAt = new Date().toISOString();
  const totalRegistros = resultados.reduce((s, r) => s + r.total_registros, 0);
  const totalErros = resultados.reduce((s, r) => s + r.total_erros, 0);
  const empresasOk = resultados.filter((r) => r.ok).length;

  const { error: etlErr } = await supabase.from('etl_controle').upsert({
    entidade: 'estoque_sincronizado_orchestrator',
    ultima_data: new Date().toISOString().slice(0, 10),
    atualizado_em: finishedAt,
  }, { onConflict: 'entidade' });
  if (etlErr) console.error(`[orchestrator] etl_controle upsert: ${etlErr.message}`);

  console.log(`[orchestrator] run=${runId} FIM empresas_ok=${empresasOk}/${EMPRESAS_ATIVAS.length} registros=${totalRegistros} erros=${totalErros} dur=${Date.now() - t0}ms started=${startedAt} finished=${finishedAt}`);
  console.log(`[orchestrator] run=${runId} detalhes=${JSON.stringify(resultados)}`);
}

Deno.serve((req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const runId = crypto.randomUUID();
  const startedAt = new Date().toISOString();

  // dispara em background
  // @ts-ignore EdgeRuntime global do Supabase
  EdgeRuntime.waitUntil(runOrchestration(runId, startedAt));

  return new Response(JSON.stringify({
    ok: true,
    mode: 'background',
    run_id: runId,
    started_at: startedAt,
    empresas_previstas: EMPRESAS_ATIVAS.length,
    duracao_estimada_min: Math.ceil((EMPRESAS_ATIVAS.length * (30 + 25)) / 60), // ~11min
    message: 'Sync iniciado. Consulte etl_controle (entidade=estoque_sincronizado_orchestrator) após ~10min.',
  }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
