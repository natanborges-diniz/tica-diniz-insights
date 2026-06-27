// supabase/functions/sync-estoque-loja/index.ts
// Sincroniza 1 loja por vez do Bridge → estoque_sincronizado
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

const BRIDGE_BASE = 'https://firebird-bridge-production.up.railway.app/api/v1';
const BRIDGE_TIMEOUT_MS = 90_000;
const BATCH_SIZE = 500;

const FAIXAS = [
  { rotulo: 'ANALISE PARA RECOMPRA', desconto: 0,  diasMin: 0,   diasMax: 90 },
  { rotulo: 'ACOMPANHAMENTO',        desconto: 0,  diasMin: 91,  diasMax: 180 },
  { rotulo: 'PROMOCAO 20%',          desconto: 20, diasMin: 181, diasMax: 270 },
  { rotulo: 'LIQUIDA 30%',           desconto: 30, diasMin: 271, diasMax: 360 },
  { rotulo: 'LIQUIDA 50%',           desconto: 50, diasMin: 361, diasMax: 720 },
  { rotulo: 'AÇÃO ESPECIAL',         desconto: 0,  diasMin: 721, diasMax: Number.MAX_SAFE_INTEGER },
];

function classificarPorIdade(dias: number) {
  return FAIXAS.find(f => dias >= f.diasMin && dias <= f.diasMax) ?? FAIXAS[0];
}

function classificarP31(item: { is_dead_stock: boolean; dias_sem_venda?: number | null; dias_em_estoque?: number | null }) {
  const dias = item.is_dead_stock
    ? (item.dias_sem_venda ?? item.dias_em_estoque ?? 0)
    : (item.dias_em_estoque ?? 0);
  return classificarPorIdade(dias);
}

async function fetchBridgeCompleto(empresa: number) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), BRIDGE_TIMEOUT_MS);
  try {
    const res = await fetch(`${BRIDGE_BASE}/estoque/completo?empresa=${empresa}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      signal: ctrl.signal,
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`Bridge ${res.status}: ${text.slice(0, 300)}`);
    return JSON.parse(text);
  } finally {
    clearTimeout(t);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const startedAt = new Date().toISOString();
  const t0 = Date.now();
  let empresa = 0;

  try {
    const url = new URL(req.url);
    empresa = parseInt(url.searchParams.get('empresa') ?? '0', 10);
    if (!empresa || Number.isNaN(empresa)) {
      return new Response(JSON.stringify({ ok: false, erro: 'Parâmetro ?empresa=N obrigatório' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    console.log(`[sync-estoque-loja] empresa=${empresa} iniciando`);

    const bridgeResp = await fetchBridgeCompleto(empresa);
    const itens: any[] = Array.isArray(bridgeResp) ? bridgeResp : (bridgeResp.data ?? bridgeResp.itens ?? []);
    console.log(`[sync-estoque-loja] empresa=${empresa} bridge retornou ${itens.length} itens`);

    const toInt = (v: any): number | null => {
      if (v === null || v === undefined || v === '') return null;
      const n = Number(v);
      return Number.isFinite(n) ? Math.round(n) : null;
    };
    const toNum = (v: any): number | null => {
      if (v === null || v === undefined || v === '') return null;
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    };

    const comEstoque = itens.filter(i => (toNum(i.quantidade_estoque) ?? 0) > 0);

    const rows = comEstoque.map(i => {
      const categoria = (i.tipo ?? '').toString().trim() || null;
      const isArmacao = categoria === 'ARMACOES';
      const qtd = toInt(i.quantidade_estoque) ?? 0;
      const precoCusto = toNum(i.preco_custo) ?? 0;
      const dias_em_estoque = toInt(i.dias_estoque);
      const dias_sem_venda = toInt(i.dias_sem_venda);
      const is_dead_stock = isArmacao && qtd > 0 && (dias_sem_venda ?? 0) > 180;

      let faixa: typeof FAIXAS[number] | null = null;
      if (isArmacao) {
        faixa = classificarP31({ is_dead_stock, dias_sem_venda, dias_em_estoque });
      }

      return {
        cod_empresa: empresa,
        cod_sku: toInt(i.cod_sku),
        marca: i.grife ?? null,
        fornecedor: i.fornecedor_nome ?? null,
        categoria,
        subcategoria: (i.subcategoria ?? '').toString().trim() || null,
        quantidade_estoque: qtd,
        custo_ultima_compra: precoCusto > 0 ? precoCusto : null,
        origem_custo: precoCusto > 0 ? 'PRODUTO' : null,
        valor_estoque_custo: precoCusto > 0 ? precoCusto * qtd : null,
        data_ultima_compra: i.data_ultima_compra ?? null,
        dias_em_estoque,
        dias_desde_ultima_venda: dias_sem_venda,
        qtd_vendidos_180d: toInt(i.pecas_vendidas_consideradas) ?? 0,
        is_dead_stock: isArmacao ? is_dead_stock : false,
        faixa_saneamento: isArmacao ? (faixa?.rotulo ?? null) : null,
        acao_sugerida: isArmacao ? (faixa?.rotulo ?? null) : null,
        desconto_sugerido: isArmacao ? (faixa?.desconto ?? null) : null,
        atualizado_em: new Date().toISOString(),
      };
    }).filter(r => r.cod_sku !== null);

    let totalErros = 0;
    let totalRegistros = 0;
    const errosDetalhes: string[] = [];
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      const { error } = await supabase
        .from('estoque_sincronizado')
        .upsert(batch, { onConflict: 'cod_empresa,cod_sku' });
      if (error) {
        totalErros++;
        const sample = batch[0];
        const msg = `batch ${i} (${batch.length} rows): ${error.message} | sample cod_sku=${sample?.cod_sku} qtd=${sample?.quantidade_estoque} dias_estoque=${sample?.dias_em_estoque} dias_sem_venda=${sample?.dias_desde_ultima_venda}`;
        errosDetalhes.push(msg);
        console.error(`[sync-estoque-loja] empresa=${empresa} upsert ${msg}`);
      } else {
        totalRegistros += batch.length;
      }
    }

    const { error: delError } = await supabase
      .from('estoque_sincronizado')
      .delete()
      .eq('cod_empresa', empresa)
      .lt('atualizado_em', startedAt);
    if (delError) {
      console.error(`[sync-estoque-loja] empresa=${empresa} delete antigos: ${delError.message}`);
    }

    const finishedAt = new Date().toISOString();
    const duracao_ms = Date.now() - t0;
    const ok = totalErros === 0;

    console.log(`[sync-estoque-loja] empresa=${empresa} FIM ok=${ok} registros=${totalRegistros} erros=${totalErros} dur=${duracao_ms}ms`);

    return new Response(JSON.stringify({
      ok, empresa, started_at: startedAt, finished_at: finishedAt, duracao_ms,
      total_registros: totalRegistros, total_erros: totalErros,
      erro: errosDetalhes.length ? errosDetalhes.join(' ; ') : null,
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (e: any) {
    const finishedAt = new Date().toISOString();
    const msg = e?.message ?? String(e);
    console.error(`[sync-estoque-loja] empresa=${empresa} ERRO: ${msg}`);
    return new Response(JSON.stringify({
      ok: false, empresa,
      started_at: startedAt, finished_at: finishedAt,
      duracao_ms: Date.now() - t0,
      total_registros: 0, total_erros: 1, erro: msg,
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
