// P2/E2 — Sync parcelas_cache → lancamentos_financeiros (SPEC_P2_LEDGER_UNICO.md §4)
// Chamada pelo pg_cron a cada 30 min (verify_jwt=false) ou manualmente.
//   mode=incremental (default) → parcelas com cache_loaded_at recente (janela 6h)
//   mode=full                  → todas as parcelas com chave dura (backfill)
//   codEmpresa=<n|ALL>
// Idempotente: chave dura (cod_empresa, erp_parcela_id); rodar 2x não duplica.
// Precedência de estados no módulo puro _shared/ledgerSync.ts — nunca reabre
// nem re-baixa o que o P1/BTG já fechou.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  decidirSync,
  type LancamentoAtual,
  type ParcelaCacheRow,
  type PlanoMap,
} from "../_shared/ledgerSync.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function getServiceClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}

const PAGE = 1000;

// deno-lint-ignore no-explicit-any
async function carregarPlano(db: any): Promise<PlanoMap> {
  const { data } = await db
    .from("dre_plano_contas")
    .select("conta_numero, grupo_dre, categoria")
    .eq("ativo", true);
  const map: PlanoMap = new Map();
  for (const pc of (data || [])) map.set(pc.conta_numero, { grupo_dre: pc.grupo_dre, categoria: pc.categoria });
  return map;
}

// deno-lint-ignore no-explicit-any
async function empresasAtivas(db: any): Promise<number[]> {
  const { data } = await db.from("empresa").select("cod_empresa").eq("ativa", true);
  return (data || []).map((e: { cod_empresa: number }) => Number(e.cod_empresa));
}

// deno-lint-ignore no-explicit-any
async function sincronizarEmpresa(db: any, codEmpresa: number, mode: string, planoMap: PlanoMap) {
  const resultado = {
    parcelas: 0, inseridos: 0, baixados_erp: 0, atualizados: 0,
    divergencias: 0, dda_vinculados: 0, erros: [] as string[],
  };

  // DDA pendente para cross-match dos inserts PAGAR (mesma lógica do importar_erp_auto)
  const { data: ddaTitulos } = await db
    .from("btg_dda_titulos")
    .select("id, valor, data_vencimento, linha_digitavel, emissor, banco_emissor, documento_emissor")
    .eq("cod_empresa", codEmpresa)
    .eq("status", "PENDENTE");
  const ddaList = (ddaTitulos || []) as Array<Record<string, unknown>>;
  const ddaUsed = new Set<string>();

  let offset = 0;
  for (;;) {
    let query = db
      .from("parcelas_cache")
      .select("*")
      .eq("cod_empresa", codEmpresa)
      .not("parcela_id", "is", null)
      .order("parcela_id", { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (mode !== "full") {
      const corte = new Date(Date.now() - 6 * 3600_000).toISOString();
      query = query.gte("cache_loaded_at", corte);
    }
    const { data: parcelas, error } = await query;
    if (error) {
      resultado.erros.push(`empresa ${codEmpresa}: ${error.message}`);
      break;
    }
    if (!parcelas || parcelas.length === 0) break;
    resultado.parcelas += parcelas.length;

    // Estado atual do ledger para o lote (chave dura)
    const ids = parcelas.map((p: { parcela_id: number }) => p.parcela_id);
    const { data: existentes } = await db
      .from("lancamentos_financeiros")
      .select("id, status, valor, data_vencimento, erp_parcela_id")
      .eq("cod_empresa", codEmpresa)
      .in("erp_parcela_id", ids);
    const atualPorParcela = new Map<number, LancamentoAtual>();
    for (const l of (existentes || [])) {
      atualPorParcela.set(Number(l.erp_parcela_id), { id: l.id, status: l.status, valor: Number(l.valor), data_vencimento: l.data_vencimento });
    }

    const inserts: Record<string, unknown>[] = [];

    for (const raw of parcelas) {
      const p = raw as ParcelaCacheRow;
      const atual = atualPorParcela.get(Number(p.parcela_id)) ?? null;
      const decisao = decidirSync(p, atual, planoMap);

      try {
        if (decisao.acao === "INSERIR") {
          const record = decisao.record;
          // Cross-match DDA só para PAGAR em aberto
          if (record.tipo === "PAGAR" && record.status === "PREVISTO" && ddaList.length > 0) {
            const dda = ddaList.find((d) =>
              !ddaUsed.has(String(d.id)) &&
              Math.abs(Number(d.valor) - Number(record.valor)) < 0.01 &&
              String(d.data_vencimento) === String(record.data_vencimento)
            );
            if (dda) {
              ddaUsed.add(String(dda.id));
              record.btg_dda_id = dda.id;
              record.dados_extras = {
                ...(record.dados_extras as Record<string, unknown>),
                linha_digitavel: dda.linha_digitavel,
                dda_emissor: dda.emissor,
                dda_banco: dda.banco_emissor,
                btg_payment_type: "BANKSLIP",
              };
              resultado.dda_vinculados++;
            }
          }
          inserts.push(record);
        } else if (decisao.acao === "BAIXAR") {
          const { error: upErr } = await db
            .from("lancamentos_financeiros")
            .update({ ...decisao.update, baixado_em: new Date().toISOString() })
            .eq("id", atual!.id);
          if (upErr) resultado.erros.push(`baixa parcela ${p.parcela_id}: ${upErr.message}`);
          else resultado.baixados_erp++;
        } else if (decisao.acao === "ATUALIZAR") {
          const { error: upErr } = await db
            .from("lancamentos_financeiros")
            .update(decisao.update)
            .eq("id", atual!.id);
          if (upErr) resultado.erros.push(`update parcela ${p.parcela_id}: ${upErr.message}`);
          else resultado.atualizados++;
        } else if (decisao.acao === "DIVERGENCIA") {
          // Loga em dados_extras sem mexer no estado
          const { data: lanc } = await db
            .from("lancamentos_financeiros").select("dados_extras").eq("id", atual!.id).single();
          const dados = (lanc?.dados_extras || {}) as Record<string, unknown>;
          if (!dados.divergencia_erp) {
            await db.from("lancamentos_financeiros").update({
              dados_extras: { ...dados, divergencia_erp: decisao.motivo, divergencia_em: new Date().toISOString() },
            }).eq("id", atual!.id);
          }
          resultado.divergencias++;
        }
      } catch (e) {
        resultado.erros.push(`parcela ${p.parcela_id}: ${String(e)}`);
      }
    }

    // Inserts em lote (upsert pela chave dura: corrida entre crons não duplica)
    for (let i = 0; i < inserts.length; i += 200) {
      const batch = inserts.slice(i, i + 200);
      const { error: insErr } = await db
        .from("lancamentos_financeiros")
        .upsert(batch, { onConflict: "cod_empresa,erp_parcela_id", ignoreDuplicates: true });
      if (insErr) resultado.erros.push(`insert lote empresa ${codEmpresa}: ${insErr.message}`);
      else resultado.inseridos += batch.length;
    }

    if (parcelas.length < PAGE) break;
    offset += PAGE;
  }

  return resultado;
}

// ─── MAIN ────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    let body: Record<string, string> = {};
    if (req.method === "POST") body = await req.json().catch(() => ({}));
    const getParam = (k: string) => url.searchParams.get(k) ?? body[k] ?? null;

    const mode = getParam("mode") || "incremental";
    const codEmpresaParam = (getParam("codEmpresa") || "ALL").toUpperCase();

    const db = getServiceClient();
    const planoMap = await carregarPlano(db);
    const empresas = codEmpresaParam === "ALL" || codEmpresaParam === "0"
      ? await empresasAtivas(db)
      : [Number(codEmpresaParam)];

    const totais = {
      mode, empresas: empresas.length, parcelas: 0, inseridos: 0,
      baixados_erp: 0, atualizados: 0, divergencias: 0, dda_vinculados: 0,
      erros: [] as string[],
    };

    for (const emp of empresas) {
      const r = await sincronizarEmpresa(db, emp, mode, planoMap);
      totais.parcelas += r.parcelas;
      totais.inseridos += r.inseridos;
      totais.baixados_erp += r.baixados_erp;
      totais.atualizados += r.atualizados;
      totais.divergencias += r.divergencias;
      totais.dda_vinculados += r.dda_vinculados;
      totais.erros.push(...r.erros);
    }

    console.log("[sync-ledger]", JSON.stringify(totais));
    return json({ ok: true, ...totais });
  } catch (e) {
    console.error("[sync-ledger] Unhandled error:", e);
    return json({ ok: false, error: String(e) }, 500);
  }
});
