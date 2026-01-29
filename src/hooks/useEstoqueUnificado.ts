// src/hooks/useEstoqueUnificado.ts
// Hook UNIFICADO para gestão de estoque - fonte única de dados para todas as abas
// RESOLVE: Inconsistência entre abas (Visão Estoque, O que Fazer, Análise OTB)

import { useState, useCallback, useMemo, useEffect } from "react";
import { useEmpresas } from "./useEmpresas";
import { EmpresaParam } from "@/services/firebirdBridge";
import { getAnaliseSku, AnaliseSku } from "@/services/vendasService";
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
  
  // Estoque
  estoqueAtual: number;
  estoqueMinimo: number;
  
  // Vendas
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
}

export interface MetricasEstoque {
  // Métricas de estoque físico (apenas itens com estoque > 0)
  totalPecas: number;
  totalSkusComEstoque: number;
  
  // Métricas gerais
  totalSkus: number;
  fornecedoresDistintos: number;
  marcasDistintas: number;
  
  // Por ação
  pecasLiquidar: number;
  pecasManter: number;
  pecasComprar: number;
  
  // OTB
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
  
  if (tipoNorm.startsWith('AR ') || tipoNorm === 'AR' || tipoNorm.includes('ARMAC') || tipoNorm.includes('ARMAÇÃO')) {
    return 'ARMACOES';
  }
  if (tipoNorm.startsWith('LG ') || tipoNorm.startsWith('GC ') || tipoNorm === 'LG' || tipoNorm === 'GC' || tipoNorm.includes('LENT')) {
    return 'LENTES';
  }
  if (tipoNorm.startsWith('AC ') || tipoNorm === 'AC' || tipoNorm.includes('ACESS') || tipoNorm.includes('ACC')) {
    return 'ACESSORIOS';
  }
  return 'OUTROS';
}

function calcularAcaoSugerida(item: { estoqueAtual: number; estoqueMinimo: number; qtdVendidos: number; diasDesdeUltimaVenda: number; classificacao: string }): string {
  // Sem estoque mas com vendas = COMPRAR URGENTE
  if (item.estoqueAtual === 0 && item.qtdVendidos > 0) {
    return 'COMPRAR URGENTE';
  }
  
  // Parado há muito tempo = LIQUIDAR
  if (item.diasDesdeUltimaVenda > 180 || (item.qtdVendidos === 0 && item.estoqueAtual > 0)) {
    return 'LIQUIDAR';
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
  const [dadosBrutos, setDadosBrutos] = useState<AnaliseSku[]>([]);
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

  // Contagem por categoria (dados brutos)
  const contagemPorCategoria = useMemo(() => {
    if (!dadosBrutos || dadosBrutos.length === 0) return { armacoes: 0, lentes: 0, acessorios: 0, outros: 0 };
    
    let armacoes = 0, lentes = 0, acessorios = 0, outros = 0;
    
    dadosBrutos.forEach(sku => {
      const cat = categorizarTipo(sku.tipo);
      if (cat === 'ARMACOES') armacoes++;
      else if (cat === 'LENTES') lentes++;
      else if (cat === 'ACESSORIOS') acessorios++;
      else outros++;
    });
    
    return { armacoes, lentes, acessorios, outros };
  }, [dadosBrutos]);

  // Processa dados brutos em ItemEstoque com cálculos OTB
  const itensProcessados = useMemo((): ItemEstoque[] => {
    if (!dadosBrutos || dadosBrutos.length === 0) {
      console.log('[useEstoqueUnificado] Nenhum dado bruto disponível');
      return [];
    }

    console.log('[useEstoqueUnificado] Processando', dadosBrutos.length, 'SKUs');
    
    // Calcular curva ABC
    const totalVendasGeral = dadosBrutos.reduce((acc, sku) => acc + sku.totalVendido, 0);
    const ordenadosPorVenda = [...dadosBrutos].sort((a, b) => b.totalVendido - a.totalVendido);
    
    let acumulado = 0;
    const curvaMap = new Map<number, 'A' | 'B' | 'C'>();
    
    ordenadosPorVenda.forEach(sku => {
      acumulado += sku.totalVendido;
      const percentual = totalVendasGeral > 0 ? (acumulado / totalVendasGeral) * 100 : 0;
      
      if (percentual <= 80) curvaMap.set(sku.codSku, 'A');
      else if (percentual <= 95) curvaMap.set(sku.codSku, 'B');
      else curvaMap.set(sku.codSku, 'C');
    });

    return dadosBrutos.map(sku => {
      const categoria = categorizarTipo(sku.tipo);
      const curvaABC = curvaMap.get(sku.codSku) || 'C';
      const vendaDiaria = diasPeriodo > 0 ? sku.qtdProdutos / diasPeriodo : 0;
      
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
      const otb = Math.max(0, Math.ceil(estoqueMinimo - sku.estoqueAtual));
      const otbValor = otb * sku.precoCusto;
      
      // Classificação
      let classificacao: ItemEstoque['classificacao'];
      
      if (estoqueMinimo > 0) {
        const percentualDoMinimo = (sku.estoqueAtual / estoqueMinimo) * 100;
        
        if (percentualDoMinimo < 30) classificacao = 'COMPRAR_URGENTE';
        else if (percentualDoMinimo < 100) classificacao = 'COMPRAR';
        else if (percentualDoMinimo > 200) classificacao = 'EXCESSO';
        else classificacao = 'ESTOQUE_OK';
      } else {
        if (sku.qtdProdutos > 0 && sku.estoqueAtual === 0) classificacao = 'COMPRAR_URGENTE';
        else if (sku.estoqueAtual > 0 && sku.diasDesdeUltimaVenda > 180) classificacao = 'EXCESSO';
        else classificacao = 'ESTOQUE_OK';
      }
      
      // Fornecedor com fallback
      let fornecedorFinal = sku.fornecedor;
      if (!fornecedorFinal || fornecedorFinal === 'SEM FORNECEDOR' || fornecedorFinal === 'N/D') {
        const marcaUpper = (sku.marca || '').toUpperCase();
        const fornecedorMapeado = mapeamentoFornecedor.get(marcaUpper);
        if (fornecedorMapeado) fornecedorFinal = fornecedorMapeado;
      }

      const item: ItemEstoque = {
        codSku: sku.codSku,
        descricao: sku.descricaoItem,
        marca: sku.marca,
        fornecedor: fornecedorFinal,
        tipo: sku.tipo,
        categoria,
        estoqueAtual: sku.estoqueAtual,
        estoqueMinimo,
        qtdVendidos: sku.qtdProdutos,
        totalVendido: sku.totalVendido,
        diasDesdeUltimaVenda: sku.diasDesdeUltimaVenda,
        vendaDiaria,
        precoCusto: sku.precoCusto,
        precoVenda: sku.precoVendaFinal,
        margemBruta: sku.margemBruta,
        otb,
        otbValor,
        curvaABC,
        classificacao,
        acaoSugerida: '',
        giroEstoque: sku.giroEstoque,
      };
      
      item.acaoSugerida = calcularAcaoSugerida(item);
      
      return item;
    });
  }, [dadosBrutos, diasPeriodo, filters.empresa, mapeamentoFornecedor, configMinimos]);

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
    // Para estoque físico: apenas itens com estoque > 0
    const comEstoque = itensFiltrados.filter(item => item.estoqueAtual > 0);
    const totalPecas = comEstoque.reduce((acc, i) => acc + i.estoqueAtual, 0);
    const totalSkusComEstoque = comEstoque.length;
    
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
  }, [itensFiltrados, diasPeriodo]);

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

  // Carregar dados
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
      console.log('[useEstoqueUnificado] Carregando dados...', {
        empresa: filters.empresa,
        dataInicio: filters.dataInicio,
        dataFim: filters.dataFim,
      });
      
      const dados = await getAnaliseSku({
        empresa: filters.empresa,
        dataInicio: filters.dataInicio,
        dataFim: filters.dataFim,
      });
      
      console.log('[useEstoqueUnificado] Dados carregados:', dados.length, 'SKUs');
      
      // Contar peças com estoque > 0
      const pecasComEstoque = dados.filter(d => d.estoqueAtual > 0);
      const totalPecas = pecasComEstoque.reduce((acc, d) => acc + d.estoqueAtual, 0);
      
      setDadosBrutos(dados);
      
      toast({
        title: "Dados Carregados",
        description: `${pecasComEstoque.length} SKUs com estoque • ${totalPecas.toLocaleString('pt-BR')} peças`,
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
    
    // Dados
    dadosBrutos,
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
