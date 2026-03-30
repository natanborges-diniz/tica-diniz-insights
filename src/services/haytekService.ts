// src/services/haytekService.ts
// Client-side service para chamar o proxy Haytek via Edge Function

import { supabase } from "@/integrations/supabase/client";

// ============================================
// TYPES
// ============================================

export interface HaytekEyeInput {
  spherical?: string;
  cylindrical?: string;
  axis?: string;
  addition?: string;
  ndp?: string;
  height?: string;
  prism?: {
    horizontal?: { base?: string; value?: string };
    vertical?: { base?: string; value?: string };
  };
}

export interface HaytekFrameInput {
  code: string; // 3PC, ARF, FIN, FIA
  material?: string; // Acetato, Metal
  modelImage?: string; // 001-012
  bridge?: number;
  height?: number;
  width?: number;
}

export interface HaytekColoringInput {
  color?: string; // CNZ, MAR, VDE
  intensityCode?: string; // D25, D50, D80, T25, T50, T80
}

export interface HaytekCustomizationInput {
  frameAngle?: string;
  pantoscopicAngle?: string;
  vertexDistance?: string;
  workDistance?: string; // 1.3, 2, 4
  version?: string; // 0.50, 0.75, 1.00, 1.25
}

export interface HaytekAssemblyInput {
  brand?: string;
  model?: string;
  color?: string;
  polishing?: boolean;
}

export interface HaytekPedidoPayload {
  storeId: string;
  storeName?: string;
  osId: string;
  patientName: string;
  addressId?: string;
  products: {
    productId: string;
    treatment: string;
    frame: HaytekFrameInput;
    right?: HaytekEyeInput;
    left?: HaytekEyeInput;
    corridor?: number;
    coloring?: HaytekColoringInput;
    customization?: HaytekCustomizationInput;
  };
  services?: {
    assembly?: HaytekAssemblyInput;
    remoteCut?: { tracingFile?: string };
  };
}

export interface HaytekPedidoResponse {
  orderId?: string;
  status?: string;
  message?: string;
  error?: string;
}

export interface HaytekOrderTracking {
  orderId?: string;
  status?: string;
  deliveries?: unknown[];
  payment?: unknown;
  [key: string]: unknown;
}

export interface HaytekProduto {
  id: string;
  product_id: string;
  design: string | null;
  linha: string | null;
  material: string | null;
  nome_comercial: string | null;
  esferico_maximo: number | null;
  esferico_minimo: number | null;
  cilindrico_maximo: number | null;
  adicao_minima: number | null;
  adicao_maxima: number | null;
  diametro: string | null;
}

// ============================================
// PROXY CALLS
// ============================================

const HAYTEK_ERROR_MESSAGES: Record<string, string> = {
  HAYTEK_TIMEOUT: "A API Haytek não respondeu a tempo. Tente novamente.",
  HAYTEK_UNAVAILABLE: "Serviço Haytek temporariamente indisponível.",
  HAYTEK_API_ERROR: "Erro na comunicação com Haytek.",
  HAYTEK_CONFIG_ERROR: "Loja não configurada para Haytek. Configure em Admin > Fornecedores.",
};

export interface HaytekProxyError {
  code: string;
  message: string;
  correlationId?: string;
}

async function callHaytekProxy<T>(action: string, params: Record<string, unknown> = {}): Promise<T> {
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData?.session?.access_token;

  if (!accessToken) {
    throw new Error("Sessão expirada. Faça login novamente.");
  }

  const { data, error } = await supabase.functions.invoke("haytek-proxy", {
    body: { action, ...params },
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (error) {
    console.error("[haytekService] Edge function error:", error);
    throw new Error(error.message || "Erro ao chamar proxy Haytek");
  }

  if (data?.error) {
    const code = data.code as string | undefined;
    const isApiError = code === "HAYTEK_API_ERROR";
    const friendlyMessage = isApiError
      ? data.error
      : (code && HAYTEK_ERROR_MESSAGES[code]) || data.error;
    const proxyError: HaytekProxyError = {
      code: code || "HAYTEK_API_ERROR",
      message: friendlyMessage,
      correlationId: data.correlationId,
    };
    throw proxyError;
  }

  return data as T;
}

// ── Criar Pedido ──
export async function criarPedidoHaytek(
  pedido: HaytekPedidoPayload,
  codOs: number,
  codEmpresa: number,
): Promise<HaytekPedidoResponse> {
  return callHaytekProxy<HaytekPedidoResponse>("criar-pedido", {
    pedido,
    codOs,
    codEmpresa,
  });
}

// ── Consultar Pedido ──
export async function consultarPedidoHaytek(
  orderId: string,
  codEmpresa: number,
): Promise<HaytekOrderTracking> {
  return callHaytekProxy<HaytekOrderTracking>("consultar-pedido", {
    orderId,
    codEmpresa,
  });
}

// ── Listar Produtos do Catálogo (local DB) ──
export async function listarProdutosHaytek(): Promise<HaytekProduto[]> {
  const { data, error } = await supabase
    .from("haytek_produtos" as never)
    .select("*")
    .order("product_id");

  if (error) {
    console.error("[haytekService] Error fetching produtos:", error);
    return [];
  }

  return (data || []) as unknown as HaytekProduto[];
}
