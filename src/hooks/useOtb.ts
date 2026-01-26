// src/hooks/useOtb.ts
// Hook para módulo OTB (Open to Buy) - cálculo de necessidades de compra

import { useState, useCallback, useMemo } from "react";
import { useEmpresas } from "./useEmpresas";
import { EmpresaParam } from "@/services/firebirdBridge";
import { getAnaliseSku, AnaliseSku } from "@/services/vendasService";
import { getPeriodoComercial } from "@/utils/dateValidation";
import { toast } from "@/hooks/use-toast";

// ============================================
// INTERFACES
// ============================================

export interface OtbFilters {
  empresa: EmpresaParam;
  dataInicio: string;
  dataFim: string;
  coberturaDias: number; // Dias de cobertura desejados
  tipoFiltro: 'TODOS' | 'ARMACOES' | 'LENTES' | 'ACESSORIOS' | 'OUTROS';
}

export interface OtbItem {
  // Dados do SKU
  codSku: number;
  descricaoItem: string;
  marca: string;
  fornecedor: string;
  tipo: string;
  
  // Estoque atual
  estoqueAtual: number;
  
  // Vendas no período
  qtdVendidos: number;
  totalVendido: number;
  diasDesdeUltimaVenda: number;
  
  // Custos e margens
  precoCusto: number;
  precoVendaFinal: number;
  margemBruta: number;
  
  // Cálculos OTB
  vendaDiaria: number; // média de vendas por dia
  vendasProjetadas: number; // vendas projetadas para o período de cobertura
  otb: number; // Open to Buy = Vendas Projetadas - Estoque Atual
  otbValor: number; // OTB em valor (OTB * preço custo)
  
  // Classificação
  classificacao: 'COMPRAR_URGENTE' | 'COMPRAR' | 'ESTOQUE_OK' | 'EXCESSO';
  giroEstoque: number;
}

export interface OtbAgrupado {
  chave: string; // fornecedor ou marca
  fornecedor: string;
  marca?: string;
  tipo: string;
  qtdSkus: number;
  estoqueTotal: number;
  qtdVendidos: number;
  totalVendido: number;
  otbTotal: number;
  otbValorTotal: number;
  skusComprarUrgente: number;
  skusComprar: number;
  skusEstoqueOk: number;
  skusExcesso: number;
  margemMedia: number;
}

export interface OtbMetrics {
  totalSkus: number;
  totalEstoque: number;
  totalVendido: number;
  totalOtb: number;
  totalOtbValor: number;
  skusComprarUrgente: number;
  skusComprar: number;
  skusEstoqueOk: number;
  skusExcesso: number;
  diasPeriodo: number;
}

// ============================================
// HOOK
// ============================================

export function useOtb() {
  const { empresas, isLoading: loadingEmpresas } = useEmpresas();
  
  // Período padrão: últimos 180 dias (base para projeção)
  const hoje = new Date();
  const dataFim = hoje.toISOString().split('T')[0];
  const dataInicio = new Date(hoje.getTime() - 180 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  
  const [filters, setFilters] = useState<OtbFilters>({
    empresa: 'ALL',
    dataInicio,
    dataFim,
    coberturaDias: 60, // 60 dias de cobertura padrão
    tipoFiltro: 'TODOS', // Começa com TODOS para mostrar todos os dados
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dadosBrutos, setDadosBrutos] = useState<AnaliseSku[]>([]);
  const [agrupamento, setAgrupamento] = useState<'fornecedor' | 'marca'>('fornecedor');

  /**
   * Calcula o número de dias do período selecionado
   */
  const diasPeriodo = useMemo(() => {
    const inicio = new Date(filters.dataInicio);
    const fim = new Date(filters.dataFim);
    return Math.ceil((fim.getTime() - inicio.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  }, [filters.dataInicio, filters.dataFim]);

  /**
   * Processa dados brutos e calcula OTB para cada SKU
   */
  /**
   * Contagem de SKUs por categoria (para mostrar disponibilidade)
   */
  const contagemPorCategoria = useMemo(() => {
    if (!dadosBrutos || dadosBrutos.length === 0) return { armacoes: 0, lentes: 0, acessorios: 0, outros: 0 };
    
    let armacoes = 0, lentes = 0, acessorios = 0, outros = 0;
    
    dadosBrutos.forEach(sku => {
      const tipoNorm = (sku.tipo || '').toUpperCase().trim();
      const isArmacao = tipoNorm.startsWith('AR ') || tipoNorm === 'AR' || tipoNorm.includes('ARMAC') || tipoNorm.includes('ARMAÇÃO');
      const isLente = tipoNorm.startsWith('LG ') || tipoNorm.startsWith('GC ') || tipoNorm === 'LG' || tipoNorm === 'GC' || tipoNorm.includes('LENT');
      const isAcessorio = tipoNorm.startsWith('AC ') || tipoNorm === 'AC' || tipoNorm.includes('ACESS') || tipoNorm.includes('ACC');
      
      if (isArmacao) armacoes++;
      else if (isLente) lentes++;
      else if (isAcessorio) acessorios++;
      else outros++;
    });
    
    return { armacoes, lentes, acessorios, outros };
  }, [dadosBrutos]);

  const itensOtb = useMemo((): OtbItem[] => {
    if (!dadosBrutos || dadosBrutos.length === 0) {
      console.log('[useOtb] Nenhum dado bruto disponível');
      return [];
    }

    console.log('[useOtb] Processando', dadosBrutos.length, 'SKUs. Filtro tipo:', filters.tipoFiltro);
    console.log('[useOtb] Contagem por categoria:', contagemPorCategoria);
    
    // Log tipos únicos disponíveis para debug
    const tiposUnicos = [...new Set(dadosBrutos.map(s => s.tipo))];
    console.log('[useOtb] Tipos disponíveis (primeiros 10):', tiposUnicos.slice(0, 10));

    // Se filtro é TODOS, retorna todos os itens sem filtragem
    const filtrados = filters.tipoFiltro === 'TODOS' 
      ? dadosBrutos 
      : dadosBrutos.filter(sku => {
          const tipoNorm = (sku.tipo || '').toUpperCase().trim();
          
          // Lógica baseada nos tipos reais do ERP:
          // AR = Armações, LG = Lentes de Grau, GC = Grau de Contato, etc.
          switch (filters.tipoFiltro) {
            case 'ARMACOES':
              // AR no início ou contém ARMAC/ARMAÇÃO
              return tipoNorm.startsWith('AR ') || tipoNorm === 'AR' || 
                     tipoNorm.includes('ARMAC') || tipoNorm.includes('ARMAÇÃO');
            case 'LENTES':
              // LG (lentes de grau) ou GC (grau de contato) ou contém LENT
              return tipoNorm.startsWith('LG ') || tipoNorm.startsWith('GC ') || 
                     tipoNorm === 'LG' || tipoNorm === 'GC' ||
                     tipoNorm.includes('LENT');
            case 'ACESSORIOS':
              // AC ou contém ACESS
              return tipoNorm.startsWith('AC ') || tipoNorm === 'AC' || 
                     tipoNorm.includes('ACESS') || tipoNorm.includes('ACC');
            case 'OUTROS':
              // Tudo que não é armação, lente ou acessório
              const isArmacao = tipoNorm.startsWith('AR ') || tipoNorm === 'AR' || tipoNorm.includes('ARMAC');
              const isLente = tipoNorm.startsWith('LG ') || tipoNorm.startsWith('GC ') || tipoNorm === 'LG' || tipoNorm === 'GC' || tipoNorm.includes('LENT');
              const isAcessorio = tipoNorm.startsWith('AC ') || tipoNorm === 'AC' || tipoNorm.includes('ACESS');
              return !isArmacao && !isLente && !isAcessorio;
            default:
              return true;
          }
        });

    console.log('[useOtb] Após filtro:', filtrados.length, 'SKUs');

    return filtrados.map(sku => {
      // Cálculo da venda diária média
      const vendaDiaria = diasPeriodo > 0 ? sku.qtdProdutos / diasPeriodo : 0;
      
      // Projeção de vendas para o período de cobertura
      const vendasProjetadas = vendaDiaria * filters.coberturaDias;
      
      // OTB = Vendas Projetadas - Estoque Atual
      const otb = Math.max(0, Math.ceil(vendasProjetadas - sku.estoqueAtual));
      
      // Valor do OTB em reais
      const otbValor = otb * sku.precoCusto;
      
      // Classificação baseada na situação
      let classificacao: OtbItem['classificacao'];
      const diasEstoque = vendaDiaria > 0 ? sku.estoqueAtual / vendaDiaria : 999;
      
      if (diasEstoque < 15 && sku.qtdProdutos > 0) {
        classificacao = 'COMPRAR_URGENTE';
      } else if (otb > 0) {
        classificacao = 'COMPRAR';
      } else if (diasEstoque > filters.coberturaDias * 2) {
        classificacao = 'EXCESSO';
      } else {
        classificacao = 'ESTOQUE_OK';
      }

      return {
        codSku: sku.codSku,
        descricaoItem: sku.descricaoItem,
        marca: sku.marca,
        fornecedor: sku.fornecedor,
        tipo: sku.tipo,
        estoqueAtual: sku.estoqueAtual,
        qtdVendidos: sku.qtdProdutos,
        totalVendido: sku.totalVendido,
        diasDesdeUltimaVenda: sku.diasDesdeUltimaVenda,
        precoCusto: sku.precoCusto,
        precoVendaFinal: sku.precoVendaFinal,
        margemBruta: sku.margemBruta,
        vendaDiaria,
        vendasProjetadas,
        otb,
        otbValor,
        classificacao,
        giroEstoque: sku.giroEstoque,
      };
    });
  }, [dadosBrutos, diasPeriodo, filters.coberturaDias, filters.tipoFiltro]);

  /**
   * Agrupa itens por fornecedor ou marca
   */
  const itensAgrupados = useMemo((): OtbAgrupado[] => {
    if (!itensOtb || itensOtb.length === 0) return [];

    const agrupado = new Map<string, OtbAgrupado>();

    itensOtb.forEach(item => {
      const chave = agrupamento === 'fornecedor' 
        ? item.fornecedor 
        : `${item.fornecedor}|${item.marca}`;
      
      const existente = agrupado.get(chave);
      
      if (existente) {
        existente.qtdSkus++;
        existente.estoqueTotal += item.estoqueAtual;
        existente.qtdVendidos += item.qtdVendidos;
        existente.totalVendido += item.totalVendido;
        existente.otbTotal += item.otb;
        existente.otbValorTotal += item.otbValor;
        if (item.classificacao === 'COMPRAR_URGENTE') existente.skusComprarUrgente++;
        if (item.classificacao === 'COMPRAR') existente.skusComprar++;
        if (item.classificacao === 'ESTOQUE_OK') existente.skusEstoqueOk++;
        if (item.classificacao === 'EXCESSO') existente.skusExcesso++;
        // Média ponderada da margem
        existente.margemMedia = (existente.margemMedia * (existente.qtdSkus - 1) + item.margemBruta) / existente.qtdSkus;
      } else {
        agrupado.set(chave, {
          chave,
          fornecedor: item.fornecedor,
          marca: agrupamento === 'marca' ? item.marca : undefined,
          tipo: item.tipo,
          qtdSkus: 1,
          estoqueTotal: item.estoqueAtual,
          qtdVendidos: item.qtdVendidos,
          totalVendido: item.totalVendido,
          otbTotal: item.otb,
          otbValorTotal: item.otbValor,
          skusComprarUrgente: item.classificacao === 'COMPRAR_URGENTE' ? 1 : 0,
          skusComprar: item.classificacao === 'COMPRAR' ? 1 : 0,
          skusEstoqueOk: item.classificacao === 'ESTOQUE_OK' ? 1 : 0,
          skusExcesso: item.classificacao === 'EXCESSO' ? 1 : 0,
          margemMedia: item.margemBruta,
        });
      }
    });

    return Array.from(agrupado.values())
      .sort((a, b) => b.otbValorTotal - a.otbValorTotal);
  }, [itensOtb, agrupamento]);

  /**
   * Métricas consolidadas
   */
  const metrics = useMemo((): OtbMetrics => {
    const base: OtbMetrics = {
      totalSkus: 0,
      totalEstoque: 0,
      totalVendido: 0,
      totalOtb: 0,
      totalOtbValor: 0,
      skusComprarUrgente: 0,
      skusComprar: 0,
      skusEstoqueOk: 0,
      skusExcesso: 0,
      diasPeriodo,
    };

    if (!itensOtb || itensOtb.length === 0) return base;

    return itensOtb.reduce((acc, item) => ({
      totalSkus: acc.totalSkus + 1,
      totalEstoque: acc.totalEstoque + item.estoqueAtual,
      totalVendido: acc.totalVendido + item.totalVendido,
      totalOtb: acc.totalOtb + item.otb,
      totalOtbValor: acc.totalOtbValor + item.otbValor,
      skusComprarUrgente: acc.skusComprarUrgente + (item.classificacao === 'COMPRAR_URGENTE' ? 1 : 0),
      skusComprar: acc.skusComprar + (item.classificacao === 'COMPRAR' ? 1 : 0),
      skusEstoqueOk: acc.skusEstoqueOk + (item.classificacao === 'ESTOQUE_OK' ? 1 : 0),
      skusExcesso: acc.skusExcesso + (item.classificacao === 'EXCESSO' ? 1 : 0),
      diasPeriodo,
    }), base);
  }, [itensOtb, diasPeriodo]);

  /**
   * Carrega dados do endpoint
   */
  const carregarDados = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    // Resetar filtro de tipo para TODOS ao carregar novos dados
    setFilters(prev => ({ ...prev, tipoFiltro: 'TODOS' }));
    
    try {
      console.log('[useOtb] Carregando dados de SKU...');
      
      const dados = await getAnaliseSku({
        empresa: filters.empresa,
        dataInicio: filters.dataInicio,
        dataFim: filters.dataFim,
      });
      
      console.log('[useOtb] Dados carregados:', dados.length, 'SKUs');
      setDadosBrutos(dados);
      
      toast({
        title: "Módulo OTB Pronto",
        description: `${dados.length} SKUs analisados - mostrando todos`,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao carregar dados';
      console.error('[useOtb] Erro:', message);
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
    agrupamento,
    setAgrupamento,
    
    // Estado
    loading,
    error,
    
    // Dados
    itensOtb,
    itensAgrupados,
    metrics,
    diasPeriodo,
    contagemPorCategoria,
    totalSkusBrutos: dadosBrutos.length,
    
    // Ações
    carregarDados,
  };
}
