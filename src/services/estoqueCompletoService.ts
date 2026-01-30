// src/services/estoqueCompletoService.ts
// Service para endpoint /estoque/completo - retorna TODO inventário físico (estoque > 0)
// Diferente de /vendas/analise-sku que retorna apenas SKUs com vendas no período

import { apiGet, EmpresaParam, formatEmpresaParam, ApiGetOptions } from './firebirdBridge';

// ============================================
// INTERFACES - Campos do backend (snake_case)
// ============================================

interface EstoqueCompletoRaw {
  cod_sku: number;
  descricao: string;
  fornecedor_nome: string;
  grife: string;
  tipo: string;
  quantidade_estoque: number;
  preco_custo: number;
  preco_venda: number;
  data_entrada: string | null;
  data_ultima_venda: string | null;
  dias_sem_venda: number;
}

// ============================================
// INTERFACE NORMALIZADA (camelCase)
// ============================================

export interface EstoqueCompleto {
  codSku: number;
  descricao: string;
  fornecedor: string;
  marca: string; // grife no backend
  tipo: string;
  quantidadeEstoque: number;
  precoCusto: number;
  precoVenda: number;
  valorEstoqueCusto: number; // calculado: qtd * custo
  dataEntrada: string | null;
  dataUltimaVenda: string | null;
  diasSemVenda: number;
  isDeadStock: boolean; // dias_sem_venda > 180 ou nunca vendeu
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
    console.log('[estoqueCompletoService] Sample record:', raw[0]);
    // Log tipos únicos para debug de categorização
    const tiposUnicos = [...new Set(raw.map(r => r.tipo))];
    console.log('[estoqueCompletoService] Tipos únicos encontrados:', tiposUnicos);
  }

  return raw.map((r) => {
    const quantidadeEstoque = r.quantidade_estoque ?? 0;
    const precoCusto = r.preco_custo ?? 0;
    const diasSemVenda = r.dias_sem_venda ?? 999;
    
    return {
      // Converter para número garantindo consistência (backend pode enviar como string)
      codSku: typeof r.cod_sku === 'string' ? parseInt(r.cod_sku, 10) : (r.cod_sku ?? 0),
      descricao: (r.descricao ?? '').trim(),
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
      tipo: (r.tipo ?? 'OUTROS').trim(),
      quantidadeEstoque,
      precoCusto,
      precoVenda: r.preco_venda ?? 0,
      valorEstoqueCusto: quantidadeEstoque * precoCusto,
      dataEntrada: r.data_entrada,
      dataUltimaVenda: r.data_ultima_venda,
      diasSemVenda,
      // Dead stock: mais de 180 dias sem venda ou nunca vendeu
      isDeadStock: diasSemVenda > 180 || r.data_ultima_venda === null,
    };
  });
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
