// src/services/estoqueCompletoService.ts
// Service para endpoint /estoque/completo - retorna TODO inventário físico (estoque > 0)
// Diferente de /vendas/analise-sku que retorna apenas SKUs com vendas no período

import { apiGet, EmpresaParam, formatEmpresaParam, ApiGetOptions } from './firebirdBridge';

// ============================================
// INTERFACES - Campos do backend (snake_case)
// ============================================

interface EstoqueCompletoRaw {
  // Backend pode retornar como cod_sku OU cod_armacao
  cod_sku?: number | string;
  cod_armacao?: number | string;
  codigo_barras?: string;
  // Backend pode retornar como descricao ou descricao_item
  descricao?: string;
  descricao_item?: string;
  fornecedor_nome?: string;
  grife?: string;
  tipo?: string;
  quantidade_estoque?: number;
  preco_custo?: number;
  preco_venda?: number;
  data_ultima_entrada?: string | null;
  data_ultima_venda?: string | null;
  dias_sem_venda?: number | null;
  // Campos calculados pelo backend (quando disponíveis)
  dias_estoque?: number | null;
  acao_sugerida?: string | null;
}

/**
 * Extrai o tipo/categoria do produto a partir do prefixo da descrição
 * Ex: "AR TIGO 047" -> "AR", "LG HOYA 1.60" -> "LG", "AC ESTOJO" -> "AC"
 */
function extrairTipoDeDescricao(descricao: string): string {
  if (!descricao) return 'OUTROS';
  
  const desc = descricao.trim().toUpperCase();
  
  // Pega as primeiras 2-3 letras antes do primeiro espaço
  const primeiroEspaco = desc.indexOf(' ');
  const prefixo = primeiroEspaco > 0 ? desc.substring(0, primeiroEspaco) : desc.substring(0, 3);
  
  // Armações: AR, ARM, OC (óculos)
  if (prefixo === 'AR' || prefixo === 'ARM' || prefixo === 'OC') {
    return 'AR';
  }
  
  // Lentes: LG (lentes de grau), GC (grau contato), LC (lentes contato)
  if (prefixo === 'LG' || prefixo === 'GC' || prefixo === 'LC') {
    return 'LG';
  }
  
  // Acessórios: AC, EST (estojo), CORD (cordão), etc
  if (prefixo === 'AC' || prefixo === 'EST' || prefixo.startsWith('CORD')) {
    return 'AC';
  }
  
  // Solar: SOL, OS (óculos solar)
  if (prefixo === 'SOL' || prefixo === 'OS') {
    return 'SOL';
  }
  
  console.log('[estoqueCompletoService] Tipo não reconhecido:', prefixo, 'de:', descricao.substring(0, 30));
  return 'OUTROS';
}

// ============================================
// INTERFACE NORMALIZADA (camelCase)
// ============================================

export interface EstoqueCompleto {
  codSku: number;
  codigoBarra: string;
  descricao: string;
  fornecedor: string;
  marca: string; // grife no backend
  tipo: string;
  quantidadeEstoque: number;
  precoCusto: number;
  precoVenda: number;
  valorEstoqueCusto: number; // calculado: qtd * custo
  dataUltimaEntrada: string | null;
  dataUltimaVenda: string | null;
  diasEmEstoque: number; // calculado pelo backend (dias desde última entrada)
  acaoSugerida: string; // calculado pelo backend baseado em dias_estoque
  isDeadStock: boolean; // dias_estoque > 180
}

export interface GetEstoqueCompletoParams {
  empresa: EmpresaParam;
  /** Se true, ignora cache e busca dados ao vivo */
  bypassCache?: boolean;
}

// ============================================
// FUNÇÃO PRINCIPAL
// ============================================

/**
 * Busca TODO o inventário físico da loja (estoque > 0)
 * Independente de vendas - mostra itens parados também
 */
export async function getEstoqueCompleto(
  params: GetEstoqueCompletoParams
): Promise<EstoqueCompleto[]> {
  const options: ApiGetOptions = params.bypassCache ? { cache: false } : {};
  
  const raw = await apiGet<EstoqueCompletoRaw>('/estoque/completo', {
    empresa: formatEmpresaParam(params.empresa),
  }, options);

  console.log('[estoqueCompletoService] Raw data count:', raw.length);
  if (raw.length > 0) {
    console.log('[estoqueCompletoService] Sample record:', JSON.stringify(raw[0], null, 2));
  }

  const hoje = new Date();
  
  const resultado = raw.map((r) => {
    const quantidadeEstoque = r.quantidade_estoque ?? 0;
    const precoCusto = r.preco_custo ?? 0;
    
    // Descrição pode vir como descricao ou descricao_item
    const descricao = (r.descricao || r.descricao_item || '').trim();
    
    // Tipo: extrair do prefixo da descrição se não vier do backend
    const tipoBackend = r.tipo?.trim();
    const tipo = tipoBackend && tipoBackend !== '' ? tipoBackend : extrairTipoDeDescricao(descricao);
    
    // Dias em estoque: preferir dias_estoque do backend, senão calcular
    let diasEmEstoque = 0;
    if (r.dias_estoque !== undefined && r.dias_estoque !== null) {
      diasEmEstoque = r.dias_estoque;
    } else if (r.data_ultima_entrada) {
      const dataEntrada = new Date(r.data_ultima_entrada);
      if (!isNaN(dataEntrada.getTime())) {
        diasEmEstoque = Math.floor((hoje.getTime() - dataEntrada.getTime()) / (1000 * 60 * 60 * 24));
        if (diasEmEstoque < 0) diasEmEstoque = 0;
      }
    }
    
    // Ação sugerida: preferir do backend, senão calcular baseado em dias
    let acaoSugerida = r.acao_sugerida;
    if (!acaoSugerida) {
      if (r.data_ultima_entrada === null) {
        acaoSugerida = 'SEM MOVIMENTO';
      } else if (diasEmEstoque <= 90) {
        acaoSugerida = 'ANALISE PARA RECOMPRA';
      } else if (diasEmEstoque <= 180) {
        acaoSugerida = 'ACOMPANHAMENTO';
      } else if (diasEmEstoque <= 270) {
        acaoSugerida = 'SINAL DE ALERTA';
      } else if (diasEmEstoque <= 360) {
        acaoSugerida = 'LIQUIDA 20%';
      } else if (diasEmEstoque <= 720) {
        acaoSugerida = 'LIQUIDA 30%';
      } else {
        acaoSugerida = 'LIQUIDA 50%';
      }
    }
    
    // cod_sku: backend pode enviar como cod_sku OU cod_armacao (fallback)
    const rawCodSku = r.cod_sku ?? r.cod_armacao ?? 0;
    const codSku = typeof rawCodSku === 'string' ? parseInt(rawCodSku, 10) : rawCodSku;
    
    return {
      // Converter para número garantindo consistência
      codSku: isNaN(codSku) ? 0 : codSku,
      codigoBarra: (r.codigo_barras ?? '').trim(),
      descricao,
      // Fornecedor: tratar valores nulos ou vazios
      fornecedor: (() => {
        const forn = (r.fornecedor_nome ?? '').trim();
        if (!forn || forn === '' || forn.toUpperCase() === 'NULL') {
          return 'SEM FORNECEDOR';
        }
        return forn;
      })(),
      // Marca vem como "grife" do backend
      marca: (() => {
        const grife = (r.grife ?? '').trim();
        if (!grife || grife === '' || grife.toUpperCase() === 'NULL') {
          return 'SEM MARCA';
        }
        return grife;
      })(),
      tipo,
      quantidadeEstoque,
      precoCusto,
      precoVenda: r.preco_venda ?? 0,
      valorEstoqueCusto: quantidadeEstoque * precoCusto,
      dataUltimaEntrada: r.data_ultima_entrada ?? null,
      dataUltimaVenda: r.data_ultima_venda ?? null,
      diasEmEstoque,
      acaoSugerida,
      // Dead stock: mais de 180 dias em estoque
      isDeadStock: diasEmEstoque > 180,
    };
  });
  
  // Log tipos extraídos para debug
  const tiposExtraidos = [...new Set(resultado.map(r => r.tipo))];
  console.log('[estoqueCompletoService] Tipos extraídos das descrições:', tiposExtraidos);
  
  // Contagem por tipo
  const contagemTipos: Record<string, number> = {};
  resultado.forEach(r => {
    contagemTipos[r.tipo] = (contagemTipos[r.tipo] || 0) + 1;
  });
  console.log('[estoqueCompletoService] Contagem por tipo:', contagemTipos);
  
  return resultado;
}

// ============================================
// INTERFACE PARA MÉTRICAS RESUMO
// ============================================

export interface MetricasEstoqueCompleto {
  totalPecas: number;
  totalSkus: number;
  valorTotalCusto: number;
  fornecedoresDistintos: number;
  marcasDistintas: number;
  deadStockPecas: number;
  deadStockValor: number;
  deadStockPercentual: number;
}

/**
 * Calcula métricas resumidas do estoque completo
 */
export function calcularMetricasEstoqueCompleto(dados: EstoqueCompleto[]): MetricasEstoqueCompleto {
  const totalPecas = dados.reduce((acc, item) => acc + item.quantidadeEstoque, 0);
  const totalSkus = dados.length;
  const valorTotalCusto = dados.reduce((acc, item) => acc + item.valorEstoqueCusto, 0);
  
  const fornecedoresDistintos = new Set(dados.map(item => item.fornecedor)).size;
  const marcasDistintas = new Set(dados.map(item => item.marca)).size;
  
  const deadStock = dados.filter(item => item.isDeadStock);
  const deadStockPecas = deadStock.reduce((acc, item) => acc + item.quantidadeEstoque, 0);
  const deadStockValor = deadStock.reduce((acc, item) => acc + item.valorEstoqueCusto, 0);
  const deadStockPercentual = totalPecas > 0 ? (deadStockPecas / totalPecas) * 100 : 0;
  
  return {
    totalPecas,
    totalSkus,
    valorTotalCusto,
    fornecedoresDistintos,
    marcasDistintas,
    deadStockPecas,
    deadStockValor,
    deadStockPercentual,
  };
}
