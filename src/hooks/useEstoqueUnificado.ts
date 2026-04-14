// src/hooks/useEstoqueUnificado.ts
// Hook UNIFICADO para gestão de estoque - fonte única de dados para todas as abas
// 
// ESTRATÉGIA DE DADOS:
// - /estoque/completo: Inventário físico TOTAL (estoque > 0) para "Visão Estoque"
// - /vendas/analise-sku: Métricas de giro/vendas para "Análise OTB"
// - Dados são MESCLADOS pelo cod_sku para ter visão completa

import { useState, useCallback, useMemo, useEffect } from "react";
import { useUserEmpresas } from "./useUserEmpresas";
import { EmpresaParam } from "@/services/firebirdBridge";
import { useDefaultEmpresa } from "./useDefaultEmpresa";
import { getAnaliseSku, AnaliseSku } from "@/services/vendasService";
import { getEstoqueCompleto, EstoqueCompleto, calcularMetricasEstoqueCompleto } from "@/services/estoqueCompletoService";
import { categorizarProduto } from "@/utils/categorizarProduto";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

// ============================================
// INTERFACES
// ============================================

export interface EstoqueFilters {
  empresa: EmpresaParam;
  dataInicio: string;
  dataFim: string;
  categoria: 'TODOS' | 'ARMACOES' | 'LENTES' | 'ACESSORIOS' | 'OUTROS';
  curvaABC: 'A' | 'B' | 'C' | null;
  fornecedor: string;
  marca: string;
  acao: string; // TODAS, LIQUIDAR, COMPRAR, COMPRAR URGENTE, MANTER
  busca: string;
}

export interface ItemEstoque {
  // Dados do SKU
  codSku: number;
  codigoBarra: string;
  descricao: string;
  marca: string;
  fornecedor: string;
  tipo: string;
  categoria: 'ARMACOES' | 'LENTES' | 'ACESSORIOS' | 'OUTROS';
  
  // Estoque (do /estoque/completo)
  estoqueAtual: number;
  estoqueMinimo: number;
  valorEstoqueCusto: number;
  
  // Vendas (do /vendas/analise-sku)
  qtdVendidos: number;
  totalVendido: number;
  diasEmEstoque: number; // dias desde a entrada do produto
  vendaDiaria: number;
  
  // Custos
  precoCusto: number;
  precoVenda: number;
  margemBruta: number;
  
  // OTB
  otb: number;
  otbValor: number;
  curvaABC: 'A' | 'B' | 'C';
  classificacao: 'COMPRAR_URGENTE' | 'COMPRAR' | 'ESTOQUE_OK' | 'EXCESSO';
  acaoSugerida: string;
  giroEstoque: number;
  
  // Dead stock
  isDeadStock: boolean;
}

// Decisão por marca para Plano de Compra
export type DecisaoMarca = 'REPOR_REFERENCIA' | 'RENOVAR_COLECAO' | 'AVALIAR_DESCONTINUACAO';

export interface ResumoMarca {
  marca: string;
  categoria: string;
  pecasEstoque: number;
  valorEstoque: number;
  qtdVendidos6m: number;
  totalVendido6m: number;
  otbTotal: number;
  mediaDiasEmEstoque: number;
  temCurvaA: boolean;
  decisao: DecisaoMarca;
  skus: ItemEstoque[];
}

// Mix ideal por categoria e marca
export interface MixComparativo {
  chave: string; // categoria ou marca
  percentualIdeal: number; // baseado em vendas 6m
  percentualAtual: number; // baseado em estoque atual
  gap: number; // ideal - atual (positivo = subrepresentada)
}

// Faixa de estoque doente
export type FaixaDoente = 'PROMOCAO_20' | 'LIQUIDACAO_30' | 'LIQUIDACAO_50' | 'DESCARTE' | 'REVISAO_URGENTE';

export interface GrupoEstoqueDoente {
  faixa: FaixaDoente;
  label: string;
  desconto: string;
  cor: string; // tailwind class
  pecas: number;
  valorCusto: number;
  marcas: string[];
  itens: ItemEstoque[];
}

export interface MetricasEstoque {
  // Métricas de estoque físico (do /estoque/completo)
  totalPecas: number;
  totalSkusComEstoque: number;
  valorTotalCusto: number;
  
  // Dead stock
  deadStockPecas: number;
  deadStockValor: number;
  deadStockPercentual: number;
  
  // Métricas gerais
  totalSkus: number;
  fornecedoresDistintos: number;
  marcasDistintas: number;
  
  // Por ação
  pecasLiquidar: number;
  pecasManter: number;
  pecasComprar: number;
  
  // OTB (do /vendas/analise-sku)
  totalVendido: number;
  totalOtb: number;
  totalOtbValor: number;
  skusComprarUrgente: number;
  skusComprar: number;
  skusEstoqueOk: number;
  skusExcesso: number;
  diasPeriodo: number;
}

interface EstoqueMinimoConfig {
  cod_empresa: number;
  categoria: string;
  curva_abc: string;
  quantidade_minima: number;
}

interface MapeamentoFornecedor {
  marca: string;
  fornecedor: string;
}

// ============================================
// FUNÇÕES AUXILIARES
// ============================================

// Importado de @/utils/categorizarProduto — fonte única de verdade

// Ação sugerida agora vem calculada do backend baseada em dias_estoque

// ============================================
// HOOK PRINCIPAL
// ============================================

export function useEstoqueUnificado() {
  const { empresas, isLoading: loadingEmpresas } = useUserEmpresas();
  const { defaultEmpresa } = useDefaultEmpresa();
  
  // Período padrão: últimos 180 dias
  const hoje = new Date();
  const dataFim = hoje.toISOString().split('T')[0];
  const dataInicio = new Date(hoje.getTime() - 180 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  
  const [filters, setFilters] = useState<EstoqueFilters>({
    empresa: null, // Será preenchido pelo useEffect abaixo
    dataInicio,
    dataFim,
    categoria: 'TODOS',
    curvaABC: null,
    fornecedor: 'TODOS',
    marca: 'TODAS',
    acao: 'TODAS',
    busca: '',
  });

  // Preencher empresa do profile quando disponível
  useEffect(() => {
    if (defaultEmpresa && !filters.empresa) {
      setFilters(prev => ({ ...prev, empresa: defaultEmpresa }));
    }
  }, [defaultEmpresa]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Dados de ambos endpoints
  const [dadosEstoqueCompleto, setDadosEstoqueCompleto] = useState<EstoqueCompleto[]>([]);
  const [dadosVendasSku, setDadosVendasSku] = useState<AnaliseSku[]>([]);
  
  const [mapeamentoFornecedor, setMapeamentoFornecedor] = useState<Map<string, string>>(new Map());
  const [configMinimos, setConfigMinimos] = useState<EstoqueMinimoConfig[]>([]);

  // Carregar mapeamentos marca→fornecedor do Supabase
  useEffect(() => {
    const carregarMapeamentos = async () => {
      try {
        const { data, error } = await supabase
          .from('fornecedor_marca')
          .select('marca, fornecedor');
        
        if (error) throw error;
        
        if (data && data.length > 0) {
          const mapa = new Map<string, string>();
          data.forEach((m: MapeamentoFornecedor) => {
            mapa.set(m.marca.toUpperCase(), m.fornecedor);
          });
          setMapeamentoFornecedor(mapa);
          console.log('[useEstoqueUnificado] Mapeamentos carregados:', mapa.size);
        }
      } catch (err) {
        console.error('[useEstoqueUnificado] Erro ao carregar mapeamentos:', err);
      }
    };
    
    carregarMapeamentos();
  }, []);

  // Carregar configurações de mínimo por loja
  useEffect(() => {
    const carregarMinimos = async () => {
      try {
        const { data, error } = await supabase
          .from('estoque_minimo_loja')
          .select('cod_empresa, categoria, curva_abc, quantidade_minima');
        
        if (error) throw error;
        if (data) {
          setConfigMinimos(data);
          console.log('[useEstoqueUnificado] Mínimos por loja carregados:', data.length);
        }
      } catch (err) {
        console.error('[useEstoqueUnificado] Erro ao carregar mínimos:', err);
      }
    };
    
    carregarMinimos();
  }, []);

  // Dias do período
  const diasPeriodo = useMemo(() => {
    const inicio = new Date(filters.dataInicio);
    const fim = new Date(filters.dataFim);
    return Math.ceil((fim.getTime() - inicio.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  }, [filters.dataInicio, filters.dataFim]);

  // Mescla dados de ambos endpoints por cod_sku
  const itensProcessados = useMemo((): ItemEstoque[] => {
    // Se não tem dados de estoque completo, retorna vazio
    if (!dadosEstoqueCompleto || dadosEstoqueCompleto.length === 0) {
      console.log('[useEstoqueUnificado] Nenhum dado de estoque completo disponível');
      return [];
    }

    console.log('[useEstoqueUnificado] Processando dados:');
    console.log('  - Estoque completo:', dadosEstoqueCompleto.length, 'SKUs');
    console.log('  - Vendas SKU:', dadosVendasSku.length, 'SKUs');
    
    // DEBUG: Log dos tipos únicos para diagnóstico de categorização
    const tiposUnicos = [...new Set(dadosEstoqueCompleto.map(item => item.tipo))];
    console.log('[useEstoqueUnificado] TIPOS ÚNICOS DO ESTOQUE:', tiposUnicos);
    
    // Contar quantos itens têm cada tipo
    const contagemTipos: Record<string, number> = {};
    dadosEstoqueCompleto.forEach(item => {
      const tipo = item.tipo || 'NULL/VAZIO';
      contagemTipos[tipo] = (contagemTipos[tipo] || 0) + 1;
    });
    console.log('[useEstoqueUnificado] CONTAGEM POR TIPO:', contagemTipos);
    
    // Criar mapa de vendas por cod_sku para lookup rápido
    const vendasMap = new Map<number, AnaliseSku>();
    dadosVendasSku.forEach(sku => {
      vendasMap.set(sku.codSku, sku);
    });
    
    // Calcular curva ABC baseado em vendas (usa dadosVendasSku)
    const totalVendasGeral = dadosVendasSku.reduce((acc, sku) => acc + sku.totalVendido, 0);
    const ordenadosPorVenda = [...dadosVendasSku].sort((a, b) => b.totalVendido - a.totalVendido);
    
    let acumulado = 0;
    const curvaMap = new Map<number, 'A' | 'B' | 'C'>();
    
    ordenadosPorVenda.forEach(sku => {
      acumulado += sku.totalVendido;
      const percentual = totalVendasGeral > 0 ? (acumulado / totalVendasGeral) * 100 : 0;
      
      if (percentual <= 80) curvaMap.set(sku.codSku, 'A');
      else if (percentual <= 95) curvaMap.set(sku.codSku, 'B');
      else curvaMap.set(sku.codSku, 'C');
    });

    // Processar cada item do estoque completo
    return dadosEstoqueCompleto.map(estoqueItem => {
      // Buscar dados de vendas correspondentes
      const vendas = vendasMap.get(estoqueItem.codSku);
      
      const categoria = categorizarProduto(estoqueItem.tipo);
      // Curva ABC: do mapa de vendas ou 'C' se não tiver vendas (sem giro)
      const curvaABC = curvaMap.get(estoqueItem.codSku) || 'C';
      
      // Métricas de vendas (do endpoint de vendas ou zero se não vendeu)
      const qtdVendidos = vendas?.qtdProdutos ?? 0;
      const totalVendido = vendas?.totalVendido ?? 0;
      const vendaDiaria = diasPeriodo > 0 ? qtdVendidos / diasPeriodo : 0;
      const giroEstoque = vendas?.giroEstoque ?? 0;
      const margemBruta = vendas?.margemBruta ?? 0;
      
      // Buscar mínimo configurado
      let estoqueMinimo = 0;
      if (filters.empresa !== null && filters.empresa !== 'ALL') {
        const codEmpresa = typeof filters.empresa === 'number' ? filters.empresa : parseInt(String(filters.empresa));
        
        const configEspecifica = configMinimos.find(c => 
          c.cod_empresa === codEmpresa && 
          c.categoria === categoria && 
          c.curva_abc === curvaABC
        );
        
        const configGenerica = configMinimos.find(c => 
          c.cod_empresa === codEmpresa && 
          c.categoria === 'TODOS' && 
          c.curva_abc === curvaABC
        );
        
        estoqueMinimo = configEspecifica?.quantidade_minima || configGenerica?.quantidade_minima || 0;
      }
      
      // OTB = Mínimo - Estoque Atual
      const otb = Math.max(0, Math.ceil(estoqueMinimo - estoqueItem.quantidadeEstoque));
      const otbValor = otb * estoqueItem.precoCusto;
      
      // Classificação baseada em estoque vs mínimo
      let classificacao: ItemEstoque['classificacao'];
      
      if (estoqueMinimo > 0) {
        const percentualDoMinimo = (estoqueItem.quantidadeEstoque / estoqueMinimo) * 100;
        
        if (percentualDoMinimo < 30) classificacao = 'COMPRAR_URGENTE';
        else if (percentualDoMinimo < 100) classificacao = 'COMPRAR';
        else if (percentualDoMinimo > 200) classificacao = 'EXCESSO';
        else classificacao = 'ESTOQUE_OK';
      } else {
        // Sem mínimo configurado: usa lógica baseada em vendas
        if (qtdVendidos > 0 && estoqueItem.quantidadeEstoque === 0) classificacao = 'COMPRAR_URGENTE';
        else if (estoqueItem.isDeadStock) classificacao = 'EXCESSO';
        else classificacao = 'ESTOQUE_OK';
      }
      
      // Fornecedor com fallback para mapeamento
      let fornecedorFinal = estoqueItem.fornecedor;
      if (!fornecedorFinal || fornecedorFinal === 'SEM FORNECEDOR' || fornecedorFinal === 'N/D') {
        const marcaUpper = (estoqueItem.marca || '').toUpperCase();
        const fornecedorMapeado = mapeamentoFornecedor.get(marcaUpper);
        if (fornecedorMapeado) fornecedorFinal = fornecedorMapeado;
      }

      const item: ItemEstoque = {
        codSku: estoqueItem.codSku,
        codigoBarra: estoqueItem.codigoBarra,
        descricao: estoqueItem.descricao,
        marca: estoqueItem.marca,
        fornecedor: fornecedorFinal,
        tipo: estoqueItem.tipo,
        categoria,
        
        // Estoque do /estoque/completo
        estoqueAtual: estoqueItem.quantidadeEstoque,
        estoqueMinimo,
        valorEstoqueCusto: estoqueItem.valorEstoqueCusto,
        
        // Vendas do /vendas/analise-sku
        qtdVendidos,
        totalVendido,
        diasEmEstoque: estoqueItem.diasEmEstoque,
        vendaDiaria,
        
        // Custos
        precoCusto: estoqueItem.precoCusto,
        precoVenda: estoqueItem.precoVenda,
        margemBruta,
        
        // OTB
        otb,
        otbValor,
        curvaABC,
        classificacao,
        // Ação sugerida vem diretamente do backend (baseada em dias_estoque)
        acaoSugerida: estoqueItem.acaoSugerida,
        giroEstoque,
        
        // Dead stock
        isDeadStock: estoqueItem.isDeadStock,
      };
      
      return item;
    });
  }, [dadosEstoqueCompleto, dadosVendasSku, diasPeriodo, filters.empresa, mapeamentoFornecedor, configMinimos]);

  // Contagem por categoria (dados brutos)
  const contagemPorCategoria = useMemo(() => {
    if (!itensProcessados || itensProcessados.length === 0) return { armacoes: 0, lentes: 0, acessorios: 0, outros: 0 };
    
    let armacoes = 0, lentes = 0, acessorios = 0, outros = 0;
    
    itensProcessados.forEach(item => {
      if (item.categoria === 'ARMACOES') armacoes++;
      else if (item.categoria === 'LENTES') lentes++;
      else if (item.categoria === 'ACESSORIOS') acessorios++;
      else outros++;
    });
    
    return { armacoes, lentes, acessorios, outros };
  }, [itensProcessados]);

  // Itens filtrados (aplica TODOS os filtros)
  const itensFiltrados = useMemo(() => {
    let resultado = itensProcessados;
    
    // Filtro por categoria
    if (filters.categoria !== 'TODOS') {
      resultado = resultado.filter(item => item.categoria === filters.categoria);
    }
    
    // Filtro por curva ABC
    if (filters.curvaABC) {
      resultado = resultado.filter(item => item.curvaABC === filters.curvaABC);
    }
    
    // Filtro por fornecedor
    if (filters.fornecedor !== 'TODOS') {
      resultado = resultado.filter(item => item.fornecedor === filters.fornecedor);
    }
    
    // Filtro por marca
    if (filters.marca !== 'TODAS') {
      resultado = resultado.filter(item => item.marca === filters.marca);
    }
    
    // Filtro por ação sugerida
    if (filters.acao !== 'TODAS') {
      resultado = resultado.filter(item => item.acaoSugerida === filters.acao);
    }
    
    // Busca textual
    if (filters.busca.trim()) {
      const termo = filters.busca.toLowerCase();
      resultado = resultado.filter(item =>
        item.descricao?.toLowerCase().includes(termo) ||
        item.marca?.toLowerCase().includes(termo) ||
        item.fornecedor?.toLowerCase().includes(termo) ||
        String(item.codSku).includes(termo)
      );
    }
    
    return resultado;
  }, [itensProcessados, filters]);

  // Itens com estoque > 0 (para aba Visão Estoque)
  const itensComEstoque = useMemo(() => {
    return itensFiltrados.filter(item => item.estoqueAtual > 0);
  }, [itensFiltrados]);

  // Métricas consolidadas
  const metricas = useMemo((): MetricasEstoque => {
    // Métricas de estoque físico direto do endpoint completo
    const metricasEstoque = calcularMetricasEstoqueCompleto(
      dadosEstoqueCompleto.filter(item => {
        // Aplica filtro de categoria se selecionado
        if (filters.categoria !== 'TODOS') {
          const cat = categorizarProduto(item.tipo);
          return cat === filters.categoria;
        }
        return true;
      })
    );
    
    // Para estoque físico filtrado: apenas itens com estoque > 0
    const comEstoque = itensFiltrados.filter(item => item.estoqueAtual > 0);
    const totalPecas = comEstoque.reduce((acc, i) => acc + i.estoqueAtual, 0);
    const totalSkusComEstoque = comEstoque.length;
    const valorTotalCusto = comEstoque.reduce((acc, i) => acc + i.valorEstoqueCusto, 0);
    
    // Dead stock
    const deadStock = comEstoque.filter(i => i.isDeadStock);
    const deadStockPecas = deadStock.reduce((acc, i) => acc + i.estoqueAtual, 0);
    const deadStockValor = deadStock.reduce((acc, i) => acc + i.valorEstoqueCusto, 0);
    const deadStockPercentual = totalPecas > 0 ? (deadStockPecas / totalPecas) * 100 : 0;
    
    // Métricas gerais
    const totalSkus = itensFiltrados.length;
    const fornecedoresDistintos = new Set(comEstoque.map(i => i.fornecedor)).size;
    const marcasDistintas = new Set(comEstoque.map(i => i.marca)).size;
    
    // Por ação sugerida (LIQUIDA, não LIQUIDAR)
    const pecasLiquidar = comEstoque
      .filter(i => i.acaoSugerida.toUpperCase().includes('LIQUIDA'))
      .reduce((acc, i) => acc + i.estoqueAtual, 0);
    
    const pecasManter = comEstoque
      .filter(i => i.acaoSugerida.includes('MANTER'))
      .reduce((acc, i) => acc + i.estoqueAtual, 0);
    
    const pecasComprar = comEstoque
      .filter(i => i.acaoSugerida.includes('COMPRAR'))
      .reduce((acc, i) => acc + i.estoqueAtual, 0);
    
    // OTB (usa todos os itens para calcular necessidade de compra)
    const totalVendido = itensFiltrados.reduce((acc, i) => acc + i.totalVendido, 0);
    const totalOtb = itensFiltrados.reduce((acc, i) => acc + i.otb, 0);
    const totalOtbValor = itensFiltrados.reduce((acc, i) => acc + i.otbValor, 0);
    const skusComprarUrgente = itensFiltrados.filter(i => i.classificacao === 'COMPRAR_URGENTE').length;
    const skusComprar = itensFiltrados.filter(i => i.classificacao === 'COMPRAR').length;
    const skusEstoqueOk = itensFiltrados.filter(i => i.classificacao === 'ESTOQUE_OK').length;
    const skusExcesso = itensFiltrados.filter(i => i.classificacao === 'EXCESSO').length;
    
    return {
      totalPecas,
      totalSkusComEstoque,
      valorTotalCusto,
      deadStockPecas,
      deadStockValor,
      deadStockPercentual,
      totalSkus,
      fornecedoresDistintos,
      marcasDistintas,
      pecasLiquidar,
      pecasManter,
      pecasComprar,
      totalVendido,
      totalOtb,
      totalOtbValor,
      skusComprarUrgente,
      skusComprar,
      skusEstoqueOk,
      skusExcesso,
      diasPeriodo,
    };
  }, [itensFiltrados, dadosEstoqueCompleto, filters.categoria, diasPeriodo]);

  // Listas para filtros
  const listaFornecedores = useMemo(() => {
    const set = new Set(itensProcessados.map(i => i.fornecedor).filter(Boolean));
    return ['TODOS', ...Array.from(set).sort()];
  }, [itensProcessados]);

  const listaMarcas = useMemo(() => {
    const set = new Set(itensProcessados.map(i => i.marca).filter(Boolean));
    return ['TODAS', ...Array.from(set).sort()];
  }, [itensProcessados]);

  // Lista de ações para filtro
  const listaAcoes = useMemo(() => {
    const set = new Set(itensProcessados.map(i => i.acaoSugerida).filter(Boolean));
    return ['TODAS', ...Array.from(set).sort()];
  }, [itensProcessados]);

  // ============================================
  // MIX IDEAL (vendas 6m vs estoque atual)
  // ============================================
  const mixIdealCategoria = useMemo((): MixComparativo[] => {
    const comEstoque = itensProcessados.filter(i => i.estoqueAtual > 0);
    const totalEstoque = comEstoque.reduce((acc, i) => acc + i.estoqueAtual, 0);
    const totalVendas = itensProcessados.reduce((acc, i) => acc + i.qtdVendidos, 0);
    
    if (totalEstoque === 0 && totalVendas === 0) return [];

    const categorias: Array<'ARMACOES' | 'LENTES' | 'ACESSORIOS' | 'OUTROS'> = ['ARMACOES', 'LENTES', 'ACESSORIOS', 'OUTROS'];
    
    return categorias.map(cat => {
      const vendasCat = itensProcessados.filter(i => i.categoria === cat).reduce((acc, i) => acc + i.qtdVendidos, 0);
      const estoqueCat = comEstoque.filter(i => i.categoria === cat).reduce((acc, i) => acc + i.estoqueAtual, 0);
      
      const percentualIdeal = totalVendas > 0 ? (vendasCat / totalVendas) * 100 : 0;
      const percentualAtual = totalEstoque > 0 ? (estoqueCat / totalEstoque) * 100 : 0;
      
      return {
        chave: cat,
        percentualIdeal,
        percentualAtual,
        gap: percentualIdeal - percentualAtual,
      };
    }).filter(m => m.percentualIdeal > 0 || m.percentualAtual > 0);
  }, [itensProcessados]);

  const mixIdealMarca = useMemo((): MixComparativo[] => {
    const comEstoque = itensProcessados.filter(i => i.estoqueAtual > 0);
    const totalEstoque = comEstoque.reduce((acc, i) => acc + i.estoqueAtual, 0);
    const totalVendas = itensProcessados.reduce((acc, i) => acc + i.qtdVendidos, 0);
    
    if (totalEstoque === 0 && totalVendas === 0) return [];

    const marcasSet = new Set(itensProcessados.map(i => i.marca).filter(Boolean));
    
    return Array.from(marcasSet).map(marca => {
      const vendasMarca = itensProcessados.filter(i => i.marca === marca).reduce((acc, i) => acc + i.qtdVendidos, 0);
      const estoqueMarca = comEstoque.filter(i => i.marca === marca).reduce((acc, i) => acc + i.estoqueAtual, 0);
      
      const percentualIdeal = totalVendas > 0 ? (vendasMarca / totalVendas) * 100 : 0;
      const percentualAtual = totalEstoque > 0 ? (estoqueMarca / totalEstoque) * 100 : 0;
      
      return {
        chave: marca,
        percentualIdeal,
        percentualAtual,
        gap: percentualIdeal - percentualAtual,
      };
    })
    .filter(m => m.percentualIdeal > 0 || m.percentualAtual > 0)
    .sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap));
  }, [itensProcessados]);

  // ============================================
  // RESUMO POR MARCA (decisão REPOR/RENOVAR/DESCONTINUAR)
  // ============================================
  const resumoPorMarca = useMemo((): ResumoMarca[] => {
    if (itensProcessados.length === 0) return [];

    const porMarca = new Map<string, ItemEstoque[]>();
    itensProcessados.forEach(item => {
      const key = item.marca || 'SEM MARCA';
      if (!porMarca.has(key)) porMarca.set(key, []);
      porMarca.get(key)!.push(item);
    });

    return Array.from(porMarca.entries()).map(([marca, skus]) => {
      const comEstoque = skus.filter(s => s.estoqueAtual > 0);
      const pecasEstoque = comEstoque.reduce((acc, s) => acc + s.estoqueAtual, 0);
      const valorEstoque = comEstoque.reduce((acc, s) => acc + s.valorEstoqueCusto, 0);
      const qtdVendidos6m = skus.reduce((acc, s) => acc + s.qtdVendidos, 0);
      const totalVendido6m = skus.reduce((acc, s) => acc + s.totalVendido, 0);
      const otbTotal = skus.reduce((acc, s) => acc + s.otb, 0);
      const temCurvaA = skus.some(s => s.curvaABC === 'A');
      
      // Média de dias em estoque dos SKUs que venderam
      const vendidos = skus.filter(s => s.qtdVendidos > 0);
      const mediaDiasEmEstoque = vendidos.length > 0
        ? vendidos.reduce((acc, s) => acc + s.diasEmEstoque, 0) / vendidos.length
        : 999;

      // Decisão
      let decisao: DecisaoMarca;
      const soTemCurvaC = skus.every(s => s.curvaABC === 'C');
      const todosDeadStock = comEstoque.length > 0 && comEstoque.every(s => s.isDeadStock);

      if (soTemCurvaC && (todosDeadStock || qtdVendidos6m === 0)) {
        decisao = 'AVALIAR_DESCONTINUACAO';
      } else if (temCurvaA || mediaDiasEmEstoque < 90) {
        decisao = 'REPOR_REFERENCIA';
      } else {
        decisao = 'RENOVAR_COLECAO';
      }

      const categoria = skus[0]?.categoria || 'OUTROS';

      return { marca, categoria, pecasEstoque, valorEstoque, qtdVendidos6m, totalVendido6m, otbTotal, mediaDiasEmEstoque, temCurvaA, decisao, skus };
    }).sort((a, b) => {
      // Prioridade: REPOR > RENOVAR > DESCONTINUAR
      const ordem: Record<DecisaoMarca, number> = { REPOR_REFERENCIA: 0, RENOVAR_COLECAO: 1, AVALIAR_DESCONTINUACAO: 2 };
      return ordem[a.decisao] - ordem[b.decisao] || b.totalVendido6m - a.totalVendido6m;
    });
  }, [itensProcessados]);

  // ============================================
  // ESTOQUE DOENTE (agrupado por faixa de ação)
  // ============================================
  const estoqueDoenteAgrupado = useMemo((): GrupoEstoqueDoente[] => {
    const comEstoque = itensProcessados.filter(i => i.estoqueAtual > 0 && i.diasEmEstoque >= 180);
    
    if (comEstoque.length === 0) return [];

    const classificar = (dias: number): FaixaDoente => {
      if (dias >= 720) return 'DESCARTE';
      if (dias >= 360) return 'LIQUIDACAO_50';
      if (dias >= 270) return 'LIQUIDACAO_30';
      if (dias >= 180) return 'PROMOCAO_20';
      return 'PROMOCAO_20';
    };

    const faixasConfig: Record<FaixaDoente, { label: string; desconto: string; cor: string }> = {
      PROMOCAO_20: { label: 'Promoção 20%', desconto: '20%', cor: 'text-yellow-600' },
      LIQUIDACAO_30: { label: 'Liquidação 30%', desconto: '30%', cor: 'text-orange-600' },
      LIQUIDACAO_50: { label: 'Liquidação 50%', desconto: '50%', cor: 'text-destructive' },
      DESCARTE: { label: 'Descarte / Doação', desconto: '100%', cor: 'text-destructive' },
      REVISAO_URGENTE: { label: 'Revisão Urgente', desconto: '-', cor: 'text-destructive' },
    };

    const grupos = new Map<FaixaDoente, ItemEstoque[]>();
    comEstoque.forEach(item => {
      const faixa = classificar(item.diasEmEstoque);
      if (!grupos.has(faixa)) grupos.set(faixa, []);
      grupos.get(faixa)!.push(item);
    });

    // Add items with no sales record at all as REVISAO_URGENTE
    const semMovimento = itensProcessados.filter(i => i.estoqueAtual > 0 && i.qtdVendidos === 0 && i.diasEmEstoque === 0);
    if (semMovimento.length > 0) {
      if (!grupos.has('REVISAO_URGENTE')) grupos.set('REVISAO_URGENTE', []);
      grupos.get('REVISAO_URGENTE')!.push(...semMovimento);
    }

    const ordemFaixas: FaixaDoente[] = ['PROMOCAO_20', 'LIQUIDACAO_30', 'LIQUIDACAO_50', 'DESCARTE', 'REVISAO_URGENTE'];

    return ordemFaixas
      .filter(f => grupos.has(f))
      .map(faixa => {
        const itens = grupos.get(faixa)!;
        const config = faixasConfig[faixa];
        const marcasSet = new Set(itens.map(i => i.marca).filter(Boolean));
        return {
          faixa,
          label: config.label,
          desconto: config.desconto,
          cor: config.cor,
          pecas: itens.reduce((acc, i) => acc + i.estoqueAtual, 0),
          valorCusto: itens.reduce((acc, i) => acc + i.valorEstoqueCusto, 0),
          marcas: Array.from(marcasSet).sort(),
          itens,
        };
      });
  }, [itensProcessados]);

  // Marcas sem fornecedor
  const marcasSemFornecedor = useMemo(() => {
    const marcaContagem = new Map<string, number>();
    
    itensProcessados.forEach(item => {
      if (!item.fornecedor || item.fornecedor === 'SEM FORNECEDOR' || item.fornecedor === 'N/D') {
        const marca = item.marca || 'SEM MARCA';
        marcaContagem.set(marca, (marcaContagem.get(marca) || 0) + 1);
      }
    });
    
    return Array.from(marcaContagem.entries())
      .map(([marca, qtdSkus]) => ({ marca, qtdSkus }))
      .sort((a, b) => b.qtdSkus - a.qtdSkus);
  }, [itensProcessados]);

  // Carregar dados de AMBOS endpoints
  const carregarDados = useCallback(async () => {
    if (filters.empresa === null) {
      toast({
        title: "Selecione uma empresa",
        description: "Escolha uma empresa para carregar os dados de estoque",
        variant: "destructive",
      });
      return;
    }
    
    setLoading(true);
    setError(null);
    
    try {
      console.log('[useEstoqueUnificado] Carregando dados de ambos endpoints...', {
        empresa: filters.empresa,
        dataInicio: filters.dataInicio,
        dataFim: filters.dataFim,
      });
      
      // Busca PARALELA de ambos endpoints
      const [estoqueCompleto, vendasSku] = await Promise.all([
        // 1. Estoque completo: inventário físico total
        getEstoqueCompleto({
          empresa: filters.empresa,
        }),
        // 2. Vendas por SKU: métricas de giro e vendas
        getAnaliseSku({
          empresa: filters.empresa,
          dataInicio: filters.dataInicio,
          dataFim: filters.dataFim,
        }),
      ]);
      
      console.log('[useEstoqueUnificado] Dados carregados:');
      console.log('  - Estoque completo:', estoqueCompleto.length, 'SKUs');
      console.log('  - Vendas por SKU:', vendasSku.length, 'SKUs');
      
      // Contar totais
      const totalPecasEstoque = estoqueCompleto.reduce((acc, d) => acc + d.quantidadeEstoque, 0);
      const pecasDeadStock = estoqueCompleto.filter(d => d.isDeadStock).reduce((acc, d) => acc + d.quantidadeEstoque, 0);
      
      setDadosEstoqueCompleto(estoqueCompleto);
      setDadosVendasSku(vendasSku);
      
      toast({
        title: "Dados Carregados",
        description: `${estoqueCompleto.length} SKUs • ${totalPecasEstoque.toLocaleString('pt-BR')} peças em estoque • ${pecasDeadStock.toLocaleString('pt-BR')} paradas`,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao carregar dados';
      console.error('[useEstoqueUnificado] Erro:', message);
      setError(message);
      
      toast({
        title: "Erro ao carregar",
        description: message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [filters.empresa, filters.dataInicio, filters.dataFim]);

  // Para compatibilidade com código existente
  const dadosBrutos = dadosVendasSku;

  return {
    // Empresas
    empresas,
    loadingEmpresas,
    
    // Filtros
    filters,
    setFilters,
    
    // Estado
    loading,
    error,
    
    // Dados brutos
    dadosBrutos,
    dadosEstoqueCompleto,
    dadosVendasSku,
    
    // Dados processados
    itensProcessados,
    itensFiltrados,
    itensComEstoque,
    
    // Métricas
    metricas,
    contagemPorCategoria,
    diasPeriodo,
    
    // Listas para filtros
    listaFornecedores,
    listaMarcas,
    listaAcoes,
    marcasSemFornecedor,
    
    // Ações
    carregarDados,
  };
}
