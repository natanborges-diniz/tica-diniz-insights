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
import { getEstoqueCompleto, EstoqueCompleto } from "@/services/estoqueCompletoService";
import { categorizarProduto, subcategorizarProduto, type SubcategoriaProduto } from "@/utils/categorizarProduto";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useEstoqueStore, type EstoqueFilters } from "@/stores/useEstoqueStore";

// Re-export para compatibilidade com imports existentes
export type { EstoqueFilters };

export interface ItemEstoque {
  codSku: number;
  codigoBarra: string;
  descricao: string;
  marca: string;
  fornecedor: string;
  tipo: string;
  categoria: 'ARMACOES' | 'LENTES' | 'ACESSORIOS' | 'OUTROS';
  subcategoria: SubcategoriaProduto;
  
  estoqueAtual: number;
  estoqueMinimo: number;
  valorEstoqueCusto: number;
  
  qtdVendidos: number;
  totalVendido: number;
  diasEmEstoque: number;
  vendaDiaria: number;
  
  precoCusto: number;
  precoVenda: number;
  margemBruta: number;
  
  otb: number;
  otbValor: number;
  curvaABC: 'A' | 'B' | 'C';
  classificacao: 'COMPRAR_URGENTE' | 'COMPRAR' | 'ESTOQUE_OK' | 'EXCESSO';
  acaoSugerida: string;
  giroEstoque: number;
  
  isDeadStock: boolean;
}

// Decisão por marca para Plano de Compra
export type DecisaoMarca = 'REPOR_REFERENCIA' | 'RENOVAR_COLECAO' | 'AVALIAR_DESCONTINUACAO';

// Faixa de estoque doente
export type FaixaDoente = 'PROMOCAO_20' | 'LIQUIDACAO_30' | 'LIQUIDACAO_50' | 'DESCARTE' | 'REVISAO_URGENTE';

// SKU específico a repor
export interface SkuARepor {
  codSku: number;
  codigoBarra: string;
  descricao: string;
  qtdVendidos: number;
  estoqueAtual: number;
  qtdAComprar: number;
  curvaABC: 'A' | 'B' | 'C';
  marca: string;
  fornecedor: string;
  subcategoria: SubcategoriaProduto;
  vendaDiaria: number;
  coberturaDias: number;
  precoCusto: number;
  valorCompra: number;
  prioridade: 'URGENTE' | 'ALTA' | 'MEDIA' | 'BAIXA';
}

// Item doente de uma marca
export interface ItemDoenteMarca {
  codSku: number;
  descricao: string;
  estoqueAtual: number;
  valorCusto: number;
  diasEmEstoque: number;
  faixa: FaixaDoente;
  desconto: string;
}

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
  // Bloco 1 — Repor referências (SKUs específicos curva A/B com giro rápido)
  skusARepor: SkuARepor[];
  // Bloco 2 — Novos modelos (qtd de peças de coleção nova)
  pecasARenovar: number;
  // Bloco 3 — Estoque doente desta marca
  itensDoentes: ItemDoenteMarca[];
  totalDoenteValor: number;
  totalDoentePecas: number;
  // Todos os SKUs da marca (para export/detalhe)
  skus: ItemEstoque[];
}

// Mix ideal por subcategoria
export interface MixComparativo {
  chave: string;
  percentualIdeal: number;
  percentualAtual: number;
  gap: number;
}

// Estoque doente global (mantido para compatibilidade)
export interface GrupoEstoqueDoente {
  faixa: FaixaDoente;
  label: string;
  desconto: string;
  cor: string;
  pecas: number;
  valorCusto: number;
  marcas: string[];
  itens: ItemEstoque[];
}

export interface MetricasEstoque {
  totalPecas: number;
  totalSkusComEstoque: number;
  valorTotalCusto: number;
  deadStockPecas: number;
  deadStockValor: number;
  deadStockPercentual: number;
  totalSkus: number;
  fornecedoresDistintos: number;
  marcasDistintas: number;
  pecasLiquidar: number;
  pecasManter: number;
  pecasComprar: number;
  totalVendido: number;
  totalVendido6mPecas: number;
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

// Período fixo: 180 dias
const DIAS_PERIODO = 180;

// ============================================
// HOOK PRINCIPAL
// ============================================

export function useEstoqueUnificado() {
  const { empresas, isLoading: loadingEmpresas } = useUserEmpresas();
  const { defaultEmpresa } = useDefaultEmpresa();
  
  // Período fixo: últimos 180 dias (não exposto para o usuário)
  const hoje = new Date();
  const dataFim = hoje.toISOString().split('T')[0];
  const dataInicio = new Date(hoje.getTime() - DIAS_PERIODO * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  
  // Estado compartilhado entre páginas via Zustand store
  const filters = useEstoqueStore((s) => s.filters);
  const setFilters = useEstoqueStore((s) => s.setFilters);
  const loading = useEstoqueStore((s) => s.loading);
  const setLoading = useEstoqueStore((s) => s.setLoading);
  const error = useEstoqueStore((s) => s.error);
  const setError = useEstoqueStore((s) => s.setError);
  const dadosEstoqueCompleto = useEstoqueStore((s) => s.dadosEstoqueCompleto);
  const dadosVendasSku = useEstoqueStore((s) => s.dadosVendasSku);
  const setDados = useEstoqueStore((s) => s.setDados);
  const carregadoEm = useEstoqueStore((s) => s.carregadoEm);
  const empresaCarregada = useEstoqueStore((s) => s.empresaCarregada);

  useEffect(() => {
    if (defaultEmpresa && !filters.empresa) {
      setFilters((prev) => ({ ...prev, empresa: defaultEmpresa }));
    }
  }, [defaultEmpresa, filters.empresa, setFilters]);

  // Estado local apenas para mapeamentos (são globais e não dependem de empresa)
  const [mapeamentoFornecedor, setMapeamentoFornecedor] = useState<Map<string, string>>(new Map());
  const [configMinimos, setConfigMinimos] = useState<EstoqueMinimoConfig[]>([]);

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
        }
      } catch (err) {
        console.error('[useEstoqueUnificado] Erro ao carregar mapeamentos:', err);
      }
    };
    carregarMapeamentos();
  }, []);

  useEffect(() => {
    const carregarMinimos = async () => {
      try {
        const { data, error } = await supabase
          .from('estoque_minimo_loja')
          .select('cod_empresa, categoria, curva_abc, quantidade_minima');
        if (error) throw error;
        if (data) setConfigMinimos(data);
      } catch (err) {
        console.error('[useEstoqueUnificado] Erro ao carregar mínimos:', err);
      }
    };
    carregarMinimos();
  }, []);

  // Mescla dados de ambos endpoints por cod_sku
  const itensProcessados = useMemo((): ItemEstoque[] => {
    if (!dadosEstoqueCompleto || dadosEstoqueCompleto.length === 0) return [];

    const vendasMap = new Map<number, AnaliseSku>();
    dadosVendasSku.forEach(sku => vendasMap.set(sku.codSku, sku));
    
    // Curva ABC
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

    return dadosEstoqueCompleto.map(estoqueItem => {
      const vendas = vendasMap.get(estoqueItem.codSku);
      const categoria = categorizarProduto(estoqueItem.tipo);
      const subcategoria = subcategorizarProduto(estoqueItem.tipo);
      const curvaABC = curvaMap.get(estoqueItem.codSku) || 'C';
      
      const qtdVendidos = vendas?.qtdProdutos ?? 0;
      const totalVendido = vendas?.totalVendido ?? 0;
      const vendaDiaria = DIAS_PERIODO > 0 ? qtdVendidos / DIAS_PERIODO : 0;
      const giroEstoque = vendas?.giroEstoque ?? 0;
      const margemBruta = vendas?.margemBruta ?? 0;
      
      let estoqueMinimo = 0;
      if (filters.empresa !== null && filters.empresa !== 'ALL') {
        const codEmpresa = typeof filters.empresa === 'number' ? filters.empresa : parseInt(String(filters.empresa));
        const configEspecifica = configMinimos.find(c => c.cod_empresa === codEmpresa && c.categoria === categoria && c.curva_abc === curvaABC);
        const configGenerica = configMinimos.find(c => c.cod_empresa === codEmpresa && c.categoria === 'TODOS' && c.curva_abc === curvaABC);
        estoqueMinimo = configEspecifica?.quantidade_minima || configGenerica?.quantidade_minima || 0;
      }
      
      const otb = Math.max(0, Math.ceil(estoqueMinimo - estoqueItem.quantidadeEstoque));
      const otbValor = otb * estoqueItem.precoCusto;
      
      let classificacao: ItemEstoque['classificacao'];
      if (estoqueMinimo > 0) {
        const percentualDoMinimo = (estoqueItem.quantidadeEstoque / estoqueMinimo) * 100;
        if (percentualDoMinimo < 30) classificacao = 'COMPRAR_URGENTE';
        else if (percentualDoMinimo < 100) classificacao = 'COMPRAR';
        else if (percentualDoMinimo > 200) classificacao = 'EXCESSO';
        else classificacao = 'ESTOQUE_OK';
      } else {
        if (qtdVendidos > 0 && estoqueItem.quantidadeEstoque === 0) classificacao = 'COMPRAR_URGENTE';
        else if (estoqueItem.isDeadStock) classificacao = 'EXCESSO';
        else classificacao = 'ESTOQUE_OK';
      }
      
      let fornecedorFinal = estoqueItem.fornecedor;
      if (!fornecedorFinal || fornecedorFinal === 'SEM FORNECEDOR' || fornecedorFinal === 'N/D') {
        const marcaUpper = (estoqueItem.marca || '').toUpperCase();
        const fornecedorMapeado = mapeamentoFornecedor.get(marcaUpper);
        if (fornecedorMapeado) fornecedorFinal = fornecedorMapeado;
      }

      return {
        codSku: estoqueItem.codSku,
        codigoBarra: estoqueItem.codigoBarra,
        descricao: estoqueItem.descricao,
        marca: estoqueItem.marca,
        fornecedor: fornecedorFinal,
        tipo: estoqueItem.tipo,
        categoria,
        subcategoria,
        estoqueAtual: estoqueItem.quantidadeEstoque,
        estoqueMinimo,
        valorEstoqueCusto: estoqueItem.valorEstoqueCusto,
        qtdVendidos,
        totalVendido,
        diasEmEstoque: estoqueItem.diasEmEstoque,
        vendaDiaria,
        precoCusto: estoqueItem.precoCusto,
        precoVenda: estoqueItem.precoVenda,
        margemBruta,
        otb,
        otbValor,
        curvaABC,
        classificacao,
        acaoSugerida: estoqueItem.acaoSugerida,
        giroEstoque,
        isDeadStock: estoqueItem.isDeadStock,
      };
    });
  }, [dadosEstoqueCompleto, dadosVendasSku, filters.empresa, mapeamentoFornecedor, configMinimos]);

  // Contagem por categoria
  const contagemPorCategoria = useMemo(() => {
    if (!itensProcessados.length) return { armacoes: 0, lentes: 0, acessorios: 0, outros: 0 };
    let armacoes = 0, lentes = 0, acessorios = 0, outros = 0;
    itensProcessados.forEach(item => {
      if (item.categoria === 'ARMACOES') armacoes++;
      else if (item.categoria === 'LENTES') lentes++;
      else if (item.categoria === 'ACESSORIOS') acessorios++;
      else outros++;
    });
    return { armacoes, lentes, acessorios, outros };
  }, [itensProcessados]);

  // Itens filtrados
  const itensFiltrados = useMemo(() => {
    let resultado = itensProcessados;
    if (filters.categoria !== 'TODOS') resultado = resultado.filter(item => item.categoria === filters.categoria);
    if (filters.subcategoria && filters.subcategoria !== 'TODAS') {
      resultado = resultado.filter(item => item.subcategoria === filters.subcategoria);
    }
    if (filters.curvaABC) resultado = resultado.filter(item => item.curvaABC === filters.curvaABC);
    if (filters.fornecedor !== 'TODOS') resultado = resultado.filter(item => item.fornecedor === filters.fornecedor);
    if (filters.marca !== 'TODAS') resultado = resultado.filter(item => item.marca === filters.marca);
    if (filters.acao !== 'TODAS') resultado = resultado.filter(item => item.acaoSugerida === filters.acao);
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

  const itensComEstoque = useMemo(() => itensFiltrados.filter(item => item.estoqueAtual > 0), [itensFiltrados]);

  // Métricas consolidadas
  const metricas = useMemo((): MetricasEstoque => {
    const comEstoque = itensFiltrados.filter(item => item.estoqueAtual > 0);
    const totalPecas = comEstoque.reduce((acc, i) => acc + i.estoqueAtual, 0);
    const totalSkusComEstoque = comEstoque.length;
    const valorTotalCusto = comEstoque.reduce((acc, i) => acc + i.valorEstoqueCusto, 0);
    
    const deadStock = comEstoque.filter(i => i.isDeadStock);
    const deadStockPecas = deadStock.reduce((acc, i) => acc + i.estoqueAtual, 0);
    const deadStockValor = deadStock.reduce((acc, i) => acc + i.valorEstoqueCusto, 0);
    const deadStockPercentual = totalPecas > 0 ? (deadStockPecas / totalPecas) * 100 : 0;
    
    const totalSkus = itensFiltrados.length;
    const fornecedoresDistintos = new Set(comEstoque.map(i => i.fornecedor)).size;
    const marcasDistintas = new Set(comEstoque.map(i => i.marca)).size;
    
    const pecasLiquidar = comEstoque.filter(i => i.acaoSugerida.toUpperCase().includes('LIQUIDA')).reduce((acc, i) => acc + i.estoqueAtual, 0);
    const pecasManter = comEstoque.filter(i => i.acaoSugerida.includes('MANTER')).reduce((acc, i) => acc + i.estoqueAtual, 0);
    const pecasComprar = comEstoque.filter(i => i.acaoSugerida.includes('COMPRAR')).reduce((acc, i) => acc + i.estoqueAtual, 0);
    
    const totalVendido = itensFiltrados.reduce((acc, i) => acc + i.totalVendido, 0);
    const totalVendido6mPecas = itensFiltrados.reduce((acc, i) => acc + i.qtdVendidos, 0);
    const totalOtb = itensFiltrados.reduce((acc, i) => acc + i.otb, 0);
    const totalOtbValor = itensFiltrados.reduce((acc, i) => acc + i.otbValor, 0);
    const skusComprarUrgente = itensFiltrados.filter(i => i.classificacao === 'COMPRAR_URGENTE').length;
    const skusComprar = itensFiltrados.filter(i => i.classificacao === 'COMPRAR').length;
    const skusEstoqueOk = itensFiltrados.filter(i => i.classificacao === 'ESTOQUE_OK').length;
    const skusExcesso = itensFiltrados.filter(i => i.classificacao === 'EXCESSO').length;
    
    return {
      totalPecas, totalSkusComEstoque, valorTotalCusto,
      deadStockPecas, deadStockValor, deadStockPercentual,
      totalSkus, fornecedoresDistintos, marcasDistintas,
      pecasLiquidar, pecasManter, pecasComprar,
      totalVendido, totalVendido6mPecas, totalOtb, totalOtbValor,
      skusComprarUrgente, skusComprar, skusEstoqueOk, skusExcesso,
      diasPeriodo: DIAS_PERIODO,
    };
  }, [itensFiltrados]);

  // Listas para filtros
  const listaFornecedores = useMemo(() => {
    const set = new Set(itensProcessados.map(i => i.fornecedor).filter(Boolean));
    return ['TODOS', ...Array.from(set).sort()];
  }, [itensProcessados]);

  const listaMarcas = useMemo(() => {
    const set = new Set(itensProcessados.map(i => i.marca).filter(Boolean));
    return ['TODAS', ...Array.from(set).sort()];
  }, [itensProcessados]);

  const listaAcoes = useMemo(() => {
    const set = new Set(itensProcessados.map(i => i.acaoSugerida).filter(Boolean));
    return ['TODAS', ...Array.from(set).sort()];
  }, [itensProcessados]);

  // ============================================
  // MIX IDEAL POR SUBCATEGORIA (AR RX / Solar / Lentes / Acessórios)
  // ============================================
  const mixIdealCategoria = useMemo((): MixComparativo[] => {
    const comEstoque = itensProcessados.filter(i => i.estoqueAtual > 0);
    const totalEstoque = comEstoque.reduce((acc, i) => acc + i.estoqueAtual, 0);
    const totalVendas = itensProcessados.reduce((acc, i) => acc + i.qtdVendidos, 0);
    if (totalEstoque === 0 && totalVendas === 0) return [];

    const subcats: SubcategoriaProduto[] = ['AR_RX', 'AR_SOLAR', 'LENTES', 'ACESSORIOS', 'OUTROS'];
    const labels: Record<SubcategoriaProduto, string> = {
      AR_RX: 'Armações RX',
      AR_SOLAR: 'Solar / OC',
      LENTES: 'Lentes',
      ACESSORIOS: 'Acessórios',
      OUTROS: 'Outros',
    };

    return subcats.map(sub => {
      const vendasSub = itensProcessados.filter(i => i.subcategoria === sub).reduce((acc, i) => acc + i.qtdVendidos, 0);
      const estoqueSub = comEstoque.filter(i => i.subcategoria === sub).reduce((acc, i) => acc + i.estoqueAtual, 0);
      const percentualIdeal = totalVendas > 0 ? (vendasSub / totalVendas) * 100 : 0;
      const percentualAtual = totalEstoque > 0 ? (estoqueSub / totalEstoque) * 100 : 0;
      return { chave: labels[sub], percentualIdeal, percentualAtual, gap: percentualIdeal - percentualAtual };
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
      return { chave: marca, percentualIdeal, percentualAtual, gap: percentualIdeal - percentualAtual };
    })
    .filter(m => m.percentualIdeal > 0 || m.percentualAtual > 0)
    .sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap));
  }, [itensProcessados]);

  // ============================================
  // RESUMO POR MARCA — com blocos acionáveis
  // ============================================

  const classificarFaixaDoente = (dias: number): { faixa: FaixaDoente; desconto: string } => {
    if (dias >= 720) return { faixa: 'DESCARTE', desconto: '100%' };
    if (dias >= 360) return { faixa: 'LIQUIDACAO_50', desconto: '50%' };
    if (dias >= 270) return { faixa: 'LIQUIDACAO_30', desconto: '30%' };
    return { faixa: 'PROMOCAO_20', desconto: '20%' };
  };

  const resumoPorMarca = useMemo((): ResumoMarca[] => {
    if (itensFiltrados.length === 0) return [];

    const porMarca = new Map<string, ItemEstoque[]>();
    itensFiltrados.forEach(item => {
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

      // Bloco 1 — SKUs a repor (Curva A/B com giro rápido, venderam nos últimos 6m)
      const skusARepor: SkuARepor[] = skus
        .filter(s => s.qtdVendidos > 0 && (s.curvaABC === 'A' || s.curvaABC === 'B') && s.diasEmEstoque < 90)
        .map(s => {
          // Qtd a comprar: projeção de vendas para ~90 dias menos estoque atual
          const projecao90d = Math.ceil(s.vendaDiaria * 90);
          const qtdAComprar = Math.max(0, projecao90d - s.estoqueAtual);
          const coberturaDias = s.vendaDiaria > 0 ? Math.round(s.estoqueAtual / s.vendaDiaria) : 999;
          const valorCompra = qtdAComprar * s.precoCusto;
          let prioridade: SkuARepor['prioridade'];
          if (coberturaDias < 15) prioridade = 'URGENTE';
          else if (coberturaDias < 30) prioridade = 'ALTA';
          else if (coberturaDias < 60) prioridade = 'MEDIA';
          else prioridade = 'BAIXA';
          return {
            codSku: s.codSku,
            codigoBarra: s.codigoBarra,
            descricao: s.descricao,
            qtdVendidos: s.qtdVendidos,
            estoqueAtual: s.estoqueAtual,
            qtdAComprar,
            curvaABC: s.curvaABC,
            marca: s.marca,
            fornecedor: s.fornecedor,
            subcategoria: s.subcategoria,
            vendaDiaria: s.vendaDiaria,
            coberturaDias,
            precoCusto: s.precoCusto,
            valorCompra,
            prioridade,
          };
        })
        .filter(s => s.qtdAComprar > 0)
        .sort((a, b) => b.qtdVendidos - a.qtdVendidos);

      // Bloco 2 — Peças a renovar (gap de compra menos SKUs a repor)
      const totalReporPecas = skusARepor.reduce((acc, s) => acc + s.qtdAComprar, 0);
      const gapTotal = Math.max(0, qtdVendidos6m - pecasEstoque);
      const pecasARenovar = Math.max(0, gapTotal - totalReporPecas);

      // Bloco 3 — Estoque doente desta marca
      const itensDoentes: ItemDoenteMarca[] = comEstoque
        .filter(s => s.diasEmEstoque >= 180)
        .map(s => {
          const { faixa, desconto } = classificarFaixaDoente(s.diasEmEstoque);
          return {
            codSku: s.codSku,
            descricao: s.descricao,
            estoqueAtual: s.estoqueAtual,
            valorCusto: s.valorEstoqueCusto,
            diasEmEstoque: s.diasEmEstoque,
            faixa,
            desconto,
          };
        })
        .sort((a, b) => b.diasEmEstoque - a.diasEmEstoque);
      
      const totalDoentePecas = itensDoentes.reduce((acc, i) => acc + i.estoqueAtual, 0);
      const totalDoenteValor = itensDoentes.reduce((acc, i) => acc + i.valorCusto, 0);

      const categoria = skus[0]?.categoria || 'OUTROS';

      return {
        marca, categoria, pecasEstoque, valorEstoque,
        qtdVendidos6m, totalVendido6m, otbTotal,
        mediaDiasEmEstoque, temCurvaA, decisao,
        skusARepor, pecasARenovar,
        itensDoentes, totalDoenteValor, totalDoentePecas,
        skus,
      };
    }).sort((a, b) => {
      const ordem: Record<DecisaoMarca, number> = { REPOR_REFERENCIA: 0, RENOVAR_COLECAO: 1, AVALIAR_DESCONTINUACAO: 2 };
      return ordem[a.decisao] - ordem[b.decisao] || b.totalVendido6m - a.totalVendido6m;
    });
  }, [itensFiltrados]);

  // Lista achatada de SKUs a comprar — ordenada por prioridade
  const listaCompraFlat = useMemo((): SkuARepor[] => {
    const ordemPrio: Record<SkuARepor['prioridade'], number> = { URGENTE: 0, ALTA: 1, MEDIA: 2, BAIXA: 3 };
    const flat: SkuARepor[] = [];
    resumoPorMarca.forEach(m => {
      if (filters.decisaoMarca && filters.decisaoMarca !== 'TODAS' && m.decisao !== filters.decisaoMarca) return;
      flat.push(...m.skusARepor);
    });
    return flat.sort((a, b) => {
      const pa = ordemPrio[a.prioridade] - ordemPrio[b.prioridade];
      if (pa !== 0) return pa;
      return b.qtdVendidos - a.qtdVendidos;
    });
  }, [resumoPorMarca, filters.decisaoMarca]);

  // Estoque doente global (mantido para compatibilidade com Visão Estoque)
  const estoqueDoenteAgrupado = useMemo((): GrupoEstoqueDoente[] => {
    const comEstoque = itensProcessados.filter(i => i.estoqueAtual > 0 && i.diasEmEstoque >= 180);
    if (comEstoque.length === 0) return [];

    const faixasConfig: Record<FaixaDoente, { label: string; desconto: string; cor: string }> = {
      PROMOCAO_20: { label: 'Promoção 20%', desconto: '20%', cor: 'text-yellow-600' },
      LIQUIDACAO_30: { label: 'Liquidação 30%', desconto: '30%', cor: 'text-orange-600' },
      LIQUIDACAO_50: { label: 'Liquidação 50%', desconto: '50%', cor: 'text-destructive' },
      DESCARTE: { label: 'Descarte / Doação', desconto: '100%', cor: 'text-destructive' },
      REVISAO_URGENTE: { label: 'Revisão Urgente', desconto: '-', cor: 'text-destructive' },
    };

    const grupos = new Map<FaixaDoente, ItemEstoque[]>();
    comEstoque.forEach(item => {
      const { faixa } = classificarFaixaDoente(item.diasEmEstoque);
      if (!grupos.has(faixa)) grupos.set(faixa, []);
      grupos.get(faixa)!.push(item);
    });

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
          faixa, label: config.label, desconto: config.desconto, cor: config.cor,
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

  // Carregar dados
  const carregarDados = useCallback(async () => {
    if (filters.empresa === null) {
      toast({ title: "Selecione uma empresa", description: "Escolha uma empresa para carregar os dados de estoque", variant: "destructive" });
      return;
    }
    
    setLoading(true);
    setError(null);
    
    try {
      const [estoqueCompleto, vendasSku] = await Promise.all([
        getEstoqueCompleto({ empresa: filters.empresa }),
        getAnaliseSku({ empresa: filters.empresa, dataInicio, dataFim }),
      ]);
      
      const totalPecasEstoque = estoqueCompleto.reduce((acc, d) => acc + d.quantidadeEstoque, 0);
      const pecasDeadStock = estoqueCompleto.filter(d => d.isDeadStock).reduce((acc, d) => acc + d.quantidadeEstoque, 0);
      
      setDados(estoqueCompleto, vendasSku);
      
      toast({
        title: "Dados Carregados",
        description: `${estoqueCompleto.length} SKUs • ${totalPecasEstoque.toLocaleString('pt-BR')} peças em estoque • ${pecasDeadStock.toLocaleString('pt-BR')} paradas`,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao carregar dados';
      setError(message);
      toast({ title: "Erro ao carregar", description: message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [filters.empresa, dataInicio, dataFim, setLoading, setError, setDados]);

  const dadosBrutos = dadosVendasSku;

  return {
    empresas, loadingEmpresas,
    filters, setFilters,
    loading, error,
    dadosBrutos, dadosEstoqueCompleto, dadosVendasSku,
    itensProcessados, itensFiltrados, itensComEstoque,
    metricas, contagemPorCategoria, diasPeriodo: DIAS_PERIODO,
    listaFornecedores, listaMarcas, listaAcoes, marcasSemFornecedor,
    mixIdealCategoria, mixIdealMarca,
    resumoPorMarca, estoqueDoenteAgrupado,
    carregarDados,
    carregadoEm, empresaCarregada,
  };
}
