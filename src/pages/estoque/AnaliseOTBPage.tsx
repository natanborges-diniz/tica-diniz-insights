// src/pages/estoque/AnaliseOTBPage.tsx
// Página: Plano de Compra — KPIs, Mix Ideal, Relatório por Marca

import { useState, useMemo } from "react";
import { useEstoqueUnificado, type ResumoMarca, type MixComparativo, type DecisaoMarca } from "@/hooks/useEstoqueUnificado";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { OtbFornecedorMarcaConfig } from "@/components/otb/OtbFornecedorMarcaConfig";
import { PlanoCompraFiltros } from "@/components/otb/PlanoCompraFiltros";
import { ListaCompraTable } from "@/components/otb/ListaCompraTable";
import { EstoqueLoadStatus } from "@/components/estoque/EstoqueLoadStatus";
import { DataTableToolbar } from "@/components/ui/data-table-toolbar";
import { formatters, ExportColumn } from "@/utils/exportData";
import { 
  ShoppingCart, AlertCircle, Info, RefreshCw, BoxIcon,
  ChevronDown, ChevronRight, Target, Download,
  Repeat, Sparkles, XCircle, AlertTriangle, Package, TrendingUp, DollarSign,
  Eye, HelpCircle, Replace
} from "lucide-react";

// ============================================
// KPIs
// ============================================

function KPICards({
  metricas,
  comprar,
}: {
  metricas: ReturnType<typeof useEstoqueUnificado>['metricas'];
  comprar: { pecas: number; valor: number; skus: number; urgentes: number };
}) {
  const coberturaMedia = useMemo(() => {
    const vendaDiariaTotal = metricas.totalVendido6mPecas / Math.max(1, metricas.diasPeriodo);
    if (vendaDiariaTotal <= 0) return 0;
    return Math.round(metricas.totalPecas / vendaDiariaTotal);
  }, [metricas]);

  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
      <Card>
        <CardContent className="pt-5 pb-4">
          <div className="flex items-center gap-2 mb-1">
            <ShoppingCart className="h-4 w-4 text-primary" />
            <span className="text-sm text-muted-foreground">A Comprar Agora</span>
          </div>
          <div className="text-2xl font-bold text-primary">{comprar.pecas.toLocaleString('pt-BR')}</div>
          <p className="text-xs text-muted-foreground">
            {comprar.skus} SKUs • {comprar.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })}
            {comprar.urgentes > 0 && <span className="block text-destructive font-medium">{comprar.urgentes} urgentes</span>}
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-5 pb-4">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="h-4 w-4 text-primary" />
            <span className="text-sm text-muted-foreground">Vendidas (6m)</span>
          </div>
          <div className="text-2xl font-bold">{metricas.totalVendido6mPecas.toLocaleString('pt-BR')}</div>
          <p className="text-xs text-muted-foreground">peças nos últimos 180 dias</p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-5 pb-4">
          <div className="flex items-center gap-2 mb-1">
            <Package className="h-4 w-4 text-info" />
            <span className="text-sm text-muted-foreground">Em Estoque</span>
          </div>
          <div className="text-2xl font-bold">{metricas.totalPecas.toLocaleString('pt-BR')}</div>
          <p className="text-xs text-muted-foreground">{metricas.totalSkusComEstoque} SKUs distintos</p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-5 pb-4">
          <div className="flex items-center gap-2 mb-1">
            <BoxIcon className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Cobertura Média</span>
          </div>
          <div className="text-2xl font-bold">{coberturaMedia > 0 ? `${coberturaMedia}d` : '—'}</div>
          <p className="text-xs text-muted-foreground">no ritmo atual de venda</p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-5 pb-4">
          <div className="flex items-center gap-2 mb-1">
            <DollarSign className="h-4 w-4 text-destructive" />
            <span className="text-sm text-muted-foreground">Capital em Risco</span>
          </div>
          <div className="text-2xl font-bold text-destructive">{metricas.deadStockValor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })}</div>
          <p className="text-xs text-muted-foreground">{metricas.deadStockPecas} peças doentes ({metricas.deadStockPercentual.toFixed(1)}%)</p>
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================
// MIX IDEAL
// ============================================

function MixIdealSection({ mix }: { mix: MixComparativo[] }) {
  if (mix.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Target className="h-5 w-5 text-primary" />
          Mix Ideal
        </CardTitle>
        <CardDescription>Vendas 6 meses vs estoque atual — por subcategoria</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {mix.map(m => {
            const isExcesso = m.gap < -2;
            const isFalta = m.gap > 2;
            return (
              <div key={m.chave} className="rounded-lg border p-3 space-y-2">
                <div className="font-medium text-sm">{m.chave}</div>
                <div className="flex items-baseline gap-2">
                  <span className="text-lg font-bold">{m.percentualAtual.toFixed(0)}%</span>
                  <span className="text-xs text-muted-foreground">atual</span>
                  <span className="text-xs text-muted-foreground">→ {m.percentualIdeal.toFixed(0)}% ideal</span>
                </div>
                <Badge 
                  variant="outline" 
                  className={`text-xs ${isExcesso ? 'border-orange-300 text-orange-700 dark:border-orange-700 dark:text-orange-400' : isFalta ? 'border-destructive text-destructive' : 'border-emerald-300 text-emerald-700 dark:border-emerald-700 dark:text-emerald-400'}`}
                >
                  {isFalta ? `↓ Falta ${m.gap.toFixed(1)}%` : isExcesso ? `↑ Excesso ${Math.abs(m.gap).toFixed(1)}%` : '✓ OK'}
                </Badge>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================
// DECISÃO CONFIG
// ============================================

const decisaoConfig: Record<DecisaoMarca, { label: string; icon: React.ReactNode; className: string; descricao: string }> = {
  REPOR_REFERENCIA: {
    label: 'Repor',
    icon: <Repeat className="h-3.5 w-3.5" />,
    className: 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-700',
    descricao: 'Marca saudável — recomprar mesmas referências',
  },
  RENOVAR_COLECAO: {
    label: 'Renovar',
    icon: <Sparkles className="h-3.5 w-3.5" />,
    className: 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-700',
    descricao: 'Marca relevante mas grade envelhecida — trocar referências',
  },
  AVALIAR_DESCONTINUACAO: {
    label: 'Descontinuar',
    icon: <XCircle className="h-3.5 w-3.5" />,
    className: 'bg-red-100 text-red-800 border-red-300 dark:bg-red-900/30 dark:text-red-300 dark:border-red-700',
    descricao: 'Marca não justifica espaço — sair gradualmente',
  },
  SEM_HISTORICO: {
    label: 'Sem histórico',
    icon: <HelpCircle className="h-3.5 w-3.5" />,
    className: 'bg-muted text-muted-foreground border-border',
    descricao: 'Marca nova — aguardar mais 60d antes de julgar',
  },
};

// ============================================
// MARCA EXPANDIDA — 4 blocos: REPOR / TROCAR / OBSERVAR / LIQUIDAR
// ============================================

function MarcaExpandida({ r }: { r: ResumoMarca }) {
  const taxaPct = (r.taxaPerformance * 100).toFixed(0);
  const ctxAvaliar = r.decisao === 'AVALIAR_DESCONTINUACAO';
  const ctxSemHist = r.decisao === 'SEM_HISTORICO';

  return (
    <div className="p-4 space-y-3 bg-muted/10">
      {/* Header de performance da marca */}
      <div className="text-xs text-muted-foreground border-b pb-2">
        <span className="font-medium text-foreground">{r.skusComVenda} de {r.skusAtivos} SKUs giraram ({taxaPct}%)</span>
        {' · '}{(r.pctCurvaAB * 100).toFixed(0)}% em curva A/B
        {r.skusComVenda > 0 && <> · cobertura média {Math.round(r.mediaDiasEmEstoque)}d</>}
        {r.mediaDiasParado > 0 && <> · média {Math.round(r.mediaDiasParado)}d parados (sem venda)</>}
      </div>

      {ctxSemHist && (
        <p className="text-sm text-muted-foreground text-center py-2">
          Marca nova / sem histórico de venda nos últimos 180 dias. Aguardar antes de classificar.
        </p>
      )}

      {ctxAvaliar && r.itensDoentes.length > 0 && (
        <div className="rounded-lg border border-destructive/30 p-3">
          <h5 className="text-sm font-semibold text-destructive mb-2 flex items-center gap-1.5">
            <AlertTriangle className="h-4 w-4" />
            Liquidar / desmobilizar ({r.totalDoentePecas} pçs • {r.totalDoenteValor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })})
          </h5>
          <p className="text-xs text-muted-foreground mb-2">Marca marcada para descontinuar — sair com promoção/devolução.</p>
        </div>
      )}

      {/* Bloco REPOR */}
      {r.skusARepor.length > 0 && (
        <div className="rounded-lg border border-emerald-200 dark:border-emerald-800 p-3">
          <h5 className="text-sm font-semibold text-emerald-700 dark:text-emerald-400 mb-2 flex items-center gap-1.5">
            <Repeat className="h-4 w-4" />
            REPOR ({r.skusARepor.length} SKUs · {r.skusARepor.reduce((a, s) => a + s.qtdAComprar, 0)} pçs · {r.skusARepor.reduce((a,s) => a + s.valorCompra, 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })})
          </h5>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-muted-foreground">
                <th className="text-left p-1">Código</th>
                <th className="text-left p-1">Descrição</th>
                <th className="text-right p-1">Vendas 6m</th>
                <th className="text-right p-1">Estoque</th>
                <th className="text-right p-1" title="Mediana de dias entre entrada e venda">Giro med.</th>
                <th className="text-right p-1" title="Dias da última peça vendida (entrada → saída)">Últ. peça</th>
                <th className="text-right p-1">Cobert.</th>
                <th className="text-right p-1 font-bold">Comprar</th>
                <th className="text-left p-1">Curva</th>
              </tr>
            </thead>
            <tbody>
              {r.skusARepor.map(s => (
                <tr key={s.codSku} className="border-t border-muted">
                  <td className="p-1 font-mono">{s.codigoBarra || s.codSku}</td>
                  <td className="p-1 truncate max-w-[200px]" title={s.descricao}>{s.descricao}</td>
                  <td className="p-1 text-right">{s.qtdVendidos}</td>
                  <td className="p-1 text-right">{s.estoqueAtual}</td>
                  <td className="p-1 text-right" title={`Amostra: ${s.pecasGiroConsideradas} peça(s)`}>{s.diasGiroMediano != null ? `${Math.round(s.diasGiroMediano)}d` : '—'}</td>
                  <td className="p-1 text-right text-muted-foreground">{s.diasGiroUltimaPeca != null ? `${Math.round(s.diasGiroUltimaPeca)}d` : '—'}</td>
                  <td className="p-1 text-right">{s.coberturaDias >= 999 ? '—' : `${s.coberturaDias}d`}</td>
                  <td className="p-1 text-right font-bold text-emerald-700 dark:text-emerald-400">{s.qtdAComprar}</td>
                  <td className="p-1">
                    <Badge variant={s.curvaABC === 'A' ? 'default' : 'secondary'} className="text-[10px]">{s.curvaABC}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Bloco TROCAR (só em marca RENOVAR) */}
      {r.skusATrocar.length > 0 && (
        <div className="rounded-lg border border-blue-200 dark:border-blue-800 p-3">
          <h5 className="text-sm font-semibold text-blue-700 dark:text-blue-400 mb-2 flex items-center gap-1.5">
            <Replace className="h-4 w-4" />
            TROCAR ({r.skusATrocar.length} SKUs · liberar exposição)
          </h5>
          <p className="text-xs text-muted-foreground mb-2">
            Referências sem venda há ≥180d numa marca que ainda performa — substituir por novo modelo no próximo pedido.
          </p>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-muted-foreground">
                <th className="text-left p-1">Código</th>
                <th className="text-left p-1">Descrição</th>
                <th className="text-right p-1">Estoque</th>
                <th className="text-right p-1">Dias parado</th>
                <th className="text-left p-1">Sugestão</th>
              </tr>
            </thead>
            <tbody>
              {r.skusATrocar.slice(0, 10).map(s => (
                <tr key={s.codSku} className="border-t border-muted">
                  <td className="p-1 font-mono">{s.codigoBarra || s.codSku}</td>
                  <td className="p-1 truncate max-w-[200px]" title={s.descricao}>{s.descricao}</td>
                  <td className="p-1 text-right">{s.estoqueAtual}</td>
                  <td className="p-1 text-right text-muted-foreground">{s.diasEmEstoque}d</td>
                  <td className="p-1 text-blue-700 dark:text-blue-400">substituir por novo modelo</td>
                </tr>
              ))}
            </tbody>
          </table>
          {r.skusATrocar.length > 10 && (
            <p className="text-xs text-muted-foreground text-center mt-2">+{r.skusATrocar.length - 10} itens</p>
          )}
        </div>
      )}

      {/* Bloco OBSERVAR — só contador */}
      {r.skusObservar.length > 0 && (
        <div className="rounded-lg border p-2 flex items-center gap-2 text-xs text-muted-foreground">
          <Eye className="h-4 w-4" />
          OBSERVAR ({r.skusObservar.length} SKUs · estoque saudável, sem ação imediata)
        </div>
      )}

      {/* Bloco LIQUIDAR (em marcas REPOR/RENOVAR também) */}
      {!ctxAvaliar && r.itensDoentes.length > 0 && (
        <div className="rounded-lg border border-destructive/30 p-3">
          <h5 className="text-sm font-semibold text-destructive mb-2 flex items-center gap-1.5">
            <AlertTriangle className="h-4 w-4" />
            LIQUIDAR ({r.totalDoentePecas} pçs · {r.totalDoenteValor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })})
          </h5>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-muted-foreground">
                <th className="text-left p-1">Descrição</th>
                <th className="text-right p-1">Qtd</th>
                <th className="text-right p-1">Dias</th>
                <th className="text-left p-1">Ação</th>
              </tr>
            </thead>
            <tbody>
              {r.itensDoentes.slice(0, 10).map(d => (
                <tr key={d.codSku} className="border-t border-muted">
                  <td className="p-1 truncate max-w-[200px]" title={d.descricao}>{d.descricao}</td>
                  <td className="p-1 text-right">{d.estoqueAtual}</td>
                  <td className="p-1 text-right text-muted-foreground">{d.diasEmEstoque}d</td>
                  <td className="p-1">
                    <Badge variant="outline" className="text-[10px] border-destructive/50 text-destructive">{d.desconto} off</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {r.itensDoentes.length > 10 && (
            <p className="text-xs text-muted-foreground text-center mt-2">+{r.itensDoentes.length - 10} itens</p>
          )}
        </div>
      )}

      {/* Sem ações — mensagem clara */}
      {!ctxSemHist && r.skusARepor.length === 0 && r.skusATrocar.length === 0 && r.itensDoentes.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-2">
          Estoque saudável — sem reposição, troca ou liquidação pendentes nos últimos 180 dias.
        </p>
      )}
    </div>
  );
}

// ============================================
// RELATÓRIO POR MARCA
// ============================================

function RelatorioMarcas({ resumo }: { resumo: ResumoMarca[] }) {
  const [expandido, setExpandido] = useState<string | null>(null);

  const exportColumns: ExportColumn[] = [
    { key: 'marca', header: 'Marca' },
    { key: 'qtdVendidos6m', header: 'Vendas 6m', format: formatters.number },
    { key: 'pecasEstoque', header: 'Estoque', format: formatters.number },
    { key: 'totalVendido6m', header: 'Faturamento 6m', format: formatters.currency },
    { key: 'otbTotal', header: 'Gap Compra', format: formatters.number },
    { key: 'totalDoentePecas', header: 'Pçs Doentes', format: formatters.number },
    { key: 'decisao', header: 'Decisão' },
  ];

  if (resumo.length === 0) return null;

  const totais = useMemo(() => ({
    repor: resumo.filter(r => r.decisao === 'REPOR_REFERENCIA').length,
    renovar: resumo.filter(r => r.decisao === 'RENOVAR_COLECAO').length,
    descontinuar: resumo.filter(r => r.decisao === 'AVALIAR_DESCONTINUACAO').length,
    semHistorico: resumo.filter(r => r.decisao === 'SEM_HISTORICO').length,
  }), [resumo]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <ShoppingCart className="h-5 w-5 text-primary" />
              Relatório por Marca
            </CardTitle>
            <CardDescription>
              {resumo.length} marcas • {totais.repor} repor · {totais.renovar} renovar · {totais.descontinuar} descontinuar{totais.semHistorico > 0 && <> · {totais.semHistorico} sem histórico</>}
            </CardDescription>
          </div>
          <DataTableToolbar
            exportOptions={{
              filename: `plano_compra_${new Date().toISOString().split('T')[0]}`,
              title: 'Plano de Compra por Marca',
              columns: exportColumns,
              data: resumo,
            }}
          >
            <Button variant="outline" size="sm" className="gap-1">
              <Download className="h-4 w-4" />
              Exportar
            </Button>
          </DataTableToolbar>
        </div>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="w-8 p-3"></th>
                <th className="text-left p-3 font-medium">Marca</th>
                <th className="text-right p-3 font-medium">Vendas 6m</th>
                <th className="text-right p-3 font-medium">Estoque</th>
                <th className="text-right p-3 font-medium">Gap</th>
                <th className="text-right p-3 font-medium">Doente</th>
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
                          <td className="p-3 text-right">{r.qtdVendidos6m}</td>
                          <td className="p-3 text-right">{r.pecasEstoque}</td>
                          <td className="p-3 text-right">
                            {r.skusARepor.reduce((a, s) => a + s.qtdAComprar, 0) + r.pecasARenovar > 0 ? (
                              <span className="text-primary font-medium">+{r.skusARepor.reduce((a, s) => a + s.qtdAComprar, 0) + r.pecasARenovar}</span>
                            ) : '-'}
                          </td>
                          <td className="p-3 text-right">
                            {r.totalDoentePecas > 0 ? (
                              <span className="text-destructive">{r.totalDoentePecas}</span>
                            ) : '-'}
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
                          <td colSpan={7} className="p-0">
                            <MarcaExpandida r={r} />
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
    metricas,
    marcasSemFornecedor,
    mixIdealCategoria,
    mixIdealMarcas,
    lacunasNaoPreenchiveis,
    resumoPorMarca,
    listaCompraFlat,
    listaMarcas,
    listaFornecedores,
    carregarDados,
  } = useEstoqueUnificado();

  const empresaSelecionada = empresas.find(e =>
    filters.empresa !== null &&
    (e.codEmpresa === filters.empresa || String(e.codEmpresa) === String(filters.empresa))
  );

  // Contagens por subcategoria (totais, antes do filtro de subcategoria)
  const contSub = useMemo(() => ({
    rx: itensProcessados.filter(i => i.subcategoria === 'AR_RX').length,
    solar: itensProcessados.filter(i => i.subcategoria === 'AR_SOLAR').length,
    lentes: itensProcessados.filter(i => i.subcategoria === 'LENTES').length,
    lentesGrau: itensProcessados.filter(i => i.subcategoria === 'LENTES_GRAU').length,
    lentesContato: itensProcessados.filter(i => i.subcategoria === 'LENTES_CONTATO').length,
    acessorios: itensProcessados.filter(i => i.subcategoria === 'ACESSORIOS').length,
    outros: itensProcessados.filter(i => i.subcategoria === 'OUTROS').length,
  }), [itensProcessados]);

  const comprarKpi = useMemo(() => ({
    pecas: listaCompraFlat.reduce((a, i) => a + i.qtdAComprar, 0),
    valor: listaCompraFlat.reduce((a, i) => a + i.valorCompra, 0),
    urgentes: listaCompraFlat.filter(i => i.prioridade === 'URGENTE').length,
    skus: listaCompraFlat.length,
  }), [listaCompraFlat]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ShoppingCart className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Plano de Compra</h1>
            <p className="text-sm text-muted-foreground">Análise de 180 dias • Mix, reposição e tratamento de estoque</p>
          </div>
        </div>
        {empresas.length > 0 && (
          <OtbFornecedorMarcaConfig marcasSemFornecedor={marcasSemFornecedor} />
        )}
      </div>

      {/* Parâmetros — apenas empresa */}
      <Card>
        <CardContent className="pt-5 pb-4">
          <div className="flex flex-wrap gap-4 items-end">
            <div className="flex-1 min-w-[200px]">
              <label className="text-sm font-medium mb-2 block">Empresa</label>
              <Select
                value={filters.empresa !== null ? String(filters.empresa) : ""}
                onValueChange={(value) => setFilters(prev => ({
                  ...prev,
                  empresa: Number(value),
                  fornecedor: 'TODOS', marca: 'TODAS', acao: 'TODAS', categoria: 'TODOS', curvaABC: null, busca: '',
                  subcategoria: 'AR_RX', decisaoMarca: 'TODAS',
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

            <Button onClick={carregarDados} disabled={loading || filters.empresa === null} className="min-w-[140px]">
              {loading ? (<><RefreshCw className="h-4 w-4 mr-2 animate-spin" />Carregando...</>) : (<><RefreshCw className="h-4 w-4 mr-2" />Carregar Dados</>)}
            </Button>
          </div>
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
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-24" />)}
          </div>
          <Skeleton className="h-[200px]" />
          <Skeleton className="h-[400px]" />
        </div>
      )}

      {/* Conteúdo Principal */}
      {!loading && itensProcessados.length > 0 && (
        <>
          <EstoqueLoadStatus
            empresaNome={empresaSelecionada?.nome}
            onRecarregar={carregarDados}
            loading={loading}
          />
          {empresaSelecionada && (
            <Alert className="bg-primary/5 border-primary/20">
              <Info className="h-4 w-4 text-primary" />
              <AlertDescription>
                <div><strong>{empresaSelecionada.nome}</strong> • {metricas.marcasDistintas} marcas • {metricas.fornecedoresDistintos} fornecedores</div>
                <div className="text-xs mt-1">
                  Estoque: {metricas.totalPecas.toLocaleString('pt-BR')} peças • {metricas.totalSkusComEstoque.toLocaleString('pt-BR')} SKUs <span className="text-muted-foreground">(posição agora)</span>
                </div>
                <div className="text-xs">
                  Vendas / giro: últimos 180 dias
                  {filters.subcategoria !== 'TODAS' && (
                    <span> • Filtro: {({ AR_RX: 'Armações RX', AR_SOLAR: 'Solar / OC', LENTES: 'Lentes', LENTES_GRAU: 'Lentes de grau', LENTES_CONTATO: 'Lentes de contato', ACESSORIOS: 'Acessórios', OUTROS: 'Outros' } as Record<string, string>)[filters.subcategoria] ?? filters.subcategoria}</span>
                  )}
                </div>
              </AlertDescription>
            </Alert>
          )}

          {/* Filtros do Plano de Compra */}
          <PlanoCompraFiltros
            filters={filters}
            setFilters={setFilters}
            listaMarcas={listaMarcas}
            listaFornecedores={listaFornecedores}
            contagens={contSub}
          />

          {/* KPIs */}
          <KPICards metricas={metricas} comprar={comprarKpi} />

          {/* Mix Ideal por Marca (Fase 1) */}
          {mixIdealMarcas.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Target className="h-5 w-5 text-primary" />
                  Mix Ideal por Marca
                </CardTitle>
                <CardDescription>
                  Define quanto de estoque cada marca deve ter (antes de olhar SKU). Marcas com lacuna = 0 não geram compra, mesmo com SKUs zerados.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="rounded-md border overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 text-xs">
                      <tr>
                        <th className="text-left p-2">Marca</th>
                        <th className="text-left p-2">Curva</th>
                        <th className="text-right p-2">Vendas 6m</th>
                        <th className="text-right p-2">Estoque ideal</th>
                        <th className="text-right p-2">Estoque atual</th>
                        <th className="text-right p-2 font-bold">Lacuna</th>
                        <th className="text-left p-2">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {mixIdealMarcas.slice(0, 30).map(m => (
                        <tr key={m.marca} className="border-t hover:bg-muted/30">
                          <td className="p-2 font-medium">{m.marca}</td>
                          <td className="p-2"><Badge variant={m.curvaMarca === 'A' ? 'default' : 'secondary'} className="text-[10px]">{m.curvaMarca}</Badge></td>
                          <td className="p-2 text-right">{m.pecasVendidas6m}</td>
                          <td className="p-2 text-right">{m.incluidaNoMix ? m.pecasIdeais : '—'}</td>
                          <td className="p-2 text-right">{m.pecasAtuais}</td>
                          <td className="p-2 text-right font-bold">
                            {!m.incluidaNoMix ? <span className="text-muted-foreground">fora do mix</span>
                              : m.lacuna > 0 ? <span className="text-primary">+{m.lacuna}</span>
                              : <span className="text-emerald-600">0</span>}
                          </td>
                          <td className="p-2 text-xs">
                            {!m.incluidaNoMix ? <span className="text-muted-foreground">não compõe mix</span>
                              : m.lacuna === 0 ? <span className="text-emerald-700 dark:text-emerald-400">estoque suficiente — sem compra</span>
                              : <span className="text-primary">comprar até {m.lacuna} pç</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {mixIdealMarcas.length > 30 && (
                  <p className="text-xs text-muted-foreground text-center mt-2">+{mixIdealMarcas.length - 30} marcas</p>
                )}
              </CardContent>
            </Card>
          )}

          {/* Lacunas não preenchíveis (Fase 2) */}
          {lacunasNaoPreenchiveis.length > 0 && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                <div className="font-medium mb-1">Lacunas não preenchíveis — falta curadoria de novos modelos</div>
                <div className="text-xs text-muted-foreground">
                  {lacunasNaoPreenchiveis.length} marca{lacunasNaoPreenchiveis.length > 1 ? 's' : ''} com pool de SKUs bons (giro ≤ 90 d) insuficiente para preencher a lacuna do mix:
                  {' '}
                  {lacunasNaoPreenchiveis.slice(0, 5).map(l => `${l.marca} (faltam ${l.faltam})`).join(' • ')}
                  {lacunasNaoPreenchiveis.length > 5 && ` • +${lacunasNaoPreenchiveis.length - 5}`}
                </div>
              </AlertDescription>
            </Alert>
          )}

          {/* Lista de Compra Executável */}
          <ListaCompraTable itens={listaCompraFlat} />

          {/* Mix Ideal por Subcategoria */}
          <MixIdealSection mix={mixIdealCategoria} />

          {/* Relatório por Marca */}
          <RelatorioMarcas resumo={resumoPorMarca} />
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
                Escolha uma empresa acima e clique em "Carregar Dados" para visualizar o plano de compra.
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
