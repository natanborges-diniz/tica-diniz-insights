// src/components/os-dashboard/OsDashboardLayout.tsx

import React from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ClipboardList, Info, RefreshCw } from "lucide-react";
import { OsRecord } from "../../services/osMonitor";
import { OsMetrics, mapStatus, getStatusLegivel, isAtrasada } from "../../utils/osMetrics";
import { OsFilterState, OsStatusFilter, OsEmpresaFilter } from "../../hooks/useOsMonitor";
import { OsKpiCards } from "./OsKpiCards";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";

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
};

export const OsDashboardLayout: React.FC<Props> = ({
  data,
  rawData,
  loading,
  error,
  metrics,
  filters,
  dataLoaded,
  onChangeFilters,
  onChangePeriod,
  onLoadData,
}) => {
  const hoje = new Date();
  const showEmptyState = !dataLoaded && !loading;

  // Lista de empresas única a partir dos dados brutos
  const empresas = Array.from(
    new Set(rawData.map((os) => os.empresa).filter((e): e is string => !!e))
  ).sort();

  function handleChangeToday() {
    const iso = hoje.toISOString().slice(0, 10);
    onChangePeriod({ dataInicio: iso, dataFim: iso });
  }

  function handleChangeLast7Days() {
    const fim = hoje.toISOString().slice(0, 10);
    const inicio = new Date(hoje);
    inicio.setDate(inicio.getDate() - 7);
    const ini = inicio.toISOString().slice(0, 10);
    onChangePeriod({ dataInicio: ini, dataFim: fim });
  }

  function handleChangeLast30Days() {
    const fim = hoje.toISOString().slice(0, 10);
    const inicio = new Date(hoje);
    inicio.setDate(inicio.getDate() - 30);
    const ini = inicio.toISOString().slice(0, 10);
    onChangePeriod({ dataInicio: ini, dataFim: fim });
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Link to="/">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div className="flex items-center gap-2">
              <ClipboardList className="h-6 w-6 text-primary" />
              <h1 className="text-xl font-bold">Monitor de Produção (OS)</h1>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 space-y-4">
        <div className="flex flex-wrap gap-2 items-center justify-end">

        <div className="flex gap-2">
          <button
            onClick={handleChangeToday}
            className="px-3 py-1 text-sm border border-border rounded-md hover:bg-muted"
          >
            Hoje
          </button>
          <button
            onClick={handleChangeLast7Days}
            className="px-3 py-1 text-sm border border-border rounded-md hover:bg-muted"
          >
            Últimos 7 dias
          </button>
          <button
            onClick={handleChangeLast30Days}
            className="px-3 py-1 text-sm border border-border rounded-md hover:bg-muted"
          >
            Últimos 30 dias
          </button>
        </div>
      </div>

      {/* Estado inicial - Aguardando ação do usuário */}
      {showEmptyState && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Info className="h-12 w-12 text-muted-foreground mb-4" />
            <CardTitle className="text-lg mb-2">Clique em Carregar para visualizar as OS</CardTitle>
            <p className="text-sm text-muted-foreground text-center max-w-md mb-4">
              Selecione o período desejado e clique no botão para carregar os dados.
              O período máximo permitido é de 1 ano.
            </p>
            <Button onClick={onLoadData} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
              Carregar Dados
            </Button>
          </CardContent>
        </Card>
      )}

      {/* KPIs clicáveis - só mostra se dados carregados */}
      {dataLoaded && (
        <OsKpiCards
          metrics={metrics}
          filters={filters}
          onChangeFilters={onChangeFilters}
          loading={loading}
        />
      )}

      {error && (
        <div className="text-sm text-destructive border border-destructive/30 bg-destructive/10 p-3 rounded-md">
          Erro: {error}
        </div>
      )}

      {/* Toolbar de filtros - só mostra se dados carregados */}
      {dataLoaded && (
        <div className="flex flex-wrap gap-4 items-center p-3 bg-muted/50 rounded-lg border border-border">
          <Select
            value={filters.empresaVisual ?? "TODAS"}
            onValueChange={(value) => onChangeFilters({ empresaVisual: value === "TODAS" ? null : value })}
          >
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder="Todas as empresas" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="TODAS">Todas as empresas</SelectItem>
            {empresas.map((nome) => (
              <SelectItem key={nome} value={nome}>
                {nome}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filters.status}
          onValueChange={(value) => onChangeFilters({ status: value as OsStatusFilter })}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="TODOS">Todos os status</SelectItem>
            <SelectItem value="EM_ANDAMENTO">Em andamento</SelectItem>
            <SelectItem value="ATRASADAS">Atrasadas</SelectItem>
            <SelectItem value="ENTREGUES">Entregues</SelectItem>
            <SelectItem value="CANCELADAS">Canceladas</SelectItem>
          </SelectContent>
        </Select>

        <div className="flex gap-4 items-center">
          <div className="flex items-center gap-2">
            <Checkbox
              id="check-reparo"
              checked={filters.somenteReparo}
              onCheckedChange={(checked) => onChangeFilters({ somenteReparo: !!checked })}
            />
            <label htmlFor="check-reparo" className="text-sm cursor-pointer">
              Reparo
            </label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="check-ecommerce"
              checked={filters.somenteEcommerce}
              onCheckedChange={(checked) => onChangeFilters({ somenteEcommerce: !!checked })}
            />
            <label htmlFor="check-ecommerce" className="text-sm cursor-pointer">
              E-commerce
            </label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="check-sem-previsao"
              checked={filters.somenteSemPrevisao}
              onCheckedChange={(checked) => onChangeFilters({ somenteSemPrevisao: !!checked })}
            />
            <label htmlFor="check-sem-previsao" className="text-sm cursor-pointer">
              Sem previsão
            </label>
          </div>
        </div>
      </div>
      )}

      {/* Tabela - só mostra se dados carregados */}
      {dataLoaded && (
        <div className="overflow-auto border border-border rounded-lg">
        <table className="min-w-full text-sm">
          <thead className="bg-muted">
            <tr>
              <Th>Empresa</Th>
              <Th>Nº OS</Th>
              <Th>Cliente</Th>
              <Th>Data Emissão</Th>
              <Th>Previsão</Th>
              <Th>Tags</Th>
              <Th>Status</Th>
              <Th>Atrasada</Th>
            </tr>
          </thead>
          <tbody>
            {data.map((os) => {
              const status = mapStatus(os);
              const statusLegivel = getStatusLegivel(status);
              const atrasada = isAtrasada(os, status);

              return (
                <tr
                  key={`${os.numeroOs}-${os.codEmpresa}-${os.dataHoraEntradaUltima}`}
                  className={`border-t border-border hover:bg-muted/50 ${
                    atrasada ? "bg-destructive/5" : ""
                  }`}
                >
                  <Td>{os.empresa}</Td>
                  <Td>{os.numeroOs}</Td>
                  <Td>{os.cliente}</Td>
                  <Td>{formatDate(os.dataEmissao)}</Td>
                  <Td>
                    {os.dataPrevisao ? (
                      formatDate(os.dataPrevisao)
                    ) : (
                      <span className="text-muted-foreground text-xs">Sem previsão</span>
                    )}
                  </Td>
                  <Td>
                    {!os.isReparo && !os.isEcommerce ? (
                      <span className="text-xs text-muted-foreground">—</span>
                    ) : (
                      <div className="flex gap-1 flex-wrap">
                        {os.isReparo && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-100 text-amber-800 border border-amber-200">
                            Reparo
                          </span>
                        )}
                        {os.isEcommerce && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-100 text-blue-800 border border-blue-200">
                            E-commerce
                          </span>
                        )}
                      </div>
                    )}
                  </Td>
                  <Td>
                    <Badge
                      variant={
                        status === "ENTREGUE"
                          ? "default"
                          : status === "CANCELADA"
                          ? "destructive"
                          : "secondary"
                      }
                    >
                      {statusLegivel}
                    </Badge>
                  </Td>
                  <Td>
                    {atrasada ? (
                      !os.dataPrevisao ? (
                        <Badge variant="destructive" className="bg-amber-500 hover:bg-amber-600">
                          Sim (sem previsão)
                        </Badge>
                      ) : (
                        <Badge variant="destructive">Sim</Badge>
                      )
                    ) : (
                      <span className="text-muted-foreground">Não</span>
                    )}
                  </Td>
                </tr>
              );
            })}
            {data.length === 0 && !loading && (
              <tr>
                <td
                  colSpan={8}
                  className="py-8 text-center text-muted-foreground"
                >
                  Nenhuma OS encontrada com os filtros atuais.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        </div>
      )}

      {loading && (
        <div className="text-sm text-muted-foreground text-center py-4">
          Carregando OS...
        </div>
      )}
      </main>
    </div>
  );
};

const Th: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
    {children}
  </th>
);

const Td: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <td className="px-3 py-2 whitespace-nowrap align-top">{children}</td>
);

function formatDate(value: string | null) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("pt-BR");
}
