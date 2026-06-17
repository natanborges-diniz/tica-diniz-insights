// supabase/functions/sync-parcelas/index.ts
// Sync parcelas financeiras do Firebird para parcelas_cache.
// Busca por VENCIMENTO (janela curta p/ fluxo) E por EMISSAO (janela longa p/ Compras/DRE).
// Usa upsert idempotente — não deleta nada.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authGuard, corsHeaders } from "../_shared/authGuard.ts";

const FIREBIRD_BASE_URL = (Deno.env.get("FIREBIRD_API_BASE_URL") || "https://firebird-bridge-production.up.railway.app").replace(/\/+$/, "");

type Rec = Record<string, unknown>;

function mapRecord(r: Rec, loadedAt: string) {
  const lancamentoPagar = ((r.lancamento_pagar as string) ?? "").trim();
  const tipoLancamento = lancamentoPagar === "T" ? "PAGAR" : "RECEBER";
  return {
    cod_empresa: r.cod_empresa ?? 0,
    empresa_nome: ((r.empresa_nome as string) ?? "").trim(),
    tipo_lancamento: tipoLancamento,
    documento: ((r.lancamento_documento as string) ?? "").trim(),
    pessoa_nome: ((r.pessoa_nome as string) ?? "").trim(),
    data_vencimento: r.parcela_data_vencimento ?? null,
    data_emissao: r.parcela_data_emissao ?? null,
    data_pagamento: r.parcela_data_pagamento ?? null,
    valor: r.parcela_valor ?? 0,
    valor_pago: r.parcela_valor_pago ?? 0,
    situacao: ((r.parcela_situacao as string) ?? "EM ABERTO").trim(),
    conta_numero: ((r.contacla_numero as string) ?? "").trim() || null,
    conta_descricao: ((r.contacla_descricao as string) ?? "").trim() || null,
    forma_pagamento_tipo: ((r.formapagto_tipo_nome as string) ?? "").trim() || null,
    cache_loaded_at: loadedAt,
  };
}

async function fetchFirebird(campoData: "VENCIMENTO" | "EMISSAO", dataInicio: string, dataFim: string, empresaParam: string): Promise<Rec[]> {
  const url = `${FIREBIRD_BASE_URL}/api/v1/financeiro/parcelas?dataInicio=${dataInicio}&dataFim=${dataFim}&empresa=${empresaParam}&campoData=${campoData}`;
  console.log(`[sync-parcelas] Firebird (${campoData}) URL: ${url}`);
  const resp = await fetch(url, { method: "GET", headers: { "Content-Type": "application/json" } });
  if (!resp.ok) throw new Error(`Firebird API error (${campoData}): ${resp.status}`);
  const result = await resp.json();
  return result.data ?? result.rows ?? (Array.isArray(result) ? result : []);
}

async function resolveEmpresas(supabase: ReturnType<typeof createClient>, codEmpresa: string): Promise<string[]> {
  const normalized = codEmpresa.trim().toUpperCase();
  if (normalized && normalized !== "ALL" && normalized !== "TODAS" && normalized !== "0") {
    return codEmpresa.split(",").map((e) => e.trim()).filter(Boolean);
  }

  const { data, error } = await supabase
    .from("empresa")
    .select("cod_empresa")
    .eq("ativa", true)
    .order("cod_empresa", { ascending: true });

  if (error) throw new Error(`Erro ao carregar empresas ativas: ${error.message}`);
  return (data ?? []).map((e) => String(e.cod_empresa));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    await authGuard(req, { requiredRole: "admin" });

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const url = new URL(req.url);
    const mode = url.searchParams.get("mode") || "incremental";
    const codEmpresa = url.searchParams.get("codEmpresa") || "ALL";
    const empresasParam = await resolveEmpresas(supabase, codEmpresa);

    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);

    // Janela por VENCIMENTO (para Fluxo de Caixa / DRE realizado próximo)
    let vencIni: string;
    const vencFimDate = new Date(now); vencFimDate.setDate(vencFimDate.getDate() + 90);
    const vencFim = vencFimDate.toISOString().slice(0, 10);
    if (mode === "backfill") {
      const s = new Date(now); s.setMonth(s.getMonth() - 6);
      vencIni = s.toISOString().slice(0, 10);
    } else {
      const s = new Date(now); s.setDate(s.getDate() - 45);
      vencIni = s.toISOString().slice(0, 10);
    }

    // Janela por EMISSAO (para Compras / DRE retroativo)
    let emissaoIni: string;
    if (mode === "backfill") {
      const s = new Date(now); s.setMonth(s.getMonth() - 24);
      emissaoIni = s.toISOString().slice(0, 10);
    } else {
      const s = new Date(now); s.setDate(s.getDate() - 90);
      emissaoIni = s.toISOString().slice(0, 10);
    }

    console.log(`[sync-parcelas] Mode=${mode} Empresa=${codEmpresa} (${empresasParam.join(",")}) VENC=${vencIni}..${vencFim} EMISSAO=${emissaoIni}..${todayStr}`);

    const fetched = await Promise.all(
      empresasParam.flatMap((empresaParam) => [
        fetchFirebird("VENCIMENTO", vencIni, vencFim, empresaParam),
        fetchFirebird("EMISSAO", emissaoIni, todayStr, empresaParam),
      ])
    );
    const recsVenc = fetched.filter((_, idx) => idx % 2 === 0).flat();
    const recsEmis = fetched.filter((_, idx) => idx % 2 === 1).flat();

    console.log(`[sync-parcelas] Fetched: VENC=${recsVenc.length} EMISSAO=${recsEmis.length}`);

    const loadedAt = new Date().toISOString();
    const combined = [...recsVenc, ...recsEmis].map((r) => mapRecord(r, loadedAt));

    // Dedupe em memória pela chave única (cod_empresa, tipo_lancamento, documento, data_vencimento, valor)
    const dedup = new Map<string, ReturnType<typeof mapRecord>>();
    for (const r of combined) {
      const k = `${r.cod_empresa}|${r.tipo_lancamento}|${r.documento}|${r.data_vencimento}|${r.valor}`;
      dedup.set(k, r);
    }
    const records = Array.from(dedup.values());
    console.log(`[sync-parcelas] After dedupe: ${records.length}`);

    if (records.length === 0) {
      return new Response(JSON.stringify({ ok: true, synced: 0, mode }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const batchSize = 200;
    let totalUpserted = 0;
    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize);
      const { error } = await supabase
        .from("parcelas_cache")
        .upsert(batch, { onConflict: "cod_empresa,tipo_lancamento,documento,data_vencimento,valor" });
      if (error) {
        console.error(`[sync-parcelas] Upsert error batch ${i}:`, error.message);
      } else {
        totalUpserted += batch.length;
      }
    }

    console.log(`[sync-parcelas] Upserted ${totalUpserted} parcelas`);

    return new Response(
      JSON.stringify({
        ok: true,
        synced: totalUpserted,
        mode,
        empresas: empresasParam,
        windows: { vencimento: { ini: vencIni, fim: vencFim }, emissao: { ini: emissaoIni, fim: todayStr } },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[sync-parcelas] Error:", err);
    return new Response(
      JSON.stringify({ ok: false, error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
