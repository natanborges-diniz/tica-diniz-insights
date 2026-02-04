// src/pages/estoque/VisaoEstoquePage.tsx
// Página: Visão Estoque - lista detalhada de SKUs com KPIs

import { useState, useMemo } from "react";
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

function EstoqueTable({ itens }: { itens: ItemEstoque[] }) {
  const exportColumns: ExportColumn[] = [
    { key: 'codSku', header: 'Código SKU' },
    { key: 'codigoBarra', header: 'Cód. Barras' },
    { key: 'descricao', header: 'Descrição' },
    { key: 'marca', header: 'Marca' },
    { key: 'fornecedor', header: 'Fornecedor' },
    { key: 'categoria', header: 'Categoria' },
    { key: 'estoqueAtual', header: 'Estoque', format: formatters.number },
    { key: 'valorEstoqueCusto', header: 'Valor Custo', format: formatters.currency },
    { key: 'diasEmEstoque', header: 'Dias em Estoque', format: (v) => formatarDiasEmEstoque(v) },
    { key: 'curvaABC', header: 'Curva ABC' },
    { key: 'acaoSugerida', header: 'Ação Sugerida' },
  ];

  if (itens.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        Nenhum item encontrado com os filtros selecionados
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <DataTableToolbar
        exportOptions={{
          filename: `estoque_${new Date().toISOString().split('T')[0]}`,
          title: 'Detalhamento de Estoque',
          columns: exportColumns,
          data: itens,
        }}
      >
        <span className="text-sm text-muted-foreground">
          {itens.length.toLocaleString('pt-BR')} itens • Posição: {new Date().toLocaleDateString('pt-BR')} (tempo real)
        </span>
      </DataTableToolbar>

      <div className="rounded-md border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left p-3 font-medium">Cód. Barras</th>
              <th className="text-left p-3 font-medium">Descrição</th>
              <th className="text-left p-3 font-medium">Marca</th>
              <th className="text-left p-3 font-medium">Fornecedor</th>
              <th className="text-left p-3 font-medium">Cat.</th>
              <th className="text-right p-3 font-medium">Estoque</th>
              <th className="text-right p-3 font-medium">Valor Custo</th>
              <th className="text-right p-3 font-medium">Dias em Estoque</th>
              <th className="text-left p-3 font-medium">Curva</th>
              <th className="text-left p-3 font-medium">Ação</th>
            </tr>
          </thead>
          <tbody>
            {itens.slice(0, 100).map((item, index) => (
              <tr 
                key={`${item.codSku}-${index}`} 
                className={`border-t hover:bg-muted/30 ${item.isDeadStock ? 'bg-destructive/5' : ''}`}
              >
                <td className="p-3 font-mono text-xs">{item.codigoBarra || item.codSku}</td>
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
                  <span className={item.diasEmEstoque > 180 ? 'text-destructive font-medium' : ''}>
                    {formatarDiasEmEstoque(item.diasEmEstoque)}
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
    </div>
  );
}

export default function VisaoEstoquePage() {
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

  const empresaSelecionada = empresas.find(e => 
    filters.empresa !== null && 
    (e.codEmpresa === filters.empresa || String(e.codEmpresa) === String(filters.empresa))
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Package className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Visão Estoque</h1>
            <p className="text-sm text-muted-foreground">Lista detalhada de SKUs com KPIs</p>
          </div>
        </div>
        {empresas.length > 0 && (
          <OtbFornecedorMarcaConfig marcasSemFornecedor={marcasSemFornecedor} />
        )}
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
