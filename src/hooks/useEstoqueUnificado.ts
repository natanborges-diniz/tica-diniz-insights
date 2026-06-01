// src/hooks/useEstoqueUnificado.ts
// Hook UNIFICADO para gestão de estoque - fonte única de dados para todas as abas
// 
// ESTRATÉGIA DE DADOS:
// - /estoque/completo: Inventário físico TOTAL (estoque > 0) para "Visão Estoque"
// - /vendas/analise-sku: Métricas de giro/vendas para "Análise OTB"
// - Dados são MESCLADOS pelo cod_sku para ter visão completa

import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { useUserEmpresas } from "./useUserEmpresas";
import { EmpresaParam } from "@/services/firebirdBridge";
import { useDefaultEmpresa } from "./useDefaultEmpresa";
import { getAnaliseSku, AnaliseSku } from "@/services/vendasService";
import { getEstoqueCompleto, EstoqueCompleto } from "@/services/estoqueCompletoService";
import { categorizarProduto, subcategorizarProduto, type CategoriaProduto, type SubcategoriaProduto } from "@/utils/categorizarProduto";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { isAbortError } from "@/lib/isAbortError";
import { useEstoqueStore, type EstoqueFilters } from "@/stores/useEstoqueStore";
import { classificarPorIdade, toFaixaDoente, type FaixaDoente } from "@/lib/estoque/faixas-saneamento";
import { calcularCurvaABC } from "@/lib/estoque/curva-abc";
import { calcularMixIdealCategoria, calcularMixIdealMarcas, type DecisaoMarca as DecisaoMarcaType, type MixMarca as MixMarcaType, type MixComparativo as MixComparativoType, type MarcaConfigFlags } from "@/lib/estoque/mix-ideal";
import { calcularDecisaoSku, type DecisaoSku as DecisaoSkuType } from "@/lib/estoque/decisao-sku";
import { distribuirLacuna, type MotivoQtd as MotivoQtdType, type SkuParaPool } from "@/lib/estoque/lacuna";
import { calcularCapacidadePorCategoria, type CapacidadeConfig } from "@/lib/estoque/capacidade";
import { calcularParticipacaoMarca, type ParticipacaoMarca } from "@/lib/estoque/participacao-marca";
import { calcularMixIdealV2, type MixMarcaV2, type MarcaConfigV2 } from "@/lib/estoque/mix-ideal-v2";

// Re-export para compatibilidade com imports existentes
export type { EstoqueFilters };

export interface ItemEstoque {
  codSku: number;
  codigoBarra: string;
  descricao: string;
  marca: string;
  fornecedor: string;
  tipo: string;
  categoria: CategoriaProduto;
  subcategoria: SubcategoriaProduto;

  estoqueAtual: number;
  estoqueMinimo: number;
  valorEstoqueCusto: number;

  qtdVendidos: number;
  totalVendido: number;
  diasEmEstoque: number;
  diasDesdeUltimaVenda: number;
  vendaDiaria: number;
  coberturaDias: number;
  diasAlvo: number;

  // Giro real (Bridge af64a42)
  diasGiroMedio: number | null;
  diasGiroMediano: number | null;
  diasGiroUltimaPeca: number | null;
  pecasGiroConsideradas: number;

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
  decisaoSku: DecisaoSku;
}

// DecisaoMarca defined in @/lib/estoque/mix-ideal and re-exported here for consumers
export type DecisaoMarca = DecisaoMarcaType;

// DecisaoSku defined in @/lib/estoque/decisao-sku and re-exported here for consumers
export type DecisaoSku = DecisaoSkuType;

// FaixaDoente is defined in @/lib/estoque/faixas-saneamento and re-exported here for consumers
export type { FaixaDoente };

// MotivoQtd defined in @/lib/estoque/lacuna and re-exported here for consumers
export type MotivoQtd = MotivoQtdType;

// SKU específico a repor / trocar / observar
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
  diasEmEstoque: number;
  diasGiroMedio: number | null;
  diasGiroMediano: number | null;
  diasGiroUltimaPeca: number | null;
  pecasGiroConsideradas: number;
  precoCusto: number;
  valorCompra: number;
  prioridade: 'URGENTE' | 'ALTA' | 'MEDIA' | 'BAIXA';
  decisaoSku: DecisaoSku;
  motivoQtd?: MotivoQtd;
}

// MixMarca defined in @/lib/estoque/mix-ideal and re-exported here for consumers
export type MixMarca = MixMarcaType;

// Lacuna que sobrou após esgotar o pool de SKUs bons
export interface LacunaNaoPreenchivel {
  marca: string;
  faltam: number;
  poolSize: number;
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
  // Métricas da grade (Etapa 1)
  skusAtivos: number;
  skusComVenda: number;
  taxaPerformance: number; // 0..1
  pctCurvaAB: number;      // 0..1
  mediaDiasParado: number;
  // Fase 1 — mix ideal
  curvaMarca: 'A' | 'B' | 'C';
  pecasIdeais: number;
  lacuna: number;
  incluidaNoMix: boolean;
  // Fase 2 — partição
  skusARepor: SkuARepor[];
  skusATrocar: SkuARepor[];
  skusObservar: SkuARepor[];
  pecasARenovar: number; // = skusATrocar.length
  itensDoentes: ItemDoenteMarca[];
  totalDoenteValor: number;
  totalDoentePecas: number;
  lacunaNaoPreenchivel: number;
  poolSkusBons: number;
  skus: ItemEstoque[];
}

// MixComparativo defined in @/lib/estoque/mix-ideal and re-exported here for consumers
export type MixComparativo = MixComparativoType;

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
  deadStockSkus: number;
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

interface CapacidadeExpositorRow extends CapacidadeConfig {
  cod_empresa: number;
}

interface MapeamentoFornecedor {
  marca: string;
  fornecedor: string;
}

interface MarcaConfigRow {
  cod_empresa: number;
  marca: string;
  pct_solar: number | null;
  estrategica: boolean;
  recem_introduzida: boolean;
}

export interface MarcaConfig {
  pctSolar: number | null;
  estrategica: boolean;
  recemIntroduzida: boolean;
}

// Re-export para consumers
export type { ParticipacaoMarca, MixMarcaV2 };

// Período fixo: 180 dias
const DIAS_PERIODO = 180;

// Cobertura-alvo (dias) por subcategoria — quanto de estoque queremos manter
// para não rupturar dado o lead time típico de cada categoria
const COBERTURA_ALVO_DIAS: Record<SubcategoriaProduto, number> = {
  AR_RX: 60,
  AR_SOLAR: 45,
  LENTES: 30,
  LENTES_GRAU: 30,
  LENTES_CONTATO: 30,
  ACESSORIOS: 60,
  OUTROS: 60,
};

// ============================================
// PARÂMETROS DA INTELIGÊNCIA DE COMPRA (Fase 1 + Fase 2)
// ============================================

// Giro máximo (dias) para considerar uma peça "boa" — dentro deste limite ela
// gira rápido o suficiente para entrar no pool de recompra.
// Acima disso o SKU é excluído do plano (vai para Observar / Avaliar troca).
const GIRO_BOM_MAX_DIAS = 90;

// Cobertura-alvo (dias) por curva da MARCA — quanto de estoque a marca deve manter.
// Marcas A merecem maior giro (cobertura menor); marcas C maior cobertura (menos compra).
const COBERTURA_ALVO_MARCA: Record<'A' | 'B' | 'C', number> = {
  A: 60,
  B: 75,
  C: 90,
};

// Peso da curva ABC do SKU no score de prioridade dentro do pool da marca.
const PESO_CURVA: Record<'A' | 'B' | 'C', number> = {
  A: 3,
  B: 2,
  C: 1,
};

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

  // Ref para evitar disparos duplicados do auto-load
  const autoLoadingRef = useRef(false);

  // Estado local apenas para mapeamentos (são globais e não dependem de empresa)
  const [mapeamentoFornecedor, setMapeamentoFornecedor] = useState<Map<string, string>>(new Map());
  const [configCapacidade, setConfigCapacidade] = useState<CapacidadeExpositorRow[]>([]);
  // marca_config: chaveado por (cod_empresa, marca). Carregado por empresa.
  const [marcaConfigRows, setMarcaConfigRows] = useState<MarcaConfigRow[]>([]);

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
        if (isAbortError(err)) return;
        console.error('[useEstoqueUnificado] Erro ao carregar mapeamentos:', err);
      }
    };
    carregarMapeamentos();
  }, []);

  useEffect(() => {
    const carregarCapacidades = async () => {
      try {
        const { data, error } = await supabase
          .from('capacidade_expositor')
          .select('cod_empresa, capacidade_total, percentual_solar');
        if (error) throw error;
        if (data) setConfigCapacidade(data as CapacidadeExpositorRow[]);
      } catch (err) {
        if (isAbortError(err)) return;
        console.error('[useEstoqueUnificado] Erro ao carregar capacidades:', err);
      }
    };
    carregarCapacidades();
  }, []);

  // Carrega marca_config da empresa selecionada (override de pct_solar + flags).
  // Re-fetch quando filters.empresa muda. ALL → carrega tudo.
  useEffect(() => {
    const carregarMarcaConfig = async () => {
      if (filters.empresa === null || filters.empresa === undefined) {
        setMarcaConfigRows([]);
        return;
      }
      try {
        let query = supabase
          .from('marca_config')
          .select('cod_empresa, marca, pct_solar, estrategica, recem_introduzida');
        if (filters.empresa !== 'ALL') {
          const codEmpresa = typeof filters.empresa === 'number' ? filters.empresa : parseInt(String(filters.empresa));
          query = query.eq('cod_empresa', codEmpresa);
        }
        const { data, error } = await query;
        if (error) throw error;
        if (data) setMarcaConfigRows(data as MarcaConfigRow[]);
      } catch (err) {
        console.error('[useEstoqueUnificado] Erro ao carregar marca_config:', err);
        setMarcaConfigRows([]);
      }
    };
    carregarMarcaConfig();
  }, [filters.empresa]);

  // Map<marcaUpperCase, MarcaConfig> filtrado pela empresa atual.
  // Chave em uppercase porque marca chega em formatação variável dos fontes.
  const marcaConfigMap = useMemo((): Map<string, MarcaConfig> => {
    const map = new Map<string, MarcaConfig>();
    const codEmpresaAtual = filters.empresa !== null && filters.empresa !== 'ALL'
      ? (typeof filters.empresa === 'number' ? filters.empresa : parseInt(String(filters.empresa)))
      : null;
    marcaConfigRows.forEach(r => {
      if (codEmpresaAtual !== null && r.cod_empresa !== codEmpresaAtual) return;
      map.set(r.marca.trim().toUpperCase(), {
        pctSolar: r.pct_solar,
        estrategica: r.estrategica,
        recemIntroduzida: r.recem_introduzida,
      });
    });
    return map;
  }, [marcaConfigRows, filters.empresa]);

  // Mescla dados de ambos endpoints por cod_sku — UNIÃO (estoque ∪ vendas)
  // Inclui SKUs sem estoque mas com venda nos 180d, para que "Vendas 6m" não fique subcontado
  const itensProcessados = useMemo((): ItemEstoque[] => {
    if (
      (!dadosEstoqueCompleto || dadosEstoqueCompleto.length === 0) &&
      (!dadosVendasSku || dadosVendasSku.length === 0)
    ) return [];

    const estoqueMap = new Map<number, EstoqueCompleto>();
    dadosEstoqueCompleto.forEach(e => estoqueMap.set(e.codSku, e));

    const vendasMap = new Map<number, AnaliseSku>();
    dadosVendasSku.forEach(sku => vendasMap.set(sku.codSku, sku));

    // Curva ABC sobre o universo de vendas
    const curvaMap = calcularCurvaABC(dadosVendasSku);

    // União dos códigos de SKU
    const codSkus = new Set<number>();
    estoqueMap.forEach((_, k) => codSkus.add(k));
    vendasMap.forEach((_, k) => codSkus.add(k));

    return Array.from(codSkus).map(codSku => {
      const estoqueItem = estoqueMap.get(codSku);
      const vendas = vendasMap.get(codSku);

      const descricao = estoqueItem?.descricao ?? vendas?.descricaoItem ?? '';
      const marca = (estoqueItem?.marca ?? vendas?.marca ?? '').trim();
      const fornecedorBruto = estoqueItem?.fornecedor ?? vendas?.fornecedor ?? '';
      const tipo = estoqueItem?.tipo ?? vendas?.tipo ?? '';
      const codigoBarra = estoqueItem?.codigoBarra ?? '';
      const estoqueAtual = estoqueItem?.quantidadeEstoque ?? 0;
      const precoCusto = estoqueItem?.precoCusto ?? vendas?.precoCusto ?? 0;
      const precoVenda = estoqueItem?.precoVenda ?? vendas?.precoVendaFinal ?? 0;
      const valorEstoqueCusto = estoqueItem?.valorEstoqueCusto ?? (estoqueAtual * precoCusto);
      const diasEmEstoque = estoqueItem?.diasEmEstoque ?? (vendas?.diasDesdeUltimaVenda ?? 0);
      const diasDesdeUltimaVenda = estoqueItem?.diasDesdeUltimaVenda ?? 0;
      const acaoSugerida = estoqueItem?.acaoSugerida ?? '';
      const isDeadStock = estoqueAtual > 0 && diasDesdeUltimaVenda > 180;

      const categoria = categorizarProduto(tipo);
      // Subcategoria: prefere o que veio do Bridge (estoque ou vendas), fallback regex
      const subBackend = (estoqueItem?.subcategoria
        ?? (vendas?.subcategoria as SubcategoriaProduto | null | undefined)
        ?? null) as SubcategoriaProduto | null;
      const subValid: SubcategoriaProduto[] = ['AR_RX', 'AR_SOLAR', 'LENTES', 'LENTES_GRAU', 'LENTES_CONTATO', 'ACESSORIOS', 'OUTROS'];
      const subcategoria: SubcategoriaProduto = (subBackend && subValid.includes(subBackend))
        ? subBackend
        : subcategorizarProduto(tipo);
      const curvaABC = curvaMap.get(codSku) || 'C';

      const qtdVendidos = vendas?.qtdProdutos ?? 0;
      const totalVendido = vendas?.totalVendido ?? 0;
      const vendaDiaria = DIAS_PERIODO > 0 ? qtdVendidos / DIAS_PERIODO : 0;
      const giroEstoque = vendas?.giroEstoque ?? 0;
      const margemBruta = vendas?.margemBruta ?? 0;

      // Giro real (Bridge): prefere estoque/completo (mais abrangente), fallback vendas/analise-sku
      const diasGiroMedio = estoqueItem?.diasGiroMedio ?? vendas?.diasGiroMedio ?? null;
      const diasGiroMediano = estoqueItem?.diasGiroMediano ?? vendas?.diasGiroMediano ?? null;
      const diasGiroUltimaPeca = estoqueItem?.diasGiroUltimaPeca ?? vendas?.diasGiroUltimaPeca ?? null;
      const pecasGiroConsideradas = estoqueItem?.pecasGiroConsideradas ?? vendas?.pecasGiroConsideradas ?? 0;

      // Giro efetivo: orientação do backend → preferir dias_giro_ultima_peca, fallback dias_giro_medio.
      const diasGiroEfetivo = diasGiroUltimaPeca ?? diasGiroMedio ?? null;

      // Cobertura: se há giro real (dias por peça) → estoque atual * dias por peça = dias até esgotar.
      // Caso contrário, fallback no método antigo (estoque / venda diária).
      const diasAlvo = COBERTURA_ALVO_DIAS[subcategoria] ?? 60;
      const coberturaDias = diasGiroEfetivo && diasGiroEfetivo > 0
        ? Math.round(estoqueAtual * diasGiroEfetivo)
        : (vendaDiaria > 0 ? Math.round(estoqueAtual / vendaDiaria) : 999);

      let estoqueMinimo = 0;
      if (filters.empresa !== null && filters.empresa !== 'ALL') {
        const codEmpresa = typeof filters.empresa === 'number' ? filters.empresa : parseInt(String(filters.empresa));
        const config = configCapacidade.find(c => c.cod_empresa === codEmpresa) ?? null;
        // Override de pct_solar por marca (marca_config), quando existir.
        const marcaCfg = marcaConfigMap.get(marca.trim().toUpperCase());
        estoqueMinimo = calcularCapacidadePorCategoria(config, subcategoria, marcaCfg?.pctSolar);
      }

      const otb = Math.max(0, Math.ceil(estoqueMinimo - estoqueAtual));
      const otbValor = otb * precoCusto;

      let classificacao: ItemEstoque['classificacao'];
      if (estoqueMinimo > 0) {
        const percentualDoMinimo = (estoqueAtual / estoqueMinimo) * 100;
        if (percentualDoMinimo < 30) classificacao = 'COMPRAR_URGENTE';
        else if (percentualDoMinimo < 100) classificacao = 'COMPRAR';
        else if (percentualDoMinimo > 200) classificacao = 'EXCESSO';
        else classificacao = 'ESTOQUE_OK';
      } else {
        if (qtdVendidos > 0 && estoqueAtual === 0) classificacao = 'COMPRAR_URGENTE';
        else if (isDeadStock) classificacao = 'EXCESSO';
        else classificacao = 'ESTOQUE_OK';
      }

      let fornecedorFinal = fornecedorBruto;
      if (!fornecedorFinal || fornecedorFinal === 'SEM FORNECEDOR' || fornecedorFinal === 'N/D') {
        const marcaUpper = marca.toUpperCase();
        const fornecedorMapeado = mapeamentoFornecedor.get(marcaUpper);
        if (fornecedorMapeado) fornecedorFinal = fornecedorMapeado;
      }

      const decisaoSku = calcularDecisaoSku({
        precoCusto, estoqueAtual, qtdVendidos, diasEmEstoque,
        diasGiroEfetivo, pecasGiroConsideradas, coberturaDias, diasAlvo, vendaDiaria,
      });

      return {
        codSku,
        codigoBarra,
        descricao,
        marca,
        fornecedor: fornecedorFinal,
        tipo,
        categoria,
        subcategoria,
        estoqueAtual,
        estoqueMinimo,
        valorEstoqueCusto,
        qtdVendidos,
        totalVendido,
        diasEmEstoque,
        diasDesdeUltimaVenda,
        vendaDiaria,
        coberturaDias,
        diasAlvo,
        diasGiroMedio,
        diasGiroMediano,
        diasGiroUltimaPeca,
        pecasGiroConsideradas,
        precoCusto,
        precoVenda,
        margemBruta,
        otb,
        otbValor,
        curvaABC,
        classificacao,
        acaoSugerida,
        giroEstoque,
        isDeadStock,
        decisaoSku,
      };
    });
  }, [dadosEstoqueCompleto, dadosVendasSku, filters.empresa, mapeamentoFornecedor, configCapacidade, marcaConfigMap]);

  // Contagem por categoria — apenas itens com estoque positivo (B.1)
  // LENTES_GRAU: excluída da UI (oculta), não entra em nenhum contador
  const contagemPorCategoria = useMemo(() => {
    const comEstoque = itensProcessados.filter(i => i.estoqueAtual > 0);
    const calc = (cat: CategoriaProduto) => ({
      skus: comEstoque.filter(i => i.categoria === cat).length,
      pecas: comEstoque.filter(i => i.categoria === cat).reduce((s, i) => s + i.estoqueAtual, 0),
    });
    return {
      armacoes: calc('ARMACOES'),
      lentes_contato: calc('LENTES_CONTATO'),
      produtos: calc('PRODUTOS'),
      outros: calc('OUTROS'),
    };
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
    const deadStockSkus = deadStock.length;

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
      deadStockPecas, deadStockValor, deadStockPercentual, deadStockSkus,
      totalSkus, fornecedoresDistintos, marcasDistintas,
      pecasLiquidar, pecasManter, pecasComprar,
      totalVendido, totalVendido6mPecas, totalOtb, totalOtbValor,
      skusComprarUrgente, skusComprar, skusEstoqueOk, skusExcesso,
      diasPeriodo: DIAS_PERIODO,
    };
  }, [itensFiltrados]);

  const estoqueEfetivoArmacoes = useMemo(() => {
    return itensProcessados
      .filter(item =>
        item.categoria === 'ARMACOES'
        && item.estoqueAtual > 0
        && !item.isDeadStock
      )
      .reduce((soma, item) => soma + item.estoqueAtual, 0);
  }, [itensProcessados]);

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
    const subcats: SubcategoriaProduto[] = ['AR_RX', 'AR_SOLAR', 'LENTES', 'LENTES_GRAU', 'LENTES_CONTATO', 'ACESSORIOS', 'OUTROS'];
    const labels: Record<SubcategoriaProduto, string> = {
      AR_RX: 'Armações RX',
      AR_SOLAR: 'Solar / OC',
      LENTES: 'Lentes',
      LENTES_GRAU: 'Lentes de grau',
      LENTES_CONTATO: 'Lentes de contato',
      ACESSORIOS: 'Acessórios',
      OUTROS: 'Outros',
    };
    const projected = itensProcessados.map(i => ({
      chave: labels[i.subcategoria] ?? i.subcategoria,
      estoqueAtual: i.estoqueAtual,
      qtdVendidos: i.qtdVendidos,
    }));
    const resultMap = new Map(calcularMixIdealCategoria(projected).map(m => [m.chave, m]));
    return subcats
      .map(sub => resultMap.get(labels[sub]))
      .filter((m): m is MixComparativo => m !== undefined);
  }, [itensProcessados]);

  const mixIdealMarca = useMemo((): MixComparativo[] => {
    const projected = itensProcessados.map(i => ({
      chave: i.marca || 'SEM MARCA',
      estoqueAtual: i.estoqueAtual,
      qtdVendidos: i.qtdVendidos,
    }));
    return calcularMixIdealCategoria(projected)
      .sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap));
  }, [itensProcessados]);

  // ============================================
  // FASE 1 — MIX IDEAL POR MARCA (top-down)
  // ============================================
  // Decide quais marcas compõem o mix e quanto de estoque cada uma deve ter.
  // SKU não entra aqui. A saída alimenta a Fase 2 (distribuição da lacuna).

  // Repassa as flags estrategica/recem_introduzida (marca_config) pro motor V1.
  // Chave em uppercase pra bater com a normalização feita ao montar marcaConfigMap.
  const marcaConfigFlagsMap = useMemo((): Map<string, MarcaConfigFlags> => {
    const m = new Map<string, MarcaConfigFlags>();
    marcaConfigMap.forEach((cfg, marcaKey) => {
      m.set(marcaKey, { estrategica: cfg.estrategica, recemIntroduzida: cfg.recemIntroduzida });
    });
    return m;
  }, [marcaConfigMap]);

  // calcularMixIdealMarcas usa o nome cru da marca como chave; normalizamos
  // o map de flags para casar com a forma que o motor consulta.
  const marcaConfigFlagsByName = useMemo((): Map<string, MarcaConfigFlags> => {
    const m = new Map<string, MarcaConfigFlags>();
    const visto = new Set<string>();
    itensFiltrados.forEach(i => {
      const nome = (i.marca || 'SEM MARCA');
      if (visto.has(nome)) return;
      visto.add(nome);
      const cfg = marcaConfigFlagsMap.get(nome.trim().toUpperCase());
      if (cfg) m.set(nome, cfg);
    });
    return m;
  }, [itensFiltrados, marcaConfigFlagsMap]);

  const mixIdealMarcas = useMemo((): MixMarca[] => {
    return calcularMixIdealMarcas(itensFiltrados, {
      diasPeriodo: DIAS_PERIODO,
      coberturaAlvo: COBERTURA_ALVO_MARCA,
      marcaConfigs: marcaConfigFlagsByName,
    });
  }, [itensFiltrados, marcaConfigFlagsByName]);

  // ============================================
  // FASE 2.0 — PARTICIPAÇÃO POR MARCA (Princípio #6)
  // ============================================
  // Participação proporcional = 60% peças + 40% faturamento (apenas Armações).
  // Consumível pelo Wizard Plano Mensal e por qualquer view que precise do
  // share-of-sales por marca.
  const participacaoMarca = useMemo((): Map<string, ParticipacaoMarca> => {
    return calcularParticipacaoMarca(itensFiltrados);
  }, [itensFiltrados]);

  // Capacidade total e pct_solar default da empresa selecionada (input do V2).
  const capacidadeEmpresa = useMemo(() => {
    if (filters.empresa === null || filters.empresa === 'ALL') return null;
    const codEmpresa = typeof filters.empresa === 'number' ? filters.empresa : parseInt(String(filters.empresa));
    return configCapacidade.find(c => c.cod_empresa === codEmpresa) ?? null;
  }, [configCapacidade, filters.empresa]);

  // Mix ideal V2: participação × capacidade, com override de pct_solar e flags
  // por marca aplicadas. Vazio quando não há empresa ou capacidade carregada.
  const mixIdealV2 = useMemo((): MixMarcaV2[] => {
    if (!capacidadeEmpresa || capacidadeEmpresa.capacidade_total <= 0) return [];
    const configsV2 = new Map<string, MarcaConfigV2>();
    marcaConfigFlagsByName.forEach((_flags, nome) => {
      const cfg = marcaConfigMap.get(nome.trim().toUpperCase());
      if (!cfg) return;
      configsV2.set(nome, {
        pctSolar: cfg.pctSolar,
        estrategica: cfg.estrategica,
        recemIntroduzida: cfg.recemIntroduzida,
      });
    });
    return calcularMixIdealV2({
      itens: itensFiltrados.map(i => ({
        codSku: i.codSku,
        descricao: i.descricao,
        marca: i.marca || 'SEM MARCA',
        qtdVendidos: i.qtdVendidos,
        totalVendido: i.totalVendido,
        estoqueAtual: i.estoqueAtual,
        isDeadStock: i.isDeadStock,
        diasGiroUltimaPeca: i.diasGiroUltimaPeca,
        categoria: i.categoria,
      })),
      capacidadeTotal: capacidadeEmpresa.capacidade_total,
      marcaConfigs: configsV2,
      pctSolarDefault: capacidadeEmpresa.percentual_solar,
    });
  }, [itensFiltrados, capacidadeEmpresa, marcaConfigMap, marcaConfigFlagsByName]);

  // ============================================
  // RESUMO POR MARCA — com blocos acionáveis (Fase 2)
  // ============================================

  // Helper: monta um SkuARepor a partir de um ItemEstoque.
  // qtdAComprar e motivoQtd são IMPOSTOS pela distribuição da lacuna (Fase 2)
  // — não calculados aqui. Quando não há qtd (ex: TROCAR/OBSERVAR), passa 0.
  const buildSkuView = (
    s: ItemEstoque,
    decisaoSkuOverride: DecisaoSku | undefined,
    qtdAComprar: number,
    motivoQtd: MotivoQtd | undefined,
  ): SkuARepor => {
    const valorCompra = qtdAComprar * s.precoCusto;
    // Prioridade derivada do motivo do passe da distribuição.
    let prioridade: SkuARepor['prioridade'];
    if (motivoQtd === 'GIRO_MUITO_RAPIDO') prioridade = 'URGENTE';
    else if (motivoQtd === 'GIRO_RAPIDO') prioridade = 'ALTA';
    else if (motivoQtd === 'BASE') prioridade = 'MEDIA';
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
      coberturaDias: s.coberturaDias,
      diasEmEstoque: s.diasEmEstoque,
      diasGiroMedio: s.diasGiroMedio,
      diasGiroMediano: s.diasGiroMediano,
      diasGiroUltimaPeca: s.diasGiroUltimaPeca,
      pecasGiroConsideradas: s.pecasGiroConsideradas,
      precoCusto: s.precoCusto,
      valorCompra,
      prioridade,
      decisaoSku: decisaoSkuOverride ?? s.decisaoSku,
      motivoQtd,
    };
  };

  const resumoPorMarca = useMemo((): ResumoMarca[] => {
    if (itensFiltrados.length === 0) return [];

    const mixMap = new Map(mixIdealMarcas.map(m => [m.marca, m]));

    const porMarca = new Map<string, ItemEstoque[]>();
    itensFiltrados.forEach(item => {
      const key = item.marca || 'SEM MARCA';
      if (!porMarca.has(key)) porMarca.set(key, []);
      porMarca.get(key)!.push(item);
    });

    return Array.from(porMarca.entries()).map(([marca, skus]) => {
      const mix = mixMap.get(marca);
      const comEstoque = skus.filter(s => s.estoqueAtual > 0);
      const pecasEstoque = comEstoque.reduce((acc, s) => acc + s.estoqueAtual, 0);
      const valorEstoque = comEstoque.reduce((acc, s) => acc + s.valorEstoqueCusto, 0);
      const qtdVendidos6m = skus.reduce((acc, s) => acc + s.qtdVendidos, 0);
      const totalVendido6m = skus.reduce((acc, s) => acc + s.totalVendido, 0);
      const otbTotal = skus.reduce((acc, s) => acc + s.otb, 0);
      const temCurvaA = skus.some(s => s.curvaABC === 'A');

      // Métricas da grade (mantidas)
      const skusAtivosArr = skus.filter(s => s.estoqueAtual > 0 || s.qtdVendidos > 0);
      const skusComVendaArr = skus.filter(s => s.qtdVendidos > 0);
      const skusAtivos = skusAtivosArr.length;
      const skusComVenda = skusComVendaArr.length;
      const taxaPerformance = skusAtivos > 0 ? skusComVenda / skusAtivos : 0;
      const skusAB = skusAtivosArr.filter(s => s.curvaABC === 'A' || s.curvaABC === 'B').length;
      const pctCurvaAB = skusAtivos > 0 ? skusAB / skusAtivos : 0;
      const semVenda = skusAtivosArr.filter(s => s.qtdVendidos === 0);
      const mediaDiasParado = semVenda.length > 0
        ? semVenda.reduce((acc, s) => acc + s.diasEmEstoque, 0) / semVenda.length
        : 0;
      const mediaDiasEmEstoque = skusComVendaArr.length > 0
        ? skusComVendaArr.reduce((acc, s) => acc + s.diasEmEstoque, 0) / skusComVendaArr.length
        : 999;

      // Decisão e mix vêm da Fase 1 (autoridade única)
      const decisao: DecisaoMarca = mix?.decisao ?? 'SEM_HISTORICO';
      const curvaMarca = mix?.curvaMarca ?? 'C';
      const pecasIdeais = mix?.pecasIdeais ?? 0;
      const lacuna = mix?.lacuna ?? 0;
      const incluidaNoMix = mix?.incluidaNoMix ?? false;

      // ============= FASE 2 — DISTRIBUIÇÃO DA LACUNA =============
      // Só rodamos se a marca está no mix E há lacuna (estoque < ideal).
      // Caso contrário, skusARepor = [] mesmo que existam SKUs zerados.
      let skusARepor: SkuARepor[] = [];
      let lacunaNaoPreenchivel = 0;
      let poolSkusBons = 0;

      if (incluidaNoMix && lacuna > 0) {
        const poolInput: SkuParaPool[] = skus.map(s => ({
          codSku: s.codSku,
          qtdVendidos: s.qtdVendidos,
          precoCusto: s.precoCusto,
          diasGiroUltimaPeca: s.diasGiroUltimaPeca,
          diasGiroMedio: s.diasGiroMedio,
          pecasGiroConsideradas: s.pecasGiroConsideradas,
          curvaABC: s.curvaABC,
        }));
        const skuMap = new Map(skus.map(s => [s.codSku, s]));

        const { alocados, naoPreenchivel, poolSize } = distribuirLacuna(
          poolInput, lacuna, { limitesGiro: { maxGiro: GIRO_BOM_MAX_DIAS } }
        );

        poolSkusBons = poolSize;
        lacunaNaoPreenchivel = naoPreenchivel;

        skusARepor = alocados
          .map(({ codSku, qtdAComprar, motivo }) => {
            const skuItem = skuMap.get(codSku);
            if (!skuItem) {
              console.warn(
                `[resumoPorMarca] SKU não encontrado no skuMap: ` +
                `codSku=${codSku}, marca=${marca}, qtdAComprar=${qtdAComprar}`
              );
              return null;
            }
            return buildSkuView(skuItem, 'REPOR', qtdAComprar, motivo);
          })
          .filter((s): s is SkuARepor => s !== null)
          .sort((a, b) => {
            const ordemPrio = { URGENTE: 0, ALTA: 1, MEDIA: 2, BAIXA: 3 } as const;
            return ordemPrio[a.prioridade] - ordemPrio[b.prioridade] || b.qtdAComprar - a.qtdAComprar;
          });
      }

      // TROCAR só faz sentido em marca RENOVAR
      const skusATrocar: SkuARepor[] = decisao === 'RENOVAR_COLECAO'
        ? skus.filter(s => s.decisaoSku === 'TROCAR').map(s => buildSkuView(s, undefined, 0, undefined)).sort((a, b) => b.diasEmEstoque - a.diasEmEstoque)
        : [];

      // OBSERVAR: SKUs com venda mas que ficaram fora do plano (giro >90, sem giro real, ou marca sem lacuna)
      const skusObservar: SkuARepor[] = incluidaNoMix
        ? skus
            .filter(s => s.qtdVendidos > 0 && !skusARepor.some(r => r.codSku === s.codSku))
            .map(s => buildSkuView(s, 'OBSERVAR', 0, undefined))
            .sort((a, b) => b.qtdVendidos - a.qtdVendidos)
        : [];

      // Estoque doente
      const itensDoentes: ItemDoenteMarca[] = comEstoque
        .filter(s => classificarPorIdade(s.diasEmEstoque).desconto > 0 && s.qtdVendidos === 0)
        .map(s => {
          const entry = classificarPorIdade(s.diasEmEstoque);
          return {
            codSku: s.codSku,
            descricao: s.descricao,
            estoqueAtual: s.estoqueAtual,
            valorCusto: s.valorEstoqueCusto,
            diasEmEstoque: s.diasEmEstoque,
            faixa: toFaixaDoente(entry),
            desconto: `${entry.desconto}%`,
          };
        })
        .sort((a, b) => b.diasEmEstoque - a.diasEmEstoque);

      const totalDoentePecas = itensDoentes.reduce((acc, i) => acc + i.estoqueAtual, 0);
      const totalDoenteValor = itensDoentes.reduce((acc, i) => acc + i.valorCusto, 0);

      const pecasARenovar = skusATrocar.length;
      const categoria = skus[0]?.categoria || 'OUTROS';

      return {
        marca, categoria, pecasEstoque, valorEstoque,
        qtdVendidos6m, totalVendido6m, otbTotal,
        mediaDiasEmEstoque, temCurvaA, decisao,
        skusAtivos, skusComVenda, taxaPerformance, pctCurvaAB, mediaDiasParado,
        curvaMarca, pecasIdeais, lacuna, incluidaNoMix,
        skusARepor, skusATrocar, skusObservar,
        pecasARenovar,
        itensDoentes, totalDoenteValor, totalDoentePecas,
        lacunaNaoPreenchivel, poolSkusBons,
        skus,
      };
    }).sort((a, b) => {
      const ordem: Record<DecisaoMarca, number> = {
        REPOR_REFERENCIA: 0,
        RENOVAR_COLECAO: 1,
        SEM_HISTORICO: 2,
        AVALIAR_DESCONTINUACAO: 3,
      };
      return ordem[a.decisao] - ordem[b.decisao] || b.totalVendido6m - a.totalVendido6m;
    });
  }, [itensFiltrados, mixIdealMarcas]);

  // Lacunas que sobraram após esgotar o pool de SKUs bons (Fase 2)
  const lacunasNaoPreenchiveis = useMemo((): LacunaNaoPreenchivel[] => {
    return resumoPorMarca
      .filter(m => m.lacunaNaoPreenchivel > 0)
      .map(m => ({ marca: m.marca, faltam: m.lacunaNaoPreenchivel, poolSize: m.poolSkusBons }))
      .sort((a, b) => b.faltam - a.faltam);
  }, [resumoPorMarca]);

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
    const comEstoque = itensProcessados.filter(i => i.estoqueAtual > 0 && classificarPorIdade(i.diasEmEstoque).desconto > 0);
    if (comEstoque.length === 0) return [];

    const faixasConfig: Record<FaixaDoente, { label: string; desconto: string; cor: string }> = {
      PROMOCAO_20:    { label: 'Promoção 20%',  desconto: '20%', cor: 'text-yellow-600'  },
      LIQUIDACAO_30:  { label: 'Liquidação 30%', desconto: '30%', cor: 'text-orange-600'  },
      LIQUIDACAO_50:  { label: 'Liquidação 50%', desconto: '50%', cor: 'text-destructive' },
      ACAO_ESPECIAL:  { label: 'Ação Especial',  desconto: '-',   cor: 'text-destructive' },
      REVISAO_URGENTE: { label: 'Revisão Urgente', desconto: '-', cor: 'text-destructive' },
    };

    const grupos = new Map<FaixaDoente, ItemEstoque[]>();
    comEstoque.forEach(item => {
      const faixa = toFaixaDoente(classificarPorIdade(item.diasEmEstoque));
      if (!grupos.has(faixa)) grupos.set(faixa, []);
      grupos.get(faixa)!.push(item);
    });

    const semMovimento = itensProcessados.filter(i => i.estoqueAtual > 0 && i.qtdVendidos === 0 && i.diasEmEstoque === 0);
    if (semMovimento.length > 0) {
      if (!grupos.has('REVISAO_URGENTE')) grupos.set('REVISAO_URGENTE', []);
      grupos.get('REVISAO_URGENTE')!.push(...semMovimento);
    }

    const ordemFaixas: FaixaDoente[] = ['PROMOCAO_20', 'LIQUIDACAO_30', 'LIQUIDACAO_50', 'ACAO_ESPECIAL', 'REVISAO_URGENTE'];
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
      if (isAbortError(err)) {
        // Fetch foi cancelado por re-render (ex.: troca de empresa logo após login).
        // Não mostrar toast nem setar error; o auto-load vai disparar a versão correta.
        console.debug('[useEstoqueUnificado] carregamento cancelado (re-render)');
        return;
      }
      const message = err instanceof Error ? err.message : 'Erro ao carregar dados';
      setError(message);
      toast({ title: "Erro ao carregar", description: message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [filters.empresa, dataInicio, dataFim, setLoading, setError, setDados]);

  // Auto-load: se a empresa está definida mas os dados ainda não foram carregados
  // para ela (ou estão vazios), dispara o fetch automaticamente.
  // Isso garante que ao navegar entre Visão Estoque ↔ Plano de Compra o usuário
  // não precise clicar em "Carregar Dados" novamente.
  useEffect(() => {
    if (filters.empresa === null || filters.empresa === undefined) return;
    // Espera o AuthContext / lista de empresas terminar de carregar antes de
    // disparar fetches — evita rajada de requests sendo abortadas por re-render
    // logo após o login.
    if (loadingEmpresas) return;
    if (loading || autoLoadingRef.current) return;
    const empresaMudou = String(empresaCarregada) !== String(filters.empresa);
    const semDados = dadosEstoqueCompleto.length === 0 && dadosVendasSku.length === 0;
    if (empresaMudou || semDados) {
      autoLoadingRef.current = true;
      carregarDados().finally(() => {
        autoLoadingRef.current = false;
      });
    }
  }, [filters.empresa, empresaCarregada, dadosEstoqueCompleto.length, dadosVendasSku.length, loading, loadingEmpresas, carregarDados]);

  const dadosBrutos = dadosVendasSku;

  return {
    empresas, loadingEmpresas,
    filters, setFilters,
    loading, error,
    dadosBrutos, dadosEstoqueCompleto, dadosVendasSku,
    itensProcessados, itensFiltrados, itensComEstoque,
    metricas, contagemPorCategoria, diasPeriodo: DIAS_PERIODO,
    estoqueEfetivoArmacoes,
    listaFornecedores, listaMarcas, listaAcoes, marcasSemFornecedor,
    mixIdealCategoria, mixIdealMarca, mixIdealMarcas, lacunasNaoPreenchiveis,
    resumoPorMarca, estoqueDoenteAgrupado, listaCompraFlat,
    // Fase 2.0 — participação proporcional + V2
    participacaoMarca, mixIdealV2, marcaConfigMap, capacidadeEmpresa,
    carregarDados,
    carregadoEm, empresaCarregada,
  };
}
