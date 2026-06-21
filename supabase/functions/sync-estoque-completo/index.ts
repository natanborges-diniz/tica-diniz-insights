// ============================================================
// sync-estoque-completo
// Sprint Estoque Materializado - Fase 1.2
// Lê /estoque/completo + /estoque/ultimo-custo do Bridge e
// popula a tabela estoque_sincronizado (UPSERT idempotente).
// ============================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import { firebirdGet } from '../_shared/firebirdApi.ts';

// ============================================================
// CONFIG
// ============================================================

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const EMPRESAS_ATIVAS = [1, 2, 4, 6, 9, 10, 13, 14, 15, 16, 17, 18];

const RETRY_MAX = 2;
const THROTTLE_ENTRE_LOJAS_MS = 1_000;
const BATCH_SIZE = 500;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, x-client-info, apikey',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

// ============================================================
// FAIXAS DE SANEAMENTO (espelho do Frontend src/lib/estoque/faixas-saneamento.ts)
// IMPORTANTE: se mudar regra, atualizar AQUI E no Frontend.
// ============================================================

interface FaixaSaneamento {
  rotulo: string;
  desconto: number;
  acao: string;
  diasMin: number;
  diasMax: number;
}

const FAIXAS_SANEAMENTO: FaixaSaneamento[] = [
  { rotulo: 'ANALISE PARA RECOMPRA', desconto: 0,  acao: 'manter',   diasMin: 0,   diasMax: 90 },
  { rotulo: 'ACOMPANHAMENTO',        desconto: 0,  acao: 'observar', diasMin: 91,  diasMax: 180 },
  { rotulo: 'PROMOCAO 20%',          desconto: 20, acao: 'promover', diasMin: 181, diasMax: 270 },
  { rotulo: 'LIQUIDA 30%',           desconto: 30, acao: 'liquidar', diasMin: 271, diasMax: 360 },
  { rotulo: 'LIQUIDA 50%',           desconto: 50, acao: 'liquidar', diasMin: 361, diasMax: 720 },
  { rotulo: 'AÇÃO ESPECIAL',         desconto: 0,  acao: 'destinar', diasMin: 721, diasMax: Number.MAX_SAFE_INTEGER },
];

function classificarPorIdade(dias: number): FaixaSaneamento {
  return FAIXAS_SANEAMENTO.find(f => dias >= f.diasMin && dias <= f.diasMax) ?? FAIXAS_SANEAMENTO[0];
}

// Princípio #31: dead stock usa diasDesdeUltimaVenda; demais usam diasEmEstoque
function classificarItemP31(item: {
  isDeadStock: boolean;
  diasEmEstoque: number;
  diasDesdeUltimaVenda: number;
}): FaixaSaneamento {
  const dias = item.isDeadStock
    ? (item.diasDesdeUltimaVenda ?? item.diasEmEstoque)
    : item.diasEmEstoque;
  return classificarPorIdade(dias ?? 0);
}

// ============================================================
// HELPERS
// ============================================================

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function bridgeGetWithRetry(path: string, params: Record<string, any>): Promise<any> {
  let lastErr: any = null;
  for (let attempt = 0; attempt <= RETRY_MAX; attempt++) {
    try {
      return await firebirdGet(path, params);
    } catch (err) {
      lastErr = err;
      if (attempt === RETRY_MAX) break;
      console.warn(`[sync-estoque] tentativa ${attempt + 1} falhou em ${path}: ${(err as Error).message}`);
      await sleep(2_000 * (attempt + 1));
    }
  }
  throw lastErr;
}

// ============================================================
// CONTRATOS Bridge
// ============================================================

interface BridgeEstoqueCompleto {
  cod_sku: number;
  descricao?: string;
  marca?: string;
  fornecedor?: string;
  categoria?: string;
  subcategoria?: string;
  cod_produto_tipo?: number;
  cod_barras_interno?: string;
  ean?: string;
  quantidade_estoque: number;
  valor_estoque_custo?: number;
  data_ultima_entrada?: string | null;
  data_ultima_venda?: string | null;
  dias_em_estoque?: number;
  dias_sem_venda?: number;
  qtd_vendidos_180d?: number;
  is_dead_stock?: boolean;
}

interface BridgeUltimoCusto {
  cod_sku: number;
  custo_ultima_compra: number | null;
  data_ultima_compra: string | null;
  origem_custo: 'NFE' | 'ESTOQUELOG' | null;
}

// ============================================================
// SYNC DE UMA EMPRESA
// ============================================================

async function syncEmpresa(empresa: number, supabase: any, startedAt: string): Promise<{
  empresa: number;
  registros: number;
  erro: string | null;
  duracao_ms: number;
}> {
  const t0 = Date.now();
  try {
    console.log(`[sync-estoque] iniciando empresa ${empresa}`);

    // 1. Buscar /estoque/completo e /estoque/ultimo-custo em PARALELO (com retry)
    const [estoqueData, custoData] = await Promise.all([
      bridgeGetWithRetry('/api/v1/estoque/completo', { empresa }),
      bridgeGetWithRetry('/api/v1/estoque/ultimo-custo', { empresa }),
    ]);

    const estoqueItems: BridgeEstoqueCompleto[] = estoqueData?.data ?? estoqueData ?? [];
    const custoItems: BridgeUltimoCusto[] = custoData?.data ?? custoData ?? [];

    // 2. Index custos por cod_sku
    const custosByCodSku = new Map<number, BridgeUltimoCusto>();
    for (const c of custoItems) custosByCodSku.set(c.cod_sku, c);

    const tsAtualizacao = new Date().toISOString();

    // 3. Filtrar SKUs com saldo > 0 e montar payload
    const rowsParaUpsert = estoqueItems
      .filter(item => (item.quantidade_estoque ?? 0) > 0)
      .map(item => {
        const custo = custosByCodSku.get(item.cod_sku);
        const isArmacao = item.categoria === 'ARMACOES';

        let faixa: FaixaSaneamento | null = null;
        if (isArmacao) {
          faixa = classificarItemP31({
            isDeadStock: item.is_dead_stock ?? false,
            diasEmEstoque: item.dias_em_estoque ?? 0,
            diasDesdeUltimaVenda: item.dias_sem_venda ?? 0,
          });
        }

        return {
          cod_empresa: empresa,
          cod_sku: item.cod_sku,
          descricao: item.descricao ?? null,
          marca: item.marca ?? null,
          fornecedor: item.fornecedor ?? null,
          categoria: item.categoria ?? null,
          subcategoria: item.subcategoria ?? null,
          cod_produto_tipo: item.cod_produto_tipo ?? null,
          cod_barras_interno: item.cod_barras_interno ?? null,
          ean: item.ean ?? null,
          quantidade_estoque: item.quantidade_estoque,
          valor_estoque_custo: item.valor_estoque_custo ?? null,
          custo_ultima_compra: custo?.custo_ultima_compra ?? null,
          data_ultima_compra: custo?.data_ultima_compra ?? null,
          origem_custo: custo?.origem_custo ?? null,
          data_ultima_entrada: item.data_ultima_entrada ?? null,
          data_ultima_venda: item.data_ultima_venda ?? null,
          dias_em_estoque: item.dias_em_estoque ?? null,
          dias_desde_ultima_venda: item.dias_sem_venda ?? null,
          qtd_vendidos_180d: item.qtd_vendidos_180d ?? 0,
          is_dead_stock: isArmacao ? (item.is_dead_stock ?? false) : false,
          faixa_saneamento: faixa?.rotulo ?? null,
          acao_sugerida: faixa?.rotulo ?? null,
          desconto_sugerido: faixa?.desconto ?? null,
          atualizado_em: tsAtualizacao,
        };
      });

    console.log(`[sync-estoque] empresa ${empresa}: ${rowsParaUpsert.length} SKUs para upsert`);

    // 4. UPSERT em batches
    for (let i = 0; i < rowsParaUpsert.length; i += BATCH_SIZE) {
      const batch = rowsParaUpsert.slice(i, i + BATCH_SIZE);
      const { error } = await supabase
        .from('estoque_sincronizado')
        .upsert(batch, { onConflict: 'cod_empresa,cod_sku' });
      if (error) throw new Error(`Upsert batch ${Math.floor(i / BATCH_SIZE) + 1}: ${error.message}`);
    }

    // 5. Limpeza: remove linhas dessa empresa que não foram tocadas neste run
    const { error: deleteError } = await supabase
      .from('estoque_sincronizado')
      .delete()
      .eq('cod_empresa', empresa)
      .lt('atualizado_em', startedAt);

    if (deleteError) {
      console.warn(`[sync-estoque] empresa ${empresa}: erro no delete de limpeza: ${deleteError.message}`);
    }

    return { empresa, registros: rowsParaUpsert.length, erro: null, duracao_ms: Date.now() - t0 };
  } catch (err: any) {
    console.error(`[sync-estoque] empresa ${empresa} falhou:`, err.message);
    return { empresa, registros: 0, erro: err.message, duracao_ms: Date.now() - t0 };
  }
}

// ============================================================
// HANDLER
// ============================================================

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const startedAt = new Date().toISOString();
  console.log(`[sync-estoque] STARTED ${startedAt}`);

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // Permite ?empresa=N para sync de 1 loja só (debug/manual)
  const url = new URL(req.url);
  const empresaParam = url.searchParams.get('empresa');
  const empresasParaSync = empresaParam
    ? [parseInt(empresaParam, 10)]
    : EMPRESAS_ATIVAS;

  const resultados: Array<{ empresa: number; registros: number; erro: string | null; duracao_ms: number }> = [];

  for (let i = 0; i < empresasParaSync.length; i++) {
    const empresa = empresasParaSync[i];
    const resultado = await syncEmpresa(empresa, supabase, startedAt);
    resultados.push(resultado);
    if (i < empresasParaSync.length - 1) {
      await sleep(THROTTLE_ENTRE_LOJAS_MS);
    }
  }

  const totalRegistros = resultados.reduce((acc, r) => acc + r.registros, 0);
  const totalErros = resultados.filter(r => r.erro).length;
  const finishedAt = new Date().toISOString();

  // Registrar em etl_controle
  await supabase
    .from('etl_controle')
    .upsert({
      entidade: 'estoque_sincronizado',
      ultima_data: new Date().toISOString().split('T')[0],
      atualizado_em: finishedAt,
    }, { onConflict: 'entidade' });

  console.log(`[sync-estoque] FINISHED ${finishedAt}. Total: ${totalRegistros} registros, ${totalErros} erros.`);

  return new Response(JSON.stringify({
    ok: totalErros === 0,
    started_at: startedAt,
    finished_at: finishedAt,
    total_registros: totalRegistros,
    total_erros: totalErros,
    detalhe: resultados,
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status: totalErros === 0 ? 200 : 207,
  });
});
