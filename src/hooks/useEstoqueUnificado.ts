// src/hooks/useEstoqueUnificado.ts
// Hook UNIFICADO para gestão de estoque - fonte única de dados para todas as abas
// 
// ESTRATÉGIA DE DADOS:
// - /estoque/completo: Inventário físico TOTAL (estoque > 0) para "Visão Estoque"
// - /vendas/analise-sku: Métricas de giro/vendas para "Análise OTB"
// - Dados são MESCLADOS pelo cod_sku para ter visão completa

import { useState, useCallback, useMemo, useEffect } from "react";
import { useEmpresas } from "./useEmpresas";
import { EmpresaParam } from "@/services/firebirdBridge";
import { getAnaliseSku, AnaliseSku } from "@/services/vendasService";
import { getEstoqueCompleto, EstoqueCompleto, calcularMetricasEstoqueCompleto } from "@/services/estoqueCompletoService";
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
  busca: string;
}

export interface ItemEstoque {
  // Dados do SKU
  codSku: number;
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
  diasDesdeUltimaVenda: number;
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

function categorizarTipo(tipo: string): 'ARMACOES' | 'LENTES' | 'ACESSORIOS' | 'OUTROS' {
  const tipoNorm = (tipo || '').toUpperCase().trim();
  
  // Debug: log para verificar valores vindos do backend
  // console.log('[categorizarTipo] Input:', tipo, '-> Normalizado:', tipoNorm);
  
  // ARMAÇÕES: AR, ARM, ARMAÇÃO, ARMACAO, ou qualquer coisa que comece com AR
  if (
    tipoNorm === 'AR' ||
    tipoNorm === 'ARM' ||
    tipoNorm.startsWith('AR ') ||
    tipoNorm.startsWith('AR-') ||
    tipoNorm.startsWith('ARM ') ||
    tipoNorm.startsWith('ARM-') ||
    tipoNorm.includes('ARMAC') ||
    tipoNorm.includes('ARMAÇÃO') ||
    tipoNorm.includes('ARMA')
  ) {
    return 'ARMACOES';
  }
  
  // LENTES: LG (lentes de grau), GC (grau de contato), LC (lentes de contato)
  if (
    tipoNorm === 'LG' ||
    tipoNorm === 'GC' ||
    tipoNorm === 'LC' ||
    tipoNorm.startsWith('LG ') ||
    tipoNorm.startsWith('LG-') ||
    tipoNorm.startsWith('GC ') ||
    tipoNorm.startsWith('GC-') ||
    tipoNorm.startsWith('LC ') ||
    tipoNorm.startsWith('LC-') ||
    tipoNorm.includes('LENT') ||
    tipoNorm.includes('GRAU') ||
    tipoNorm.includes('CONTATO')
  ) {
    return 'LENTES';
  }
  
  // ACESSÓRIOS: AC, ACESSÓRIO
  if (
    tipoNorm === 'AC' ||
    tipoNorm.startsWith('AC ') ||
    tipoNorm.startsWith('AC-') ||
    tipoNorm.includes('ACESS') ||
    tipoNorm.includes('ACC')
  ) {
    return 'ACESSORIOS';
  }
  
  return 'OUTROS';
}

function calcularAcaoSugerida(item: { estoqueAtual: number; estoqueMinimo: number; qtdVendidos: number; diasDesdeUltimaVenda: number; classificacao: string; isDeadStock: boolean }): string {
  // Dead stock = LIQUIDAR (prioridade máxima)
  if (item.isDeadStock) {
    return 'LIQUIDAR';
  }
  
  // Sem estoque mas com vendas = COMPRAR URGENTE
  if (item.estoqueAtual === 0 && item.qtdVendidos > 0) {
    return 'COMPRAR URGENTE';
  }
  
  // Baseado na classificação OTB
  switch (item.classificacao) {
    case 'COMPRAR_URGENTE': return 'COMPRAR URGENTE';
    case 'COMPRAR': return 'COMPRAR';
    case 'EXCESSO': return 'LIQUIDAR';
    default: return 'MANTER';
  }
}

// ============================================
// HOOK PRINCIPAL
// ============================================

export function useEstoqueUnificado() {
  const { empresas, isLoading: loadingEmpresas } = useEmpresas();
  
  // Período padrão: últimos 180 dias
  const hoje = new Date();
  const dataFim = hoje.toISOString().split('T')[0];
  const dataInicio = new Date(hoje.getTime() - 180 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  
  const [filters, setFilters] = useState<EstoqueFilters>({
    empresa: null,
    dataInicio,
    dataFim,
    categoria: 'TODOS',
    curvaABC: null,
    fornecedor: 'TODOS',
    marca: 'TODAS',
    busca: '',
  });

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
      
      const categoria = categorizarTipo(estoqueItem.tipo);
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
        diasDesdeUltimaVenda: estoqueItem.diasSemVenda,
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
        acaoSugerida: '',
        giroEstoque,
        
        // Dead stock
        isDeadStock: estoqueItem.isDeadStock,
      };
      
      item.acaoSugerida = calcularAcaoSugerida(item);
      
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
          const cat = categorizarTipo(item.tipo);
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
    
    // Por ação sugerida
    const pecasLiquidar = comEstoque
      .filter(i => i.acaoSugerida.includes('LIQUIDAR'))
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
    marcasSemFornecedor,
    
    // Ações
    carregarDados,
  };
}
