// src/pages/OtbDashboard.tsx
// Página dedicada do módulo OTB (Open to Buy)

import { useState } from "react";
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
import { OtbMinimoLojaConfig, type MinimoLojaConfig } from "@/components/otb/OtbMinimoLojaConfig";
import { OtbSugestaoCoberturaIA } from "@/components/otb/OtbSugestaoCoberturaIA";
import { 
  ShoppingCart, 
  AlertCircle, 
  Factory, 
  Tag,
  Info
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
  } = useOtb();

  // Estado para filtro por curva ABC
  const [curvaFiltro, setCurvaFiltro] = useState<'A' | 'B' | 'C' | null>(null);
  
  // Estado para configurações de mínimo por loja
  const [minimosLoja, setMinimosLoja] = useState<MinimoLojaConfig[]>([]);

  // Filtrar itens por curva se selecionada
  const itensFiltrados = curvaFiltro 
    ? itensOtb.filter(item => item.curvaABC === curvaFiltro)
    : itensOtb;

  // Reagrupar os itens filtrados
  const itensAgrupadosFiltrados = curvaFiltro
    ? (() => {
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
      })()
    : itensAgrupados;

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
                Cálculo de necessidades de compra por categoria e fornecedor
              </p>
            </div>
          </div>
          {empresas.length > 0 && (
            <OtbMinimoLojaConfig 
              empresas={empresas}
              configuracoes={minimosLoja}
              onSave={setMinimosLoja}
            />
          )}
        </div>
      </div>

      {/* Fórmula explicativa */}
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription className="flex items-center gap-2 flex-wrap">
          <strong>Fórmula OTB:</strong>
          <code className="bg-muted px-2 py-0.5 rounded text-sm">
            OTB = (Venda Diária Média × Cobertura em Dias) - Estoque Atual
          </code>
          <span className="text-muted-foreground text-sm ml-2">
            Período base: {diasPeriodo} dias | Cobertura: {filters.coberturaDias} dias
          </span>
        </AlertDescription>
      </Alert>

      {/* Filtros */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Parâmetros de Cálculo</CardTitle>
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
          <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
            {[...Array(6)].map((_, i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
          <Skeleton className="h-[400px]" />
        </div>
      )}

      {/* Conteúdo */}
      {!loading && itensOtb.length > 0 && (
        <>
          {/* KPIs */}
          <OtbKPICards metrics={metrics} coberturaDias={filters.coberturaDias} />

          {/* Grid: Curva ABC + Cobertura */}
          <div className="grid md:grid-cols-2 gap-6">
            <OtbCurvaABCChart 
              itens={itensOtb} 
              selectedCurva={curvaFiltro}
              onCurvaClick={setCurvaFiltro}
            />
            <OtbCoberturaCard 
              itens={itensOtb} 
              coberturaMeta={filters.coberturaDias} 
            />
          </div>

          {/* Sugestão de Cobertura via IA */}
          <OtbSugestaoCoberturaIA 
            itens={itensOtb}
            coberturaAtual={filters.coberturaDias}
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
                Configure os parâmetros acima e clique em "Calcular OTB" para analisar
                as necessidades de compra baseadas nas vendas do período.
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
