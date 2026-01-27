// src/pages/OtbDashboard.tsx
// Página dedicada do módulo OTB (Open to Buy)

import { useState, useMemo } from "react";
import { useOtb } from "@/hooks/useOtb";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { OtbFilters } from "@/components/otb/OtbFilters";
import { OtbKPICards } from "@/components/otb/OtbKPICards";
import { OtbTable } from "@/components/otb/OtbTable";
import { OtbCurvaABCChart } from "@/components/otb/OtbCurvaABCChart";
import { OtbCoberturaCard } from "@/components/otb/OtbCoberturaCard";
import { OtbSugestaoCoberturaIA } from "@/components/otb/OtbSugestaoCoberturaIA";
import { OtbFornecedorMarcaConfig } from "@/components/otb/OtbFornecedorMarcaConfig";
import { OtbPainelAcoes } from "@/components/otb/OtbPainelAcoes";
import { OtbResumoVisual } from "@/components/otb/OtbResumoVisual";
import { 
  ShoppingCart, 
  AlertCircle, 
  Factory, 
  Tag,
  Info,
  LayoutDashboard,
  ListTodo
} from "lucide-react";

export default function OtbDashboard() {
  const {
    empresas,
    loadingEmpresas,
    filters,
    setFilters,
    agrupamento,
    setAgrupamento,
    loading,
    error,
    itensOtb,
    itensAgrupados,
    metrics,
    diasPeriodo,
    contagemPorCategoria,
    totalSkusBrutos,
    carregarDados,
    marcasSemFornecedor,
  } = useOtb();

  // Estado para filtro por curva ABC
  const [curvaFiltro, setCurvaFiltro] = useState<'A' | 'B' | 'C' | null>(null);
  
  // Estado para tab ativa (visão geral vs detalhes)
  const [tabAtiva, setTabAtiva] = useState<'acoes' | 'detalhes'>('acoes');

  // Filtrar itens por curva se selecionada
  const itensFiltrados = curvaFiltro 
    ? itensOtb.filter(item => item.curvaABC === curvaFiltro)
    : itensOtb;

  // Métricas recalculadas para itens filtrados
  const metricsFiltradas = useMemo(() => {
    if (itensFiltrados.length === 0) return metrics;
    
    return {
      totalSkus: itensFiltrados.length,
      totalEstoque: itensFiltrados.reduce((acc, i) => acc + i.estoqueAtual, 0),
      totalVendido: itensFiltrados.reduce((acc, i) => acc + i.totalVendido, 0),
      totalOtb: itensFiltrados.reduce((acc, i) => acc + i.otb, 0),
      totalOtbValor: itensFiltrados.reduce((acc, i) => acc + i.otbValor, 0),
      skusComprarUrgente: itensFiltrados.filter(i => i.classificacao === 'COMPRAR_URGENTE').length,
      skusComprar: itensFiltrados.filter(i => i.classificacao === 'COMPRAR').length,
      skusEstoqueOk: itensFiltrados.filter(i => i.classificacao === 'ESTOQUE_OK').length,
      skusExcesso: itensFiltrados.filter(i => i.classificacao === 'EXCESSO').length,
      diasPeriodo: metrics.diasPeriodo,
    };
  }, [itensFiltrados, metrics]);

  // Reagrupar os itens filtrados
  const itensAgrupadosFiltrados = useMemo(() => {
    const agrupado = new Map<string, typeof itensAgrupados[0]>();
    itensFiltrados.forEach(item => {
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
  }, [itensFiltrados, agrupamento]);

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ShoppingCart className="h-8 w-8 text-primary" />
            <div>
              <h1 className="text-3xl font-bold">Open to Buy (OTB)</h1>
              <p className="text-muted-foreground">
                Avaliação mensal de compras - manter estoque saudável e oxigenado
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

      {/* Filtros */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Parâmetros de Análise</CardTitle>
          <CardDescription>
            Defina o período base para análise de vendas e a cobertura desejada
          </CardDescription>
        </CardHeader>
        <CardContent>
          <OtbFilters
            filters={filters}
            setFilters={setFilters}
            empresas={empresas}
            loadingEmpresas={loadingEmpresas}
            loading={loading}
            onReload={carregarDados}
            contagemPorCategoria={contagemPorCategoria}
            totalSkusBrutos={totalSkusBrutos}
          />
        </CardContent>
      </Card>

      {/* Erro */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Loading */}
      {loading && (
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
      {!loading && itensOtb.length > 0 && (
        <>
          {/* Resumo Visual - Usando itens filtrados */}
          <OtbResumoVisual 
            metrics={metrics} 
            itens={itensFiltrados} 
            coberturaDias={filters.coberturaDias} 
          />

          {/* Tabs: Ações vs Detalhes */}
          <Tabs value={tabAtiva} onValueChange={(v) => setTabAtiva(v as 'acoes' | 'detalhes')}>
            <TabsList className="grid w-full max-w-md grid-cols-2">
              <TabsTrigger value="acoes" className="gap-2">
                <ListTodo className="h-4 w-4" />
                O que Fazer?
              </TabsTrigger>
              <TabsTrigger value="detalhes" className="gap-2">
                <LayoutDashboard className="h-4 w-4" />
                Análise Detalhada
              </TabsTrigger>
            </TabsList>

            {/* Tab: Painel de Ações - usa métricas filtradas */}
            <TabsContent value="acoes" className="mt-4">
              <OtbPainelAcoes 
                itens={itensFiltrados} 
                metrics={metricsFiltradas}
                coberturaDias={filters.coberturaDias}
                onFiltrarCategoria={(cat) => {
                  setTabAtiva('detalhes');
                }}
              />
            </TabsContent>

            {/* Tab: Análise Detalhada */}
            <TabsContent value="detalhes" className="mt-4 space-y-6">
              {/* Fórmula explicativa */}
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription className="flex items-center gap-2 flex-wrap">
                  <strong>Fórmula OTB:</strong>
                  <code className="bg-muted px-2 py-0.5 rounded text-sm">
                    OTB = MAX(Venda Diária × Cobertura, Mínimo Loja) - Estoque Atual
                  </code>
                  <span className="text-muted-foreground text-sm ml-2">
                    Período: {diasPeriodo} dias | Meta: {filters.coberturaDias} dias
                  </span>
                </AlertDescription>
              </Alert>

              {/* KPIs Detalhados - usa métricas filtradas */}
              <OtbKPICards metrics={metricsFiltradas} coberturaDias={filters.coberturaDias} />

              {/* Grid: Curva ABC + Cobertura */}
              <div className="grid md:grid-cols-2 gap-6">
                <OtbCurvaABCChart 
                  itens={itensFiltrados} 
                  selectedCurva={curvaFiltro}
                  onCurvaClick={setCurvaFiltro}
                />
                <OtbCoberturaCard 
                  itens={itensFiltrados} 
                  coberturaMeta={filters.coberturaDias} 
                />
              </div>

              {/* Sugestão de Cobertura via IA com comparativo de mínimos - usa itens filtrados */}
              <OtbSugestaoCoberturaIA 
                itens={itensFiltrados}
                coberturaAtual={filters.coberturaDias}
                codEmpresa={typeof filters.empresa === 'number' ? filters.empresa : parseInt(filters.empresa as string) || undefined}
                onSugestaoCoberturaChange={(dias) => setFilters(prev => ({ ...prev, coberturaDias: dias }))}
              />

              {/* Filtro ativo por curva */}
              {curvaFiltro && (
                <Alert className="bg-primary/5 border-primary/20">
                  <Info className="h-4 w-4 text-primary" />
                  <AlertDescription className="flex items-center justify-between">
                    <span>
                      Mostrando apenas itens da <strong>Curva {curvaFiltro}</strong> 
                      ({itensFiltrados.length} SKUs de {itensOtb.length})
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
                    itensOtb={itensFiltrados}
                    agrupamento={agrupamento}
                  />
                </CardContent>
              </Card>

              {/* Legenda */}
              <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <Badge variant="destructive">Urgente</Badge>
                  <span>Estoque &lt; 15 dias de venda</span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge className="bg-warning text-warning-foreground">Comprar</Badge>
                  <span>OTB positivo (precisa repor)</span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">OK</Badge>
                  <span>Estoque suficiente para cobertura</span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">Excesso</Badge>
                  <span>Estoque &gt; 2x a cobertura desejada</span>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </>
      )}

      {/* Estado inicial */}
      {!loading && itensOtb.length === 0 && !error && (
        <Card className="border-dashed">
          <CardContent className="py-12">
            <div className="text-center text-muted-foreground">
              <ShoppingCart className="h-16 w-16 mx-auto mb-4 opacity-30" />
              <p className="text-lg font-medium">Módulo OTB Pronto</p>
              <p className="text-sm mt-2 max-w-md mx-auto">
                Selecione uma empresa e clique em "Calcular OTB" para analisar
                as necessidades de compra e manter seu estoque saudável.
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
