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
    esquerdo: HoyaPrescricaoOlho;
    direito: HoyaPrescricaoOlho;
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
  historico: { situacao: string; data: string; observacao: string }[];
  prescricao: {
    esquerdo: Record<string, unknown>;
    direito: Record<string, unknown>;
  };
}

// ============================================
// API CALLS
// ============================================

async function callHoyaProxy<T>(action: string, params: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke("hoya-proxy", {
    body: { action, ...params },
  });

  if (error) {
    console.error("[hoyaService] Edge function error:", error);
    throw new Error(error.message || "Erro ao chamar proxy Hoya");
  }

  // Check if the response contains an error from Hoya
  if (data?.error) {
    throw new Error(data.error);
  }

  return data as T;
}

export async function listarProdutosHoya(): Promise<HoyaProduto[]> {
  return callHoyaProxy<HoyaProduto[]>("listar-produtos");
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

export async function consultarPedidoHoya(numeroPedido: string | number): Promise<HoyaPedidoTracking> {
  return callHoyaProxy<HoyaPedidoTracking>("consultar-pedido", { numeroPedido });
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
