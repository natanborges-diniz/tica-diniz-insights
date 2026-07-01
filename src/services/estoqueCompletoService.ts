// src/services/estoqueCompletoService.ts
// Service para endpoint /estoque/completo - retorna TODO inventário físico (estoque > 0)
// Diferente de /vendas/analise-sku que retorna apenas SKUs com vendas no período
//
// SUB-ENTREGA 1.4.b — Dispatcher entre Bridge (legado) e Supabase (estoque_sincronizado).
// Controlado por VITE_ESTOQUE_SOURCE=supabase|bridge (default: 'bridge').

import { apiGet, EmpresaParam, formatEmpresaParam, ApiGetOptions } from './firebirdBridge';
import { categorizarPorDescricao, subcategorizarProduto, subcategorizarPorDescricao, type SubcategoriaProduto } from '@/utils/categorizarProduto';
import { classificarItemP31 } from '@/lib/estoque/faixas-saneamento';
import { supabase } from '@/integrations/supabase/client';

// ============================================
// INTERFACES - Campos do backend (snake_case)
// ============================================

interface EstoqueCompletoRaw {
  // Backend pode retornar como cod_sku OU cod_armacao
  cod_sku?: number | string;
  cod_armacao?: number | string;
  codigo_barras?: string;       // alias legado (compat)
  cod_barras_interno?: string;  // código interno Firebird (Bridge ≥ 1.6, sempre preenchido)
  ean?: string | null;          // EAN do fabricante (~79% preenchido)
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
  codArmacao: number | null; // cod_armacao bruto — usado no double-lookup do merge (Onda 1.6 fix)
  codigoBarra: string;   // cod_barras_interno (sempre preenchido)
  ean: string | null;    // EAN do fabricante; null quando não disponível
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
  diasDesdeUltimaVenda: number; // dias desde última venda (0 se nunca vendeu)
  diasEmEstoque: number; // calculado pelo backend (dias desde última entrada)
  acaoSugerida: string; // calculado pelo backend baseado em dias_estoque
  isDeadStock: boolean; // estoqueAtual > 0 && diasDesdeUltimaVenda > 180 (Princípio #19)
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
 * Dispatcher: escolhe fonte (Supabase ou Bridge) via feature flag VITE_ESTOQUE_SOURCE.
 * Contrato de retorno idêntico para ambas as fontes.
 */
const ESTOQUE_SOURCE = (import.meta.env.VITE_ESTOQUE_SOURCE ?? 'bridge').toLowerCase();

export async function getEstoqueCompleto(
  params: GetEstoqueCompletoParams
): Promise<EstoqueCompleto[]> {
  if (ESTOQUE_SOURCE === 'supabase') {
    console.log('[estoqueCompletoService] Source: SUPABASE (estoque_sincronizado)');
    return getEstoqueCompletoDoSupabase(params);
  }
  console.log('[estoqueCompletoService] Source: BRIDGE (Firebird ao vivo)');
  return getEstoqueCompletoDoBridge(params);
}

/**
 * Busca TODO o inventário físico da loja (estoque > 0) via Firebird Bridge (legado).
 */
async function getEstoqueCompletoDoBridge(
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
    
    // diasDesdeUltimaVenda precisa ser calculado antes de acaoSugerida (Princípio #31)
    const diasDesdeUltimaVenda = (() => {
      if (r.dias_sem_venda !== undefined && r.dias_sem_venda !== null) {
        return Math.max(0, r.dias_sem_venda);
      }
      if (r.data_ultima_venda) {
        const dataVenda = new Date(r.data_ultima_venda);
        if (!isNaN(dataVenda.getTime())) {
          return Math.max(0, Math.floor((hoje.getTime() - dataVenda.getTime()) / (1000 * 60 * 60 * 24)));
        }
      }
      return 0;
    })();
    const isDeadStock = quantidadeEstoque > 0 && diasDesdeUltimaVenda > 180;

    // Frontend é a fonte de verdade para acaoSugerida.
    // r.acao_sugerida do bridge é intencionalmente ignorado — alinhamento SQL pendente
    // (ver FASE_1.5_RELATORIO.md). Quando o bridge entregar os mesmos rótulos,
    // os dois concordarão; até lá o frontend calcula localmente.
    const temInfoTempo = r.data_ultima_entrada !== null ||
                         (r.dias_sem_venda !== undefined && r.dias_sem_venda !== null) ||
                         (r.dias_estoque !== undefined && r.dias_estoque !== null);
    // Princípio #31: dead stock usa diasDesdeUltimaVenda na classificação
    const acaoSugerida = temInfoTempo
      ? classificarItemP31({ isDeadStock, diasEmEstoque, diasDesdeUltimaVenda }).rotulo
      : 'SEM CADASTRO';

    // cod_sku: Bridge pode enviar como string ("3293456") ou number — Number() normaliza
    const codSkuNum = Number(r.cod_sku ?? r.cod_armacao ?? 0);

    // cod_armacao bruto — preservado como referência alternativa
    const rawCodArmacao = r.cod_armacao ?? null;
    const codArmacao = rawCodArmacao == null ? null : (Number(rawCodArmacao) || null);

    return {
      codSku: isNaN(codSkuNum) ? 0 : codSkuNum,
      codArmacao: codArmacao != null && !isNaN(codArmacao) ? codArmacao : null,
      codigoBarra: (r.cod_barras_interno?.trim() ?? r.codigo_barras?.trim() ?? ''),
      ean: r.ean?.trim() || null,
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
      diasDesdeUltimaVenda,
      diasEmEstoque,
      acaoSugerida,
      isDeadStock,
      // Subcategoria: prefere o backend; fallback regex em tipo, depois descrição
      subcategoria: (() => {
        const sub = (r.subcategoria ?? '').toString().toUpperCase().trim();
        const valid: SubcategoriaProduto[] = ['AR_RX', 'AR_SOLAR', 'LENTES', 'LENTES_GRAU', 'LENTES_CONTATO', 'ACESSORIOS', 'OUTROS'];
        if (valid.includes(sub as SubcategoriaProduto)) return sub as SubcategoriaProduto;
        const fromTipo = subcategorizarProduto(tipo);
        if (fromTipo !== 'OUTROS') return fromTipo;
        return subcategorizarPorDescricao(descricao);
      })(),
      diasGiroMedio: r.dias_giro_medio ?? null,
      diasGiroMediano: r.dias_giro_mediano ?? null,
      diasGiroUltimaPeca: r.dias_giro_ultima_peca ?? null,
      pecasGiroConsideradas: r.pecas_vendidas_consideradas ?? 0,
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

  // Contagem por subcategoria (esperar AR_SOLAR > 0 quando há óculos OC)
  const contagemSubcat: Record<string, number> = {};
  resultado.forEach(r => { contagemSubcat[r.subcategoria] = (contagemSubcat[r.subcategoria] || 0) + 1; });
  console.log('[estoqueCompletoService] Contagem por subcategoria:', contagemSubcat);

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
