// src/pages/FinanceiroDashboard.tsx

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Wallet, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { TrendingUp, TrendingDown, AlertTriangle } from "lucide-react";
import { fetchEmpresas, Empresa } from "../services/firebirdBridge";

// ========== TYPES ==========
interface FinanceiroParcela {
  codEmpresa: number;
  empresaNome: string;
  codLancamento: number;
  tipoLancamento: "PAGAR" | "RECEBER";
  documento: string;
  pessoaNome: string;
  dataVencimento: Date;
  dataEmissao: Date | null;
  dataPagamento: Date | null;
  valor: number;
  valorPago: number;
  situacao: "PAGA" | "EM ABERTO" | "EM ATRASO";
  contaNumero: string | null;
  contaDescricao: string | null;
  formaPagamentoTipo: string | null;
}

type TipoFilter = "TODOS" | "PAGAR" | "RECEBER";
type SituacaoFilter = "TODOS" | "EM ABERTO" | "EM ATRASO" | "PAGA";

interface FinanceiroFilters {
  empresa: string | number | null;
  dataIni: string;
  dataFim: string;
  tipo: TipoFilter;
  situacao: SituacaoFilter;
}

interface FinanceiroMetrics {
  totalReceberAberto: number;
  totalReceberAtraso: number;
  totalPagarAberto: number;
  totalPagarAtraso: number;
  qtdParcelas: number;
  qtdParcelasAtraso: number;
  qtdParcelasPagar: number;
  qtdParcelasReceber: number;
}

// ========== SERVICE ==========
const FIREBIRD_BRIDGE_BASE_URL =
  import.meta.env.VITE_FIREBIRD_BRIDGE_BASE_URL ||
  "https://firebird-bridge-production.up.railway.app";

interface ApiParcelaRow {
  COD_EMPRESA: number;
  EMPRESA_NOME: string;
  COD_LANCAMENTO: number;
  LANCAMENTO_PAGAR: "T" | "F";
  LANCAMENTO_DOCUMENTO: string;
  PESSOA_NOME: string;
  PARCELA_DATA_EMISSAO: string | null;
  PARCELA_DATA_VENCIMENTO: string;
  PARCELA_DATA_PAGAMENTO: string | null;
  PARCELA_VALOR: number;
  PARCELA_VALOR_PAGO: number;
  PARCELA_SITUACAO: "PAGA" | "EM ABERTO" | "EM ATRASO";
  CONTACLA_NUMERO: string | null;
  CONTACLA_DESCRICAO: string | null;
  FORMAPAGTO_TIPO_NOME: string | null;
}

function parseDate(dateStr: string | null): Date | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? null : d;
}

function mapRowToParcela(row: ApiParcelaRow): FinanceiroParcela {
  return {
    codEmpresa: row.COD_EMPRESA,
    empresaNome: row.EMPRESA_NOME || "",
    codLancamento: row.COD_LANCAMENTO,
    tipoLancamento: row.LANCAMENTO_PAGAR === "T" ? "PAGAR" : "RECEBER",
    documento: row.LANCAMENTO_DOCUMENTO || "",
    pessoaNome: row.PESSOA_NOME || "",
    dataEmissao: parseDate(row.PARCELA_DATA_EMISSAO),
    dataVencimento: parseDate(row.PARCELA_DATA_VENCIMENTO) || new Date(),
    dataPagamento: parseDate(row.PARCELA_DATA_PAGAMENTO),
    valor: row.PARCELA_VALOR || 0,
    valorPago: row.PARCELA_VALOR_PAGO || 0,
    situacao: row.PARCELA_SITUACAO || "EM ABERTO",
    contaNumero: row.CONTACLA_NUMERO,
    contaDescricao: row.CONTACLA_DESCRICAO,
    formaPagamentoTipo: row.FORMAPAGTO_TIPO_NOME,
  };
}

async function getFinanceiroParcelas(params: {
  dataIni: string;
  dataFim: string;
  empresa?: number | string;
}): Promise<FinanceiroParcela[]> {
  const queryParams = new URLSearchParams({
    dataIni: params.dataIni,
    dataFim: params.dataFim,
  });

  if (params.empresa !== undefined && params.empresa !== null && params.empresa !== "") {
    queryParams.append("empresa", String(params.empresa));
  }

  const url = `${FIREBIRD_BRIDGE_BASE_URL}/api/v1/financeiro/parcelas?${queryParams.toString()}`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Erro ao buscar parcelas: ${response.status}`);
  }

  const result = await response.json();
  return (result.rows || []).map(mapRowToParcela);
}

// ========== UTILITIES ==========
function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

function formatDate(date: Date | null): string {
  if (!date) return "—";
  return date.toLocaleDateString("pt-BR");
}

function getDefaultFilters(): FinanceiroFilters {
  const hoje = new Date();
  const primeiroDiaMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  const ultimoDiaMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);

  return {
    empresa: null,
    dataIni: primeiroDiaMes.toISOString().split("T")[0],
    dataFim: ultimoDiaMes.toISOString().split("T")[0],
    tipo: "TODOS",
    situacao: "TODOS",
  };
}

function calculateMetrics(parcelas: FinanceiroParcela[]): FinanceiroMetrics {
  let totalReceberAberto = 0;
  let totalReceberAtraso = 0;
  let totalPagarAberto = 0;
  let totalPagarAtraso = 0;
  let qtdParcelasAtraso = 0;
  let qtdParcelasPagar = 0;
  let qtdParcelasReceber = 0;

  for (const p of parcelas) {
    if (p.tipoLancamento === "RECEBER") {
      qtdParcelasReceber++;
      if (p.situacao === "EM ABERTO") {
        totalReceberAberto += p.valor;
      } else if (p.situacao === "EM ATRASO") {
        totalReceberAtraso += p.valor;
        qtdParcelasAtraso++;
      }
    } else {
      qtdParcelasPagar++;
      if (p.situacao === "EM ABERTO") {
        totalPagarAberto += p.valor;
      } else if (p.situacao === "EM ATRASO") {
        totalPagarAtraso += p.valor;
        qtdParcelasAtraso++;
      }
    }
  }

  return {
    totalReceberAberto,
    totalReceberAtraso,
    totalPagarAberto,
    totalPagarAtraso,
    qtdParcelas: parcelas.length,
    qtdParcelasAtraso,
    qtdParcelasPagar,
    qtdParcelasReceber,
  };
}

// ========== MAIN COMPONENT ==========
export default function FinanceiroDashboard() {
  const [filters, setFilters] = useState<FinanceiroFilters>(getDefaultFilters());
  const [data, setData] = useState<FinanceiroParcela[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [empresas, setEmpresas] = useState<Empresa[]>([]);

  // Load empresas
  useEffect(() => {
    fetchEmpresas()
      .then(setEmpresas)
      .catch(() => setEmpresas([]));
  }, []);

  // Fetch data
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const parcelas = await getFinanceiroParcelas({
        dataIni: filters.dataIni,
        dataFim: filters.dataFim,
        empresa: filters.empresa || undefined,
      });
      setData(parcelas);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao buscar parcelas");
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [filters.dataIni, filters.dataFim, filters.empresa]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Filter data
  const filteredData = useMemo(() => {
    return data.filter((p) => {
      if (filters.tipo !== "TODOS" && p.tipoLancamento !== filters.tipo) {
        return false;
      }
      if (filters.situacao !== "TODOS" && p.situacao !== filters.situacao) {
        return false;
      }
      return true;
    });
  }, [data, filters.tipo, filters.situacao]);

  const metrics = useMemo(() => calculateMetrics(data), [data]);

  // Chart data
  const chartData = useMemo(() => {
    const groupedByDate: Record<string, { receber: number; pagar: number }> = {};

    for (const p of filteredData) {
      if (!p.dataVencimento) continue;
      const dateKey = p.dataVencimento.toISOString().split("T")[0];

      if (!groupedByDate[dateKey]) {
        groupedByDate[dateKey] = { receber: 0, pagar: 0 };
      }

      if (p.tipoLancamento === "RECEBER") {
        groupedByDate[dateKey].receber += p.valor;
      } else {
        groupedByDate[dateKey].pagar += p.valor;
      }
    }

    const sortedDates = Object.keys(groupedByDate).sort();
    return sortedDates.map((dateKey) => {
      const [, month, day] = dateKey.split("-");
      return {
        data: `${day}/${month}`,
        receber: groupedByDate[dateKey].receber,
        pagar: groupedByDate[dateKey].pagar,
      };
    });
  }, [filteredData]);

  // Sorted table data
  const sortedData = useMemo(() => {
    return [...filteredData].sort((a, b) => {
      const dateA = a.dataVencimento?.getTime() || 0;
      const dateB = b.dataVencimento?.getTime() || 0;
      return dateB - dateA;
    });
  }, [filteredData]);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link to="/">
                <Button variant="ghost" size="icon">
                  <ArrowLeft className="h-5 w-5" />
                </Button>
              </Link>
              <div className="flex items-center gap-2">
                <Wallet className="h-6 w-6 text-primary" />
                <h1 className="text-xl font-bold">Financeiro – Contas a Pagar / Receber</h1>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
              Atualizar
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-6 space-y-6">
        {/* Filters */}
        <div className="flex flex-wrap gap-4 items-end">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Empresa</Label>
            <Select
              value={filters.empresa ? String(filters.empresa) : "TODAS"}
              onValueChange={(value) =>
                setFilters((prev) => ({ ...prev, empresa: value === "TODAS" ? null : Number(value) }))
              }
            >
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Todas as empresas" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="TODAS">Todas as empresas</SelectItem>
                {empresas.map((e) => (
                  <SelectItem key={e.COD_EMPRESA} value={String(e.COD_EMPRESA)}>
                    {e.EMPRESA}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Data Início</Label>
            <Input
              type="date"
              value={filters.dataIni}
              onChange={(e) => setFilters((prev) => ({ ...prev, dataIni: e.target.value }))}
              className="w-[150px]"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Data Fim</Label>
            <Input
              type="date"
              value={filters.dataFim}
              onChange={(e) => setFilters((prev) => ({ ...prev, dataFim: e.target.value }))}
              className="w-[150px]"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Tipo</Label>
            <Select
              value={filters.tipo}
              onValueChange={(value) => setFilters((prev) => ({ ...prev, tipo: value as TipoFilter }))}
            >
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="TODOS">Todos</SelectItem>
                <SelectItem value="RECEBER">A Receber</SelectItem>
                <SelectItem value="PAGAR">A Pagar</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Situação</Label>
            <Select
              value={filters.situacao}
              onValueChange={(value) => setFilters((prev) => ({ ...prev, situacao: value as SituacaoFilter }))}
            >
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Situação" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="TODOS">Todas</SelectItem>
                <SelectItem value="EM ABERTO">Em Aberto</SelectItem>
                <SelectItem value="EM ATRASO">Em Atraso</SelectItem>
                <SelectItem value="PAGA">Pagas</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Error State */}
        {error && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-destructive">
            {error}
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
            <span className="ml-2 text-muted-foreground">Carregando parcelas...</span>
          </div>
        )}

        {/* Content */}
        {!loading && !error && (
          <>
            {/* KPI Cards */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">A Receber (Aberto)</CardTitle>
                  <TrendingUp className="h-4 w-4 text-emerald-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-emerald-600">
                    {formatCurrency(metrics.totalReceberAberto)}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {metrics.qtdParcelasReceber} parcelas a receber
                  </p>
                </CardContent>
              </Card>

              <Card className="border-amber-200 bg-amber-50/50 dark:bg-amber-950/20">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">A Receber (Atraso)</CardTitle>
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-amber-600">
                    {formatCurrency(metrics.totalReceberAtraso)}
                  </div>
                  <p className="text-xs text-muted-foreground">Valores vencidos não recebidos</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">A Pagar (Aberto)</CardTitle>
                  <TrendingDown className="h-4 w-4 text-blue-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-blue-600">
                    {formatCurrency(metrics.totalPagarAberto)}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {metrics.qtdParcelasPagar} parcelas a pagar
                  </p>
                </CardContent>
              </Card>

              <Card className="border-destructive/50 bg-destructive/5">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">A Pagar (Atraso)</CardTitle>
                  <AlertTriangle className="h-4 w-4 text-destructive" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-destructive">
                    {formatCurrency(metrics.totalPagarAtraso)}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {metrics.qtdParcelasAtraso} parcelas em atraso total
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Chart */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Vencimentos por Dia</CardTitle>
              </CardHeader>
              <CardContent>
                {chartData.length === 0 ? (
                  <div className="h-[300px] flex items-center justify-center">
                    <p className="text-muted-foreground">Sem dados para exibir</p>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="data" tick={{ fontSize: 12 }} />
                      <YAxis
                        tick={{ fontSize: 12 }}
                        tickFormatter={(value) =>
                          new Intl.NumberFormat("pt-BR", {
                            style: "currency",
                            currency: "BRL",
                            minimumFractionDigits: 0,
                            maximumFractionDigits: 0,
                          }).format(value)
                        }
                      />
                      <Tooltip
                        formatter={(value: number) => formatCurrency(value)}
                        labelFormatter={(label) => `Data: ${label}`}
                      />
                      <Legend />
                      <Bar dataKey="receber" name="A Receber" fill="hsl(142, 76%, 36%)" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="pagar" name="A Pagar" fill="hsl(221, 83%, 53%)" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            {/* Table */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center justify-between">
                  <span>Parcelas</span>
                  <span className="text-sm font-normal text-muted-foreground">
                    {filteredData.length} registro(s)
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Empresa</TableHead>
                        <TableHead>Tipo</TableHead>
                        <TableHead>Situação</TableHead>
                        <TableHead>Cliente/Fornecedor</TableHead>
                        <TableHead>Documento</TableHead>
                        <TableHead>Vencimento</TableHead>
                        <TableHead className="text-right">Valor</TableHead>
                        <TableHead>Conta</TableHead>
                        <TableHead>Forma Pgto</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sortedData.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                            Nenhuma parcela encontrada
                          </TableCell>
                        </TableRow>
                      ) : (
                        sortedData.map((p, idx) => (
                          <TableRow key={`${p.codLancamento}-${idx}`}>
                            <TableCell className="font-medium text-sm">
                              {p.empresaNome || `Empresa ${p.codEmpresa}`}
                            </TableCell>
                            <TableCell>
                              {p.tipoLancamento === "RECEBER" ? (
                                <Badge className="bg-emerald-500 hover:bg-emerald-600">Receber</Badge>
                              ) : (
                                <Badge className="bg-blue-500 hover:bg-blue-600">Pagar</Badge>
                              )}
                            </TableCell>
                            <TableCell>
                              {p.situacao === "PAGA" ? (
                                <Badge variant="outline" className="bg-emerald-100 text-emerald-800 border-emerald-200">
                                  Paga
                                </Badge>
                              ) : p.situacao === "EM ATRASO" ? (
                                <Badge variant="destructive">Em Atraso</Badge>
                              ) : (
                                <Badge variant="secondary">Em Aberto</Badge>
                              )}
                            </TableCell>
                            <TableCell className="max-w-[200px] truncate" title={p.pessoaNome}>
                              {p.pessoaNome || "—"}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">{p.documento || "—"}</TableCell>
                            <TableCell className="whitespace-nowrap">{formatDate(p.dataVencimento)}</TableCell>
                            <TableCell className="text-right font-medium whitespace-nowrap">
                              {formatCurrency(p.valor)}
                            </TableCell>
                            <TableCell
                              className="text-sm text-muted-foreground max-w-[150px] truncate"
                              title={p.contaDescricao || ""}
                            >
                              {p.contaDescricao || p.contaNumero || "—"}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {p.formaPagamentoTipo || "—"}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </main>
    </div>
  );
}
