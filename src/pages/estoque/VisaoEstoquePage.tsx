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
import { EstoqueLoadStatus } from "@/components/estoque/EstoqueLoadStatus";
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
  AlertTriangle,
  ShieldCheck
} from "lucide-react";
import { EmptyState, ErrorState, LoadingState } from "@/components/system/states";
import { ModuleHeader } from "@/components/system/ModuleHeader";
import { useModuleInsights } from "@/hooks/useModuleInsights";
import { ModuleInsightsPanel } from "@/components/ia/ModuleInsightsPanel";
import { useEffect } from "react";
import { registerAction, unregisterAction } from "@/lib/actionCatalog";
import { useNavigate } from "react-router-dom";

// KPI Cards Component
type FiltroSubcategoria = 'TODAS' | 'AR_RX' | 'AR_SOLAR';

function EstoqueKPICards({
  metricas,
  categoria,
  estoqueEfetivoArmacoes,
  filtroAtivo,
}: {
  metricas: ReturnType<typeof useEstoqueUnificado>["metricas"];
  categoria: string;
  estoqueEfetivoArmacoes: number;
  filtroAtivo: FiltroSubcategoria;
}) {
  const isArmacoes = categoria === "ARMACOES";
  const labelCategoria =
    categoria === "ARMACOES" ? "Armações" :
    categoria === "LENTES_CONTATO" ? "Lentes de Contato" :
    categoria === "PRODUTOS" ? "Produtos" :
    categoria === "OUTROS" ? "Outros" : "Estoque";

  // Fundo sutil dos cards quando filtro RX/Solar está ativo
  const cardBg = isArmacoes && filtroAtivo !== 'TODAS'
    ? filtroAtivo === 'AR_RX'
      ? 'border-blue-200 bg-blue-50/60'
      : 'border-amber-200 bg-amber-50/60'
    : '';

  return (
    <div className="space-y-2">
      {!isArmacoes && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Filter className="h-3 w-3" />
          <span>Métricas filtradas por categoria:</span>
          <Badge variant="secondary">{labelCategoria}</Badge>
        </div>
      )}
      {isArmacoes && filtroAtivo !== 'TODAS' && (
        <div className="flex items-center gap-2 text-xs">
          <Filter className="h-3 w-3 text-muted-foreground" />
          <span className="text-muted-foreground">KPIs filtrados por subcategoria:</span>
          <Badge
            variant="secondary"
            className={filtroAtivo === 'AR_RX' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}
          >
            {filtroAtivo === 'AR_RX' ? 'Armações RX' : 'Óculos Solar'}
          </Badge>
        </div>
      )}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card className={cardBg}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total em Estoque</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metricas.totalPecas.toLocaleString('pt-BR')}</div>
            <p className="text-xs text-muted-foreground">peças • {metricas.totalSkusComEstoque.toLocaleString('pt-BR')} SKUs distintos</p>
          </CardContent>
        </Card>

        {isArmacoes && (
          <Card className={cardBg} title="Peças de Armações com estoque positivo que não são Dead Stock.">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Estoque Efetivo</CardTitle>
              <ShieldCheck className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-700">
                {estoqueEfetivoArmacoes.toLocaleString('pt-BR')}
              </div>
              <p className="text-xs text-muted-foreground">peças</p>
              <p className="text-[10px] text-muted-foreground mt-1">Estoque saudável (exclui Dead Stock)</p>
            </CardContent>
          </Card>
        )}

        <Card className={cardBg}>
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

        {isArmacoes && (
          <Card className={cardBg} title="SKUs com estoque > 0 e sem venda há mais de 180 dias (Princípio #19).">
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
              <p className="text-[10px] text-muted-foreground mt-1">+180 dias parado</p>
            </CardContent>
          </Card>
        )}

        <Card className={cardBg}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Fornecedores</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metricas.fornecedoresDistintos}</div>
            <p className="text-xs text-muted-foreground">{metricas.marcasDistintas} marcas</p>
          </CardContent>
        </Card>

        {isArmacoes && (
          <Card className={cardBg}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Peças p/ Liquidar</CardTitle>
              <AlertTriangle className="h-4 w-4 text-destructive" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-destructive">{metricas.pecasLiquidar.toLocaleString('pt-BR')}</div>
              <p className="text-xs text-muted-foreground">ação sugerida: liquidar</p>
            </CardContent>
          </Card>
        )}
      </div>
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
        {row.categoria === "ARMACOES" ? "AR" : row.categoria === "LENTES_CONTATO" ? "LC" : row.categoria === "LENTES_GRAU" ? "LG" : row.categoria === "PRODUTOS" ? "PR" : "OU"}
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
  const [mostrarOutras, setMostrarOutras] = useState(false);
  const [subcategoriaFiltroVisual, setSubcategoriaFiltroVisual] = useState<'TODAS' | 'AR_RX' | 'AR_SOLAR'>('TODAS');
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
    estoqueEfetivoArmacoes,
    listaFornecedores,
    listaMarcas,
    listaAcoes,
    marcasSemFornecedor,
    carregarDados,
  } = useEstoqueUnificado();

  const itensParaTabela = useMemo(() => {
    if (filters.categoria !== 'ARMACOES' || subcategoriaFiltroVisual === 'TODAS') return itensComEstoque;
    return itensComEstoque.filter(item => item.subcategoria === subcategoriaFiltroVisual);
  }, [itensComEstoque, filters.categoria, subcategoriaFiltroVisual]);

  // Contador da aba Armações filtrado por subcategoria (usa itensProcessados — não depende de outros filtros)
  const contagemArmacoesVisiveis = useMemo(() => {
    if (subcategoriaFiltroVisual === 'TODAS') return contagemPorCategoria.armacoes;
    const itens = itensProcessados.filter(i =>
      i.estoqueAtual > 0 &&
      i.categoria === 'ARMACOES' &&
      i.subcategoria === subcategoriaFiltroVisual
    );
    return { skus: itens.length, pecas: itens.reduce((acc, i) => acc + i.estoqueAtual, 0) };
  }, [contagemPorCategoria.armacoes, itensProcessados, subcategoriaFiltroVisual]);

  // Estoque Efetivo filtrado pela subcategoria ativa
  const estoqueEfetivoVisivel = useMemo(() => {
    if (filters.categoria !== 'ARMACOES' || subcategoriaFiltroVisual === 'TODAS') return estoqueEfetivoArmacoes;
    return itensParaTabela.filter(i => !i.isDeadStock).reduce((acc, i) => acc + i.estoqueAtual, 0);
  }, [estoqueEfetivoArmacoes, itensParaTabela, subcategoriaFiltroVisual, filters.categoria]);

  // Métricas dos KPIs filtradas pela subcategoria ativa (Motor de mix-ideal NÃO é afetado)
  const metricasVisiveis = useMemo(() => {
    if (filters.categoria !== 'ARMACOES' || subcategoriaFiltroVisual === 'TODAS') return metricas;
    const base = itensParaTabela;
    const totalPecas = base.reduce((acc, i) => acc + i.estoqueAtual, 0);
    const totalSkusComEstoque = base.length;
    const valorTotalCusto = base.reduce((acc, i) => acc + i.valorEstoqueCusto, 0);
    const deadStock = base.filter(i => i.isDeadStock);
    const deadStockPecas = deadStock.reduce((acc, i) => acc + i.estoqueAtual, 0);
    const deadStockValor = deadStock.reduce((acc, i) => acc + i.valorEstoqueCusto, 0);
    const deadStockPercentual = totalPecas > 0 ? (deadStockPecas / totalPecas) * 100 : 0;
    const deadStockSkus = deadStock.length;
    const fornecedoresDistintos = new Set(base.map(i => i.fornecedor)).size;
    const marcasDistintas = new Set(base.map(i => i.marca)).size;
    const pecasLiquidar = base
      .filter(i => i.acaoSugerida.toUpperCase().includes('LIQUIDA'))
      .reduce((acc, i) => acc + i.estoqueAtual, 0);
    return {
      ...metricas,
      totalPecas, totalSkusComEstoque, valorTotalCusto,
      deadStockPecas, deadStockValor, deadStockPercentual, deadStockSkus,
      fornecedoresDistintos, marcasDistintas, pecasLiquidar,
    };
  }, [metricas, itensParaTabela, subcategoriaFiltroVisual, filters.categoria]);

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
        subtitle="Consulta livre de todas as categorias. Para decisão de compra mensal, use Plano Mensal."
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
                onValueChange={(value) => {
                  setFilters(prev => ({
                    ...prev,
                    empresa: Number(value),
                    fornecedor: 'TODOS',
                    marca: 'TODAS',
                    acao: 'TODAS',
                    categoria: 'ARMACOES',
                    curvaABC: null,
                    busca: '',
                  }));
                  setMostrarOutras(false);
                  setSubcategoriaFiltroVisual('TODAS');
                }}
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

          {/* Filtros por Categoria (B.3) */}
          {itensProcessados.length > 0 && (
            <>
            <div className="flex flex-wrap gap-2 pt-2 items-center">
              <span className="text-sm text-muted-foreground mr-1">Categoria:</span>

              {/* Armações — sempre visível, aba principal */}
              <Button
                variant={filters.categoria === 'ARMACOES' ? 'default' : 'outline'}
                size="sm"
                className="flex flex-col h-auto py-1.5 px-3 items-center gap-0"
                onClick={() => {
                  setFilters(prev => ({ ...prev, categoria: 'ARMACOES' }));
                  setMostrarOutras(false);
                  setSubcategoriaFiltroVisual('TODAS');
                }}
              >
                <span className="text-xs font-medium">Armações</span>
                <span className="text-[10px] font-normal opacity-70 leading-tight">
                  {contagemArmacoesVisiveis.skus.toLocaleString('pt-BR')} SKUs · {contagemArmacoesVisiveis.pecas.toLocaleString('pt-BR')} peças
                </span>
              </Button>

              {/* Outras categorias — colapsadas por default */}
              {!mostrarOutras ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground text-xs"
                  onClick={() => setMostrarOutras(true)}
                >
                  Ver outras categorias ›
                </Button>
              ) : (
                <>
                  {contagemPorCategoria.produtos.skus > 0 && (
                    <Button
                      variant={filters.categoria === 'PRODUTOS' ? 'default' : 'outline'}
                      size="sm"
                      className="flex flex-col h-auto py-1.5 px-3 items-center gap-0"
                      onClick={() => setFilters(prev => ({ ...prev, categoria: 'PRODUTOS' }))}
                    >
                      <span className="text-xs font-medium">Produtos</span>
                      <span className="text-[10px] font-normal opacity-70 leading-tight">
                        {contagemPorCategoria.produtos.skus.toLocaleString('pt-BR')} SKUs · {contagemPorCategoria.produtos.pecas.toLocaleString('pt-BR')} peças
                      </span>
                    </Button>
                  )}

                  {contagemPorCategoria.lentes_contato.skus > 0 && (
                    <Button
                      variant={filters.categoria === 'LENTES_CONTATO' ? 'default' : 'outline'}
                      size="sm"
                      className="flex flex-col h-auto py-1.5 px-3 items-center gap-0"
                      onClick={() => setFilters(prev => ({ ...prev, categoria: 'LENTES_CONTATO' }))}
                    >
                      <span className="text-xs font-medium">Lentes de Contato</span>
                      <span className="text-[10px] font-normal opacity-70 leading-tight">
                        {contagemPorCategoria.lentes_contato.skus.toLocaleString('pt-BR')} SKUs · {contagemPorCategoria.lentes_contato.pecas.toLocaleString('pt-BR')} peças
                      </span>
                    </Button>
                  )}

                  {contagemPorCategoria.outros.skus > 0 && (
                    <Button
                      variant={filters.categoria === 'OUTROS' ? 'default' : 'outline'}
                      size="sm"
                      className="flex flex-col h-auto py-1.5 px-3 items-center gap-0"
                      onClick={() => setFilters(prev => ({ ...prev, categoria: 'OUTROS' }))}
                    >
                      <span className="text-xs font-medium">Outros</span>
                      <span className="text-[10px] font-normal opacity-70 leading-tight">
                        {contagemPorCategoria.outros.skus.toLocaleString('pt-BR')} SKUs · {contagemPorCategoria.outros.pecas.toLocaleString('pt-BR')} peças
                      </span>
                    </Button>
                  )}

                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground text-xs"
                    onClick={() => {
                      setMostrarOutras(false);
                      setFilters(prev => ({ ...prev, categoria: 'ARMACOES' }));
                    }}
                  >
                    ‹ Ocultar
                  </Button>
                </>
              )}
            </div>
            {filters.categoria === 'ARMACOES' && (
              <div className="flex flex-wrap gap-2 items-center pt-1">
                <span className="text-sm text-muted-foreground">Filtrar:</span>
                {(['TODAS', 'AR_RX', 'AR_SOLAR'] as const).map((sub) => (
                  <Button
                    key={sub}
                    variant={subcategoriaFiltroVisual === sub ? 'secondary' : 'ghost'}
                    size="sm"
                    className="text-xs h-7 px-3"
                    onClick={() => setSubcategoriaFiltroVisual(sub)}
                  >
                    {sub === 'TODAS' ? 'Todas' : sub === 'AR_RX' ? 'RX' : 'Solar'}
                  </Button>
                ))}
              </div>
            )}
            </>
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
          {/* Info da Empresa (B.2) */}
          {empresaSelecionada && (
            <Alert className="bg-primary/5 border-primary/20">
              <Info className="h-4 w-4 text-primary" />
              <AlertDescription>
                <div><strong>{empresaSelecionada.nome}</strong></div>
                <div className="text-xs mt-1">
                  Armações: {metricas.totalPecas.toLocaleString('pt-BR')} peças • {metricas.totalSkusComEstoque.toLocaleString('pt-BR')} SKUs <span className="text-muted-foreground">(posição agora)</span>
                </div>
                <div className="text-xs">
                  Vendas / giro: últimos {diasPeriodo} dias
                </div>
              </AlertDescription>
            </Alert>
          )}

          {/* Visão informativa — exibido quando categoria ≠ ARMACOES */}
          {filters.categoria !== 'ARMACOES' && (
            <Alert className="border-muted-foreground/20 bg-muted/40">
              <Info className="h-4 w-4 text-muted-foreground" />
              <AlertDescription className="text-muted-foreground text-sm">
                Visão informativa — gestão de mix se aplica apenas a Armações
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

          {/* Indicador de dados compartilhados */}
          <EstoqueLoadStatus
            empresaNome={empresaSelecionada?.nome}
            onRecarregar={carregarDados}
            loading={loading}
          />

          {/* KPIs */}
          <EstoqueKPICards
            metricas={metricasVisiveis}
            categoria={filters.categoria}
            estoqueEfetivoArmacoes={estoqueEfetivoVisivel}
            filtroAtivo={subcategoriaFiltroVisual}
          />

          {/* Tabela */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">
                Detalhamento do Estoque
                <Badge variant="secondary" className="ml-2">
                  {filters.categoria === 'ARMACOES' ? 'Armações' :
                   filters.categoria === 'LENTES_CONTATO' ? 'Lentes de Contato' :
                   filters.categoria === 'PRODUTOS' ? 'Produtos' : 'Outros'}
                </Badge>
              </CardTitle>
              <CardDescription>
                {itensParaTabela.length} itens com estoque positivo
                {subcategoriaFiltroVisual !== 'TODAS' && (
                  <span className="ml-1 text-muted-foreground">
                    ({subcategoriaFiltroVisual === 'AR_RX' ? 'RX' : 'Solar'})
                  </span>
                )}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <EstoqueTable itens={itensParaTabela} />
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
