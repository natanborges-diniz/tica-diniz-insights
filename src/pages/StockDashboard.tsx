// src/pages/StockDashboard.tsx
// Dashboard unificado de Estoque + OTB (Open to Buy)

import { useState, useMemo, useEffect } from "react";
import { useOtb } from "@/hooks/useOtb";
import { useEstoqueCompleto } from "@/hooks/useEstoqueCompleto";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { OtbFilters } from "@/components/otb/OtbFilters";
import { OtbKPICards } from "@/components/otb/OtbKPICards";
import { OtbTable } from "@/components/otb/OtbTable";
import { OtbCurvaABCChart } from "@/components/otb/OtbCurvaABCChart";
import { OtbSugestaoCoberturaIA } from "@/components/otb/OtbSugestaoCoberturaIA";
import { OtbFornecedorMarcaConfig } from "@/components/otb/OtbFornecedorMarcaConfig";
import { OtbPainelAcoes } from "@/components/otb/OtbPainelAcoes";
import { OtbResumoVisual } from "@/components/otb/OtbResumoVisual";
import { StockKPICards } from "@/components/stock-dashboard/StockKPICards";
import { StockActionChart } from "@/components/stock-dashboard/StockActionChart";
import { StockTable } from "@/components/stock-dashboard/StockTable";
import { StockFilters } from "@/components/stock-dashboard/StockFilters";
import { 
  Package, 
  AlertCircle, 
  Factory, 
  Tag,
  Info,
  Search,
  ShoppingCart,
  BoxIcon,
  ListTodo,
  RefreshCw
} from "lucide-react";

export default function StockDashboard() {
  // Hook OTB (análise de vendas + estoque para planejamento de compras)
  const {
    empresas,
    loadingEmpresas,
    filters: otbFilters,
    setFilters: setOtbFilters,
    agrupamento,
    setAgrupamento,
    loading: loadingOtb,
    error: errorOtb,
    itensOtb,
    itensAgrupados,
    metrics: otbMetrics,
    diasPeriodo,
    contagemPorCategoria,
    totalSkusBrutos,
    carregarDados: carregarOtb,
    marcasSemFornecedor,
  } = useOtb();

  // Hook Estoque Completo (dados reais de estoque físico)
  const {
    dados: dadosEstoque,
    dadosFiltrados: dadosEstoqueFiltrados,
    loading: loadingEstoque,
    error: errorEstoque,
    filters: estoqueFilters,
    setFilters: setEstoqueFilters,
    metrics: estoqueMetrics,
    carregarDados: carregarEstoque,
    listaFornecedores,
    listaMarcas,
    listaAcoes,
  } = useEstoqueCompleto();

  // Estado para filtro por curva ABC (apenas na aba OTB)
  const [curvaFiltro, setCurvaFiltro] = useState<'A' | 'B' | 'C' | null>(null);
  
  // Estado para tab ativa principal
  const [tabPrincipal, setTabPrincipal] = useState<'acoes' | 'estoque' | 'analise'>('estoque');

  // Busca textual para OTB
  const [buscaTextoOtb, setBuscaTextoOtb] = useState("");

  // Carregar estoque quando empresa mudar
  useEffect(() => {
    if (otbFilters.empresa !== null && otbFilters.empresa !== 'ALL') {
      carregarEstoque(otbFilters.empresa);
    }
  }, [otbFilters.empresa, carregarEstoque]);

  // Filtrar itens OTB por curva e busca
  const itensFiltradosOtb = useMemo(() => {
    let resultado = itensOtb;
    
    if (curvaFiltro) {
      resultado = resultado.filter(item => item.curvaABC === curvaFiltro);
    }
    
    if (buscaTextoOtb.trim()) {
      const termo = buscaTextoOtb.toLowerCase();
      resultado = resultado.filter(item => 
        item.descricaoItem?.toLowerCase().includes(termo) ||
        item.marca?.toLowerCase().includes(termo) ||
        item.fornecedor?.toLowerCase().includes(termo) ||
        String(item.codSku).includes(termo)
      );
    }
    
    return resultado;
  }, [itensOtb, curvaFiltro, buscaTextoOtb]);

  // Métricas recalculadas para itens OTB filtrados
  const metricsFiltradas = useMemo(() => {
    if (itensFiltradosOtb.length === 0) return otbMetrics;
    
    return {
      totalSkus: itensFiltradosOtb.length,
      totalEstoque: itensFiltradosOtb.reduce((acc, i) => acc + i.estoqueAtual, 0),
      totalVendido: itensFiltradosOtb.reduce((acc, i) => acc + i.totalVendido, 0),
      totalOtb: itensFiltradosOtb.reduce((acc, i) => acc + i.otb, 0),
      totalOtbValor: itensFiltradosOtb.reduce((acc, i) => acc + i.otbValor, 0),
      skusComprarUrgente: itensFiltradosOtb.filter(i => i.classificacao === 'COMPRAR_URGENTE').length,
      skusComprar: itensFiltradosOtb.filter(i => i.classificacao === 'COMPRAR').length,
      skusEstoqueOk: itensFiltradosOtb.filter(i => i.classificacao === 'ESTOQUE_OK').length,
      skusExcesso: itensFiltradosOtb.filter(i => i.classificacao === 'EXCESSO').length,
      diasPeriodo: otbMetrics.diasPeriodo,
    };
  }, [itensFiltradosOtb, otbMetrics]);

  // Reagrupar itens OTB filtrados
  const itensAgrupadosFiltrados = useMemo(() => {
    const agrupado = new Map<string, typeof itensAgrupados[0]>();
    itensFiltradosOtb.forEach(item => {
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
    return Array.from(agrupado.values()).sort((a, b) => b.otbValorTotal - a.otbValorTotal);
  }, [itensFiltradosOtb, agrupamento]);

  // Obter código da empresa para IA
  const codEmpresaAtual = otbFilters.empresa !== 'ALL' 
    ? (typeof otbFilters.empresa === 'number' ? otbFilters.empresa : parseInt(otbFilters.empresa as string))
    : undefined;

  // Handler para mudança de empresa nos filtros OTB
  const handleEmpresaChange = (novoFiltro: typeof otbFilters) => {
    setOtbFilters(novoFiltro);
    // Resetar filtros de estoque quando mudar empresa
    if (novoFiltro.empresa !== otbFilters.empresa) {
      setEstoqueFilters(prev => ({
        ...prev,
        empresa: novoFiltro.empresa,
        fornecedor: "TODOS",
        marca: "TODAS",
        acao: "TODAS",
        busca: "",
      }));
    }
  };

  // Loading combinado
  const isLoading = loadingOtb || loadingEstoque;
  const hasError = errorOtb || errorEstoque;

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Package className="h-8 w-8 text-primary" />
            <div>
              <h1 className="text-3xl font-bold">Gestão de Estoque</h1>
              <p className="text-muted-foreground">
                Análise de estoque e planejamento de compras (OTB)
              </p>
            </div>
          </div>
          {empresas.length > 0 && (
            <div className="flex items-center gap-2">
              <OtbFornecedorMarcaConfig marcasSemFornecedor={marcasSemFornecedor} />
            </div>
          )}
        </div>
      </div>

      {/* Filtros (compartilhados) */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Parâmetros de Análise</CardTitle>
          <CardDescription>
            Selecione a empresa para visualizar estoque e análise OTB
          </CardDescription>
        </CardHeader>
        <CardContent>
          <OtbFilters
            filters={otbFilters}
            setFilters={handleEmpresaChange}
            empresas={empresas}
            loadingEmpresas={loadingEmpresas}
            loading={isLoading}
            onReload={() => {
              carregarOtb();
              if (otbFilters.empresa !== null && otbFilters.empresa !== 'ALL') {
                carregarEstoque(otbFilters.empresa);
              }
            }}
            contagemPorCategoria={contagemPorCategoria}
            totalSkusBrutos={totalSkusBrutos}
          />
        </CardContent>
      </Card>

      {/* Erro */}
      {hasError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{errorOtb || errorEstoque}</AlertDescription>
        </Alert>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
          <Skeleton className="h-[400px]" />
        </div>
      )}

      {/* Conteúdo Principal */}
      {!isLoading && (dadosEstoque.length > 0 || itensOtb.length > 0) && (
        <>
          {/* Tabs Principais: Estoque | Ações | Análise OTB */}
          <Tabs value={tabPrincipal} onValueChange={(v) => setTabPrincipal(v as typeof tabPrincipal)}>
            <TabsList className="grid w-full max-w-lg grid-cols-3">
              <TabsTrigger value="estoque" className="gap-2">
                <BoxIcon className="h-4 w-4" />
                Visão Estoque
              </TabsTrigger>
              <TabsTrigger value="acoes" className="gap-2">
                <ListTodo className="h-4 w-4" />
                O que Fazer?
              </TabsTrigger>
              <TabsTrigger value="analise" className="gap-2">
                <ShoppingCart className="h-4 w-4" />
                Análise OTB
              </TabsTrigger>
            </TabsList>

            {/* Tab: Visão Estoque (dados reais do endpoint /estoque/analise-acao) */}
            <TabsContent value="estoque" className="mt-4 space-y-6">
              {dadosEstoque.length > 0 ? (
                <>
                  {/* Filtros específicos de estoque */}
                  <Card>
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-lg">Filtros de Estoque</CardTitle>
                        <Button 
                          variant="outline" 
                          size="sm" 
                          onClick={() => carregarEstoque(otbFilters.empresa)}
                          disabled={loadingEstoque}
                        >
                          <RefreshCw className={`h-4 w-4 mr-2 ${loadingEstoque ? 'animate-spin' : ''}`} />
                          Atualizar
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <StockFilters
                        dados={dadosEstoque}
                        fornecedorSelecionado={estoqueFilters.fornecedor}
                        setFornecedorSelecionado={(v) => setEstoqueFilters(p => ({ ...p, fornecedor: v }))}
                        marcaSelecionada={estoqueFilters.marca}
                        setMarcaSelecionada={(v) => setEstoqueFilters(p => ({ ...p, marca: v }))}
                        acaoSelecionada={estoqueFilters.acao}
                        setAcaoSelecionada={(v) => setEstoqueFilters(p => ({ ...p, acao: v }))}
                        buscaTexto={estoqueFilters.busca}
                        setBuscaTexto={(v) => setEstoqueFilters(p => ({ ...p, busca: v }))}
                      />
                    </CardContent>
                  </Card>

                  {/* KPIs de Estoque - agora com dados reais */}
                  <StockKPICards dados={dadosEstoqueFiltrados} />
                  
                  {/* Gráfico por ação */}
                  <StockActionChart dados={dadosEstoqueFiltrados} />
                  
                  {/* Tabela de Estoque */}
                  <StockTable dados={dadosEstoqueFiltrados} />
                </>
              ) : (
                <Card className="border-dashed">
                  <CardContent className="py-12">
                    <div className="text-center text-muted-foreground">
                      <BoxIcon className="h-16 w-16 mx-auto mb-4 opacity-30" />
                      <p className="text-lg font-medium">Selecione uma Empresa</p>
                      <p className="text-sm mt-2 max-w-md mx-auto">
                        Escolha uma empresa específica nos filtros acima para visualizar
                        o estoque completo.
                      </p>
                    </div>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            {/* Tab: Painel de Ações */}
            <TabsContent value="acoes" className="mt-4">
              {itensOtb.length > 0 ? (
                <>
                  <OtbResumoVisual 
                    metrics={metricsFiltradas} 
                    itens={itensFiltradosOtb}
                  />
                  <OtbPainelAcoes 
                    itens={itensFiltradosOtb} 
                    metrics={metricsFiltradas}
                    onFiltrarCategoria={() => setTabPrincipal('analise')}
                  />
                </>
              ) : (
                <Card className="border-dashed">
                  <CardContent className="py-12">
                    <div className="text-center text-muted-foreground">
                      <ListTodo className="h-16 w-16 mx-auto mb-4 opacity-30" />
                      <p className="text-lg font-medium">Carregue os Dados</p>
                      <p className="text-sm mt-2 max-w-md mx-auto">
                        Selecione uma empresa e clique em "Carregar Dados" para ver
                        as ações sugeridas para o estoque.
                      </p>
                    </div>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            {/* Tab: Análise OTB Detalhada */}
            <TabsContent value="analise" className="mt-4 space-y-6">
              {itensOtb.length > 0 ? (
                <>
                  {/* Busca por SKU no OTB */}
                  <div className="flex items-center gap-2">
                    <Search className="h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Buscar SKU por descrição, marca, fornecedor ou código..."
                      value={buscaTextoOtb}
                      onChange={(e) => setBuscaTextoOtb(e.target.value)}
                      className="max-w-md"
                    />
                    {buscaTextoOtb && (
                      <Button variant="ghost" size="sm" onClick={() => setBuscaTextoOtb("")}>
                        Limpar
                      </Button>
                    )}
                  </div>

                  {/* Fórmula explicativa */}
                  <Alert>
                    <Info className="h-4 w-4" />
                    <AlertDescription className="flex items-center gap-2 flex-wrap">
                      <strong>Fórmula OTB:</strong>
                      <code className="bg-muted px-2 py-0.5 rounded text-sm">
                        OTB = Mínimo por Loja - Estoque Atual
                      </code>
                      <span className="text-muted-foreground text-sm ml-2">
                        Período base: {diasPeriodo} dias
                      </span>
                    </AlertDescription>
                  </Alert>

                  {/* KPIs Detalhados */}
                  <OtbKPICards metrics={metricsFiltradas} />

                  {/* Grid: Curva ABC + Sugestão IA */}
                  <div className="grid md:grid-cols-2 gap-6">
                    <OtbCurvaABCChart 
                      itens={itensFiltradosOtb} 
                      selectedCurva={curvaFiltro}
                      onCurvaClick={setCurvaFiltro}
                    />
                    <OtbSugestaoCoberturaIA 
                      itens={itensFiltradosOtb}
                      codEmpresa={codEmpresaAtual}
                    />
                  </div>

                  {/* Filtro ativo por curva */}
                  {curvaFiltro && (
                    <Alert className="bg-primary/5 border-primary/20">
                      <Info className="h-4 w-4 text-primary" />
                      <AlertDescription className="flex items-center justify-between">
                        <span>
                          Mostrando apenas itens da <strong>Curva {curvaFiltro}</strong> 
                          ({itensFiltradosOtb.length} SKUs de {itensOtb.length})
                        </span>
                        <button 
                          onClick={() => setCurvaFiltro(null)}
                          className="text-primary hover:underline text-sm"
                        >
                          Limpar filtro
                        </button>
                      </AlertDescription>
                    </Alert>
                  )}

                  {/* Tabela com Tabs de Agrupamento */}
                  <Card>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle className="text-lg">Análise por Fornecedor/Marca</CardTitle>
                          <CardDescription>
                            Clique em uma linha para ver os SKUs detalhados
                          </CardDescription>
                        </div>
                        <Tabs 
                          value={agrupamento} 
                          onValueChange={(v) => setAgrupamento(v as 'fornecedor' | 'marca')}
                        >
                          <TabsList>
                            <TabsTrigger value="fornecedor" className="gap-2">
                              <Factory className="h-4 w-4" />
                              Por Fornecedor
                            </TabsTrigger>
                            <TabsTrigger value="marca" className="gap-2">
                              <Tag className="h-4 w-4" />
                              Por Marca
                            </TabsTrigger>
                          </TabsList>
                        </Tabs>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <OtbTable
                        itensAgrupados={itensAgrupadosFiltrados}
                        itensOtb={itensFiltradosOtb}
                        agrupamento={agrupamento}
                      />
                    </CardContent>
                  </Card>

                  {/* Legenda */}
                  <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <Badge variant="destructive">Urgente</Badge>
                      <span>Estoque &lt; 30% do mínimo</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className="bg-warning text-warning-foreground">Comprar</Badge>
                      <span>Abaixo do mínimo configurado</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">OK</Badge>
                      <span>Estoque dentro do esperado</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">Excesso</Badge>
                      <span>Estoque &gt; 2x o mínimo</span>
                    </div>
                  </div>
                </>
              ) : (
                <Card className="border-dashed">
                  <CardContent className="py-12">
                    <div className="text-center text-muted-foreground">
                      <ShoppingCart className="h-16 w-16 mx-auto mb-4 opacity-30" />
                      <p className="text-lg font-medium">Análise OTB</p>
                      <p className="text-sm mt-2 max-w-md mx-auto">
                        Selecione uma empresa e clique em "Carregar Dados" para analisar
                        as necessidades de compra.
                      </p>
                    </div>
                  </CardContent>
                </Card>
              )}
            </TabsContent>
          </Tabs>
        </>
      )}

      {/* Estado inicial */}
      {!isLoading && dadosEstoque.length === 0 && itensOtb.length === 0 && !hasError && (
        <Card className="border-dashed">
          <CardContent className="py-12">
            <div className="text-center text-muted-foreground">
              <Package className="h-16 w-16 mx-auto mb-4 opacity-30" />
              <p className="text-lg font-medium">Gestão de Estoque</p>
              <p className="text-sm mt-2 max-w-md mx-auto">
                Selecione uma empresa para começar a analisar o estoque
                e planejar as compras.
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
