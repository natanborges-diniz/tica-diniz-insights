// src/pages/estoque/VisaoEstoquePage.tsx
// Página: Visão Estoque - lista detalhada de SKUs com KPIs

import { useState, useMemo, useCallback } from "react";
import { useEstoqueUnificado, ItemEstoque } from "@/hooks/useEstoqueUnificado";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { OtbFornecedorMarcaConfig } from "@/components/otb/OtbFornecedorMarcaConfig";
import { DataTableToolbar } from "@/components/ui/data-table-toolbar";
import { DataTable, DataTableColumn, QueryState } from "@/components/ui/data-table";
import { formatters, ExportColumn } from "@/utils/exportData";
import { 
  Package, 
  AlertCircle, 
  Info,
  Search,
  BoxIcon,
  RefreshCw,
  Filter,
  Users,
  AlertTriangle
} from "lucide-react";
import { EmptyState, ErrorState, LoadingState } from "@/components/system/states";
import { ModuleHeader } from "@/components/system/ModuleHeader";
import { useModuleInsights } from "@/hooks/useModuleInsights";
import { ModuleInsightsPanel } from "@/components/ia/ModuleInsightsPanel";
import { useEffect } from "react";
import { registerAction, unregisterAction } from "@/lib/actionCatalog";
import { useNavigate } from "react-router-dom";

// KPI Cards Component
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

// Helper para formatar dias em estoque
function formatarDiasEmEstoque(dias: number): string {
  if (dias === 0) return '-';
  return String(dias);
}

// Colunas do DataTable
const estoqueColumns: DataTableColumn<ItemEstoque>[] = [
  {
    key: "codigoBarra",
    header: "Cód. Barras",
    sortable: true,
    mobileVisible: true,
    cell: (row) => (
      <span className="font-mono text-xs">{row.codigoBarra || row.codSku}</span>
    ),
  },
  {
    key: "descricao",
    header: "Descrição",
    sortable: true,
    mobileVisible: true,
    maxWidth: "200px",
    cell: (row) => (
      <span title={row.descricao}>
        {row.isDeadStock && (
          <span className="inline-flex items-center gap-0.5 mr-1" title="Dead stock — sem giro no período">
            <AlertTriangle className="h-3 w-3 text-danger" />
          </span>
        )}
        {row.descricao}
      </span>
    ),
  },
  {
    key: "marca",
    header: "Marca",
    sortable: true,
    mobileVisible: false,
  },
  {
    key: "fornecedor",
    header: "Fornecedor",
    sortable: true,
    mobileVisible: false,
  },
  {
    key: "categoria",
    header: "Cat.",
    sortable: true,
    mobileVisible: false,
    cell: (row) => (
      <Badge variant="outline" className="text-xs">
        {row.categoria === "ARMACOES" ? "AR" : row.categoria === "LENTES" ? "LT" : row.categoria === "ACESSORIOS" ? "AC" : "OU"}
      </Badge>
    ),
  },
  {
    key: "estoqueAtual",
    header: "Estoque",
    sortable: true,
    align: "right",
    mobileVisible: true,
    cell: (row) => <span className="font-medium">{row.estoqueAtual}</span>,
  },
  {
    key: "valorEstoqueCusto",
    header: "Valor Custo",
    sortable: true,
    align: "right",
    mobileVisible: false,
    cell: (row) => (
      <span className="text-muted-foreground">
        {row.valorEstoqueCusto.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
      </span>
    ),
  },
  {
    key: "diasEmEstoque",
    header: "Dias Estoque",
    sortable: true,
    align: "right",
    mobileVisible: false,
    cell: (row) => (
      <span className={row.diasEmEstoque > 180 ? "text-danger font-medium" : ""}>
        {row.diasEmEstoque === 0 ? "-" : row.diasEmEstoque}
      </span>
    ),
  },
  {
    key: "curvaABC",
    header: "Curva",
    sortable: true,
    mobileVisible: false,
    cell: (row) => (
      <Badge
        variant={row.curvaABC === "A" ? "default" : row.curvaABC === "B" ? "secondary" : "outline"}
        className="text-xs"
      >
        {row.curvaABC}
      </Badge>
    ),
  },
  {
    key: "acaoSugerida",
    header: "Ação",
    sortable: true,
    mobileVisible: true,
    cell: (row) => (
      <Badge
        variant={
          row.acaoSugerida.includes("URGENTE") ? "destructive"
          : row.acaoSugerida.includes("COMPRAR") ? "default"
          : row.acaoSugerida.includes("LIQUIDA") ? "secondary"
          : "outline"
        }
        className="text-xs whitespace-nowrap"
      >
        {row.acaoSugerida}
      </Badge>
    ),
  },
];

function EstoqueTable({ itens }: { itens: ItemEstoque[] }) {
  const [queryState, setQueryState] = useState<QueryState>({
    page: 1,
    pageSize: 50,
    sort: { field: "estoqueAtual", direction: "desc" },
    search: "",
  });

  const exportColumns: ExportColumn[] = [
    { key: "codSku", header: "Código SKU" },
    { key: "codigoBarra", header: "Cód. Barras" },
    { key: "descricao", header: "Descrição" },
    { key: "marca", header: "Marca" },
    { key: "fornecedor", header: "Fornecedor" },
    { key: "categoria", header: "Categoria" },
    { key: "estoqueAtual", header: "Estoque", format: formatters.number },
    { key: "valorEstoqueCusto", header: "Valor Custo", format: formatters.currency },
    { key: "diasEmEstoque", header: "Dias em Estoque", format: (v) => (v === 0 ? "-" : String(v)) },
    { key: "curvaABC", header: "Curva ABC" },
    { key: "acaoSugerida", header: "Ação Sugerida" },
  ];

  if (itens.length === 0) {
    return (
      <EmptyState
        title="Nenhum item encontrado"
        description="Ajuste os filtros selecionados ou selecione outra empresa."
        icon={<Package className="h-6 w-6 text-muted-foreground" />}
      />
    );
  }

  return (
    <DataTable
      columns={estoqueColumns}
      data={itens}
      mode="client"
      queryState={queryState}
      onQueryChange={setQueryState}
      rowKey={(row, idx) => `${row.codSku}-${idx}`}
      rowClassName={(row) => (row.isDeadStock ? "bg-danger-soft/50 [&_td:first-child]:border-l-2 [&_td:first-child]:border-l-danger" : "")}
      emptyMessage="Nenhum item encontrado com os filtros selecionados"
      toolbar={
        <DataTableToolbar
          exportOptions={{
            filename: `estoque_${new Date().toISOString().split("T")[0]}`,
            title: "Detalhamento de Estoque",
            columns: exportColumns,
            data: itens,
          }}
        >
          <span className="text-sm text-muted-foreground">
            {itens.length.toLocaleString("pt-BR")} itens • Posição: {new Date().toLocaleDateString("pt-BR")} (tempo real)
          </span>
        </DataTableToolbar>
      }
    />
  );
}

export default function VisaoEstoquePage() {
  const navigate = useNavigate();
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
    listaAcoes,
    marcasSemFornecedor,
    carregarDados,
  } = useEstoqueUnificado();

  const hoje = new Date();
  const dataFimInsights = hoje.toISOString().split('T')[0];
  const dataInicioInsights = new Date(hoje.getTime() - 180 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const { insights, loading: insightsLoading, error: insightsError, refetch: refetchInsights } = useModuleInsights({
    module: "estoque",
    period: { from: dataInicioInsights, to: dataFimInsights },
    filters: { empresa: filters.empresa },
    enabled: itensProcessados.length > 0,
  });

  useEffect(() => {
    registerAction("NAVIGATE_OTB", () => navigate("/estoque/otb"));
    registerAction("NAVIGATE_ACOES_ESTOQUE", () => navigate("/estoque/acoes"));
    return () => { unregisterAction("NAVIGATE_OTB"); unregisterAction("NAVIGATE_ACOES_ESTOQUE"); };
  }, [navigate]);

  const empresaSelecionada = empresas.find(e => 
    filters.empresa !== null && 
    (e.codEmpresa === filters.empresa || String(e.codEmpresa) === String(filters.empresa))
  );

  return (
    <div className="space-y-6">
      <ModuleHeader
        title="Visão Estoque"
        subtitle="Lista detalhada de SKUs com KPIs"
        icon={<Package className="h-6 w-6 text-primary" />}
        actions={
          empresas.length > 0 ? (
            <OtbFornecedorMarcaConfig marcasSemFornecedor={marcasSemFornecedor} />
          ) : undefined
        }
      />

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
            <div className="flex-1 min-w-[200px]">
              <label className="text-sm font-medium mb-2 block">Empresa</label>
              <Select
                value={filters.empresa !== null ? String(filters.empresa) : ""}
                onValueChange={(value) => setFilters(prev => ({ 
                  ...prev, 
                  empresa: Number(value),
                  fornecedor: 'TODOS',
                  marca: 'TODAS',
                  acao: 'TODAS',
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

            <div className="text-sm text-muted-foreground self-center">
              Período de vendas: últimos 180 dias
            </div>

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
        <ErrorState
          description={error}
          onRetry={carregarDados}
        />
      )}

      {/* Loading */}
      {loading && (
        <LoadingState message="Carregando estoque..." />
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
                
                <div className="flex-1 min-w-[150px]">
                  <Select
                    value={filters.acao}
                    onValueChange={(v) => setFilters(prev => ({ ...prev, acao: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Ação" />
                    </SelectTrigger>
                    <SelectContent>
                      {listaAcoes.map((a) => (
                        <SelectItem key={a} value={a}>{a}</SelectItem>
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
                para visualizar o estoque.
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
