// supabase/functions/zeiss-proxy/index.ts
// Proxy seguro para API MaisZeiss
// Auth: usersao + CNPJ por loja (zeiss_empresa_config)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authGuard, corsHeaders } from "../_shared/authGuard.ts";

const ZEISS_ERROR_CODES = {
  TIMEOUT: "ZEISS_TIMEOUT",
  UNAVAILABLE: "ZEISS_UNAVAILABLE",
  API_ERROR: "ZEISS_API_ERROR",
  CONFIG_ERROR: "ZEISS_CONFIG_ERROR",
} as const;

function generateCorrelationId(): string {
  return crypto.randomUUID().slice(0, 8);
}

// Load Zeiss config from fornecedor_configuracao
interface ZeissRuntimeConfig {
  baseUrl: string;
  ambiente: string;
  apiKey: string | null;
}

async function loadZeissConfig(sb: ReturnType<typeof createClient>): Promise<ZeissRuntimeConfig> {
  try {
    const { data } = await sb
      .from("fornecedor_configuracao")
      .select("ambiente, base_url_staging, base_url_production, api_key_staging, api_key_production")
      .eq("fornecedor", "ZEISS")
      .eq("ativo", true)
      .maybeSingle();

    if (data) {
      const isProduction = data.ambiente === "production";
      const baseUrl = isProduction
        ? (data.base_url_production || "https://a9lt368bb2.execute-api.us-east-2.amazonaws.com/prd")
        : (data.base_url_staging || "https://aupk1256rl.execute-api.us-east-2.amazonaws.com/dev");
      const apiKey = isProduction ? (data.api_key_production || null) : (data.api_key_staging || null);
      return { baseUrl, ambiente: data.ambiente, apiKey };
    }
  } catch (e) {
    console.warn("[zeiss-proxy] Could not load DB config:", e);
  }
  return {
    baseUrl: "https://aupk1256rl.execute-api.us-east-2.amazonaws.com/dev",
    ambiente: "staging",
    apiKey: null,
  };
}

// Load store credentials from zeiss_empresa_config
interface ZeissStoreConfig {
  userSao: string;
  cnpj: string;
}

async function loadStoreConfig(sb: ReturnType<typeof createClient>, codEmpresa: number): Promise<ZeissStoreConfig | null> {
  const { data } = await sb
    .from("zeiss_empresa_config")
    .select("cod_cliente_sao, cnpj")
    .eq("cod_empresa", codEmpresa)
    .eq("ativo", true)
    .maybeSingle();

  if (data?.cod_cliente_sao && data?.cnpj) {
    return { userSao: data.cod_cliente_sao, cnpj: data.cnpj.replace(/[.\-/]/g, "") };
  }
  return null;
}

// Fetch with timeout (15s)
async function fetchZeiss(url: string, options: RequestInit, correlationId: string, action: string, apiKey?: string | null): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  const start = Date.now();

  // Inject API key header if available
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((options.headers as Record<string, string>) || {}),
  };
  if (apiKey) {
    headers["x-api-key"] = apiKey;
  }

  try {
    const resp = await fetch(url, { ...options, headers, signal: controller.signal });
    clearTimeout(timer);
    console.log(`[zeiss-proxy] [${correlationId}] ${action} -> ${resp.status} (${Date.now() - start}ms)`);

    if (resp.status === 403) {
      throw {
        code: ZEISS_ERROR_CODES.UNAVAILABLE,
        message: "API Zeiss retornou 403 Forbidden. Verifique se a API key está correta e se os IPs estão liberados.",
        correlationId,
      };
    }

    if (resp.status === 401) {
      throw {
        code: ZEISS_ERROR_CODES.CONFIG_ERROR,
        message: "API Zeiss retornou 401 Unauthorized. Verifique as credenciais (usersao/cnpj) da loja.",
        correlationId,
      };
    }

    return resp;
  } catch (err) {
    clearTimeout(timer);
    if ((err as { code?: string })?.code) throw err;
    const isTimeout = err instanceof DOMException && err.name === "AbortError";
    throw {
      code: isTimeout ? ZEISS_ERROR_CODES.TIMEOUT : ZEISS_ERROR_CODES.UNAVAILABLE,
      message: isTimeout ? "API Zeiss não respondeu em 15s" : `Erro de rede: ${err}`,
      correlationId,
    };
  }
}

function isNegativeStatus(status: string): boolean {
  const s = status.toLowerCase();
  return s.includes("cancel") || s.includes("rejeit") || s.includes("recusad") || s.includes("devolv") || s.includes("negad");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const correlationId = generateCorrelationId();

  try {
    const body = await req.json();
    const { action, ...params } = body;

    // Auth guard
    const user = await authGuard(req, { requiredRole: "authenticated" });

    const sbService = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const zeissConfig = await loadZeissConfig(sbService);
    const BASE_URL = zeissConfig.baseUrl;

    console.log(`[zeiss-proxy] [${correlationId}] Action: ${action} | Env: ${zeissConfig.ambiente} | User: ${user.userId}`);

    switch (action) {
      // ── Listar Produtos ──
      case "listar-produtos": {
        const codEmpresa = Number(params.codEmpresa);
        const store = await loadStoreConfig(sbService, codEmpresa);
        if (!store) {
          return new Response(JSON.stringify({ error: "Loja não configurada para Zeiss", code: ZEISS_ERROR_CODES.CONFIG_ERROR, correlationId }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const url = `${BASE_URL}/produtos/lista/1/${store.cnpj}`;
        const resp = await fetchZeiss(url, { method: "GET", headers: { "Content-Type": "application/json" } }, correlationId, "listar-produtos", zeissConfig.apiKey);
        const data = await resp.json();

        if (data?.erro) {
          return new Response(JSON.stringify({ error: data.erro, code: ZEISS_ERROR_CODES.API_ERROR, correlationId }), {
            status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        return new Response(JSON.stringify(data?.sao?.produtos || []), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json", "X-Correlation-Id": correlationId },
        });
      }

      // ── Criar Pedido (dois passos) ──
      case "criar-pedido": {
        const codEmpresa = Number(params.codEmpresa);
        const codOs = Number(params.codOs);
        const store = await loadStoreConfig(sbService, codEmpresa);
        if (!store) {
          return new Response(JSON.stringify({ error: "Loja não configurada para Zeiss", code: ZEISS_ERROR_CODES.CONFIG_ERROR, correlationId }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const pedidoPayload = params.pedido || {};
        // Inject usersao and cnpj
        pedidoPayload.usersao = store.userSao;
        pedidoPayload.cnpj = store.cnpj;

        const zeissBody = { sao: { pedido: pedidoPayload } };
        const url = `${BASE_URL}/pedidos/criar`;

        // Idempotency check
        const payloadStr = JSON.stringify(zeissBody);
        const payloadHash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(payloadStr));
        const hashHex = Array.from(new Uint8Array(payloadHash)).map(b => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
        const idempotencyKey = `ZEISS_${codEmpresa}_${codOs}_${zeissConfig.ambiente}_${hashHex}`;

        // Skip idempotency for approval step (has aprov data)
        const isApprovalStep = !!pedidoPayload.aprov;
        if (!isApprovalStep) {
          const { data: existing } = await sbService
            .from("pedidos_fornecedor")
            .select("*")
            .eq("idempotency_key", idempotencyKey)
            .neq("status", "ERRO")
            .maybeSingle();

          if (existing) {
            return new Response(JSON.stringify({
              numeroPedido: existing.numero_pedido,
              status: existing.status,
              idempotencyHit: true,
              message: "Pedido já enviado para esta OS/empresa/ambiente.",
            }), {
              status: 200, headers: { ...corsHeaders, "Content-Type": "application/json", "X-Correlation-Id": correlationId },
            });
          }
        }

        console.log(`[zeiss-proxy] [${correlationId}] criar-pedido URL: ${url}`);
        console.log(`[zeiss-proxy] [${correlationId}] criar-pedido BODY: ${payloadStr.substring(0, 2000)}`);

        const resp = await fetchZeiss(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: payloadStr,
        }, correlationId, "criar-pedido", zeissConfig.apiKey);

        const respText = await resp.text();
        let respData: Record<string, unknown>;
        try { respData = JSON.parse(respText); } catch { respData = { rawResponse: respText }; }

        // Check for errors: API may return { erro: ... } or { message: "Falha..." } or HTTP 5xx
        const apiErrorMsg = respData.erro || (resp.status >= 400 ? (respData.message || respData.rawResponse || `HTTP ${resp.status}`) : null);
        if (apiErrorMsg) {
          // Save error record
          await sbService.from("pedidos_fornecedor").insert({
            cod_os: codOs,
            cod_empresa: codEmpresa,
            fornecedor: "ZEISS",
            status: "ERRO",
            payload: zeissBody,
            response: respData,
            requested_by: user.userId,
            hoya_environment: zeissConfig.ambiente,
            idempotency_key: idempotencyKey,
          });

          return new Response(JSON.stringify({ error: respData.erro, code: ZEISS_ERROR_CODES.API_ERROR, correlationId, raw: respData }), {
            status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const pedidoResp = (respData as any)?.sao?.pedido;

        // Check if approval is needed (two-step flow)
        if (pedidoResp?.aprov && !pedidoResp?.nrpedido) {
          // Step 1: Return approval data to frontend
          return new Response(JSON.stringify({
            needsApproval: true,
            aprov: pedidoResp.aprov,
            precos: pedidoResp.preco || [],
            campanhas: pedidoResp.campanha || [],
            mesmaReceita: pedidoResp.mesmarec || [],
            antecDescricao: pedidoResp.antec || null,
          }), {
            status: 200, headers: { ...corsHeaders, "Content-Type": "application/json", "X-Correlation-Id": correlationId },
          });
        }

        // Step 2 or direct confirmation
        const numeroPedido = pedidoResp?.nrpedido || null;
        const voucherGerado = pedidoResp?.voucher || null;
        const estabelecimento = pedidoResp?.est || null;

        // Save to pedidos_fornecedor
        await sbService.from("pedidos_fornecedor").insert({
          cod_os: codOs,
          cod_empresa: codEmpresa,
          fornecedor: "ZEISS",
          numero_pedido: numeroPedido,
          status: numeroPedido ? "CONFIRMADO" : "PENDENTE",
          payload: zeissBody,
          response: respData,
          requested_by: user.userId,
          hoya_environment: zeissConfig.ambiente,
          idempotency_key: idempotencyKey,
        });

        // Save voucher if generated
        if (voucherGerado && params.cpfPaciente) {
          await sbService.from("voucher_cliente").upsert({
            cpf: params.cpfPaciente,
            voucher: voucherGerado,
            cod_empresa: codEmpresa,
            numero_pedido: numeroPedido,
            cliente_nome: params.paciente || null,
          }, { onConflict: "cpf" });
        }

        return new Response(JSON.stringify({
          numeroPedido,
          voucherGerado,
          estabelecimento,
          status: numeroPedido ? "CONFIRMADO" : "PENDENTE",
        }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json", "X-Correlation-Id": correlationId },
        });
      }

      // ── Consultar Pedido (Tracking) ──
      case "consultar-pedido": {
        const codEmpresa = Number(params.codEmpresa);
        const store = await loadStoreConfig(sbService, codEmpresa);
        if (!store) {
          return new Response(JSON.stringify({ error: "Loja não configurada", code: ZEISS_ERROR_CODES.CONFIG_ERROR, correlationId }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const url = `${BASE_URL}/pedidos/detalhe`;
        const resp = await fetchZeiss(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            codcli: Number(store.userSao),
            idpais: 1,
            numpedido: Number(params.numeroPedido),
          }),
        }, correlationId, "consultar-pedido", zeissConfig.apiKey);

        const data = await resp.json();

        if (data?.erro) {
          return new Response(JSON.stringify({ error: data.erro, code: ZEISS_ERROR_CODES.API_ERROR, correlationId }), {
            status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        return new Response(JSON.stringify(data?.sao?.pedido || data), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json", "X-Correlation-Id": correlationId },
        });
      }

      // ── Atualizar Tracking ──
      case "atualizar-tracking": {
        const numeroPedido = params.numeroPedido;
        const pedidoFornecedorId = params.pedidoFornecedorId;
        const codEmpresa = Number(params.codEmpresa);

        if (!numeroPedido) {
          return new Response(JSON.stringify({ error: "numeroPedido obrigatório" }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const store = await loadStoreConfig(sbService, codEmpresa);
        if (!store) {
          return new Response(JSON.stringify({ error: "Loja não configurada", code: ZEISS_ERROR_CODES.CONFIG_ERROR }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const url = `${BASE_URL}/pedidos/detalhe`;
        const resp = await fetchZeiss(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ codcli: Number(store.userSao), idpais: 1, numpedido: Number(numeroPedido) }),
        }, correlationId, "atualizar-tracking", zeissConfig.apiKey);

        const data = await resp.json();
        const pedidoData = data?.sao?.pedido || data;
        const situacao = pedidoData?.situacao || pedidoData?.Situação || "Desconhecido";
        const codigoSituacao = pedidoData?.codigoSituacao || pedidoData?.["Código da Situação"] || null;
        const rastreamento = pedidoData?.rastreamento || null;

        // Map situacao to normalized status
        const newStatus = String(situacao);

        // Find pedido_fornecedor
        let pfId = pedidoFornecedorId;
        let pfCodEmpresa = codEmpresa;
        if (!pfId) {
          const { data: pfRec } = await sbService
            .from("pedidos_fornecedor")
            .select("id, cod_empresa")
            .eq("numero_pedido", String(numeroPedido))
            .eq("fornecedor", "ZEISS")
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          pfId = pfRec?.id;
          pfCodEmpresa = pfRec?.cod_empresa ?? codEmpresa;
        }

        if (!pfId) {
          return new Response(JSON.stringify({ tracking: pedidoData, saved: false, reason: "pedido_fornecedor não encontrado" }), {
            status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Check for status change
        const { data: lastEntry } = await sbService
          .from("pedido_status_history")
          .select("status, rastreio")
          .eq("pedido_fornecedor_id", pfId)
          .order("checked_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        const statusChanged = !lastEntry || lastEntry.status !== newStatus || lastEntry.rastreio !== rastreamento;

        if (statusChanged) {
          await sbService.from("pedido_status_history").insert({
            pedido_fornecedor_id: pfId,
            status: newStatus,
            status_producao: codigoSituacao ? String(codigoSituacao) : null,
            rastreio: rastreamento,
          });
          await sbService.from("pedidos_fornecedor").update({ status: newStatus }).eq("id", pfId);

          if (pfCodEmpresa && isNegativeStatus(newStatus)) {
            await sbService.from("pedido_alertas").upsert({
              pedido_fornecedor_id: pfId,
              cod_empresa: pfCodEmpresa,
              status_detectado: newStatus,
              acknowledged: false,
            }, { onConflict: "pedido_fornecedor_id" });
          }
        }

        const { data: timeline } = await sbService
          .from("pedido_status_history")
          .select("*")
          .eq("pedido_fornecedor_id", pfId)
          .order("checked_at", { ascending: true });

        return new Response(JSON.stringify({ tracking: pedidoData, timeline: timeline || [], statusChanged, saved: true }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json", "X-Correlation-Id": correlationId },
        });
      }

      // ── Histórico de Pedidos ──
      case "historico-pedidos": {
        let query = sbService.from("pedidos_fornecedor")
          .select("*")
          .eq("fornecedor", "ZEISS")
          .order("created_at", { ascending: false })
          .limit(params.limit || 50);

        if (params.codEmpresa && params.codEmpresa !== "ALL") {
          query = query.eq("cod_empresa", Number(params.codEmpresa));
        }

        const { data: pedidos, error: dbErr } = await query;
        if (dbErr) throw new Error(dbErr.message);

        return new Response(JSON.stringify(pedidos || []), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // ── Timeline ──
      case "timeline-pedido": {
        const { data: tlData } = await sbService
          .from("pedido_status_history")
          .select("*")
          .eq("pedido_fornecedor_id", params.pedidoFornecedorId)
          .order("checked_at", { ascending: true });

        return new Response(JSON.stringify(tlData || []), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // ── Cancelar Pedido ──
      case "cancelar-pedido": {
        const url = `${BASE_URL}/pedidos/cancelar`;
        const resp = await fetchZeiss(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            idpais: 1,
            estabel: params.estabelecimento,
            numpedido: params.numeroPedido,
          }),
        }, correlationId, "cancelar-pedido", zeissConfig.apiKey);

        const data = await resp.json();
        return new Response(JSON.stringify(data), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json", "X-Correlation-Id": correlationId },
        });
      }

      // ── Listar Serviços ──
      case "listar-servicos": {
        const url = `${BASE_URL}/servicos/lista/1`;
        const resp = await fetchZeiss(url, { method: "GET", headers: { "Content-Type": "application/json" } }, correlationId, "listar-servicos", zeissConfig.apiKey);
        const data = await resp.json();
        return new Response(JSON.stringify(data?.sao?.servicos || []), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // ── Serviços por Produto ──
      case "servicos-por-produto": {
        const codEmpresa = Number(params.codEmpresa);
        const familia = params.familia;
        if (!familia) {
          return new Response(JSON.stringify({ error: "familia obrigatório" }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const store = await loadStoreConfig(sbService, codEmpresa);
        if (!store) {
          return new Response(JSON.stringify({ error: "Loja não configurada", code: ZEISS_ERROR_CODES.CONFIG_ERROR, correlationId }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const url = `${BASE_URL}/produtos/servicos/1/${familia}/${store.cnpj}`;
        const resp = await fetchZeiss(url, { method: "GET", headers: { "Content-Type": "application/json" } }, correlationId, "servicos-por-produto", zeissConfig.apiKey);
        const data = await resp.json();
        return new Response(JSON.stringify(data?.sao?.servicos || data), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json", "X-Correlation-Id": correlationId },
        });
      }

      // ── Consulta de Cores ──
      case "listar-cores": {
        const familia = params.familia;
        if (!familia) {
          return new Response(JSON.stringify({ error: "familia obrigatório" }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const url = `${BASE_URL}/coloracao/lista/1/${familia}`;
        const resp = await fetchZeiss(url, { method: "GET", headers: { "Content-Type": "application/json" } }, correlationId, "listar-cores", zeissConfig.apiKey);
        const data = await resp.json();
        return new Response(JSON.stringify(data?.sao?.cores || data), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json", "X-Correlation-Id": correlationId },
        });
      }

      // ── Sugestão de Base ──
      case "sugestao-base": {
        const codEmpresa = Number(params.codEmpresa);
        const { familia, esf, cil, adicao } = params;
        if (!familia) {
          return new Response(JSON.stringify({ error: "familia obrigatório" }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const store = await loadStoreConfig(sbService, codEmpresa);
        if (!store) {
          return new Response(JSON.stringify({ error: "Loja não configurada", code: ZEISS_ERROR_CODES.CONFIG_ERROR, correlationId }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const url = `${BASE_URL}/pedidos/base/sugestao/1/${store.cnpj}/${familia}/${esf || "0"}/${cil || "0"}/${adicao || "0"}`;
        const resp = await fetchZeiss(url, { method: "GET", headers: { "Content-Type": "application/json" } }, correlationId, "sugestao-base", zeissConfig.apiKey);
        const data = await resp.json();
        return new Response(JSON.stringify(data), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json", "X-Correlation-Id": correlationId },
        });
      }

      // ── Tabela de Preços ──
      case "tabela-precos": {
        const codEmpresa = Number(params.codEmpresa);
        const store = await loadStoreConfig(sbService, codEmpresa);
        if (!store) {
          return new Response(JSON.stringify({ error: "Loja não configurada", code: ZEISS_ERROR_CODES.CONFIG_ERROR, correlationId }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const url = `${BASE_URL}/cliente/tabelapreco/consumidor/1/${store.cnpj}`;
        const resp = await fetchZeiss(url, { method: "GET", headers: { "Content-Type": "application/json" } }, correlationId, "tabela-precos", zeissConfig.apiKey);
        const data = await resp.json();
        return new Response(JSON.stringify(data), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json", "X-Correlation-Id": correlationId },
        });
      }

      default:
        return new Response(JSON.stringify({ error: `Ação desconhecida: ${action}` }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
  } catch (err) {
    if (err instanceof Response) return err;

    const errObj = err as { code?: string; message?: string; correlationId?: string };
    console.error(`[zeiss-proxy] [${correlationId}] Error:`, err);

    return new Response(JSON.stringify({
      error: errObj.message || "Erro interno no proxy Zeiss",
      code: errObj.code || ZEISS_ERROR_CODES.API_ERROR,
      correlationId: errObj.correlationId || correlationId,
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
