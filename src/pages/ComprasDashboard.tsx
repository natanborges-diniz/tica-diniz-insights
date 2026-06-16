import { useState, useEffect, useMemo, useRef } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, FileDown, ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useUserEmpresas } from "@/hooks/useUserEmpresas";
import { useDefaultEmpresa } from "@/hooks/useDefaultEmpresa";
import { useCompras } from "@/hooks/useCompras";
import { ComprasFilters, MultiFilter, ComparativoMode } from "@/components/compras/ComprasFilters";
import { ComprasKPICards } from "@/components/compras/ComprasKPICards";
import { ComprasCharts } from "@/components/compras/ComprasCharts";
import { ComprasPivotTable } from "@/components/compras/ComprasPivotTable";
import { exportComprasReport } from "@/utils/exportComprasReport";
import type { PivotView } from "@/components/ui/pivot-table";
import { toast } from "sonner";

function firstDayOfMonth(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-01`;
}
function today(): string { return new Date().toISOString().split("T")[0]; }

function shiftRange(ini: string, fim: string, mode: ComparativoMode): { ini: string; fim: string } | null {
  if (mode === "none") return null;
  const d1 = new Date(ini), d2 = new Date(fim);
  if (mode === "mom") {
    const novoFim = new Date(d1); novoFim.setDate(novoFim.getDate() - 1);
    const dias = Math.round((d2.getTime() - d1.getTime()) / 86400000);
    const novoIni = new Date(novoFim); novoIni.setDate(novoFim.getDate() - dias);
    return { ini: novoIni.toISOString().split("T")[0], fim: novoFim.toISOString().split("T")[0] };
  }
  // yoy
  const novoIni = new Date(d1); novoIni.setFullYear(novoIni.getFullYear() - 1);
  const novoFim = new Date(d2); novoFim.setFullYear(novoFim.getFullYear() - 1);
  return { ini: novoIni.toISOString().split("T")[0], fim: novoFim.toISOString().split("T")[0] };
}

export default function ComprasDashboard() {
  const { codEmpresa: profileEmpresa } = useDefaultEmpresa();
  const { empresas, isLoading: loadingEmpresas, error: errorEmpresas, canSeeAll } = useUserEmpresas();

  const [selectedEmpresaId, setSelectedEmpresaId] = useState<number | null>(null);
  const [empresaTouched, setEmpresaTouched] = useState(false);
  const [dataInicio, setDataInicio] = useState(firstDayOfMonth);
  const [dataFim, setDataFim] = useState(today);
  const [fornecedorFilter, setFornecedorFilter] = useState<MultiFilter>({ mode: "include", values: [] });
  const [contaFilter, setContaFilter] = useState<MultiFilter>({ mode: "include", values: [] });
  const [formaPgtoFilter, setFormaPgtoFilter] = useState<MultiFilter>({ mode: "include", values: [] });
  const [comparativo, setComparativo] = useState<ComparativoMode>("none");

  useEffect(() => {
    if (!loadingEmpresas && !errorEmpresas && empresas.length > 0 && !empresaTouched && selectedEmpresaId === null) {
      const match = profileEmpresa ? empresas.find(e => e.codEmpresa === profileEmpresa) : null;
      setSelectedEmpresaId(match ? match.codEmpresa : empresas[0].codEmpresa);
    }
  }, [empresas, loadingEmpresas, errorEmpresas, selectedEmpresaId, profileEmpresa, empresaTouched]);

  const handleEmpresaChange = (id: number | null) => {
    setEmpresaTouched(true);
    setSelectedEmpresaId(id);
  };

  const { notas, isLoading, error } = useCompras({
    dataInicio, dataFim, empresa: selectedEmpresaId,
  });

  const comparRange = useMemo(() => shiftRange(dataInicio, dataFim, comparativo), [dataInicio, dataFim, comparativo]);
  const { notas: notasAnterior } = useCompras({
    dataInicio: comparRange?.ini ?? "",
    dataFim: comparRange?.fim ?? "",
    empresa: selectedEmpresaId,
  });

  const applyMultiFilter = <T,>(arr: T[], getter: (x: T) => string, f: MultiFilter): T[] => {
    if (f.values.length === 0) return arr;
    if (f.mode === "include") return arr.filter(x => f.values.includes(getter(x)));
    return arr.filter(x => !f.values.includes(getter(x)));
  };

  const filtered = useMemo(() => {
    let r = notas;
    r = applyMultiFilter(r, n => n.fornecedor, fornecedorFilter);
    r = applyMultiFilter(r, n => n.conta, contaFilter);
    r = applyMultiFilter(r, n => n.formaPagamento, formaPgtoFilter);
    return r;
  }, [notas, fornecedorFilter, contaFilter, formaPgtoFilter]);

  const filteredAnterior = useMemo(() => {
    if (!comparRange) return undefined;
    let r = notasAnterior;
    r = applyMultiFilter(r, n => n.fornecedor, fornecedorFilter);
    r = applyMultiFilter(r, n => n.conta, contaFilter);
    r = applyMultiFilter(r, n => n.formaPagamento, formaPgtoFilter);
    return r;
  }, [notasAnterior, fornecedorFilter, contaFilter, formaPgtoFilter, comparRange]);

  const chartRef = useRef<HTMLDivElement | null>(null);
  const [pivotView, setPivotView] = useState<PivotView | null>(null);
  const [generatingPdf, setGeneratingPdf] = useState(false);

  const handleExportPdf = async () => {
    try {
      setGeneratingPdf(true);
      const empresaNome = selectedEmpresaId === null
        ? "Todas as Empresas"
        : empresas.find(e => e.codEmpresa === selectedEmpresaId)?.nome ?? "—";

      const total = filtered.reduce((a, n) => a + n.valorTotal, 0);
      const fornecedores = new Set(filtered.map(n => n.fornecedor)).size;
      const parcelas = filtered.reduce((a, n) => a + n.qtdParcelas, 0);
      const prazoMedio = filtered.length > 0
        ? Math.round(filtered.reduce((a, n) => a + n.prazoMedioDias, 0) / filtered.length) : 0;

      const fmtFilter = (f: MultiFilter) =>
        f.values.length === 0 ? "" : `${f.mode === "exclude" ? "Excluir: " : ""}${f.values.join(", ")}`;

      await exportComprasReport({
        filename: `relatorio-compras-${today()}`,
        title: "Relatório de Compras",
        subtitle: `${empresaNome} • ${dataInicio} a ${dataFim}`,
        filters: {
          empresa: empresaNome,
          dataInicio, dataFim,
          fornecedores: fmtFilter(fornecedorFilter),
          contas: fmtFilter(contaFilter),
          formasPgto: fmtFilter(formaPgtoFilter),
          comparativo: comparativo === "none" ? "—" : comparativo.toUpperCase(),
        },
        kpis: {
          total,
          notas: filtered.length,
          fornecedores,
          ticket: filtered.length > 0 ? total / filtered.length : 0,
          parcelas,
          prazoMedio,
        },
        rows: filtered as unknown as Record<string, any>[],
        view: pivotView,
        chartElement: chartRef.current,
      });
      toast.success("Relatório PDF gerado");
    } catch (err) {
      console.error(err);
      toast.error("Falha ao gerar relatório");
    } finally {
      setGeneratingPdf(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4 flex items-center gap-4">
          <Link to="/home">
            <Button variant="ghost" size="icon"><ArrowLeft className="h-5 w-5" /></Button>
          </Link>
          <div className="flex items-center gap-2 flex-1">
            <ShoppingCart className="h-6 w-6 text-primary" />
            <h1 className="text-xl font-bold">Compras por Fornecedor</h1>
          </div>
          <Button
            variant="default"
            size="sm"
            onClick={handleExportPdf}
            disabled={generatingPdf || isLoading || filtered.length === 0}
          >
            <FileDown className="h-4 w-4 mr-2" />
            {generatingPdf ? "Gerando…" : "Relatório PDF"}
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 space-y-6">
        {loadingEmpresas && (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        )}

        {errorEmpresas && (
          <Card className="border-destructive">
            <CardContent className="pt-6">
              <p className="text-destructive font-medium">Erro ao carregar empresas</p>
              <p className="text-sm text-muted-foreground mt-1">{errorEmpresas}</p>
            </CardContent>
          </Card>
        )}

        {!loadingEmpresas && !errorEmpresas && empresas.length > 0 && (
          <>
            <Card>
              <CardHeader><CardTitle className="text-lg">Filtros</CardTitle></CardHeader>
              <CardContent>
                <ComprasFilters
                  empresas={empresas}
                  selectedEmpresaId={selectedEmpresaId}
                  onEmpresaChange={handleEmpresaChange}
                  canSeeAll={canSeeAll}
                  dataInicio={dataInicio}
                  dataFim={dataFim}
                  onDataInicioChange={setDataInicio}
                  onDataFimChange={setDataFim}
                  notas={notas}
                  fornecedorFilter={fornecedorFilter}
                  setFornecedorFilter={setFornecedorFilter}
                  contaFilter={contaFilter}
                  setContaFilter={setContaFilter}
                  formaPgtoFilter={formaPgtoFilter}
                  setFormaPgtoFilter={setFormaPgtoFilter}
                  comparativo={comparativo}
                  setComparativo={setComparativo}
                />
              </CardContent>
            </Card>

            {isLoading && (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
              </div>
            )}

            {error && (
              <Card className="border-destructive">
                <CardContent className="pt-6">
                  <p className="text-destructive font-medium">Erro ao carregar dados</p>
                  <p className="text-sm text-muted-foreground mt-1">{error}</p>
                </CardContent>
              </Card>
            )}

            {!isLoading && !error && (
              <>
                <ComprasKPICards notas={filtered} notasAnterior={filteredAnterior} />
                <div ref={chartRef} className="bg-background">
                  <ComprasCharts notas={filtered} />
                </div>
                <Card>
                  <CardHeader><CardTitle>Detalhamento</CardTitle></CardHeader>
                  <CardContent>
                    <ComprasPivotTable notas={filtered} onViewChange={setPivotView} />
                  </CardContent>
                </Card>
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}
