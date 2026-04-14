// src/pages/estoque/AnaliseOTBPage.tsx
// Página: Plano de Compra — Mix Ideal, Decisão por Marca e Estoque Doente

import { useState, useMemo } from "react";
import { useEstoqueUnificado, type ResumoMarca, type GrupoEstoqueDoente, type MixComparativo, type DecisaoMarca } from "@/hooks/useEstoqueUnificado";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { OtbFornecedorMarcaConfig } from "@/components/otb/OtbFornecedorMarcaConfig";
import { DataTableToolbar } from "@/components/ui/data-table-toolbar";
import { formatters, ExportColumn } from "@/utils/exportData";
import { 
  ShoppingCart, AlertCircle, Info, Search, RefreshCw, BoxIcon,
  ChevronDown, ChevronRight, TrendingDown, DollarSign, Target,
  Repeat, Sparkles, XCircle, Download, AlertTriangle, Flame, Snowflake
} from "lucide-react";

// ============================================
// COMPONENTES INTERNOS
// ============================================

const categoriaLabels: Record<string, string> = {
  ARMACOES: 'Armações',
  LENTES: 'Lentes',
  ACESSORIOS: 'Acessórios',
  OUTROS: 'Outros',
};

const decisaoConfig: Record<DecisaoMarca, { label: string; icon: React.ReactNode; className: string }> = {
  REPOR_REFERENCIA: {
    label: 'Repor Referências',
    icon: <Repeat className="h-3.5 w-3.5" />,
    className: 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-700',
  },
  RENOVAR_COLECAO: {
    label: 'Renovar Coleção',
    icon: <Sparkles className="h-3.5 w-3.5" />,
    className: 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-700',
  },
  AVALIAR_DESCONTINUACAO: {
    label: 'Avaliar Descontinuação',
    icon: <XCircle className="h-3.5 w-3.5" />,
    className: 'bg-red-100 text-red-800 border-red-300 dark:bg-red-900/30 dark:text-red-300 dark:border-red-700',
  },
};

function MixIdealSection({ mixCategoria, mixMarca }: { mixCategoria: MixComparativo[]; mixMarca: MixComparativo[] }) {
  if (mixCategoria.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Target className="h-5 w-5 text-primary" />
          Mix Ideal da Loja
        </CardTitle>
        <CardDescription>Comparação entre vendas (últimos 6 meses) e estoque atual</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Por Categoria */}
        <div>
          <h4 className="text-sm font-medium mb-3">Por Categoria</h4>
          <div className="space-y-3">
            {mixCategoria.map(m => (
              <MixBar key={m.chave} label={categoriaLabels[m.chave] || m.chave} ideal={m.percentualIdeal} atual={m.percentualAtual} gap={m.gap} />
            ))}
          </div>
        </div>

        {/* Top marcas com maior gap */}
        {mixMarca.length > 0 && (
          <div>
            <h4 className="text-sm font-medium mb-3">Top Marcas (maior desvio)</h4>
            <div className="space-y-2">
              {mixMarca.slice(0, 8).map(m => (
                <MixBar key={m.chave} label={m.chave} ideal={m.percentualIdeal} atual={m.percentualAtual} gap={m.gap} compact />
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function MixBar({ label, ideal, atual, gap, compact }: { label: string; ideal: number; atual: number; gap: number; compact?: boolean }) {
  const maxVal = Math.max(ideal, atual, 1);
  const isExcesso = gap < -2;
  const isFalta = gap > 2;

  return (
    <div className={`flex items-center gap-3 ${compact ? 'text-xs' : 'text-sm'}`}>
      <span className={`${compact ? 'w-24' : 'w-28'} font-medium truncate`} title={label}>{label}</span>
      <div className="flex-1 space-y-1">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground w-12 text-right">{ideal.toFixed(1)}%</span>
          <div className="flex-1 bg-muted rounded-full h-2">
            <div className="bg-primary/60 h-2 rounded-full" style={{ width: `${Math.min((ideal / maxVal) * 100, 100)}%` }} />
          </div>
          <span className="text-[10px] text-muted-foreground">Ideal</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground w-12 text-right">{atual.toFixed(1)}%</span>
          <div className="flex-1 bg-muted rounded-full h-2">
            <div className={`h-2 rounded-full ${isExcesso ? 'bg-orange-500' : isFalta ? 'bg-destructive' : 'bg-emerald-500'}`} style={{ width: `${Math.min((atual / maxVal) * 100, 100)}%` }} />
          </div>
          <span className="text-[10px] text-muted-foreground">Atual</span>
        </div>
      </div>
      <Badge variant="outline" className={`text-[10px] min-w-[60px] justify-center ${isExcesso ? 'border-orange-300 text-orange-700' : isFalta ? 'border-destructive text-destructive' : 'border-emerald-300 text-emerald-700'}`}>
        {gap > 0 ? `Falta ${gap.toFixed(1)}%` : gap < 0 ? `Exc. ${Math.abs(gap).toFixed(1)}%` : 'OK'}
      </Badge>
    </div>
  );
}

function AcoesCompraSection({ resumo }: { resumo: ResumoMarca[] }) {
  const [expandido, setExpandido] = useState<string | null>(null);

  const resumoDecisao = useMemo(() => {
    const repor = resumo.filter(r => r.decisao === 'REPOR_REFERENCIA');
    const renovar = resumo.filter(r => r.decisao === 'RENOVAR_COLECAO');
    const descontinuar = resumo.filter(r => r.decisao === 'AVALIAR_DESCONTINUACAO');
    return { repor, renovar, descontinuar };
  }, [resumo]);

  const exportColumns: ExportColumn[] = [
    { key: 'marca', header: 'Marca' },
    { key: 'pecasEstoque', header: 'Peças Estoque', format: formatters.number },
    { key: 'qtdVendidos6m', header: 'Vendas 6m', format: formatters.number },
    { key: 'totalVendido6m', header: 'Faturamento 6m', format: formatters.currency },
    { key: 'otbTotal', header: 'OTB', format: formatters.number },
    { key: 'mediaDiasEmEstoque', header: 'Dias Médio Estoque', format: formatters.number },
    { key: 'decisao', header: 'Decisão' },
  ];

  if (resumo.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <ShoppingCart className="h-5 w-5 text-primary" />
          Ações de Compra por Marca
        </CardTitle>
        <CardDescription>Decisão baseada em giro e curva ABC dos últimos 6 meses</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Resumo rápido */}
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 dark:bg-emerald-900/20 dark:border-emerald-800 p-3 text-center">
            <div className="text-2xl font-bold text-emerald-700 dark:text-emerald-400">{resumoDecisao.repor.length}</div>
            <div className="text-xs text-emerald-600 dark:text-emerald-400">Repor Referências</div>
          </div>
          <div className="rounded-lg border border-blue-200 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-800 p-3 text-center">
            <div className="text-2xl font-bold text-blue-700 dark:text-blue-400">{resumoDecisao.renovar.length}</div>
            <div className="text-xs text-blue-600 dark:text-blue-400">Renovar Coleção</div>
          </div>
          <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-900/20 dark:border-red-800 p-3 text-center">
            <div className="text-2xl font-bold text-red-700 dark:text-red-400">{resumoDecisao.descontinuar.length}</div>
            <div className="text-xs text-red-600 dark:text-red-400">Descontinuar</div>
          </div>
        </div>

        <DataTableToolbar
          exportOptions={{
            filename: `plano_compra_${new Date().toISOString().split('T')[0]}`,
            title: 'Plano de Compra por Marca',
            columns: exportColumns,
            data: resumo,
          }}
        >
          <span className="text-sm text-muted-foreground">{resumo.length} marcas analisadas</span>
        </DataTableToolbar>

        {/* Tabela agrupável */}
        <div className="rounded-md border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left p-3 font-medium w-8"></th>
                <th className="text-left p-3 font-medium">Marca</th>
                <th className="text-right p-3 font-medium">Peças</th>
                <th className="text-right p-3 font-medium">Vendas 6m</th>
                <th className="text-right p-3 font-medium">Faturamento</th>
                <th className="text-right p-3 font-medium">OTB</th>
                <th className="text-right p-3 font-medium">Dias Médio</th>
                <th className="text-left p-3 font-medium">Decisão</th>
              </tr>
            </thead>
            <tbody>
              {resumo.map((r) => {
                const config = decisaoConfig[r.decisao];
                const isOpen = expandido === r.marca;
                return (
                  <Collapsible key={r.marca} open={isOpen} onOpenChange={(open) => setExpandido(open ? r.marca : null)} asChild>
                    <>
                      <CollapsibleTrigger asChild>
                        <tr className="border-t hover:bg-muted/30 cursor-pointer">
                          <td className="p-3">
                            {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          </td>
                          <td className="p-3 font-medium">{r.marca}</td>
                          <td className="p-3 text-right">{r.pecasEstoque}</td>
                          <td className="p-3 text-right">{r.qtdVendidos6m}</td>
                          <td className="p-3 text-right text-muted-foreground">
                            {r.totalVendido6m.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                          </td>
                          <td className="p-3 text-right font-medium">
                            <span className={r.otbTotal > 0 ? 'text-primary' : ''}>{r.otbTotal}</span>
                          </td>
                          <td className="p-3 text-right text-muted-foreground">
                            {r.mediaDiasEmEstoque < 999 ? `${Math.round(r.mediaDiasEmEstoque)}d` : '-'}
                          </td>
                          <td className="p-3">
                            <Badge variant="outline" className={`text-xs gap-1 ${config.className}`}>
                              {config.icon}
                              {config.label}
                            </Badge>
                          </td>
                        </tr>
                      </CollapsibleTrigger>
                      <CollapsibleContent asChild>
                        <tr>
                          <td colSpan={8} className="bg-muted/20 p-0">
                            <div className="p-3 max-h-[200px] overflow-y-auto">
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="text-muted-foreground">
                                    <th className="text-left p-1">SKU</th>
                                    <th className="text-left p-1">Descrição</th>
                                    <th className="text-right p-1">Estoque</th>
                                    <th className="text-right p-1">Vendidos</th>
                                    <th className="text-right p-1">Dias</th>
                                    <th className="text-left p-1">Curva</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {r.skus.slice(0, 20).map(sku => (
                                    <tr key={sku.codSku} className="border-t border-muted">
                                      <td className="p-1 font-mono">{sku.codigoBarra || sku.codSku}</td>
                                      <td className="p-1 truncate max-w-[200px]" title={sku.descricao}>
                                        {sku.isDeadStock && <AlertTriangle className="h-3 w-3 inline mr-1 text-destructive" />}
                                        {sku.descricao}
                                      </td>
                                      <td className="p-1 text-right">{sku.estoqueAtual}</td>
                                      <td className="p-1 text-right">{sku.qtdVendidos}</td>
                                      <td className="p-1 text-right">{sku.diasEmEstoque || '-'}</td>
                                      <td className="p-1">
                                        <Badge variant={sku.curvaABC === 'A' ? 'default' : sku.curvaABC === 'B' ? 'secondary' : 'outline'} className="text-[10px]">
                                          {sku.curvaABC}
                                        </Badge>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                              {r.skus.length > 20 && (
                                <p className="text-xs text-muted-foreground text-center mt-2">+{r.skus.length - 20} SKUs</p>
                              )}
                            </div>
                          </td>
                        </tr>
                      </CollapsibleContent>
                    </>
                  </Collapsible>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function EstoqueDoenteSection({ grupos }: { grupos: GrupoEstoqueDoente[] }) {
  if (grupos.length === 0) return null;

  const totalPecas = grupos.reduce((acc, g) => acc + g.pecas, 0);
  const totalValor = grupos.reduce((acc, g) => acc + g.valorCusto, 0);

  const faixaIcons: Record<string, React.ReactNode> = {
    PROMOCAO_20: <AlertTriangle className="h-4 w-4 text-yellow-600" />,
    LIQUIDACAO_30: <Flame className="h-4 w-4 text-orange-600" />,
    LIQUIDACAO_50: <Flame className="h-4 w-4 text-destructive" />,
    DESCARTE: <XCircle className="h-4 w-4 text-destructive" />,
    REVISAO_URGENTE: <AlertCircle className="h-4 w-4 text-destructive" />,
  };

  // Collect all items for export
  const todosItens = grupos.flatMap(g => g.itens.map(i => ({
    ...i,
    faixa: g.label,
    descontoSugerido: g.desconto,
  })));

  const exportColumns: ExportColumn[] = [
    { key: 'faixa', header: 'Ação' },
    { key: 'codSku', header: 'Código SKU' },
    { key: 'descricao', header: 'Descrição' },
    { key: 'marca', header: 'Marca' },
    { key: 'estoqueAtual', header: 'Estoque', format: formatters.number },
    { key: 'valorEstoqueCusto', header: 'Valor Custo', format: formatters.currency },
    { key: 'diasEmEstoque', header: 'Dias Parado', format: formatters.number },
    { key: 'descontoSugerido', header: 'Desconto Sugerido' },
  ];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <Snowflake className="h-5 w-5 text-info" />
              Tratamento do Estoque Doente
            </CardTitle>
            <CardDescription>
              {totalPecas} peças • {totalValor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} em custo em risco
            </CardDescription>
          </div>
          <DataTableToolbar
            exportOptions={{
              filename: `estoque_doente_${new Date().toISOString().split('T')[0]}`,
              title: 'Estoque Doente - Ação Comercial',
              columns: exportColumns,
              data: todosItens,
            }}
          >
            <Button variant="outline" size="sm" className="gap-1">
              <Download className="h-4 w-4" />
              Exportar Lista
            </Button>
          </DataTableToolbar>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {grupos.map(grupo => (
            <div key={grupo.faixa} className="rounded-lg border p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  {faixaIcons[grupo.faixa]}
                  <span className={`font-semibold text-sm ${grupo.cor}`}>{grupo.label}</span>
                  <Badge variant="outline" className="text-xs">{grupo.pecas} pçs</Badge>
                  {grupo.desconto !== '-' && (
                    <Badge variant="secondary" className="text-xs">Desconto sugerido: {grupo.desconto}</Badge>
                  )}
                </div>
                <span className="text-sm font-medium text-muted-foreground">
                  {grupo.valorCusto.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </span>
              </div>
              <div className="text-xs text-muted-foreground">
                Marcas: {grupo.marcas.slice(0, 5).join(', ')}{grupo.marcas.length > 5 ? ` +${grupo.marcas.length - 5}` : ''}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================
// PILARES RESUMO (do antigo OtbPainelAcoes simplificado)
// ============================================

function PilaresResumo({ itens, totalSkus }: { itens: ReturnType<typeof useEstoqueUnificado>['itensProcessados']; totalSkus: number }) {
  const resumo = useMemo(() => {
    const comEstoque = itens.filter(i => i.estoqueAtual > 0);
    
    const rupturaItens = itens.filter(i => i.classificacao === 'COMPRAR_URGENTE' || (i.curvaABC === 'A' && i.estoqueAtual === 0 && i.qtdVendidos > 0));
    const rupturaValor = rupturaItens.reduce((acc, i) => acc + i.totalVendido, 0);

    const capitalItens = comEstoque.filter(i => i.classificacao === 'EXCESSO' || (i.curvaABC === 'C' && i.diasEmEstoque > 180));
    const capitalValor = capitalItens.reduce((acc, i) => acc + i.valorEstoqueCusto, 0);

    const doenteItens = comEstoque.filter(i => i.diasEmEstoque >= 180);
    const doenteValor = doenteItens.reduce((acc, i) => acc + i.valorEstoqueCusto, 0);

    return { rupturaItens, rupturaValor, capitalItens, capitalValor, doenteItens, doenteValor };
  }, [itens]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <Card className="border-2 border-danger-muted bg-gradient-to-br from-danger-soft to-background">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2 text-danger">
              <TrendingDown className="h-5 w-5" />
              Risco de Ruptura
            </CardTitle>
            <Badge variant="destructive" className="text-lg px-3">{resumo.rupturaItens.length}</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-danger">
            R$ {(resumo.rupturaValor / 1000).toFixed(0)}k
          </div>
          <p className="text-xs text-muted-foreground">em potencial de perda</p>
          <Progress value={Math.min((resumo.rupturaItens.length / Math.max(totalSkus, 1)) * 100, 100)} className="mt-2 h-2 bg-danger-soft" />
        </CardContent>
      </Card>

      <Card className="border-2 border-info-muted bg-gradient-to-br from-info-soft to-background">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2 text-info">
              <DollarSign className="h-5 w-5" />
              Capital Parado
            </CardTitle>
            <Badge className="text-lg px-3 bg-info text-info-foreground">{resumo.capitalItens.length}</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-info">
            R$ {(resumo.capitalValor / 1000).toFixed(0)}k
          </div>
          <p className="text-xs text-muted-foreground">imobilizado em excesso</p>
          <Progress value={Math.min((resumo.capitalItens.length / Math.max(totalSkus, 1)) * 100, 100)} className="mt-2 h-2 bg-info-soft" />
        </CardContent>
      </Card>

      <Card className="border-2 border-warning-muted bg-gradient-to-br from-warning-soft to-background">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2 text-warning">
              <Snowflake className="h-5 w-5" />
              Estoque Doente
            </CardTitle>
            <Badge className="text-lg px-3 bg-warning text-warning-foreground">{resumo.doenteItens.length}</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-warning">
            R$ {(resumo.doenteValor / 1000).toFixed(0)}k
          </div>
          <p className="text-xs text-muted-foreground">+180 dias parado</p>
          <Progress value={Math.min((resumo.doenteItens.length / Math.max(totalSkus, 1)) * 100, 100)} className="mt-2 h-2 bg-warning-soft" />
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================
// PÁGINA PRINCIPAL
// ============================================

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
    mixIdealCategoria,
    mixIdealMarca,
    resumoPorMarca,
    estoqueDoenteAgrupado,
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
          <ShoppingCart className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Plano de Compra</h1>
            <p className="text-sm text-muted-foreground">Mix ideal, reposição e tratamento de estoque</p>
          </div>
        </div>
        {empresas.length > 0 && (
          <OtbFornecedorMarcaConfig marcasSemFornecedor={marcasSemFornecedor} />
        )}
      </div>

      {/* Parâmetros */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Parâmetros de Análise</CardTitle>
          <CardDescription>Selecione a empresa e período (padrão: 180 dias)</CardDescription>
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
                  fornecedor: 'TODOS', marca: 'TODAS', acao: 'TODAS', categoria: 'TODOS', curvaABC: null, busca: '',
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
                <Input type="date" value={filters.dataInicio} onChange={(e) => setFilters(prev => ({ ...prev, dataInicio: e.target.value }))} className="w-[140px]" />
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block">Data Fim</label>
                <Input type="date" value={filters.dataFim} onChange={(e) => setFilters(prev => ({ ...prev, dataFim: e.target.value }))} className="w-[140px]" />
              </div>
            </div>

            <Button onClick={carregarDados} disabled={loading || filters.empresa === null} className="min-w-[140px]">
              {loading ? (<><RefreshCw className="h-4 w-4 mr-2 animate-spin" />Carregando...</>) : (<><RefreshCw className="h-4 w-4 mr-2" />Carregar Dados</>)}
            </Button>
          </div>

          {/* Filtros por Categoria */}
          {itensProcessados.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-2">
              <span className="text-sm text-muted-foreground self-center mr-2">Categoria:</span>
              {[
                { key: 'TODOS' as const, label: 'Todos', count: itensProcessados.length },
                { key: 'ARMACOES' as const, label: 'Armações', count: contagemPorCategoria.armacoes },
                { key: 'LENTES' as const, label: 'Lentes', count: contagemPorCategoria.lentes },
                { key: 'ACESSORIOS' as const, label: 'Acessórios', count: contagemPorCategoria.acessorios },
              ].map(cat => (
                <Button key={cat.key} variant={filters.categoria === cat.key ? 'default' : 'outline'} size="sm"
                  onClick={() => setFilters(prev => ({ ...prev, categoria: cat.key }))}>
                  {cat.label} ({cat.count})
                </Button>
              ))}
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
          <div className="grid grid-cols-3 gap-4">
            {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-32" />)}
          </div>
          <Skeleton className="h-[300px]" />
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
                {' '}{metricas.totalPecas.toLocaleString('pt-BR')} peças • 
                {' '}{metricas.totalSkusComEstoque} SKUs • 
                {' '}Período: {diasPeriodo} dias
              </AlertDescription>
            </Alert>
          )}

          {/* Pilares Resumo */}
          <PilaresResumo itens={itensProcessados} totalSkus={metricas.totalSkus} />

          {/* Seção 1: Mix Ideal */}
          <MixIdealSection mixCategoria={mixIdealCategoria} mixMarca={mixIdealMarca} />

          {/* Seção 2: Ações de Compra por Marca */}
          <AcoesCompraSection resumo={resumoPorMarca} />

          {/* Seção 3: Estoque Doente */}
          <EstoqueDoenteSection grupos={estoqueDoenteAgrupado} />
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
                Escolha uma empresa nos parâmetros acima e clique em "Carregar Dados" para visualizar o plano de compra.
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
