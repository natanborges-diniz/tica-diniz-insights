// supabase/functions/sync-estoque-orchestrator/index.ts
// Orquestra sync-estoque-loja em batches de 4 lojas, auto-reagendando.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

const BATCHES: number[][] = [
  [1, 2, 4, 6],
  [9, 10, 13, 14],
  [15, 16, 17, 18],
];
const THROTTLE_MS = 30_000;
const PER_LOJA_TIMEOUT_MS = 120_000;

async function processarBatch(
  empresas: number[],
  batchNum: number,
  startedAt: string,
  runId: string,
) {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const resultados: Array<{ empresa: number; ok: boolean; registros?: number; erro?: string }> = [];

  for (let i = 0; i < empresas.length; i++) {
    const empresa = empresas[i];
    console.log(`[orchestrator] run=${runId} batch=${batchNum} empresa=${empresa} iniciando (${i + 1}/${empresas.length})`);

    try {
      const resp = await fetch(
        `${supabaseUrl}/functions/v1/sync-estoque-loja?empresa=${empresa}`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${serviceKey}`,
            'Content-Type': 'application/json',
          },
          signal: AbortSignal.timeout(PER_LOJA_TIMEOUT_MS),
        },
      );
      const text = await resp.text();
      let data: any = {};
      try { data = JSON.parse(text); } catch { data = { raw: text.slice(0, 300) }; }
      resultados.push({ empresa, ok: !!data.ok, registros: data.total_registros ?? 0 });
      console.log(`[orchestrator] run=${runId} batch=${batchNum} empresa=${empresa} ok=${!!data.ok} reg=${data.total_registros ?? 0}`);
    } catch (err: any) {
      const msg = err?.message ?? String(err);
      resultados.push({ empresa, ok: false, erro: msg });
      console.error(`[orchestrator] run=${runId} batch=${batchNum} empresa=${empresa} ERRO: ${msg}`);
    }

    if (i < empresas.length - 1) {
      await new Promise((r) => setTimeout(r, THROTTLE_MS));
    }
  }

  console.log(`[orchestrator] run=${runId} batch=${batchNum}/${BATCHES.length} concluído: ${JSON.stringify(resultados)}`);

  if (batchNum < BATCHES.length) {
    const nextBatch = batchNum + 1;
    console.log(`[orchestrator] run=${runId} auto-invocando batch=${nextBatch}`);
    try {
      await fetch(
        `${supabaseUrl}/functions/v1/sync-estoque-orchestrator?batch=${nextBatch}`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${serviceKey}`,
            'Content-Type': 'application/json',
          },
        },
      );
    } catch (err: any) {
      console.error(`[orchestrator] run=${runId} falha ao auto-invocar batch=${nextBatch}: ${err?.message ?? err}`);
    }
  } else {
    const supabase = createClient(supabaseUrl, serviceKey);
    const finishedAt = new Date().toISOString();
    const { error: etlErr } = await supabase.from('etl_controle').upsert({
      entidade: 'estoque_sincronizado_orchestrator',
      ultima_data: finishedAt.slice(0, 10),
      atualizado_em: finishedAt,
    }, { onConflict: 'entidade' });
    if (etlErr) console.error(`[orchestrator] run=${runId} etl_controle upsert: ${etlErr.message}`);
    console.log(`[orchestrator] run=${runId} SYNC COMPLETO — todas as ${BATCHES.flat().length} lojas processadas (started=${startedAt} finished=${finishedAt})`);
  }
}

Deno.serve((req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const url = new URL(req.url);
  const batchNum = parseInt(url.searchParams.get('batch') || '1', 10);
  const empresas = BATCHES[batchNum - 1];

  if (!empresas) {
    return new Response(JSON.stringify({ ok: false, error: `batch inválido: ${batchNum}` }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const runId = crypto.randomUUID();
  const startedAt = new Date().toISOString();

  // @ts-ignore EdgeRuntime global do Supabase
  EdgeRuntime.waitUntil(processarBatch(empresas, batchNum, startedAt, runId));

  return new Response(JSON.stringify({
    ok: true,
    mode: 'background',
    run_id: runId,
    started_at: startedAt,
    batch: batchNum,
    total_batches: BATCHES.length,
    empresas,
    duracao_estimada_min_total: 13,
    message: `Batch ${batchNum}/${BATCHES.length} iniciado. Auto-reagendará os próximos.`,
  }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
