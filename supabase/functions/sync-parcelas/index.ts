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
    // P2/E1 — chave dura do ERP (SPEC_P2_LEDGER_UNICO.md §3.1)
    cod_lancamento: r.cod_lancamento != null ? Number(r.cod_lancamento) : null,
    parcela_id: r.parcela_id != null ? Number(r.parcela_id) : null,
    cod_pessoa: r.pessoa_cod_pessoa != null ? Number(r.pessoa_cod_pessoa) : null,
    valor_original: r.parcela_valor_original ?? null,
    data_recebimento: r.parcela_data_recebimento ?? null,
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
    // P2/E2 — cron (pg_cron chama com anon key) é caller interno permitido,
    // mesmo padrão do conciliar-extrato; usuários continuam exigindo admin.
    const rawToken = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    let internalRole = "";
    try {
      const payload = JSON.parse(atob(rawToken.split(".")[1]?.replace(/-/g, "+").replace(/_/g, "/") ?? ""));
      internalRole = String(payload?.role ?? "");
    } catch { /* token ausente/ilegível → cai no authGuard */ }
    if (internalRole !== "anon" && internalRole !== "service_role") {
      await authGuard(req, { requiredRole: "admin" });
    }

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const url = new URL(req.url);
    // Aceita params via query string OU body JSON (para supabase.functions.invoke)
    let bodyParams: Record<string, string> = {};
    if (req.method === "POST") {
      try { bodyParams = await req.json().catch(() => ({})) as Record<string, string>; } catch { /* ignore */ }
    }
    const getParam = (k: string) => url.searchParams.get(k) ?? bodyParams[k] ?? null;

    const mode = getParam("mode") || "incremental";
    const codEmpresa = getParam("codEmpresa") || "ALL";
    const empresasParam = await resolveEmpresas(supabase, codEmpresa);

    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);

    // Modo RANGE: janela explícita por EMISSAO (auto-healing sob demanda)
    let vencIni = "", vencFim = "", emissaoIni = "", emissaoFim = todayStr;
    const fetchVencimento = mode !== "range";

    if (mode === "range") {
      const di = getParam("dataInicio");
      const df = getParam("dataFim");
      if (!di || !df) throw new Error("mode=range requer dataInicio e dataFim");
      emissaoIni = di;
      emissaoFim = df;
    } else {
      // Janela por VENCIMENTO (fluxo)
      const vencFimDate = new Date(now); vencFimDate.setDate(vencFimDate.getDate() + 90);
      vencFim = vencFimDate.toISOString().slice(0, 10);
      if (mode === "backfill") {
        const s = new Date(now); s.setMonth(s.getMonth() - 6);
        vencIni = s.toISOString().slice(0, 10);
        const e = new Date(now); e.setMonth(e.getMonth() - 24);
        emissaoIni = e.toISOString().slice(0, 10);
      } else {
        const s = new Date(now); s.setDate(s.getDate() - 45);
        vencIni = s.toISOString().slice(0, 10);
        const e = new Date(now); e.setDate(e.getDate() - 90);
        emissaoIni = e.toISOString().slice(0, 10);
      }
    }

    console.log(`[sync-parcelas] Mode=${mode} Empresa=${codEmpresa} (${empresasParam.join(",")}) VENC=${vencIni}..${vencFim} EMISSAO=${emissaoIni}..${emissaoFim}`);

    const recsVenc: Rec[] = [];
    const recsEmis: Rec[] = [];
    for (const empresaParam of empresasParam) {
      const tasks: Promise<Rec[]>[] = [fetchFirebird("EMISSAO", emissaoIni, emissaoFim, empresaParam)];
      if (fetchVencimento) tasks.unshift(fetchFirebird("VENCIMENTO", vencIni, vencFim, empresaParam));
      const results = await Promise.all(tasks);
      if (fetchVencimento) { recsVenc.push(...results[0]); recsEmis.push(...results[1]); }
      else { recsEmis.push(...results[0]); }
      console.log(`[sync-parcelas] Empresa ${empresaParam}: VENC=${fetchVencimento ? results[0].length : 0} EMISSAO=${results[fetchVencimento?1:0].length}`);
    }


    console.log(`[sync-parcelas] Fetched: VENC=${recsVenc.length} EMISSAO=${recsEmis.length}`);

    const loadedAt = new Date().toISOString();
    const combined = [...recsVenc, ...recsEmis].map((r) => mapRecord(r, loadedAt));

    // P2/E1 — identidade agora é a chave dura (cod_empresa, parcela_id).
    // Registros sem parcela_id (bridge desatualizada) são descartados com log —
    // melhor faltar até o deploy da bridge do que duplicar.
    const semChave = combined.filter((r) => r.parcela_id == null).length;
    if (semChave > 0) console.warn(`[sync-parcelas] ${semChave} registros sem parcela_id descartados (bridge desatualizada?)`);

    const dedup = new Map<string, ReturnType<typeof mapRecord>>();
    for (const r of combined) {
      if (r.parcela_id == null) continue;
      dedup.set(`${r.cod_empresa}|${r.parcela_id}`, r);
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
    let upsertFailures = 0;
    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize);
      const { error } = await supabase
        .from("parcelas_cache")
        .upsert(batch, { onConflict: "cod_empresa,parcela_id" });
      if (error) {
        upsertFailures++;
        console.error(`[sync-parcelas] Upsert error batch ${i}:`, error.message);
      } else {
        totalUpserted += batch.length;
      }
    }

    console.log(`[sync-parcelas] Upserted ${totalUpserted} parcelas`);

    // P2/E1 — no backfill, remove as linhas legadas sem chave dura das empresas
    // sincronizadas (evita dupla contagem no Dashboard de Parcelas). Só quando o
    // run foi limpo — se algum batch falhou, preserva o legado.
    let legadoRemovido = 0;
    if (mode === "backfill" && upsertFailures === 0 && totalUpserted > 0) {
      const empresasNum = empresasParam.map((e) => Number(e)).filter((n) => !Number.isNaN(n));
      const { count, error: delErr } = await supabase
        .from("parcelas_cache")
        .delete({ count: "exact" })
        .is("parcela_id", null)
        .in("cod_empresa", empresasNum);
      if (delErr) console.error("[sync-parcelas] Erro ao limpar legado:", delErr.message);
      else {
        legadoRemovido = count ?? 0;
        console.log(`[sync-parcelas] Legado sem parcela_id removido: ${legadoRemovido}`);
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        synced: totalUpserted,
        sem_chave_descartados: semChave,
        legado_removido: legadoRemovido,
        mode,
        empresas: empresasParam,
        windows: { vencimento: { ini: vencIni, fim: vencFim }, emissao: { ini: emissaoIni, fim: emissaoFim } },
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
