// src/services/estoqueCompletoService.ts
// Service para endpoint /estoque/completo - retorna TODO inventário físico (estoque > 0)
// Diferente de /vendas/analise-sku que retorna apenas SKUs com vendas no período

import { apiGet, EmpresaParam, formatEmpresaParam, ApiGetOptions } from './firebirdBridge';
import { categorizarPorDescricao, subcategorizarProduto, subcategorizarPorDescricao, type SubcategoriaProduto } from '@/utils/categorizarProduto';

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
  // Novos campos (Bridge af64a42): subcategoria + giro real
  subcategoria?: string | null;
  dias_giro_medio?: number | null;
  dias_giro_mediano?: number | null;
  dias_giro_ultima_peca?: number | null;
  pecas_vendidas_consideradas?: number | null;
}

// Categorização de tipo agora é feita por categorizarPorDescricao de @/utils/categorizarProduto

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
  // Subcategoria do Bridge (fallback regex)
  subcategoria: SubcategoriaProduto;
  // Métricas de giro real (Bridge). null quando não há vendas no período
  diasGiroMedio: number | null;
  diasGiroMediano: number | null;
  diasGiroUltimaPeca: number | null;
  pecasGiroConsideradas: number;
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
  const options: ApiGetOptions = { timeoutMs: 60000, ...(params.bypassCache ? { cache: false } : {}) };
  
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
    const tipo = tipoBackend && tipoBackend !== '' ? tipoBackend : categorizarPorDescricao(descricao);
    
    // Dias em estoque: preferir dias_estoque do backend, senão calcular
    // Fallback 1: data_ultima_entrada, Fallback 2: dias_sem_venda
    let diasEmEstoque = 0;
    if (r.dias_estoque !== undefined && r.dias_estoque !== null) {
      diasEmEstoque = r.dias_estoque;
    } else if (r.data_ultima_entrada) {
      const dataEntrada = new Date(r.data_ultima_entrada);
      if (!isNaN(dataEntrada.getTime())) {
        diasEmEstoque = Math.floor((hoje.getTime() - dataEntrada.getTime()) / (1000 * 60 * 60 * 24));
        if (diasEmEstoque < 0) diasEmEstoque = 0;
      }
    } else if (r.dias_sem_venda !== undefined && r.dias_sem_venda !== null) {
      // Se não tem data de entrada, usar dias_sem_venda como proxy
      diasEmEstoque = r.dias_sem_venda;
    }
    
    // Ação sugerida: preferir do backend, senão calcular baseado em dias
    let acaoSugerida = r.acao_sugerida;
    if (!acaoSugerida) {
      // Se não temos NENHUMA informação de tempo, classificar como SEM MOVIMENTO
      const temInfoTempo = r.data_ultima_entrada !== null || 
                           (r.dias_sem_venda !== undefined && r.dias_sem_venda !== null) ||
                           (r.dias_estoque !== undefined && r.dias_estoque !== null);
      
      if (!temInfoTempo) {
        // Defensivo: itens sem NENHUM registro de tempo (precoCusto e dias zerados)
        // não devem cair em LIQUIDA 50% — provavelmente é cadastro incompleto.
        // Marcamos como SEM CADASTRO para tratamento separado na UI.
        acaoSugerida = 'SEM CADASTRO';
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
  
  // Guarda de regressão: o Bridge DEVE retornar 1 linha por cod_sku (regra "vínculo mais recente").
  // Se vier duplicata, NÃO colapsamos — apenas alertamos. Frontend confia no contrato.
  // Ver firebird-bridge/CONTRACT.md → /estoque/completo.
  const skuCount = new Map<number, number>();
  resultado.forEach(r => skuCount.set(r.codSku, (skuCount.get(r.codSku) || 0) + 1));
  const duplicados = Array.from(skuCount.entries()).filter(([, n]) => n > 1);
  if (duplicados.length > 0) {
    console.warn(
      `[estoqueCompletoService] ⚠️ REGRESSÃO DE CONTRATO: Bridge retornou ${duplicados.length} cod_sku duplicado(s). ` +
      `Esperado: 1 linha por SKU (vínculo mais recente). Exemplos:`,
      duplicados.slice(0, 5).map(([sku, n]) => ({ cod_sku: sku, vezes: n }))
    );
  }

  // Log tipos extraídos para debug
  const tiposExtraidos = [...new Set(resultado.map(r => r.tipo))];
  console.log('[estoqueCompletoService] Tipos extraídos das descrições:', tiposExtraidos);

  // Contagem por tipo + por ação (inclui SEM CADASTRO)
  const contagemTipos: Record<string, number> = {};
  const contagemAcoes: Record<string, number> = {};
  resultado.forEach(r => {
    contagemTipos[r.tipo] = (contagemTipos[r.tipo] || 0) + 1;
    contagemAcoes[r.acaoSugerida] = (contagemAcoes[r.acaoSugerida] || 0) + 1;
  });
  console.log('[estoqueCompletoService] Contagem por tipo:', contagemTipos);
  console.log('[estoqueCompletoService] Contagem por ação:', contagemAcoes);

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
