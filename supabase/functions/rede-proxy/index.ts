import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const REDE_SANDBOX_URL = "https://sandbox-erede.useredecloud.com.br";
const REDE_PRODUCTION_URL = "https://api.userede.com.br/erede";

interface AdquirenteConfig {
  id: string;
  cod_empresa: number;
  adquirente: string;
  ambiente: string;
  merchant_id: string | null;
  merchant_id_production: string | null;
  integration_key_encrypted: string | null;
  integration_key_production: string | null;
  ativo: boolean;
}

async function getRedeCredentials(supabaseAdmin: ReturnType<typeof createClient>, codEmpresa: number): Promise<{ pv: string; key: string; baseUrl: string }> {
  const { data, error } = await supabaseAdmin
    .from("adquirentes_config")
    .select("*")
    .eq("cod_empresa", codEmpresa)
    .eq("adquirente", "REDE")
    .eq("ativo", true)
    .single();

  if (error || !data) throw new Error(`Nenhuma configuração Rede ativa para empresa ${codEmpresa}`);

  const config = data as AdquirenteConfig;
  const isProduction = config.ambiente === "production";

  // Resolve credentials based on active environment
  const pv = isProduction
    ? (config.merchant_id_production || config.merchant_id)
    : config.merchant_id;

  const key = isProduction
    ? (config.integration_key_production || config.integration_key_encrypted)
    : config.integration_key_encrypted;

  if (!pv) throw new Error(`PV (Merchant ID) não configurado para ambiente ${config.ambiente}`);
  if (pv === "PENDENTE") throw new Error(`PV de filiação da empresa ${codEmpresa} ainda está como PENDENTE. Atualize o Merchant ID em Adquirentes.`);
  if (!key) throw new Error(`Chave de integração não configurada para ambiente ${config.ambiente}`);

  const baseUrl = isProduction ? REDE_PRODUCTION_URL : REDE_SANDBOX_URL;
  return { pv, key, baseUrl };
}

function basicAuth(pv: string, key: string): string {
  return "Basic " + btoa(`${pv}:${key}`);
}

// Mapeamento de returnCode REDE -> mensagem amigável + categoria + ação sugerida
// Categorias: "ISSUER" (cliente liga no banco), "CARD_DATA" (revisar dados), "RETRY" (tentar de novo), "BLOCKED" (não tente de novo), "MERCHANT" (problema do lojista)
type RedeErrorCategory = "ISSUER" | "CARD_DATA" | "RETRY" | "BLOCKED" | "MERCHANT" | "UNKNOWN";

interface RedeErrorInfo {
  userMessage: string;
  category: RedeErrorCategory;
  retryable: boolean;
  suggestion: string;
}

const REDE_RETURN_CODES: Record<string, RedeErrorInfo> = {
  "00": { userMessage: "Aprovado", category: "UNKNOWN", retryable: false, suggestion: "" },
  "01": { userMessage: "Cartão recusado pelo banco emissor.", category: "ISSUER", retryable: false, suggestion: "Entre em contato com seu banco ou tente outro cartão." },
  "04": { userMessage: "Cartão bloqueado pelo banco emissor.", category: "BLOCKED", retryable: false, suggestion: "Use outro cartão." },
  "05": { userMessage: "Cartão recusado.", category: "ISSUER", retryable: false, suggestion: "Verifique com seu banco ou tente outro cartão." },
  "06": { userMessage: "Erro temporário no banco emissor.", category: "RETRY", retryable: true, suggestion: "Tente novamente em alguns minutos." },
  "12": { userMessage: "Transação inválida.", category: "MERCHANT", retryable: false, suggestion: "Entre em contato com a loja." },
  "13": { userMessage: "Valor inválido.", category: "MERCHANT", retryable: false, suggestion: "Entre em contato com a loja." },
  "14": { userMessage: "Número do cartão incorreto.", category: "CARD_DATA", retryable: true, suggestion: "Confira o número do cartão e tente novamente." },
  "15": { userMessage: "Banco emissor desconhecido.", category: "ISSUER", retryable: false, suggestion: "Use outro cartão." },
  "30": { userMessage: "Erro de comunicação com a operadora.", category: "RETRY", retryable: true, suggestion: "Tente novamente em alguns instantes." },
  "41": { userMessage: "Cartão informado como perdido.", category: "BLOCKED", retryable: false, suggestion: "Use outro cartão." },
  "43": { userMessage: "Cartão informado como roubado.", category: "BLOCKED", retryable: false, suggestion: "Use outro cartão." },
  "51": { userMessage: "Saldo ou limite insuficiente.", category: "ISSUER", retryable: false, suggestion: "Tente um valor menor ou outro cartão." },
  "54": { userMessage: "Cartão vencido.", category: "CARD_DATA", retryable: false, suggestion: "Confira a validade ou use outro cartão." },
  "55": { userMessage: "Senha incorreta.", category: "CARD_DATA", retryable: true, suggestion: "Tente novamente." },
  "57": { userMessage: "Transação não permitida para este cartão.", category: "ISSUER", retryable: false, suggestion: "Use outro cartão de crédito." },
  "58": { userMessage: "Transação não permitida pelo estabelecimento.", category: "MERCHANT", retryable: false, suggestion: "Entre em contato com a loja." },
  "61": { userMessage: "Valor excede o limite do cartão.", category: "ISSUER", retryable: false, suggestion: "Tente um valor menor ou outro cartão." },
  "62": { userMessage: "Cartão restrito pelo banco emissor.", category: "ISSUER", retryable: false, suggestion: "Entre em contato com seu banco ou use outro cartão." },
  "63": { userMessage: "Violação de segurança no cartão.", category: "BLOCKED", retryable: false, suggestion: "Use outro cartão." },
  "65": { userMessage: "Limite de saques/compras excedido.", category: "ISSUER", retryable: false, suggestion: "Tente novamente amanhã ou use outro cartão." },
  "75": { userMessage: "Excedido número de tentativas com senha incorreta.", category: "BLOCKED", retryable: false, suggestion: "Use outro cartão." },
  "78": { userMessage: "Cartão bloqueado para primeiro uso.", category: "ISSUER", retryable: false, suggestion: "Desbloqueie no app do banco e tente novamente." },
  "82": { userMessage: "CVV inválido.", category: "CARD_DATA", retryable: true, suggestion: "Confira o código de segurança (CVV) e tente novamente." },
  "91": { userMessage: "Banco emissor temporariamente indisponível.", category: "RETRY", retryable: true, suggestion: "Tente novamente em alguns minutos." },
  "96": { userMessage: "Erro temporário do sistema.", category: "RETRY", retryable: true, suggestion: "Tente novamente em alguns instantes." },
  "107": { userMessage: "Pagamento recusado pelo banco emissor.", category: "ISSUER", retryable: false, suggestion: "O cartão pode não estar habilitado para compras online. Entre em contato com seu banco ou tente outro cartão." },
  "150": { userMessage: "Erro no processamento do banco emissor.", category: "RETRY", retryable: true, suggestion: "Tente novamente em alguns instantes." },
  "203": { userMessage: "Cartão bloqueado para compras online.", category: "ISSUER", retryable: false, suggestion: "Habilite compras online no app do seu banco ou use outro cartão." },
  "303": { userMessage: "Tempo de processamento excedido.", category: "RETRY", retryable: true, suggestion: "Tente novamente." },
  "475": { userMessage: "Antifraude recusou a transação.", category: "ISSUER", retryable: false, suggestion: "Verifique seus dados ou tente outro cartão." },
  "569": { userMessage: "Pagamento não autorizado pelo emissor.", category: "ISSUER", retryable: false, suggestion: "Entre em contato com seu banco ou use outro cartão." },
};

function classifyRedeError(returnCode: unknown, returnMessage?: string): RedeErrorInfo {
  const code = String(returnCode ?? "").trim();
  if (REDE_RETURN_CODES[code]) return REDE_RETURN_CODES[code];
  // Fallback inteligente por mensagem
  const msg = (returnMessage || "").toLowerCase();
  if (msg.includes("unauth")) {
    return { userMessage: "Pagamento recusado pelo banco emissor.", category: "ISSUER", retryable: false, suggestion: "Entre em contato com seu banco ou tente outro cartão." };
  }
  if (msg.includes("expired") || msg.includes("vencid")) {
    return { userMessage: "Cartão vencido.", category: "CARD_DATA", retryable: false, suggestion: "Confira a validade ou use outro cartão." };
  }
  if (msg.includes("insufficient") || msg.includes("limite")) {
    return { userMessage: "Saldo ou limite insuficiente.", category: "ISSUER", retryable: false, suggestion: "Tente um valor menor ou outro cartão." };
  }
  return {
    userMessage: "Não foi possível processar o pagamento.",
    category: "UNKNOWN",
    retryable: true,
    suggestion: "Tente novamente ou use outro cartão.",
  };
}

async function redeRequest(baseUrl: string, path: string, pv: string, key: string, method = "GET", body?: unknown) {
  const url = `${baseUrl}${path}`;
  console.log(`[rede-proxy] ${method} ${url}`);

  const headers: Record<string, string> = {
    Authorization: basicAuth(pv, key),
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  const opts: RequestInit = { method, headers };
  if (body && method !== "GET") {
    opts.body = JSON.stringify(body);
  }

  const res = await fetch(url, opts);
  const text = await res.text();

  let parsed: any;
  try { parsed = JSON.parse(text); } catch { parsed = { raw: text }; }

  if (!res.ok) {
    // Se a REDE devolveu um returnCode estruturado dentro do 4xx (caso típico de recusa do emissor),
    // não tratamos como erro de transporte: devolvemos a resposta para o caller classificar.
    if (parsed && typeof parsed === "object" && (parsed.returnCode !== undefined || parsed.tid)) {
      console.warn(`[rede-proxy] ${res.status} with structured returnCode=${parsed.returnCode} tid=${parsed.tid}`);
      return parsed;
    }
    console.error(`[rede-proxy] ${res.status} response:`, text.slice(0, 500));
    const err = new Error(`e.Rede API ${res.status}`) as Error & { httpStatus?: number; redeRaw?: string };
    err.httpStatus = res.status;
    err.redeRaw = text.slice(0, 300);
    throw err;
  }

  return parsed;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { action, cod_empresa, ...params } = body;

    if (!action) throw new Error("action é obrigatório");
    if (!cod_empresa) throw new Error("cod_empresa é obrigatório");

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { pv, key, baseUrl } = await getRedeCredentials(supabaseAdmin, cod_empresa);

    let result: unknown;

    switch (action) {
      case "consultar_transacoes": {
        const qs = new URLSearchParams();
        if (params.status) qs.set("status", params.status);
        if (params.start_date) qs.set("startDate", params.start_date);
        if (params.end_date) qs.set("endDate", params.end_date);
        if (params.page) qs.set("page", String(params.page));
        if (params.rows) qs.set("rows", String(params.rows));
        const qsStr = qs.toString();
        result = await redeRequest(baseUrl, `/v1/transactions${qsStr ? "?" + qsStr : ""}`, pv, key);
        break;
      }

      case "consultar_transacao": {
        if (!params.tid) throw new Error("tid é obrigatório");
        result = await redeRequest(baseUrl, `/v1/transactions/${params.tid}`, pv, key);
        break;
      }

      case "criar_transacao": {
        if (!params.amount) throw new Error("amount é obrigatório");
        if (!params.reference) throw new Error("reference é obrigatório");

        const txBody: Record<string, unknown> = {
          kind: params.kind || "credit",
          reference: params.reference,
          amount: Math.round(params.amount * 100),
          installments: params.installments || 1,
          capture: params.capture !== false,
        };

        if (params.softDescriptor) txBody.softDescriptor = params.softDescriptor;
        if (params.subscription !== undefined) txBody.subscription = params.subscription;
        if (params.urls) txBody.urls = params.urls;
        if (params.antifraud) txBody.antifraud = params.antifraud;

        if (params.cardNumber) {
          txBody.cardholderName = params.cardholderName;
          txBody.cardNumber = params.cardNumber;
          txBody.expirationMonth = params.expirationMonth;
          txBody.expirationYear = params.expirationYear;
          txBody.securityCode = params.securityCode;
        }

        result = await redeRequest(baseUrl, "/v1/transactions", pv, key, "POST", txBody);
        break;
      }

      case "cancelar_transacao": {
        if (!params.tid) throw new Error("tid é obrigatório");
        if (!params.amount) throw new Error("amount é obrigatório");
        const cancelBody = { amount: Math.round(params.amount * 100) };
        result = await redeRequest(baseUrl, `/v1/transactions/${params.tid}/refunds/amount`, pv, key, "PUT", cancelBody);
        break;
      }

      case "health": {
        try {
          await redeRequest(baseUrl, "/v1/transactions?rows=1", pv, key);
          result = { ok: true, ambiente: baseUrl.includes("sandbox") ? "sandbox" : "production" };
        } catch (e) {
          result = { ok: false, error: (e as Error).message };
        }
        break;
      }

      default:
        throw new Error(`Action '${action}' não suportada. Use: consultar_transacoes, consultar_transacao, criar_transacao, cancelar_transacao, health`);
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[rede-proxy] Error:", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
