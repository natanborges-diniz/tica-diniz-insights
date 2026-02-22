// src/components/financeiro-dashboard/FinanceiroParcelasTable.tsx

import React, { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { FinanceiroParcela } from "../../services/financeiroService";
import { DataTableToolbar } from "@/components/ui/data-table-toolbar";
import { DataTable, DataTableColumn, QueryState } from "@/components/ui/data-table";
import { formatters, ExportColumn } from "@/utils/exportData";
import { Search, X } from "lucide-react";

interface FinanceiroParcelasTableProps {
  data: FinanceiroParcela[];
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  const datePart = dateStr.split("T")[0];
  const [year, month, day] = datePart.split("-");
  if (!year || !month || !day) return "—";
  return `${day}/${month}/${year}`;
}

function getSituacaoBadge(situacao: string) {
  switch (situacao) {
    case "PAGA":
      return <Badge variant="outline" className="bg-success-soft text-success border-success-muted">Paga</Badge>;
    case "EM ATRASO":
      return <Badge variant="destructive">Em Atraso</Badge>;
    case "EM ABERTO":
    default:
      return <Badge variant="secondary">Em Aberto</Badge>;
  }
}

function getTipoBadge(tipo: string) {
  if (tipo === "RECEBER") {
    return <Badge className="bg-success hover:bg-success-hover">Receber</Badge>;
  }
  return <Badge className="bg-info hover:bg-info-hover">Pagar</Badge>;
}

const parcelaColumns: DataTableColumn<FinanceiroParcela>[] = [
  {
    key: "empresaNome",
    header: "Empresa",
    sortable: true,
    mobileVisible: false,
    cell: (row) => (
      <span className="font-medium text-sm">{row.empresaNome || `Empresa ${row.codEmpresa}`}</span>
    ),
  },
  {
    key: "tipoLancamento",
    header: "Tipo",
    sortable: true,
    mobileVisible: false,
    cell: (row) => getTipoBadge(row.tipoLancamento),
  },
  {
    key: "situacao",
    header: "Situação",
    sortable: true,
    mobileVisible: true,
    cell: (row) => getSituacaoBadge(row.situacao),
  },
  {
    key: "pessoaNome",
    header: "Cliente/Fornecedor",
    sortable: true,
    mobileVisible: true,
    maxWidth: "200px",
    cell: (row) => (
      <span className="truncate block" title={row.pessoaNome}>{row.pessoaNome || "—"}</span>
    ),
  },
  {
    key: "documento",
    header: "Documento",
    sortable: true,
    mobileVisible: false,
    cellClassName: "text-sm text-muted-foreground",
  },
  {
    key: "dataEmissao",
    header: "Emissão",
    sortable: true,
    mobileVisible: false,
    cellClassName: "whitespace-nowrap text-sm",
    cell: (row) => formatDate(row.dataEmissao),
  },
  {
    key: "dataVencimento",
    header: "Vencimento",
    sortable: true,
    mobileVisible: false,
    cellClassName: "whitespace-nowrap text-sm",
    cell: (row) => formatDate(row.dataVencimento),
  },
  {
    key: "dataPagamento",
    header: "Pagamento",
    sortable: true,
    mobileVisible: false,
    cellClassName: "whitespace-nowrap text-sm",
    cell: (row) => formatDate(row.dataPagamento),
  },
  {
    key: "valor",
    header: "Valor",
    sortable: true,
    align: "right",
    mobileVisible: true,
    cell: (row) => (
      <span className="font-medium whitespace-nowrap">{formatCurrency(row.valor)}</span>
    ),
  },
  {
    key: "contaDescricao",
    header: "Conta",
    sortable: true,
    mobileVisible: false,
    maxWidth: "150px",
    cellClassName: "text-sm text-muted-foreground",
    cell: (row) => (
      <span className="truncate block" title={row.contaDescricao || ""}>
        {row.contaDescricao || row.contaNumero || "—"}
      </span>
    ),
  },
  {
    key: "formaPagamentoTipo",
    header: "Forma Pgto",
    sortable: true,
    mobileVisible: false,
    cellClassName: "text-sm text-muted-foreground",
  },
];

const exportColumns: ExportColumn[] = [
  { key: "empresaNome", header: "Empresa" },
  { key: "tipoLancamento", header: "Tipo" },
  { key: "situacao", header: "Situação" },
  { key: "pessoaNome", header: "Cliente/Fornecedor" },
  { key: "documento", header: "Documento" },
  { key: "dataEmissao", header: "Emissão", format: formatters.date },
  { key: "dataVencimento", header: "Vencimento", format: formatters.date },
  { key: "dataPagamento", header: "Pagamento", format: formatters.date },
  { key: "valor", header: "Valor", format: formatters.currency },
  { key: "contaDescricao", header: "Conta" },
  { key: "formaPagamentoTipo", header: "Forma Pgto" },
];

export function FinanceiroParcelasTable({ data }: FinanceiroParcelasTableProps) {
  const [queryState, setQueryState] = useState<QueryState>({
    page: 1,
    pageSize: 50,
    sort: { field: "dataVencimento", direction: "desc" },
    search: "",
  });
  const [searchTerm, setSearchTerm] = useState("");

  // Filtrar por termo de busca
  const filteredData = useMemo(() => {
    if (!searchTerm.trim()) return data;
    const term = searchTerm.toLowerCase();
    return data.filter(
      (p) =>
        p.pessoaNome?.toLowerCase().includes(term) ||
        p.documento?.toLowerCase().includes(term) ||
        p.empresaNome?.toLowerCase().includes(term) ||
        p.contaDescricao?.toLowerCase().includes(term)
    );
  }, [data, searchTerm]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center justify-between">
          <span>Parcelas</span>
          <span className="text-sm font-normal text-muted-foreground">
            {filteredData.length} de {data.length} registro(s)
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <DataTable
          columns={parcelaColumns}
          data={filteredData}
          mode="client"
          queryState={queryState}
          onQueryChange={setQueryState}
          rowKey={(p, index) => `${p.codEmpresa}-${p.documento}-${index}`}
          emptyMessage={data.length === 0 ? "Nenhuma parcela encontrada" : "Nenhum resultado para a busca"}
          toolbar={
            <DataTableToolbar
              exportOptions={{
                filename: `financeiro-parcelas-${new Date().toISOString().split("T")[0]}`,
                title: "Relatório de Parcelas Financeiras",
                columns: exportColumns,
                data: filteredData,
              }}
            >
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por cliente, documento, empresa..."
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setQueryState((prev) => ({ ...prev, page: 1 }));
                  }}
                  className="pl-8 pr-8"
                />
                {searchTerm && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="absolute right-1 top-1 h-6 w-6 p-0"
                    onClick={() => setSearchTerm("")}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                )}
              </div>
            </DataTableToolbar>
          }
        />
      </CardContent>
    </Card>
  );
}
