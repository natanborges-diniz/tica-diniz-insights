// supabase/functions/rh-fechamentos/index.ts
// Fase 4 — API DE INTEGRAÇÃO dos fechamentos de comissão (RH / sistema
// externo) — docs/REVISAO_VENDAS_METAS.md §5.5.
//
// GET .../functions/v1/rh-fechamentos?semana=YYYY-MM-DD&empresa=1&ano=2026&mes=7
//   Headers: x-api-key: <RH_API_KEY>   (secret da edge; configurar via
//   `supabase secrets set RH_API_KEY=...` ou painel do Supabase)
//
// Resposta (contrato estável, v1):
// {
//   "versao": 1,
//   "fechamentos": [{
//     "codEmpresa", "nomeEmpresa", "ano", "mes", "semanaInicio", "semanaFim",
//     "modo", "status", "criadoEm", "totais": {base, restituicoes, comissao,
//     premio, pagar}, "vendedores": [{ "codVendedor", "vendedorNome",
//     "metaSemana", "percentualMeta", "basePorCategoria", "basePorOrigem",
//     "baseTotal", "restituicoes", "comissao", "premioValor", "totalPagar",
//     "detalhe": [...linhas por OS/venda...] }]
//   }]
// }
//
// Lê SÓ o snapshot congelado (fechamentos_comissao*) — nunca o Firebird.
// verify_jwt = false no config.toml: a autenticação é pela API key.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "GET") return json({ error: "method not allowed" }, 405);

  const apiKeyEsperada = Deno.env.get("RH_API_KEY");
  if (!apiKeyEsperada) {
    return json({ error: "RH_API_KEY nao configurada no servidor" }, 500);
  }
  if (req.headers.get("x-api-key") !== apiKeyEsperada) {
    return json({ error: "unauthorized" }, 401);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const url = new URL(req.url);
  const semana = url.searchParams.get("semana");
  const empresa = url.searchParams.get("empresa");
  const ano = url.searchParams.get("ano");
  const mes = url.searchParams.get("mes");

  let q = supabase
    .from("fechamentos_comissao")
    .select("*")
    .order("semana_inicio", { ascending: false })
    .order("cod_empresa", { ascending: true })
    .limit(200);
  if (semana) q = q.eq("semana_inicio", semana);
  if (empresa) q = q.eq("cod_empresa", Number(empresa));
  if (ano) q = q.eq("ano", Number(ano));
  if (mes) q = q.eq("mes", Number(mes));

  const { data: fechamentos, error } = await q;
  if (error) return json({ error: error.message }, 500);

  const ids = (fechamentos ?? []).map((f: any) => f.id);
  let itens: any[] = [];
  if (ids.length) {
    const { data, error: errItens } = await supabase
      .from("fechamentos_comissao_itens")
      .select("*")
      .in("fechamento_id", ids);
    if (errItens) return json({ error: errItens.message }, 500);
    itens = data ?? [];
  }

  return json({
    versao: 1,
    geradoEm: new Date().toISOString(),
    fechamentos: (fechamentos ?? []).map((f: any) => ({
      codEmpresa: f.cod_empresa,
      nomeEmpresa: f.nome_empresa,
      ano: f.ano,
      mes: f.mes,
      semanaInicio: f.semana_inicio,
      semanaFim: f.semana_fim,
      modo: f.modo,
      status: f.status,
      criadoEm: f.criado_em,
      taxasAplicadas: f.taxas_aplicadas,
      premiosAplicados: f.premios_aplicados,
      totais: {
        base: Number(f.total_base),
        restituicoes: Number(f.total_restituicoes),
        comissao: Number(f.total_comissao),
        premio: Number(f.total_premio),
        pagar: Number(f.total_pagar),
      },
      vendedores: itens
        .filter((i) => i.fechamento_id === f.id)
        .map((i) => ({
          codVendedor: i.cod_vendedor,
          vendedorNome: i.vendedor_nome,
          metaSemana: Number(i.meta_semana),
          percentualMeta: Number(i.percentual_meta),
          basePorCategoria: i.base_por_categoria,
          basePorOrigem: i.base_por_origem,
          baseTotal: Number(i.base_total),
          restituicoes: Number(i.restituicoes),
          comissao: Number(i.comissao),
          premioFaixa: i.premio_faixa,
          premioSequencia: i.premio_sequencia,
          premioValor: Number(i.premio_valor),
          totalPagar: Number(i.total_pagar),
          detalhe: i.detalhe,
        })),
    })),
  });
});
