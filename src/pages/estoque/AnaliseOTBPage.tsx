// src/pages/estoque/AnaliseOTBPage.tsx
// Página: Análise OTB - Curva ABC e sugestões da IA

import { useMemo } from "react";
import { useEstoqueUnificado, ItemEstoque } from "@/hooks/useEstoqueUnificado";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { OtbFornecedorMarcaConfig } from "@/components/otb/OtbFornecedorMarcaConfig";
import { OtbCurvaABCChart } from "@/components/otb/OtbCurvaABCChart";
import { OtbSugestaoCoberturaIA } from "@/components/otb/OtbSugestaoCoberturaIA";
import { DataTableToolbar } from "@/components/ui/data-table-toolbar";
import { formatters, ExportColumn } from "@/utils/exportData";
import { 
  ShoppingCart, 
  AlertCircle, 
  Info,
  Search,
  RefreshCw,
  BoxIcon,
  AlertTriangle
} from "lucide-react";

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
    { key: 'estoqueAtual', header: 'Estoque', format: formatters.number },
    { key: 'otb', header: 'OTB', format: formatters.number },
    { key: 'otbValor', header: 'OTB Valor', format: formatters.currency },
    { key: 'curvaABC', header: 'Curva ABC' },
    { key: 'classificacao', header: 'Classificação' },
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
          filename: `otb_${new Date().toISOString().split('T')[0]}`,
          title: 'Análise OTB',
          columns: exportColumns,
          data: itens,
        }}
      >
        <span className="text-sm text-muted-foreground">
          {itens.length.toLocaleString('pt-BR')} itens
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
              <th className="text-right p-3 font-medium">Estoque</th>
              <th className="text-right p-3 font-medium">OTB</th>
              <th className="text-right p-3 font-medium">OTB Valor</th>
              <th className="text-left p-3 font-medium">Curva</th>
              <th className="text-left p-3 font-medium">Classificação</th>
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
                <td className="p-3 text-right font-medium">{item.estoqueAtual}</td>
                <td className="p-3 text-right font-medium">
                  <span className={item.otb > 0 ? 'text-primary' : ''}>
                    {item.otb}
                  </span>
                </td>
                <td className="p-3 text-right text-muted-foreground">
                  {item.otbValor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
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
                      item.classificacao === 'COMPRAR_URGENTE' ? 'destructive' : 
                      item.classificacao === 'COMPRAR' ? 'default' : 
                      item.classificacao === 'EXCESSO' ? 'secondary' : 'outline'
                    }
                    className="text-xs whitespace-nowrap"
                  >
                    {item.classificacao.replace('_', ' ')}
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

export default function AnaliseOTBPage() {
  const {
    empresas,
    loadingEmpresas,
    filters,
    setFilters,
    loading,
    error,
    itensProcessados,
    itensFiltrados,
    metricas,
    contagemPorCategoria,
    diasPeriodo,
    marcasSemFornecedor,
    carregarDados,
  } = useEstoqueUnificado();

  const empresaSelecionada = empresas.find(e => 
    filters.empresa !== null && 
    (e.codEmpresa === filters.empresa || String(e.codEmpresa) === String(filters.empresa))
  );

  // Código da empresa para IA
  const codEmpresaAtual = filters.empresa !== null && filters.empresa !== 'ALL'
    ? (typeof filters.empresa === 'number' ? filters.empresa : parseInt(String(filters.empresa)))
    : undefined;

  // Converter itensFiltrados para formato esperado pelo OtbCurvaABCChart
  const itensParaGraficos = useMemo(() => {
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
      diasDesdeUltimaVenda: item.diasEmEstoque,
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ShoppingCart className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Análise OTB</h1>
            <p className="text-sm text-muted-foreground">Curva ABC e sugestões da IA</p>
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
            Selecione a empresa e clique em Carregar Dados para análise OTB
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
              itens={itensParaGraficos} 
              selectedCurva={filters.curvaABC}
              onCurvaClick={(curva) => setFilters(prev => ({ 
                ...prev, 
                curvaABC: prev.curvaABC === curva ? null : curva 
              }))}
            />
            <OtbSugestaoCoberturaIA 
              itens={itensParaGraficos}
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
                para visualizar a análise OTB.
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
