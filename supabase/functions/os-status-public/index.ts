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

interface ConsultaResultado {
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

    const data: ConsultaResultado[] = envelope?.data ?? [];

    if (data.length === 0) {
      return json({
        encontrado: false,
        mensagem: "Nenhuma OS encontrada para este CPF/OS.",
      });
    }

    return json({ encontrado: true, resultados: data });
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
