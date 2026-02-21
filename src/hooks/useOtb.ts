// src/hooks/useOtb.ts
// Hook para módulo OTB (Open to Buy) - cálculo de necessidades de compra

import { useState, useCallback, useMemo, useEffect } from "react";
import { useUserEmpresas } from "./useUserEmpresas";
import { EmpresaParam } from "@/services/firebirdBridge";
import { getAnaliseSku, AnaliseSku } from "@/services/vendasService";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { categorizarProduto } from "@/utils/categorizarProduto";
// ============================================
// INTERFACES
// ============================================

export interface OtbFilters {
  empresa: EmpresaParam;
  dataInicio: string;
  dataFim: string;
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
  
  // Estoque mínimo configurado (se houver)
  estoqueMinimo: number;
  
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
  otb: number; // Open to Buy = Mínimo por Loja - Estoque Atual
  otbValor: number; // OTB em valor (OTB * preço custo)
  
  // Curva ABC - classificação por giro
  curvaABC: 'A' | 'B' | 'C';
  
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

interface EstoqueMinimoConfig {
  cod_empresa: number;
  categoria: string;
  curva_abc: string;
  quantidade_minima: number;
}

// ============================================
// HOOK
// ============================================

interface MapeamentoFornecedor {
  marca: string;
  fornecedor: string;
}

export function useOtb() {
  const { empresas, isLoading: loadingEmpresas } = useUserEmpresas();
  
  // Período padrão: últimos 180 dias (base para projeção)
  const hoje = new Date();
  const dataFim = hoje.toISOString().split('T')[0];
  const dataInicio = new Date(hoje.getTime() - 180 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  
  const [filters, setFilters] = useState<OtbFilters>({
    empresa: 'ALL',
    dataInicio,
    dataFim,
    tipoFiltro: 'TODOS', // Começa com TODOS para mostrar todos os dados
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dadosBrutos, setDadosBrutos] = useState<AnaliseSku[]>([]);
  const [agrupamento, setAgrupamento] = useState<'fornecedor' | 'marca'>('fornecedor');
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
          console.log('[useOtb] Mapeamentos carregados:', mapa.size);
        }
      } catch (err) {
        console.error('[useOtb] Erro ao carregar mapeamentos:', err);
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
          console.log('[useOtb] Mínimos por loja carregados:', data.length);
        }
      } catch (err) {
        console.error('[useOtb] Erro ao carregar mínimos:', err);
      }
    };
    
    carregarMinimos();
  }, []);

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
      const cat = categorizarProduto(sku.tipo);
      if (cat === 'ARMACOES') armacoes++;
      else if (cat === 'LENTES') lentes++;
      else if (cat === 'ACESSORIOS') acessorios++;
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
          const cat = categorizarProduto(sku.tipo);
          return cat === filters.tipoFiltro;
        });

    console.log('[useOtb] Após filtro:', filtrados.length, 'SKUs');

    // Primeiro passo: calcular totais para definir curva ABC
    const totalVendasGeral = filtrados.reduce((acc, sku) => acc + sku.totalVendido, 0);
    
    // Ordenar por vendas para calcular ABC
    const ordenadosPorVenda = [...filtrados].sort((a, b) => b.totalVendido - a.totalVendido);
    
    // Calcular percentuais acumulados para curva ABC
    let acumulado = 0;
    const skuComPercentual = ordenadosPorVenda.map(sku => {
      acumulado += sku.totalVendido;
      const percentualAcumulado = totalVendasGeral > 0 ? (acumulado / totalVendasGeral) * 100 : 0;
      
      // Curva A: 80% das vendas, B: 80-95%, C: 95-100%
      let curvaABC: 'A' | 'B' | 'C';
      if (percentualAcumulado <= 80) {
        curvaABC = 'A';
      } else if (percentualAcumulado <= 95) {
        curvaABC = 'B';
      } else {
        curvaABC = 'C';
      }
      
      return { ...sku, curvaABC, percentualAcumulado };
    });
    
    // Criar mapa para lookup rápido
    const curvaMap = new Map(skuComPercentual.map(s => [s.codSku, s.curvaABC]));

    return filtrados.map(sku => {
      // Cálculo da venda diária média
      const vendaDiaria = diasPeriodo > 0 ? sku.qtdProdutos / diasPeriodo : 0;
      
      // Cobertura atual = quantos dias o estoque atual dura
      const coberturaAtual = vendaDiaria > 0 ? sku.estoqueAtual / vendaDiaria : 999;
      
      // Curva ABC do SKU
      const curvaABC = curvaMap.get(sku.codSku) || 'C';
      
      // Buscar mínimo configurado para esta loja/categoria/curva
      const categoria = categorizarProduto(sku.tipo);
      
      // Encontrar configuração de mínimo (prioridade: categoria específica > TODOS)
      let estoqueMinimo = 0;
      if (filters.empresa !== 'ALL') {
        const codEmpresa = typeof filters.empresa === 'number' ? filters.empresa : parseInt(filters.empresa);
        
        // Buscar mínimo específico para categoria + curva
        const configEspecifica = configMinimos.find(c => 
          c.cod_empresa === codEmpresa && 
          c.categoria === categoria && 
          c.curva_abc === curvaABC
        );
        
        // Buscar mínimo genérico (TODOS + curva)
        const configGenerica = configMinimos.find(c => 
          c.cod_empresa === codEmpresa && 
          c.categoria === 'TODOS' && 
          c.curva_abc === curvaABC
        );
        
        estoqueMinimo = configEspecifica?.quantidade_minima || configGenerica?.quantidade_minima || 0;
      }
      
      // OTB SIMPLIFICADO: OTB = Mínimo por Loja - Estoque Atual
      // Se não há mínimo configurado, usa 0 (não precisa comprar)
      const otb = Math.max(0, Math.ceil(estoqueMinimo - sku.estoqueAtual));
      
      // Valor do OTB em reais
      const otbValor = otb * sku.precoCusto;
      
      // Classificação baseada no estoque vs mínimo configurado
      let classificacao: OtbItem['classificacao'];
      
      if (estoqueMinimo > 0) {
        // Se tem mínimo configurado, classifica baseado nele
        const percentualDoMinimo = estoqueMinimo > 0 ? (sku.estoqueAtual / estoqueMinimo) * 100 : 100;
        
        if (percentualDoMinimo < 30) {
          // Menos de 30% do mínimo = URGENTE
          classificacao = 'COMPRAR_URGENTE';
        } else if (percentualDoMinimo < 100) {
          // Abaixo do mínimo = COMPRAR
          classificacao = 'COMPRAR';
        } else if (percentualDoMinimo > 200) {
          // Mais de 2x o mínimo = EXCESSO
          classificacao = 'EXCESSO';
        } else {
          // Entre 100% e 200% do mínimo = OK
          classificacao = 'ESTOQUE_OK';
        }
      } else {
        // Sem mínimo configurado: baseia no giro/vendas
        if (sku.qtdProdutos > 0 && sku.estoqueAtual === 0) {
          classificacao = 'COMPRAR_URGENTE'; // Vende mas está zerado
        } else if (sku.estoqueAtual > 0 && sku.diasDesdeUltimaVenda > 180) {
          classificacao = 'EXCESSO'; // Parado há muito tempo
        } else {
          classificacao = 'ESTOQUE_OK';
        }
      }
      
      // Aplicar fallback de fornecedor usando mapeamento marca→fornecedor
      let fornecedorFinal = sku.fornecedor;
      if (!fornecedorFinal || fornecedorFinal === 'SEM FORNECEDOR' || fornecedorFinal === 'N/D') {
        const marcaUpper = (sku.marca || '').toUpperCase();
        const fornecedorMapeado = mapeamentoFornecedor.get(marcaUpper);
        if (fornecedorMapeado) {
          fornecedorFinal = fornecedorMapeado;
        }
      }

      return {
        codSku: sku.codSku,
        descricaoItem: sku.descricaoItem,
        marca: sku.marca,
        fornecedor: fornecedorFinal,
        tipo: sku.tipo,
        estoqueAtual: sku.estoqueAtual,
        estoqueMinimo,
        qtdVendidos: sku.qtdProdutos,
        totalVendido: sku.totalVendido,
        diasDesdeUltimaVenda: sku.diasDesdeUltimaVenda,
        precoCusto: sku.precoCusto,
        precoVendaFinal: sku.precoVendaFinal,
        margemBruta: sku.margemBruta,
        vendaDiaria,
        otb,
        otbValor,
        curvaABC,
        classificacao,
        giroEstoque: sku.giroEstoque,
      };
    });
  }, [dadosBrutos, diasPeriodo, filters.tipoFiltro, filters.empresa, mapeamentoFornecedor, configMinimos]);

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
   * IMPORTANTE: Para manter consistência com a aba Visão Estoque:
   * - totalEstoque e totalSkus consideram APENAS itens com estoqueAtual > 0
   * - totalOtb e classificações consideram TODOS os itens (incluindo zerados que precisam comprar)
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

    // Para estoque total e SKUs: filtra apenas itens com estoque > 0
    // Isso garante consistência com a aba Visão Estoque
    const itensComEstoque = itensOtb.filter(item => item.estoqueAtual > 0);
    
    const totalSkus = itensComEstoque.length;
    const totalEstoque = itensComEstoque.reduce((acc, i) => acc + i.estoqueAtual, 0);
    
    // Para OTB e classificações: usa TODOS os itens
    // Pois precisamos considerar itens zerados que precisam ser comprados
    const totalVendido = itensOtb.reduce((acc, i) => acc + i.totalVendido, 0);
    const totalOtb = itensOtb.reduce((acc, i) => acc + i.otb, 0);
    const totalOtbValor = itensOtb.reduce((acc, i) => acc + i.otbValor, 0);
    
    // Classificações também usam todos os itens
    const skusComprarUrgente = itensOtb.filter(i => i.classificacao === 'COMPRAR_URGENTE').length;
    const skusComprar = itensOtb.filter(i => i.classificacao === 'COMPRAR').length;
    const skusEstoqueOk = itensOtb.filter(i => i.classificacao === 'ESTOQUE_OK').length;
    const skusExcesso = itensOtb.filter(i => i.classificacao === 'EXCESSO').length;

    return {
      totalSkus,
      totalEstoque,
      totalVendido,
      totalOtb,
      totalOtbValor,
      skusComprarUrgente,
      skusComprar,
      skusEstoqueOk,
      skusExcesso,
      diasPeriodo,
    };
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

  /**
   * Identifica marcas sem fornecedor para sugestão de mapeamento
   */
  const marcasSemFornecedor = useMemo(() => {
    if (!itensOtb || itensOtb.length === 0) return [];
    
    const marcaContagem = new Map<string, number>();
    
    itensOtb.forEach(item => {
      if (!item.fornecedor || item.fornecedor === 'SEM FORNECEDOR' || item.fornecedor === 'N/D') {
        const marca = item.marca || 'SEM MARCA';
        marcaContagem.set(marca, (marcaContagem.get(marca) || 0) + 1);
      }
    });
    
    return Array.from(marcaContagem.entries())
      .map(([marca, qtdSkus]) => ({ marca, qtdSkus }))
      .sort((a, b) => b.qtdSkus - a.qtdSkus);
  }, [itensOtb]);

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
    marcasSemFornecedor,
    
    // Ações
    carregarDados,
  };
}
