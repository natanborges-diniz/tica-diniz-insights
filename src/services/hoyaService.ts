// src/services/hoyaService.ts
// Client-side service para chamar o proxy Hoya via Edge Function

import { supabase } from "@/integrations/supabase/client";

// ============================================
// TYPES
// ============================================

export interface HoyaProduto {
  codigoProduto: number;
  nome: string;
  tipoLente: string;
  codigoDesenho: number;
  desenho: string;
  codigoMaterial: number;
  material: number | string;
  codigoTratamento: number;
  tratamento: string;
  codigoAltura: number | null;
  altura: number | null;
  codigoFotossensivel?: number | null;
  fotossensivel?: string | null;
  origem: string;
  esfericoMinimo: number;
  esfericoMaximo: number;
  cilindricoMinimo: number;
  cilindricoMaximo: number;
  adicaoMinima: number;
  adicaoMaxima: number;
  alturaPupilarMinima: number;
  alturaPupilarMaxima: number;
  permiteColoracao: boolean;
  permiteCorte: boolean;
  precos: { lista: string; preco: number }[];
  camposComplementares?: {
    codigo: number;
    nome: string;
    valorPadrao: string | number;
    rangeMinimo: number;
    rangeMaximo: number;
    incremento: string | number;
    obrigatorio: boolean;
  }[];
  coloracoes?: {
    codigo: string;
    nome: string;
    codigoMaterial: number;
    nomeMaterial: string | number;
    codigoTratamento: number;
    nomeTratamento: string;
  }[];
}

export interface HoyaPedidoPayload {
  os: string;
  observacao?: string;
  codigoCliente?: number;
  voucher?: string;
  especificacoes: {
    codigoProduto?: number;
    tipoServico: number;
    codigoColoracao?: string | null;
    codigoDesenho?: number;
    codigoAltura?: number;
    codigoMaterial?: number;
    codigoTratamento?: number;
    codigoFotossensivel?: number;
  };
  prescricao: {
    // Opcionais para permitir pedidos monoculares (apenas OD ou apenas OE).
    // Quando o cliente pede só uma lente, o lado oposto é OMITIDO do payload —
    // não enviar 0/zerado para evitar que o laboratório cobre lente plana indesejada.
    esquerdo?: HoyaPrescricaoOlho;
    direito?: HoyaPrescricaoOlho;
    afinamentoPrismatico?: boolean;
    equilibrioLente?: boolean;
  };
  dadosMedida: {
    larguraLente?: number;
    alturaLente?: number;
    ponteLente?: number;
    distanciaLeitura?: number | null;
  };
  armacao: {
    tipoArmacao: number;
    comPolimento?: boolean;
    marca?: string | null;
    modelo?: string | null;
    cor?: string | null;
    formaArmacao?: number;
  };
  valorMontagemSemTriangulacao: number;
  condicaoPagamento?: string;
  garantia?: {
    usuarioFinal?: string;
    inicialUsuario?: string;
    nomeMedico?: string | null;
    crmMedico?: string | null;
  };
  camposComplementares?: { codigo: number; valor: string }[];
}

export interface HoyaPrescricaoOlho {
  esferico: number | null;
  cilindrico: number | null;
  eixo: number | null;
  adicao: number | null;
  prismaH: number | null;
  basePRPrismaH: string | null;
  prismaV: number | null;
  basePRPrismaV: string | null;
  dnpLonge: number | null;
  dnpPerto: number | null;
  alturaPupilar: number | null;
}

export interface HoyaPedidoResponse {
  numeroPedido: number;
  voucherGerado?: string;
  status: string;
}

export interface HoyaPedidoTracking {
  numeroPedidoHoya: number;
  osCliente: string;
  status: string;
  statusProducao: string;
  produto: string;
  tratamento: string;
  dataInclusao: string;
  rastreio: string;
  nf?: unknown[]; // Notas fiscais — só presentes quando faturado
  historico: { situacao: string; data: string; observacao: string }[];
  prescricao: {
    esquerdo: Record<string, unknown>;
    direito: Record<string, unknown>;
  };
}

// ============================================
// API CALLS
// ============================================

// F4.1: Standardized error codes from hoya-proxy
const HOYA_ERROR_MESSAGES: Record<string, string> = {
  HOYA_TIMEOUT: "A API do laboratório não respondeu a tempo. Tente novamente em alguns instantes.",
  HOYA_RATE_LIMITED: "Limite de requisições atingido no laboratório. Aguarde alguns minutos.",
  HOYA_UNAVAILABLE: "O serviço do laboratório está temporariamente indisponível.",
  HOYA_API_ERROR: "Erro na comunicação com o laboratório.",
  HOYA_CONFIG_ERROR: "Configuração do laboratório incompleta. Contate o administrador.",
};

export interface HoyaProxyError {
  code: string;
  message: string;
  correlationId?: string;
}

async function callHoyaProxy<T>(action: string, params: Record<string, unknown> = {}): Promise<T> {
  // Inject session token to satisfy authGuard JWT validation
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData?.session?.access_token;

  if (!accessToken) {
    const proxyError: HoyaProxyError = {
      code: "NO_SESSION",
      message: "Sessão expirada. Faça login novamente.",
    };
    throw proxyError;
  }

  // Use explicit fetch instead of supabase.functions.invoke to guarantee
  // the user JWT is sent as Authorization (invoke can override it with anon key,
  // which authGuard rejects since aud !== "authenticated").
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  let response: Response;
  try {
    response = await fetch(`${supabaseUrl}/functions/v1/hoya-proxy`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
        apikey: anonKey,
      },
      body: JSON.stringify({ action, ...params }),
    });
  } catch (networkErr) {
    console.error("[hoyaService] Network error:", networkErr);
    throw new Error("Erro de rede ao chamar proxy Hoya");
  }

  let data: any = null;
  try {
    data = await response.json();
  } catch {
    // ignore parse errors
  }

  if (!response.ok) {
    console.error("[hoyaService] Edge function error:", response.status, data);
    const errorBody = (data ?? {}) as Record<string, unknown>;

    {
      // Hoya API structured error: { erros: [{ mensagem: "..." }] }
      const erros = (errorBody as { erros?: { mensagem?: string }[] }).erros;
      if (erros && erros.length > 0 && erros[0].mensagem) {
        const proxyError: HoyaProxyError = {
          code: "HOYA_API_ERROR",
          message: erros[0].mensagem,
        };
        throw proxyError;
      }

      // Proxy standardized error: { error: "...", code: "..." }
      if (errorBody.error) {
        const code = errorBody.code as string | undefined;
        const friendlyMessage = (code && HOYA_ERROR_MESSAGES[code]) || String(errorBody.error);
        const proxyError: HoyaProxyError = {
          code: code || "HOYA_API_ERROR",
          message: friendlyMessage,
          correlationId: errorBody.correlationId as string | undefined,
        };
        throw proxyError;
      }
    }

    throw new Error(error.message || "Erro ao chamar proxy Hoya");
  }

  // F4.1: Handle standardized error codes from hoya-proxy
  if (data?.error) {
    const code = data.code as string | undefined;
    const friendlyMessage = (code && HOYA_ERROR_MESSAGES[code]) || data.error;
    const proxyError: HoyaProxyError = {
      code: code || "HOYA_API_ERROR",
      message: friendlyMessage,
      correlationId: data.correlationId,
    };
    console.error(`[hoyaService] Hoya error [${proxyError.code}]:`, proxyError.message, proxyError.correlationId ? `(${proxyError.correlationId})` : "");
    throw proxyError;
  }

  return data as T;
}

export async function listarProdutosHoya(forceRefresh = false): Promise<HoyaProduto[]> {
  return callHoyaProxy<HoyaProduto[]>("listar-produtos", { forceRefresh });
}

export async function invalidarCacheHoya(): Promise<{ success: boolean }> {
  return callHoyaProxy<{ success: boolean }>("invalidar-cache");
}

export async function consultarProdutoHoya(codigoProduto: number): Promise<HoyaProduto> {
  return callHoyaProxy<HoyaProduto>("consultar-produto", { codigoProduto });
}

export async function criarPedidoHoya(
  pedido: HoyaPedidoPayload,
  codOs: number,
  codEmpresa: number
): Promise<HoyaPedidoResponse> {
  return callHoyaProxy<HoyaPedidoResponse>("criar-pedido", {
    pedido,
    codOs,
    codEmpresa,
  });
}

export interface PedidoFornecedorRecord {
  id: string;
  cod_os: number;
  cod_empresa: number;
  fornecedor: string;
  numero_pedido: string | null;
  status: string | null;
  payload: unknown;
  response: unknown;
  requested_by: string | null;
  requested_at: string | null;
  hoya_environment: string | null;
  created_at: string;
  updated_at: string;
}

export async function listarHistoricoPedidos(
  codEmpresa?: number | string,
  limit = 50
): Promise<PedidoFornecedorRecord[]> {
  return callHoyaProxy<PedidoFornecedorRecord[]>("historico-pedidos", {
    codEmpresa: codEmpresa || "ALL",
    limit,
  });
}

export async function consultarPedidoHoya(numeroPedido: string | number): Promise<HoyaPedidoTracking> {
  return callHoyaProxy<HoyaPedidoTracking>("consultar-pedido", { numeroPedido });
}

export async function recuperarPedidoPorOs(
  osNumero: string,
  codOs: number,
  codEmpresa: number
): Promise<{ numeroPedido: string; status: string; recovered: boolean }> {
  return callHoyaProxy<{ numeroPedido: string; status: string; recovered: boolean }>(
    "recuperar-pedido-por-os",
    { osNumero, codOs, codEmpresa }
  );
}

// F4.5: Tracking update
export interface TrackingUpdateResult {
  tracking: HoyaPedidoTracking;
  timeline: StatusHistoryEntry[];
  statusChanged: boolean;
  saved: boolean;
}

export interface StatusHistoryEntry {
  id: string;
  pedido_fornecedor_id: string;
  status: string;
  status_producao: string | null;
  rastreio: string | null;
  observacao: string | null;
  checked_at: string;
}

export async function atualizarTrackingHoya(
  numeroPedido: string | number,
  pedidoFornecedorId?: string
): Promise<TrackingUpdateResult> {
  return callHoyaProxy<TrackingUpdateResult>("atualizar-tracking", {
    numeroPedido,
    pedidoFornecedorId,
  });
}

export async function atualizarTrackingBatchHoya(limit = 20): Promise<{ updated: number; total: number; errors: string[] }> {
  return callHoyaProxy<{ updated: number; total: number; errors: string[] }>("atualizar-tracking-batch", { limit });
}

export async function listarTimelinePedido(pedidoFornecedorId: string): Promise<StatusHistoryEntry[]> {
  return callHoyaProxy<StatusHistoryEntry[]>("timeline-pedido", { pedidoFornecedorId });
}

// Payment conditions
export interface HoyaCondicaoPagamento {
  codigo: number;
  descricao: string;
}

export async function listarCondicoesPagamentoHoya(): Promise<HoyaCondicaoPagamento[]> {
  return callHoyaProxy<HoyaCondicaoPagamento[]>("consultar-condicoes-pagamento");
}

export async function listarTiposArmacaoHoya(): Promise<unknown[]> {
  return callHoyaProxy<unknown[]>("tipos-armacao");
}

export async function listarDesenhosHoya(): Promise<unknown[]> {
  return callHoyaProxy<unknown[]>("desenhos");
}

export async function listarMateriaisHoya(): Promise<unknown[]> {
  return callHoyaProxy<unknown[]>("materiais");
}

export async function listarTratamentosHoya(): Promise<unknown[]> {
  return callHoyaProxy<unknown[]>("tratamentos");
}

// F4.6: XML/DANFE
export async function consultarXmlHoya(numeroPedido: string | number): Promise<{ xml?: string; [key: string]: unknown }> {
  return callHoyaProxy<{ xml?: string; [key: string]: unknown }>("consultar-xml", { numeroPedido });
}

export async function consultarDanfeHoya(numeroPedido: string | number): Promise<{ danfe?: string; url?: string; [key: string]: unknown }> {
  return callHoyaProxy<{ danfe?: string; url?: string; [key: string]: unknown }>("consultar-danfe", { numeroPedido });
}
