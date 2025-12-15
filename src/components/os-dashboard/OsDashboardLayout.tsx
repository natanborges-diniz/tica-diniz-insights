// src/components/os-dashboard/OsDashboardLayout.tsx

import React from "react";
import { Link } from "react-router-dom";
import { OsRecord } from "@/services/osService";
import { OsMetrics, getStatusColor, getStatusLabel } from "@/utils/osMetrics";
import { OsFilterState, OsStatusFilter } from "@/hooks/useOsMonitor";
import { OsKpiCards } from "./OsKpiCards";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { RefreshCw, Info, AlertTriangle, Search, ArrowLeft } from "lucide-react";
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
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface Empresa {
  codEmpresa: number;
  nome: string;
}

type Props = {
  data: OsRecord[];
  rawData: OsRecord[];
  loading: boolean;
  error: string | null;
  metrics: OsMetrics;
  filters: OsFilterState;
  dataLoaded: boolean;
  onChangeFilters: (next: Partial<OsFilterState>) => void;
  onChangePeriod: (range: { dataInicio: string; dataFim: string }) => void;
  onLoadData: () => void;
  empresas: Empresa[];
  loadingEmpresas: boolean;
  errorEmpresas: string | null;
  selectedEmpresa: number | "ALL" | null;
  onSelectEmpresa: (codEmpresa: number | "ALL" | null) => void;
  empresasUnicas: string[];
  etapasUnicas: string[];
};

export const OsDashboardLayout: React.FC<Props> = ({
  data,
  loading,
  error,
  metrics,
  filters,
  dataLoaded,
  onChangeFilters,
  onChangePeriod,
  onLoadData,
  empresas,
  loadingEmpresas,
  errorEmpresas,
  selectedEmpresa,
  onSelectEmpresa,
  empresasUnicas,
  etapasUnicas,
}) => {
  const hoje = new Date();
  const showEmptyState = !dataLoaded && !loading;

  const handleChangeToday = () => {
    const d = hoje.toISOString().slice(0, 10);
    onChangePeriod({ dataInicio: d, dataFim: d });
  };

  const handleChangeLast7Days = () => {
    const fim = hoje.toISOString().slice(0, 10);
    const inicioDate = new Date(hoje);
    inicioDate.setDate(inicioDate.getDate() - 7);
    const inicio = inicioDate.toISOString().slice(0, 10);
    onChangePeriod({ dataInicio: inicio, dataFim: fim });
  };

  const handleChangeLast30Days = () => {
    const fim = hoje.toISOString().slice(0, 10);
    const inicioDate = new Date(hoje);
    inicioDate.setDate(inicioDate.getDate() - 30);
    const inicio = inicioDate.toISOString().slice(0, 10);
    onChangePeriod({ dataInicio: inicio, dataFim: fim });
  };

  const formatDate = (value: string | null) => {
    if (!value) return "-";
    try {
      return new Date(value).toLocaleDateString("pt-BR");
    } catch {
      return "-";
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  // Alertas para OS críticas
  const osAtrasadas = data.filter(os => os.statusAtraso === 'ATRASO');
  const osSemData = data.filter(os => os.statusAtraso === 'SEM_DATA');

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link to="/">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Voltar
            </Button>
          </Link>
          <h1 className="text-2xl font-bold">Monitor de Produção (OS)</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={handleChangeToday}>
            Hoje
          </Button>
          <Button variant="outline" size="sm" onClick={handleChangeLast7Days}>
            Últimos 7 dias
          </Button>
          <Button variant="outline" size="sm" onClick={handleChangeLast30Days}>
            Últimos 30 dias
          </Button>
          {dataLoaded && (
            <Button variant="outline" size="sm" onClick={onLoadData} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
              Atualizar
            </Button>
          )}
        </div>
      </div>

      {/* Estado inicial - Aguardando seleção de empresa */}
      {showEmptyState && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Info className="h-12 w-12 text-muted-foreground mb-4" />
            <CardTitle className="text-lg mb-2">Selecione uma empresa para visualizar as OS</CardTitle>
            <p className="text-sm text-muted-foreground text-center max-w-md mb-4">
              Selecione a empresa e o período desejado, depois clique em Carregar Dados.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 items-center">
              <Select
                value={selectedEmpresa?.toString() ?? ""}
                onValueChange={(value) => {
                  if (value === "ALL") {
                    onSelectEmpresa("ALL");
                  } else {
                    onSelectEmpresa(value ? Number(value) : null);
                  }
                }}
                disabled={loadingEmpresas}
              >
                <SelectTrigger className="w-[220px]">
                  <SelectValue placeholder={loadingEmpresas ? "Carregando..." : "Selecione a empresa"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Todas as empresas</SelectItem>
                  {empresas.map((e) => (
                    <SelectItem key={e.codEmpresa} value={e.codEmpresa.toString()}>
                      {e.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button onClick={onLoadData} disabled={loading || selectedEmpresa === null}>
                <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
                Carregar Dados
              </Button>
            </div>
            {errorEmpresas && (
              <p className="text-sm text-destructive mt-2">{errorEmpresas}</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Alertas de OS Críticas */}
      {dataLoaded && (osAtrasadas.length > 0 || osSemData.length > 0) && (
        <div className="space-y-2">
          {osAtrasadas.length > 0 && (
            <div className="flex items-center gap-2 p-3 bg-destructive/10 border border-destructive/30 rounded-lg">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              <span className="text-sm font-medium text-destructive">
                {osAtrasadas.length} OS em atraso crítico! Priorizar atendimento.
              </span>
            </div>
          )}
          {osSemData.length > 0 && (
            <div className="flex items-center gap-2 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
              <span className="text-sm font-medium text-amber-700">
                {osSemData.length} OS sem data de previsão. Definir prazos.
              </span>
            </div>
          )}
        </div>
      )}

      {/* KPI Cards */}
      {dataLoaded && (
        <OsKpiCards
          metrics={metrics}
          filters={filters}
          onChangeFilters={onChangeFilters}
          loading={loading}
        />
      )}

      {/* Error */}
      {error && (
        <Card className="border-destructive bg-destructive/10">
          <CardContent className="py-4">
            <p className="text-destructive text-sm">{error}</p>
          </CardContent>
        </Card>
      )}

      {/* Toolbar de Filtros */}
      {dataLoaded && (
        <Card>
          <CardContent className="py-4">
            <div className="flex flex-wrap gap-4 items-center">
              {/* Busca */}
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por OS ou Cliente..."
                  value={filters.busca}
                  onChange={(e) => onChangeFilters({ busca: e.target.value })}
                  className="pl-9"
                />
              </div>

              {/* Filtro por Empresa Visual */}
              <Select
                value={filters.empresaVisual ?? "TODAS"}
                onValueChange={(value) => onChangeFilters({ empresaVisual: value === "TODAS" ? null : value })}
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Empresa" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="TODAS">Todas as empresas</SelectItem>
                  {empresasUnicas.map((nome) => (
                    <SelectItem key={nome} value={nome}>
                      {nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Filtro por Etapa */}
              <Select
                value={filters.etapa ?? "TODAS"}
                onValueChange={(value) => onChangeFilters({ etapa: value === "TODAS" ? null : value })}
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Etapa" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="TODAS">Todas as etapas</SelectItem>
                  {etapasUnicas.map((etapa) => (
                    <SelectItem key={etapa} value={etapa}>
                      {etapa}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Filtro por Status */}
              <Select
                value={filters.status}
                onValueChange={(value) => onChangeFilters({ status: value as OsStatusFilter })}
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
      )}

      {/* Tabela de OS */}
      {dataLoaded && !loading && data.length > 0 && (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[100px]">OS</TableHead>
                    <TableHead>Empresa</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Etapa</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-center">Atraso (dias)</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead>Usuário</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.map((os) => (
                    <TableRow key={os.codOs} className="hover:bg-muted/50">
                      <TableCell className="font-medium">{os.os || os.codOs}</TableCell>
                      <TableCell>{os.empresa || "-"}</TableCell>
                      <TableCell className="max-w-[200px] truncate" title={os.cliente}>
                        {os.cliente || "-"}
                      </TableCell>
                      <TableCell>{os.etapa || "-"}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={getStatusColor(os.statusAtraso)}>
                          {getStatusLabel(os.statusAtraso)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        {os.statusAtraso === 'ENTREGUE' ? "-" : (
                          <span className={os.atrasoDias > 0 ? "text-destructive font-medium" : ""}>
                            {os.atrasoDias}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">{formatCurrency(os.total)}</TableCell>
                      <TableCell>{os.usuario || "-"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
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

      {/* Empty state após carregar */}
      {dataLoaded && !loading && data.length === 0 && (
        <Card>
          <CardContent className="py-12">
            <div className="flex flex-col items-center justify-center">
              <Info className="h-8 w-8 text-muted-foreground mb-4" />
              <p className="text-muted-foreground">Nenhuma OS encontrada no período selecionado.</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Rodapé com contagem */}
      {dataLoaded && data.length > 0 && (
        <p className="text-sm text-muted-foreground text-center">
          Exibindo {data.length} OS
        </p>
      )}
    </div>
  );
};
