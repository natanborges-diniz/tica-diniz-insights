// supabase/functions/os-status-public/index.ts
// Endpoint serviço-a-serviço para consulta de status de OS (chatbot Connect & Flow)
// Auth: header X-Service-Key === INTERNAL_SERVICE_SECRET

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-service-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const BRIDGE_URL =
  Deno.env.get("FIREBIRD_BRIDGE_URL") ||
  "https://firebird-bridge-production.up.railway.app";

interface ConsultaResultadoBruto {
  os: string;
  etapa: string;
  statusAtraso: string;
  atrasoDias: number;
  dataPrevisao: string | null;
  dataEmissao: string | null;
  dataSaida: string | null;
  empresa: string;
  cliente: string;
  vendedor: string;
}

interface ConsultaResultado extends ConsultaResultadoBruto {
  etapaAmigavel: string;
  mensagem: string;
}

// Mapa de etapa do ERP → texto amigável para o cliente final
const ETAPA_AMIGAVEL: Record<string, string> = {
  "ordem de serviço emitida": "Pedido registrado",
  "ordem de serviço enviada ao laboratório": "Enviado ao laboratório",
  "ordem de serviço no laboratório": "Em produção no laboratório",
  "ordem de serviço enviada à loja": "A caminho da loja",
  "ordem de serviço na loja": "Pronto para retirada na loja",
  "ordem de serviço entregue": "Entregue ao cliente",
};

function trimStr(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function humanizarEtapa(etapa: string): string {
  const key = etapa.toLowerCase().trim();
  return ETAPA_AMIGAVEL[key] || etapa || "Em processamento";
}

function formatarDataBR(iso: string | null): string {
  if (!iso) return "—";
  // aceita "YYYY-MM-DD" ou ISO completo
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function montarMensagem(r: ConsultaResultadoBruto, etapaAmigavel: string): string {
  const status = r.statusAtraso.toUpperCase();
  const numero = r.os;
  const previsao = formatarDataBR(r.dataPrevisao);
  const empresa = r.empresa || "loja";

  if (status === "ENTREGUE" || /entregue/i.test(r.etapa)) {
    return `Sua OS ${numero} foi entregue. Obrigado pela preferência!`;
  }

  if (status === "NO_PRAZO") {
    return `Sua OS ${numero} está: ${etapaAmigavel}. Previsão de entrega: ${previsao}.`;
  }

  if (status.startsWith("ATRASO")) {
    const dias = r.atrasoDias || 0;
    const plural = dias === 1 ? "dia" : "dias";
    return `Sua OS ${numero} está: ${etapaAmigavel}. Atenção: ${dias} ${plural} de atraso (previsão original: ${previsao}). Recomendamos contato com a loja ${empresa}.`;
  }

  // fallback
  return `Sua OS ${numero} está: ${etapaAmigavel}. Previsão: ${previsao}.`;
}

function normalizarResultado(raw: ConsultaResultadoBruto): ConsultaResultado {
  const limpo: ConsultaResultadoBruto = {
    os: trimStr(raw.os),
    etapa: trimStr(raw.etapa),
    statusAtraso: trimStr(raw.statusAtraso),
    atrasoDias: Number(raw.atrasoDias) || 0,
    dataPrevisao: raw.dataPrevisao ? trimStr(raw.dataPrevisao) : null,
    dataEmissao: raw.dataEmissao ? trimStr(raw.dataEmissao) : null,
    dataSaida: raw.dataSaida ? trimStr(raw.dataSaida) : null,
    empresa: trimStr(raw.empresa),
    cliente: trimStr(raw.cliente),
    vendedor: trimStr(raw.vendedor),
  };
  const etapaAmigavel = humanizarEtapa(limpo.etapa);
  const mensagem = montarMensagem(limpo, etapaAmigavel);
  return { ...limpo, etapaAmigavel, mensagem };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return json({ error: "Method not allowed" }, 405);
    }

    // 1. Auth via X-Service-Key
    const serviceKey = req.headers.get("x-service-key") || req.headers.get("X-Service-Key");
    const expected = Deno.env.get("INTERNAL_SERVICE_SECRET");
    if (!expected) {
      console.error("[os-status-public] INTERNAL_SERVICE_SECRET não configurado");
      return json({ error: "Servidor mal configurado" }, 500);
    }
    if (!serviceKey || serviceKey !== expected) {
      return json({ error: "X-Service-Key inválido" }, 401);
    }

    // 2. Parse body
    let body: { cpf?: string; os?: string | number };
    try {
      body = await req.json();
    } catch {
      return json({ error: "Body JSON inválido" }, 400);
    }

    const cpfRaw = body.cpf ? String(body.cpf).replace(/\D/g, "") : "";
    const osRaw = body.os ? String(body.os).trim() : "";

    if (!cpfRaw && !osRaw) {
      return json({ error: "Informe cpf ou os no body" }, 400);
    }

    // 3. Chama Bridge
    const url = new URL(`${BRIDGE_URL}/api/v1/os/consulta-status`);
    if (osRaw) url.searchParams.set("os", osRaw);
    else url.searchParams.set("cpf", cpfRaw);

    console.log("[os-status-public] →", url.pathname, { cpf: cpfRaw ? "***" : null, os: osRaw || null });

    const bridgeRes = await fetch(url.toString(), {
      method: "GET",
      headers: { Accept: "application/json" },
    });

    const envelope = await bridgeRes.json();

    if (!bridgeRes.ok || envelope?.ok === false) {
      console.error("[os-status-public] Bridge erro:", envelope);
      return json(
        { error: envelope?.error?.message || "Erro ao consultar status" },
        bridgeRes.status >= 400 ? bridgeRes.status : 500
      );
    }

    const data: ConsultaResultadoBruto[] = envelope?.data ?? [];

    if (data.length === 0) {
      return json({
        encontrado: false,
        mensagem: "Nenhuma OS encontrada para este CPF/OS.",
      });
    }

    const resultados = data.map(normalizarResultado);

    return json({ encontrado: true, resultados });
  } catch (err) {
    console.error("[os-status-public] erro:", err);
    return json({ error: err instanceof Error ? err.message : "Erro desconhecido" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
