// src/services/zeissService.ts
// Client-side service para chamar o proxy Zeiss via Edge Function

import { supabase } from "@/integrations/supabase/client";

// ============================================
// TYPES
// ============================================

export interface ZeissProduto {
  cod: string;
  cat: string;
  nome: string;
  descr: string;
  proc?: string;
  modelo?: string;
  fab?: string;
  tipoarm?: string;
  grupo?: string;
  subgrupo?: string;
  material?: string;
  cor?: string;
  luzazul?: string | boolean;
  codcor?: string;
}

export interface ZeissAprovacao {
  precood?: string;
  precooe?: string;
  precoserv?: string;
  antec?: string;
  campanha?: string;
  mesmarec?: string;
  certdig?: string;
  luzazul?: string;
}

export interface ZeissPrecoItem {
  c: string; // "od", "oe", or service code
  n: string; // Name
  p: string; // Price
}

export interface ZeissApprovalResponse {
  needsApproval: true;
  aprov: ZeissAprovacao;
  precos: ZeissPrecoItem[];
  campanhas: { c: string; n: string }[];
  mesmaReceita: { cp: string; np: string }[];
  antecDescricao?: string | null;
}

export interface ZeissConfirmResponse {
  numeroPedido: string | null;
  voucherGerado: string | null;
  estabelecimento: string | null;
  status: string;
}

export interface ZeissPedidoOlho {
  produto: string;
  esferico?: string;
  cilindrico?: string;
  eixocilindrico?: string;
  adicao?: string;
  regressao?: string;
  dnp?: string;
  dnpperto?: string;
  dnplonge?: string;
  alturamontagem?: string;
  prisma?: string;
  eixoprisma?: string;
  sugestaobase?: string;
  sugestaodiametro?: string;
  compl?: Record<string, unknown>;
}

export interface ZeissArmacao {
  compralab?: string;
  modelo?: string;
  ponte?: string;
  altura?: string;
  largura?: string;
  diagonalmaior?: string;
  tipo?: string; // M, A, F, P, C, S
  formatoaro?: string;
  distanciahastes?: string;
  distanciafrontal?: string;
}

export interface ZeissPedidoPayload {
  oscliente: string;
  paciente?: string;
  cpfpaciente?: string;
  medico?: string;
  crm?: string;
  voucher?: string;
  luzazul?: string;
  corcoloracao?: string;
  amostracoloracao?: string;
  observacao?: string[];
  od?: ZeissPedidoOlho;
  oe?: ZeissPedidoOlho;
  armacao?: ZeissArmacao;
  servicos?: { codigo: string }[];
  datanascimento?: string;
  aprov?: ZeissAprovacao;
  compl?: Record<string, unknown>;
}

export interface ZeissTrackingData {
  // Identificação
  est?: string;
  estabel?: string;
  nrpedido?: string;
  oscliente?: string;
  modo?: string;
  // Cliente
  cliente?: { cod?: string; cnpj?: string; nome?: string; garantiaantec?: string };
  // Paciente / Médico
  paciente?: string;
  medico?: string;
  crm?: string;
  voucher?: string;
  descrvoucher?: string;
  // Status
  situacao?: string;
  codsituacao?: string;
  codigoSituacao?: string;
  rastreamento?: string;
  aguard?: string;
  // Previsão e datas
  previsao?: string;
  primprevisao?: string;
  precototal?: string;
  precoTotal?: string;
  // Datas de etapas
  entrada?: { data?: string; hora?: string };
  producao?: { data?: string; hora?: string };
  fatur?: { data?: string; hora?: string };
  // Negociação / Campanha
  codneg?: string;
  nomeneg?: string;
  codcamp?: string;
  campanha?: string;
  // Cor / Motivo
  cor?: string;
  codmot?: string;
  motivo?: string;
  // Garantia
  tracer?: string;
  prazogarprod?: string;
  prazogarserv?: string;
  // Histórico detalhado
  detalhe_sit?: { situacao: string; data: string; hora: string }[];
  detalhes?: { situacao: string; data: string; hora: string }[];
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

export interface StatusHistoryEntry {
  id: string;
  pedido_fornecedor_id: string;
  status: string;
  status_producao: string | null;
  rastreio: string | null;
  observacao: string | null;
  checked_at: string;
}

// ============================================
// API CALLS
// ============================================

const ZEISS_ERROR_MESSAGES: Record<string, string> = {
  ZEISS_TIMEOUT: "A API MaisZeiss não respondeu a tempo. Tente novamente.",
  ZEISS_UNAVAILABLE: "Serviço MaisZeiss temporariamente indisponível.",
  ZEISS_API_ERROR: "Erro na comunicação com MaisZeiss.",
  ZEISS_CONFIG_ERROR: "Loja não configurada para Zeiss. Configure em Admin > Fornecedores.",
};

export interface ZeissProxyError {
  code: string;
  message: string;
  correlationId?: string;
}

async function callZeissProxy<T>(action: string, params: Record<string, unknown> = {}): Promise<T> {
  // Inject authenticated session token for authGuard
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData?.session?.access_token;

  if (!accessToken) {
    throw new Error("Sessão expirada. Faça login novamente.");
  }

  const { data, error } = await supabase.functions.invoke("zeiss-proxy", {
    body: { action, ...params },
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (error) {
    console.error("[zeissService] Edge function error:", error);
    throw new Error(error.message || "Erro ao chamar proxy Zeiss");
  }

  if (data?.error) {
    const code = data.code as string | undefined;
    // Show exact Zeiss API error when available; only fallback to generic message for non-API errors
    const isApiError = code === "ZEISS_API_ERROR";
    const friendlyMessage = isApiError
      ? data.error  // Preserve exact Zeiss error (e.g. "É necessário informar o Diâmetro...")
      : (code && ZEISS_ERROR_MESSAGES[code]) || data.error;
    const proxyError: ZeissProxyError = {
      code: code || "ZEISS_API_ERROR",
      message: friendlyMessage,
      correlationId: data.correlationId,
    };
    throw proxyError;
  }

  return data as T;
}

// ── Product Catalog ──

export async function listarProdutosZeiss(codEmpresa: number): Promise<ZeissProduto[]> {
  return callZeissProxy<ZeissProduto[]>("listar-produtos", { codEmpresa });
}

// ── Order Creation (two-step) ──

export async function criarPedidoZeiss(
  pedido: ZeissPedidoPayload,
  codOs: number,
  codEmpresa: number,
  cpfPaciente?: string,
  paciente?: string
): Promise<ZeissApprovalResponse | ZeissConfirmResponse> {
  return callZeissProxy<ZeissApprovalResponse | ZeissConfirmResponse>("criar-pedido", {
    pedido,
    codOs,
    codEmpresa,
    cpfPaciente,
    paciente,
  });
}

// ── Tracking ──

export async function consultarPedidoZeiss(
  numeroPedido: string | number,
  codEmpresa: number
): Promise<ZeissTrackingData> {
  return callZeissProxy<ZeissTrackingData>("consultar-pedido", { numeroPedido, codEmpresa });
}

export async function atualizarTrackingZeiss(
  numeroPedido: string | number,
  codEmpresa: number,
  pedidoFornecedorId?: string
): Promise<{ tracking: ZeissTrackingData; timeline: StatusHistoryEntry[]; statusChanged: boolean; saved: boolean }> {
  return callZeissProxy("atualizar-tracking", { numeroPedido, codEmpresa, pedidoFornecedorId });
}

// ── History ──

export async function listarHistoricoPedidosZeiss(
  codEmpresa?: number | string,
  limit = 50
): Promise<PedidoFornecedorRecord[]> {
  return callZeissProxy<PedidoFornecedorRecord[]>("historico-pedidos", {
    codEmpresa: codEmpresa || "ALL",
    limit,
  });
}

export async function listarTimelinePedidoZeiss(pedidoFornecedorId: string): Promise<StatusHistoryEntry[]> {
  return callZeissProxy<StatusHistoryEntry[]>("timeline-pedido", { pedidoFornecedorId });
}

// ── Services ──

export async function listarServicosZeiss(codEmpresa?: number): Promise<unknown[]> {
  return callZeissProxy<unknown[]>("listar-servicos", codEmpresa ? { codEmpresa } : {});
}

export async function listarServicosPorProdutoZeiss(familia: string, codEmpresa: number): Promise<unknown[]> {
  return callZeissProxy<unknown[]>("servicos-por-produto", { familia, codEmpresa });
}

// ── Colors ──

export async function listarCoresZeiss(familia: string): Promise<unknown[]> {
  return callZeissProxy<unknown[]>("listar-cores", { familia });
}

// ── Base Suggestion ──

export async function sugestaoBaseZeiss(
  codEmpresa: number,
  familia: string,
  esf?: string,
  cil?: string,
  adicao?: string
): Promise<unknown> {
  return callZeissProxy("sugestao-base", { codEmpresa, familia, esf, cil, adicao });
}

// ── Price Table ──

export async function tabelaPrecosZeiss(codEmpresa: number): Promise<unknown> {
  return callZeissProxy("tabela-precos", { codEmpresa });
}

// ── Cancel Order ──

export async function cancelarPedidoZeiss(
  numeroPedido: string | number,
  estabelecimento: string
): Promise<unknown> {
  return callZeissProxy("cancelar-pedido", { numeroPedido, estabelecimento });
}
