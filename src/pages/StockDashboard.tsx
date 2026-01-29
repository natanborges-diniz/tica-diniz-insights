// src/pages/StockDashboard.tsx
// Dashboard UNIFICADO de Gestão de Estoque
// FONTE ÚNICA: Usa useEstoqueUnificado para garantir consistência entre todas as abas

import { useState, useMemo } from "react";
import { useEstoqueUnificado, ItemEstoque } from "@/hooks/useEstoqueUnificado";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { OtbFornecedorMarcaConfig } from "@/components/otb/OtbFornecedorMarcaConfig";
import { OtbPainelAcoes } from "@/components/otb/OtbPainelAcoes";
import { OtbCurvaABCChart } from "@/components/otb/OtbCurvaABCChart";
import { OtbSugestaoCoberturaIA } from "@/components/otb/OtbSugestaoCoberturaIA";
import { 
  Package, 
  AlertCircle, 
  Info,
  Search,
  ShoppingCart,
  BoxIcon,
  ListTodo,
  RefreshCw,
  Filter,
  Users,
  Tag,
  AlertTriangle
} from "lucide-react";

// ============================================
// COMPONENTES LOCAIS (KPIs e Tabela)
// ============================================

function EstoqueKPICards({ metricas }: { metricas: ReturnType<typeof useEstoqueUnificado>['metricas'] }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Total em Estoque</CardTitle>
          <Package className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{metricas.totalPecas.toLocaleString('pt-BR')}</div>
          <p className="text-xs text-muted-foreground">{metricas.totalSkusComEstoque} SKUs distintos</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Valor em Estoque</CardTitle>
          <BoxIcon className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {metricas.valorTotalCusto.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
          </div>
          <p className="text-xs text-muted-foreground">custo total</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Dead Stock</CardTitle>
          <AlertTriangle className="h-4 w-4 text-accent-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-accent-foreground">
            {metricas.deadStockPecas.toLocaleString('pt-BR')}
          </div>
          <p className="text-xs text-muted-foreground">
            {metricas.deadStockPercentual.toFixed(1)}% do estoque • {metricas.deadStockValor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Fornecedores</CardTitle>
          <Users className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{metricas.fornecedoresDistintos}</div>
          <p className="text-xs text-muted-foreground">{metricas.marcasDistintas} marcas</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Peças p/ Liquidar</CardTitle>
          <AlertTriangle className="h-4 w-4 text-destructive" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-destructive">{metricas.pecasLiquidar.toLocaleString('pt-BR')}</div>
          <p className="text-xs text-muted-foreground">ação sugerida: liquidar</p>
        </CardContent>
      </Card>
    </div>
  );
}

function EstoqueTable({ itens }: { itens: ItemEstoque[] }) {
  if (itens.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        Nenhum item encontrado com os filtros selecionados
      </div>
    );
  }

  return (
    <div className="rounded-md border overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-muted/50">
          <tr>
            <th className="text-left p-3 font-medium">Código</th>
            <th className="text-left p-3 font-medium">Descrição</th>
            <th className="text-left p-3 font-medium">Marca</th>
            <th className="text-left p-3 font-medium">Fornecedor</th>
            <th className="text-left p-3 font-medium">Cat.</th>
            <th className="text-right p-3 font-medium">Estoque</th>
            <th className="text-right p-3 font-medium">Valor Custo</th>
            <th className="text-right p-3 font-medium">Dias s/ Venda</th>
            <th className="text-left p-3 font-medium">Curva</th>
            <th className="text-left p-3 font-medium">Ação</th>
          </tr>
        </thead>
        <tbody>
          {itens.slice(0, 100).map((item) => (
            <tr 
              key={item.codSku} 
              className={`border-t hover:bg-muted/30 ${item.isDeadStock ? 'bg-destructive/5' : ''}`}
            >
              <td className="p-3 font-mono text-xs">{item.codSku}</td>
              <td className="p-3 max-w-[200px] truncate" title={item.descricao}>
                {item.isDeadStock && <AlertTriangle className="h-3 w-3 inline mr-1 text-destructive" />}
                {item.descricao}
              </td>
              <td className="p-3">{item.marca}</td>
              <td className="p-3">{item.fornecedor}</td>
              <td className="p-3">
                <Badge variant="outline" className="text-xs">
                  {item.categoria === 'ARMACOES' ? 'AR' : 
                   item.categoria === 'LENTES' ? 'LT' : 
                   item.categoria === 'ACESSORIOS' ? 'AC' : 'OU'}
                </Badge>
              </td>
              <td className="p-3 text-right font-medium">{item.estoqueAtual}</td>
              <td className="p-3 text-right text-muted-foreground">
                {item.valorEstoqueCusto.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
              </td>
              <td className="p-3 text-right">
                <span className={item.diasDesdeUltimaVenda > 180 ? 'text-destructive font-medium' : ''}>
                  {item.diasDesdeUltimaVenda > 900 ? '∞' : item.diasDesdeUltimaVenda}
                </span>
              </td>
              <td className="p-3">
                <Badge 
                  variant={item.curvaABC === 'A' ? 'default' : item.curvaABC === 'B' ? 'secondary' : 'outline'}
                  className="text-xs"
                >
                  {item.curvaABC}
                </Badge>
              </td>
              <td className="p-3">
                <Badge 
                  variant={
                    item.acaoSugerida.includes('URGENTE') ? 'destructive' : 
                    item.acaoSugerida.includes('COMPRAR') ? 'default' : 
                    item.acaoSugerida.includes('LIQUIDAR') ? 'secondary' : 'outline'
                  }
                  className="text-xs whitespace-nowrap"
                >
                  {item.acaoSugerida}
                </Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {itens.length > 100 && (
        <div className="p-3 text-center text-sm text-muted-foreground border-t">
          Mostrando 100 de {itens.length} itens. Use os filtros para refinar.
        </div>
      )}
    </div>
  );
}

// ============================================
// COMPONENTE PRINCIPAL
// ============================================

export default function StockDashboard() {
  const {
    empresas,
    loadingEmpresas,
    filters,
    setFilters,
    loading,
    error,
    itensProcessados,
    itensFiltrados,
    itensComEstoque,
    metricas,
    contagemPorCategoria,
    diasPeriodo,
    listaFornecedores,
    listaMarcas,
    marcasSemFornecedor,
    carregarDados,
  } = useEstoqueUnificado();

  const [tabPrincipal, setTabPrincipal] = useState<'estoque' | 'acoes' | 'analise'>('estoque');

  // Empresa selecionada
  const empresaSelecionada = empresas.find(e => 
    filters.empresa !== null && 
    (e.codEmpresa === filters.empresa || String(e.codEmpresa) === String(filters.empresa))
  );

  // Código da empresa para IA
  const codEmpresaAtual = filters.empresa !== null && filters.empresa !== 'ALL'
    ? (typeof filters.empresa === 'number' ? filters.empresa : parseInt(String(filters.empresa)))
    : undefined;

  // Converter itensFiltrados para formato esperado pelo OtbPainelAcoes
  const itensParaPainel = useMemo(() => {
    return itensFiltrados.map(item => ({
      codSku: item.codSku,
      descricaoItem: item.descricao,
      marca: item.marca,
      fornecedor: item.fornecedor,
      tipo: item.tipo,
      estoqueAtual: item.estoqueAtual,
      estoqueMinimo: item.estoqueMinimo,
      qtdVendidos: item.qtdVendidos,
      totalVendido: item.totalVendido,
      diasDesdeUltimaVenda: item.diasDesdeUltimaVenda,
      precoCusto: item.precoCusto,
      precoVendaFinal: item.precoVenda,
      margemBruta: item.margemBruta,
      vendaDiaria: item.vendaDiaria,
      otb: item.otb,
      otbValor: item.otbValor,
      curvaABC: item.curvaABC,
      classificacao: item.classificacao,
      giroEstoque: item.giroEstoque,
    }));
  }, [itensFiltrados]);

  // Métricas para OtbPainelAcoes
  const metricasParaPainel = useMemo(() => ({
    totalSkus: metricas.totalSkus,
    totalEstoque: metricas.totalPecas,
    totalVendido: metricas.totalVendido,
    totalOtb: metricas.totalOtb,
    totalOtbValor: metricas.totalOtbValor,
    skusComprarUrgente: metricas.skusComprarUrgente,
    skusComprar: metricas.skusComprar,
    skusEstoqueOk: metricas.skusEstoqueOk,
    skusExcesso: metricas.skusExcesso,
    diasPeriodo: metricas.diasPeriodo,
  }), [metricas]);

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
                Análise unificada de estoque e planejamento de compras
              </p>
            </div>
          </div>
          {empresas.length > 0 && (
            <OtbFornecedorMarcaConfig marcasSemFornecedor={marcasSemFornecedor} />
          )}
        </div>
      </div>

      {/* Parâmetros de Análise */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Parâmetros de Análise</CardTitle>
          <CardDescription>
            Selecione a empresa e clique em Carregar Dados para visualizar estoque
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-4 items-end">
            {/* Seletor de Empresa */}
            <div className="flex-1 min-w-[200px]">
              <label className="text-sm font-medium mb-2 block">Empresa</label>
              <Select
                value={filters.empresa !== null ? String(filters.empresa) : ""}
                onValueChange={(value) => setFilters(prev => ({ 
                  ...prev, 
                  empresa: Number(value),
                  fornecedor: 'TODOS',
                  marca: 'TODAS',
                  categoria: 'TODOS',
                  curvaABC: null,
                  busca: '',
                }))}
                disabled={loadingEmpresas}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Selecione uma empresa" />
                </SelectTrigger>
                <SelectContent>
                  {empresas.map((emp) => (
                    <SelectItem key={emp.codEmpresa} value={emp.codEmpresa.toString()}>
                      {emp.codEmpresa} - {emp.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Período */}
            <div className="flex gap-2">
              <div>
                <label className="text-sm font-medium mb-2 block">Data Início</label>
                <Input
                  type="date"
                  value={filters.dataInicio}
                  onChange={(e) => setFilters(prev => ({ ...prev, dataInicio: e.target.value }))}
                  className="w-[140px]"
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block">Data Fim</label>
                <Input
                  type="date"
                  value={filters.dataFim}
                  onChange={(e) => setFilters(prev => ({ ...prev, dataFim: e.target.value }))}
                  className="w-[140px]"
                />
              </div>
            </div>

            {/* Botão Carregar */}
            <Button 
              onClick={carregarDados} 
              disabled={loading || filters.empresa === null}
              className="min-w-[140px]"
            >
              {loading ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Carregando...
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Carregar Dados
                </>
              )}
            </Button>
          </div>

          {/* Filtros por Categoria */}
          {itensProcessados.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-2">
              <span className="text-sm text-muted-foreground self-center mr-2">Categoria:</span>
              <Button
                variant={filters.categoria === 'TODOS' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFilters(prev => ({ ...prev, categoria: 'TODOS' }))}
              >
                Todos ({itensProcessados.length})
              </Button>
              <Button
                variant={filters.categoria === 'ARMACOES' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFilters(prev => ({ ...prev, categoria: 'ARMACOES' }))}
              >
                Armações ({contagemPorCategoria.armacoes})
              </Button>
              <Button
                variant={filters.categoria === 'LENTES' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFilters(prev => ({ ...prev, categoria: 'LENTES' }))}
              >
                Lentes ({contagemPorCategoria.lentes})
              </Button>
              <Button
                variant={filters.categoria === 'ACESSORIOS' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFilters(prev => ({ ...prev, categoria: 'ACESSORIOS' }))}
              >
                Acessórios ({contagemPorCategoria.acessorios})
              </Button>
              {contagemPorCategoria.outros > 0 && (
                <Button
                  variant={filters.categoria === 'OUTROS' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setFilters(prev => ({ ...prev, categoria: 'OUTROS' }))}
                >
                  Outros ({contagemPorCategoria.outros})
                </Button>
              )}
            </div>
          )}
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
      {!loading && itensProcessados.length > 0 && (
        <>
          {/* Info da Empresa */}
          {empresaSelecionada && (
            <Alert className="bg-primary/5 border-primary/20">
              <Info className="h-4 w-4 text-primary" />
              <AlertDescription>
                <strong>{empresaSelecionada.nome}</strong> • 
                {' '}{metricas.totalPecas.toLocaleString('pt-BR')} peças em estoque • 
                {' '}{metricas.totalSkusComEstoque} SKUs • 
                {' '}Período: {diasPeriodo} dias
              </AlertDescription>
            </Alert>
          )}

          {/* Tabs Principais */}
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

            {/* Tab: Visão Estoque */}
            <TabsContent value="estoque" className="mt-4 space-y-6">
              {/* Filtros adicionais */}
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2">
                    <Filter className="h-4 w-4" />
                    <CardTitle className="text-base">Filtros</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-4">
                    <div className="flex-1 min-w-[150px]">
                      <Select
                        value={filters.fornecedor}
                        onValueChange={(v) => setFilters(prev => ({ ...prev, fornecedor: v }))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Fornecedor" />
                        </SelectTrigger>
                        <SelectContent>
                          {listaFornecedores.map((f) => (
                            <SelectItem key={f} value={f}>{f}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <div className="flex-1 min-w-[150px]">
                      <Select
                        value={filters.marca}
                        onValueChange={(v) => setFilters(prev => ({ ...prev, marca: v }))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Marca" />
                        </SelectTrigger>
                        <SelectContent>
                          {listaMarcas.map((m) => (
                            <SelectItem key={m} value={m}>{m}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <div className="flex-1 min-w-[200px] flex gap-2">
                      <Search className="h-4 w-4 self-center text-muted-foreground" />
                      <Input
                        placeholder="Buscar por descrição, código..."
                        value={filters.busca}
                        onChange={(e) => setFilters(prev => ({ ...prev, busca: e.target.value }))}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* KPIs */}
              <EstoqueKPICards metricas={metricas} />

              {/* Tabela */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">
                    Detalhamento do Estoque
                    {filters.categoria !== 'TODOS' && (
                      <Badge variant="secondary" className="ml-2">
                        {filters.categoria === 'ARMACOES' ? 'Armações' : 
                         filters.categoria === 'LENTES' ? 'Lentes' : 
                         filters.categoria === 'ACESSORIOS' ? 'Acessórios' : 'Outros'}
                      </Badge>
                    )}
                  </CardTitle>
                  <CardDescription>
                    {itensComEstoque.length} itens com estoque positivo
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <EstoqueTable itens={itensComEstoque} />
                </CardContent>
              </Card>
            </TabsContent>

            {/* Tab: O que Fazer? */}
            <TabsContent value="acoes" className="mt-4">
              <OtbPainelAcoes 
                itens={itensParaPainel} 
                metrics={metricasParaPainel}
                onFiltrarCategoria={() => setTabPrincipal('analise')}
              />
            </TabsContent>

            {/* Tab: Análise OTB */}
            <TabsContent value="analise" className="mt-4 space-y-6">
              {/* Busca OTB */}
              <div className="flex items-center gap-2">
                <Search className="h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar SKU por descrição, marca, fornecedor ou código..."
                  value={filters.busca}
                  onChange={(e) => setFilters(prev => ({ ...prev, busca: e.target.value }))}
                  className="max-w-md"
                />
                {filters.busca && (
                  <Button variant="ghost" size="sm" onClick={() => setFilters(prev => ({ ...prev, busca: '' }))}>
                    Limpar
                  </Button>
                )}
              </div>

              {/* Fórmula */}
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

              {/* KPIs OTB */}
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Estoque Total</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{metricas.totalPecas.toLocaleString('pt-BR')}</div>
                    <p className="text-xs text-muted-foreground">{metricas.totalSkusComEstoque} SKUs</p>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">OTB Total</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{metricas.totalOtb.toLocaleString('pt-BR')}</div>
                    <p className="text-xs text-muted-foreground">unidades a comprar</p>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Valor OTB</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {metricas.totalOtbValor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </div>
                    <p className="text-xs text-muted-foreground">investimento sugerido</p>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Comprar Urgente</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-destructive">{metricas.skusComprarUrgente}</div>
                    <p className="text-xs text-muted-foreground">SKUs críticos</p>
                  </CardContent>
                </Card>
              </div>

              {/* Grid: Curva ABC + Sugestão IA */}
              <div className="grid md:grid-cols-2 gap-6">
                <OtbCurvaABCChart 
                  itens={itensParaPainel} 
                  selectedCurva={filters.curvaABC}
                  onCurvaClick={(curva) => setFilters(prev => ({ 
                    ...prev, 
                    curvaABC: prev.curvaABC === curva ? null : curva 
                  }))}
                />
                <OtbSugestaoCoberturaIA 
                  itens={itensParaPainel}
                  codEmpresa={codEmpresaAtual}
                />
              </div>

              {/* Filtro Curva Ativo */}
              {filters.curvaABC && (
                <Alert className="bg-primary/5 border-primary/20">
                  <Info className="h-4 w-4 text-primary" />
                  <AlertDescription className="flex items-center justify-between">
                    <span>
                      Filtrado por Curva <strong>{filters.curvaABC}</strong> — 
                      {' '}{itensFiltrados.length} itens
                    </span>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => setFilters(prev => ({ ...prev, curvaABC: null }))}
                    >
                      Limpar Filtro
                    </Button>
                  </AlertDescription>
                </Alert>
              )}

              {/* Tabela OTB */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Detalhamento OTB</CardTitle>
                  <CardDescription>
                    {itensFiltrados.length} SKUs analisados • Período: {diasPeriodo} dias
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <EstoqueTable itens={itensFiltrados} />
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </>
      )}

      {/* Estado vazio */}
      {!loading && itensProcessados.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="py-12">
            <div className="text-center text-muted-foreground">
              <BoxIcon className="h-16 w-16 mx-auto mb-4 opacity-30" />
              <p className="text-lg font-medium">Selecione uma Empresa e Carregue os Dados</p>
              <p className="text-sm mt-2 max-w-md mx-auto">
                Escolha uma empresa nos parâmetros acima e clique em "Carregar Dados" 
                para visualizar o estoque e análise OTB.
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
