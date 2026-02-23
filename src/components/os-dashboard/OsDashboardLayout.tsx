// src/components/os-dashboard/OsDashboardLayout.tsx
// Layout do Monitor de Produção — empresa obrigatória, Bridge status banner

import React, { useEffect, useState, useCallback, useRef } from "react";
import { format } from "date-fns";
import { OsRecord } from "@/services/osService";
import { CampoDataOs } from "@/services/osService";
import { OsMetrics } from "@/utils/osMetrics";
import { OsFilterState, OsStatusFilter, OsApiFilters } from "@/hooks/useOsMonitor";
import { OsKpiCards } from "./OsKpiCards";
import { OsExpandableRow } from "./OsExpandableRow";
import { OsHubDetailSheet } from "@/components/os-hub/OsHubDetailSheet";
import { OsHubRecord } from "@/services/osHubService";
import { BridgeStatusBanner } from "@/components/ui/bridge-status-banner";
import { useModuleInsights } from "@/hooks/useModuleInsights";
import { ModuleInsightsPanel } from "@/components/ia/ModuleInsightsPanel";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { RefreshCw, Search, AlertTriangle, Info, CalendarIcon, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { BridgeHealth } from "@/hooks/useBridgeStatus";
import { Empresa } from "@/services/empresaService";

// ============================================================
// Tipo para o mapa de pedidos de fornecedor
// ============================================================
export type PedidoFornecedorInfo = {
  numero_pedido: string | null;
  fornecedor: string;
  status: string;
  created_at?: string | null;
};

// Debounced search input — Enter immediately applies
function DebouncedSearchInput({ value, onChange, className, placeholder }: {
  value: string; onChange: (v: string) => void; className?: string; placeholder?: string;
}) {
  const [local, setLocal] = useState(value);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { setLocal(value); }, [value]);

  const flush = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    onChange(local);
  }, [local, onChange]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    setLocal(v);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => onChange(v), 400);
  }, [onChange]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter") { e.preventDefault(); flush(); }
  }, [flush]);

  return <Input value={local} onChange={handleChange} onKeyDown={handleKeyDown} className={className} placeholder={placeholder} />;
}

const CAMPO_DATA_LABELS: Record<CampoDataOs, string> = {
  PREVISAO: "Data de Previsão",
  EMISSAO: "Data de Emissão",
  ENTRADA: "Data de Entrada",
  SAIDA: "Data de Saída",
};

type Props = {
  data: OsRecord[];
  rawData: OsRecord[];
  loading: boolean;
  error: string | null;
  loaded: boolean;
  metrics: OsMetrics;
  rawMetrics: OsMetrics;
  filters: OsFilterState;
  onChangeFilters: (next: Partial<OsFilterState>) => void;
  onLoad: (apiFilters: OsApiFilters) => void;
  onRefresh: () => void;
  empresasUnicas: string[];
  etapasUnicas: string[];
  /** Mapa cod_os → info do pedido de fornecedor (gerenciado pelo pai) */
  pedidosMap: Record<number, PedidoFornecedorInfo>;
  selectedHubOs: OsHubRecord | null;
  onOpenRecipe: (codOs: number, codEmpresa?: number) => void;
  onCloseRecipe: () => void;
  loadingRecipeCodOs: number | null;
  // Bridge status
  bridgeHealth: BridgeHealth;
  bridgeCircuitOpen: boolean;
  bridgeErrorMessage?: string | null;
  bridgeLastCheckedAt?: string | null;
  onBridgeRetry?: () => void;
  // Empresa selection
  empresasDisponiveis: Empresa[];
  empresasLoading: boolean;
  defaultCodEmpresa: number | null;
  canSeeAll: boolean;
};

// Module-level cache para seleções de layout — sobrevive à navegação
let _layoutCache: {
  campoData?: CampoDataOs;
  dataInicio?: Date;
  dataFim?: Date;
  empresa?: string;
} = {};

function DatePickerField({ label, date, onSelect }: { label: string; date: Date; onSelect: (d: Date) => void }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" className={cn("w-[160px] justify-start text-left font-normal text-sm")}>
            <CalendarIcon className="mr-2 h-4 w-4" />
            {format(date, "dd/MM/yyyy")}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={date}
            onSelect={(d) => d && onSelect(d)}
            initialFocus
            className={cn("p-3 pointer-events-auto")}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}

export const OsDashboardLayout: React.FC<Props> = ({
  data,
  rawData,
  loading,
  error,
  loaded,
  metrics,
  rawMetrics,
  filters,
  onChangeFilters,
  onLoad,
  onRefresh,
  empresasUnicas,
  etapasUnicas,
  pedidosMap,
  selectedHubOs,
  onOpenRecipe,
  onCloseRecipe,
  loadingRecipeCodOs,
  bridgeHealth,
  bridgeCircuitOpen,
  bridgeErrorMessage,
  bridgeLastCheckedAt,
  onBridgeRetry,
  empresasDisponiveis,
  empresasLoading,
  defaultCodEmpresa,
  canSeeAll,
}) => {
  const hoje = new Date();
  const inicio30 = new Date(hoje);
  inicio30.setDate(inicio30.getDate() - 30);

  const [campoData, setCampoData] = useState<CampoDataOs>(_layoutCache.campoData ?? "EMISSAO");
  const [dataInicio, setDataInicio] = useState<Date>(_layoutCache.dataInicio ?? inicio30);
  const [dataFim, setDataFim] = useState<Date>(_layoutCache.dataFim ?? hoje);
  const [empresaSelecionada, setEmpresaSelecionada] = useState<string>(
    _layoutCache.empresa ?? (canSeeAll ? "ALL" : (defaultCodEmpresa ? String(defaultCodEmpresa) : ""))
  );

  // Pagination
  const PAGE_SIZE = 100;
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  // Sync layout state to module cache
  useEffect(() => {
    _layoutCache = { campoData, dataInicio, dataFim, empresa: empresaSelecionada };
  }, [campoData, dataInicio, dataFim, empresaSelecionada]);

  // Reset pagination when filtered data changes
  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [data]);

  useEffect(() => {
    if (defaultCodEmpresa && !empresaSelecionada) {
      setEmpresaSelecionada(String(defaultCodEmpresa));
    }
  }, [defaultCodEmpresa]);

  const isBridgeDown = bridgeHealth === "down" || bridgeHealth === "timeout";
  const canLoad = !!empresaSelecionada && !loading && !bridgeCircuitOpen;

  const handleCarregar = () => {
    if (!empresaSelecionada) return;
    const empresa = empresaSelecionada === "ALL" ? "ALL" : empresaSelecionada;
    onLoad({
      empresa,
      dataInicio: format(dataInicio, "yyyy-MM-dd"),
      dataFim: format(dataFim, "yyyy-MM-dd"),
      campoData,
    });
  };

  // Alertas para OS críticas
  const osAtrasadas = rawData.filter(os => os.statusAtraso === 'ATRASO');
  const osSemData = rawData.filter(os => os.statusAtraso === 'SEM_DATA');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Monitor de Produção (OS)</h1>
          <p className="text-sm text-muted-foreground">
            {loaded
              ? `${CAMPO_DATA_LABELS[campoData]} — ${format(dataInicio, "dd/MM/yyyy")} a ${format(dataFim, "dd/MM/yyyy")} • ${rawData.length} OS carregadas`
              : "Selecione a empresa, período e clique em Carregar"
            }
          </p>
        </div>
        {loaded && (
          <Button variant="outline" size="sm" onClick={onRefresh} disabled={loading || bridgeCircuitOpen}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
        )}
      </div>

      {/* Bridge Status Banner */}
      <BridgeStatusBanner
        health={bridgeHealth}
        isCircuitOpen={bridgeCircuitOpen}
        errorMessage={bridgeErrorMessage}
        lastCheckedAt={bridgeLastCheckedAt}
        onRetry={onBridgeRetry}
      />

      {/* Barra de carga — sempre visível */}
      <Card>
        <CardContent className="py-4">
          <div className="flex flex-wrap gap-4 items-end">
            {/* Empresa selector - obrigatório */}
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground">Empresa *</span>
              <Select value={empresaSelecionada} onValueChange={setEmpresaSelecionada}>
                <SelectTrigger className={cn("w-[200px]", !empresaSelecionada && "border-amber-500")}>
                  <SelectValue placeholder="Selecione a empresa" />
                </SelectTrigger>
                <SelectContent>
                  {canSeeAll && (
                    <SelectItem value="ALL">Todas as Empresas</SelectItem>
                  )}
                  {empresasDisponiveis.map((emp) => (
                    <SelectItem key={emp.codEmpresa} value={String(emp.codEmpresa)}>
                      {emp.nome || `Loja ${emp.codEmpresa}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground">Tipo de Data</span>
              <Select value={campoData} onValueChange={(v) => setCampoData(v as CampoDataOs)}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(CAMPO_DATA_LABELS).map(([key, label]) => (
                    <SelectItem key={key} value={key}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <DatePickerField label="Data Início" date={dataInicio} onSelect={setDataInicio} />
            <DatePickerField label="Data Fim" date={dataFim} onSelect={setDataFim} />

            <Button onClick={handleCarregar} disabled={!canLoad} className="h-10">
              {loading ? (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Play className="h-4 w-4 mr-2" />
              )}
              Carregar
            </Button>
          </div>
          {!empresaSelecionada && (
            <p className="text-xs text-amber-600 mt-2">
              Selecione uma empresa para carregar as OS.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Se ainda não carregou, mostrar mensagem */}
      {!loaded && !loading && !error && (
        <Card>
          <CardContent className="py-12">
            <div className="flex flex-col items-center justify-center">
              <Info className="h-8 w-8 text-muted-foreground mb-4" />
              <p className="text-muted-foreground">
                {empresaSelecionada
                  ? "Clique em Carregar para visualizar as OS."
                  : "Selecione a empresa e o período para começar."
                }
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Loading */}
      {loading && (
        <Card>
          <CardContent className="py-12">
            <div className="flex flex-col items-center justify-center">
              <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground mb-4" />
              <p className="text-muted-foreground">Carregando OS...</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Conteúdo carregado */}
      {loaded && !loading && (
        <>
          {/* Alertas */}
          {(osAtrasadas.length > 0 || osSemData.length > 0) && (
            <div className="space-y-2">
              {osAtrasadas.length > 0 && (
                <div className="flex items-center gap-2 p-3 bg-destructive/10 border border-destructive/30 rounded-lg">
                  <AlertTriangle className="h-5 w-5 text-destructive" />
                  <span className="text-sm font-medium text-destructive">
                    {osAtrasadas.length} OS em atraso crítico!
                  </span>
                </div>
              )}
              {osSemData.length > 0 && (
                <div className="flex items-center gap-2 p-3 bg-warning-soft border border-warning-muted rounded-lg">
                  <AlertTriangle className="h-5 w-5 text-warning" />
                  <span className="text-sm font-medium text-warning-foreground">
                    {osSemData.length} OS sem data de previsão.
                  </span>
                </div>
              )}
            </div>
          )}

          {/* KPI Cards */}
          <OsKpiCards
            metrics={rawMetrics}
            filters={filters}
            onChangeFilters={onChangeFilters}
            loading={loading}
          />

          {/* Error */}
          {error && (
            <Card className="border-destructive bg-destructive/10">
              <CardContent className="py-4">
                <p className="text-destructive text-sm">{error}</p>
              </CardContent>
            </Card>
          )}

          {/* Filtros client-side */}
          <Card>
            <CardContent className="py-4">
              <div className="flex flex-wrap gap-4 items-center">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <DebouncedSearchInput
                    placeholder="Buscar por OS ou Cliente..."
                    value={filters.busca}
                    onChange={(value) => onChangeFilters({ busca: value })}
                    className="pl-9"
                  />
                </div>

                <Select
                  value={filters.empresaVisual ?? "TODAS"}
                  onValueChange={(v) => onChangeFilters({ empresaVisual: v === "TODAS" ? null : v })}
                >
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Empresa" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="TODAS">Todas as empresas</SelectItem>
                    {empresasUnicas.map((nome) => (
                      <SelectItem key={nome} value={nome}>{nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select
                  value={filters.etapa ?? "TODAS"}
                  onValueChange={(v) => onChangeFilters({ etapa: v === "TODAS" ? null : v })}
                >
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Etapa" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="TODAS">Todas as etapas</SelectItem>
                    {etapasUnicas.map((etapa) => (
                      <SelectItem key={etapa} value={etapa}>{etapa}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select
                  value={filters.status}
                  onValueChange={(v) => onChangeFilters({ status: v as OsStatusFilter })}
                >
                  <SelectTrigger className="w-[160px]">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="TODOS">Todos</SelectItem>
                    <SelectItem value="ATRASADAS">Atrasadas</SelectItem>
                    <SelectItem value="NO_PRAZO">No Prazo</SelectItem>
                    <SelectItem value="ATRASO">Atraso Crítico</SelectItem>
                    <SelectItem value="ATRASO_LEVE">Atraso Leve</SelectItem>
                    <SelectItem value="SEM_DATA">Sem Data</SelectItem>
                    <SelectItem value="ENTREGUE">Entregue</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Tabela */}
          {data.length > 0 && (
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[40px]"></TableHead>
                        <TableHead className="w-[100px]">OS</TableHead>
                        <TableHead>Empresa</TableHead>
                        <TableHead>Cliente</TableHead>
                        <TableHead>Etapa</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-center">Atraso</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.slice(0, visibleCount).map((os) => (
                        <OsExpandableRow
                          key={os.codOs}
                          os={os}
                          onOpenRecipe={onOpenRecipe}
                          loadingRecipe={loadingRecipeCodOs === os.codOs}
                          pedidoFornecedor={pedidosMap[os.codOs] ?? null}
                        />
                      ))}
                    </TableBody>
                  </Table>
                </div>
                {data.length > visibleCount && (
                  <div className="flex justify-center py-4 border-t">
                    <Button variant="outline" size="sm" onClick={() => setVisibleCount(c => c + PAGE_SIZE)}>
                      Carregar mais ({data.length - visibleCount} restantes)
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Empty */}
          {data.length === 0 && !error && (
            <Card>
              <CardContent className="py-12">
                <div className="flex flex-col items-center justify-center">
                  <Info className="h-8 w-8 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">Nenhuma OS encontrada no período selecionado.</p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Rodapé */}
          {data.length > 0 && (
            <p className="text-sm text-muted-foreground text-center">
              Exibindo {Math.min(visibleCount, data.length)} de {data.length} filtradas ({rawData.length} total)
            </p>
          )}
        </>
      )}

      {/* Error fora do loaded (ex: falha na carga inicial) */}
      {!loaded && error && (
        <Card className="border-destructive bg-destructive/10">
          <CardContent className="py-4">
            <p className="text-destructive text-sm">{error}</p>
          </CardContent>
        </Card>
      )}

      {/* Sheet de receita */}
      <OsHubDetailSheet os={selectedHubOs} onClose={onCloseRecipe} />
    </div>
  );
};
