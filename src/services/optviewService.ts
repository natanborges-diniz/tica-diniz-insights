import { supabase } from "@/integrations/supabase/client";

export interface OptviewProduto {
  id: string;
  codigo_produto: string;
  nome_produto: string;
  material: string | null;
  desenho: string | null;
  observacao: string | null;
  ativo: boolean;
}

export interface OptviewServico {
  id: string;
  codigo_servico: string;
  nome_servico: string;
  categoria_servico: string | null;
  observacao: string | null;
  ativo: boolean;
}

export interface OptviewTipoArmacao {
  id: string;
  codigo_tipo_armacao: string;
  nome_tipo_armacao: string;
  observacao: string | null;
  ativo: boolean;
}

export interface OptviewModeloAro {
  id: string;
  codigo_modelo_aro: string;
  nome_modelo_aro: string;
  observacao: string | null;
  ativo: boolean;
}

export interface OptviewServiceItem {
  codigo: string;
  quantidade: number;
  nome?: string;
}

export interface OptviewPedidoPayload {
  numeroOs: string;
  observacao?: string;
  paciente: string;
  loginSite?: string;
  senhaSite?: string;
  loginRestrito?: string;
  codigoCadastral?: string;
  receita: {
    esfericoLongeOd?: string;
    esfericoLongeOe?: string;
    cilindricoOd?: string;
    cilindricoOe?: string;
    alturaOd?: string;
    alturaOe?: string;
    eixoOd?: string;
    eixoOe?: string;
    dnpOd?: string;
    dnpOe?: string;
    diametroOd?: string;
    diametroOe?: string;
    adicaoOd?: string;
    adicaoOe?: string;
    prismaOd?: string;
    prismaOe?: string;
    esfericoPertoOd?: string;
    esfericoPertoOe?: string;
    dnpPertoOd?: string;
    dnpPertoOe?: string;
    cilindricoPertoOd?: string;
    cilindricoPertoOe?: string;
    eixoPertoOd?: string;
    eixoPertoOe?: string;
    prismaPertoOd?: string;
    prismaPertoOe?: string;
    curvaBase?: string;
    diametroArmacao?: string;
    dpa?: string;
    diagonalMaior?: string;
    medidaVerticalAro?: string;
    medidaHorizontalAro?: string;
    codigoTipoArmacao?: string;
    ponte?: string;
    codigoModeloAro?: string;
    enviarArmacao?: boolean;
    anguloPantoscopicoOd?: string;
    anguloPantoscopicoOe?: string;
    distanciaVerticeOd?: string;
    distanciaVerticeOe?: string;
    curvaturaOd?: string;
    curvaturaOe?: string;
    // Opcionais para suportar pedidos monoculares (apenas OD ou apenas OE)
    codigoProdutoOd?: string;
    codigoProdutoOe?: string;
    tracerBase64?: string;
  };
  servicos?: OptviewServiceItem[];
}

export interface OptviewPedidoResponse {
  numeroPedido?: string | null;
  status: string;
  raw?: unknown;
  idempotencyHit?: boolean;
  message?: string;
  correlationId?: string;
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
  created_at: string;
  updated_at: string;
  hoya_environment: string | null;
  idempotency_key: string | null;
  requested_by: string | null;
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

export interface OptviewProxyError {
  code: string;
  message: string;
  correlationId?: string;
}

const OPTVIEW_ERROR_MESSAGES: Record<string, string> = {
  OPTVIEW_TIMEOUT: "A integração OptView não respondeu a tempo.",
  OPTVIEW_UNAVAILABLE: "Serviço OptView temporariamente indisponível.",
  OPTVIEW_API_ERROR: "Erro na comunicação com OptView.",
  OPTVIEW_CONFIG_ERROR: "Loja não configurada para OptView. Configure em Admin > Fornecedores.",
};

async function callOptviewProxy<T>(action: string, params: Record<string, unknown> = {}): Promise<T> {
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData?.session?.access_token;

  if (!accessToken) {
    throw new Error("Sessão expirada. Faça login novamente.");
  }

  const { data, error } = await supabase.functions.invoke("optview-proxy", {
    body: { action, ...params },
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (error) {
    console.error("[optviewService] Edge function error:", error);
    throw new Error(error.message || "Erro ao chamar proxy OptView");
  }

  if (data?.error) {
    const code = data.code as string | undefined;
    const proxyError: OptviewProxyError = {
      code: code || "OPTVIEW_API_ERROR",
      message: (code && OPTVIEW_ERROR_MESSAGES[code]) || data.error,
      correlationId: data.correlationId,
    };
    throw proxyError;
  }

  return data as T;
}

export async function criarPedidoOptview(pedido: OptviewPedidoPayload, codOs: number, codEmpresa: number): Promise<OptviewPedidoResponse> {
  return callOptviewProxy<OptviewPedidoResponse>("criar-pedido", { pedido, codOs, codEmpresa });
}

export async function listarHistoricoPedidosOptview(codEmpresa?: number | string, limit = 50): Promise<PedidoFornecedorRecord[]> {
  return callOptviewProxy<PedidoFornecedorRecord[]>("historico-pedidos", { codEmpresa: codEmpresa || "ALL", limit });
}

export async function listarTimelinePedidoOptview(pedidoFornecedorId: string): Promise<StatusHistoryEntry[]> {
  return callOptviewProxy<StatusHistoryEntry[]>("timeline-pedido", { pedidoFornecedorId });
}

export async function listarProdutosOptview(): Promise<OptviewProduto[]> {
  const { data, error } = await supabase.from("optview_produtos" as never).select("*").eq("ativo", true).order("nome_produto");
  if (error) {
    console.error("[optviewService] Error loading produtos:", error);
    return [];
  }
  return (data || []) as unknown as OptviewProduto[];
}

export async function listarServicosOptview(): Promise<OptviewServico[]> {
  const { data, error } = await supabase.from("optview_servicos" as never).select("*").eq("ativo", true).order("nome_servico");
  if (error) {
    console.error("[optviewService] Error loading serviços:", error);
    return [];
  }
  return (data || []) as unknown as OptviewServico[];
}

export async function listarTiposArmacaoOptview(): Promise<OptviewTipoArmacao[]> {
  const { data, error } = await supabase.from("optview_tipos_armacao" as never).select("*").eq("ativo", true).order("nome_tipo_armacao");
  if (error) {
    console.error("[optviewService] Error loading tipos de armação:", error);
    return [];
  }
  return (data || []) as unknown as OptviewTipoArmacao[];
}

export async function listarModelosAroOptview(): Promise<OptviewModeloAro[]> {
  const { data, error } = await supabase.from("optview_modelos_aro" as never).select("*").eq("ativo", true).order("nome_modelo_aro");
  if (error) {
    console.error("[optviewService] Error loading modelos de aro:", error);
    return [];
  }
  return (data || []) as unknown as OptviewModeloAro[];
}