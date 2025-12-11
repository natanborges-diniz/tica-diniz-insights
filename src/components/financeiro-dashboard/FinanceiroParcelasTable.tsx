// src/components/financeiro-dashboard/FinanceiroParcelasTable.tsx

import React, { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { FinanceiroParcela } from "../../services/financeiroService";
import { DataTableToolbar } from "@/components/ui/data-table-toolbar";
import { formatters, ExportColumn } from "@/utils/exportData";
import { ArrowUpDown, ArrowUp, ArrowDown, Search, X } from "lucide-react";

interface FinanceiroParcelasTableProps {
  data: FinanceiroParcela[];
}

type SortDirection = "asc" | "desc" | null;
type SortField = keyof FinanceiroParcela | null;

interface SortState {
  field: SortField;
  direction: SortDirection;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  const datePart = dateStr.split('T')[0];
  const [year, month, day] = datePart.split('-');
  if (!year || !month || !day) return "—";
  return `${day}/${month}/${year}`;
}

function getSituacaoBadge(situacao: string) {
  switch (situacao) {
    case "PAGA":
      return <Badge variant="outline" className="bg-emerald-100 text-emerald-800 border-emerald-200">Paga</Badge>;
    case "EM ATRASO":
      return <Badge variant="destructive">Em Atraso</Badge>;
    case "EM ABERTO":
    default:
      return <Badge variant="secondary">Em Aberto</Badge>;
  }
}

function getTipoBadge(tipo: string) {
  if (tipo === "RECEBER") {
    return <Badge className="bg-emerald-500 hover:bg-emerald-600">Receber</Badge>;
  }
  return <Badge className="bg-blue-500 hover:bg-blue-600">Pagar</Badge>;
}

// Colunas para exportação
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

function SortableHeader({ 
  label, 
  field, 
  sortState, 
  onSort 
}: { 
  label: string; 
  field: SortField; 
  sortState: SortState; 
  onSort: (field: SortField) => void;
}) {
  const isActive = sortState.field === field;
  
  return (
    <Button 
      variant="ghost" 
      size="sm" 
      className="h-8 px-2 -ml-2 font-medium hover:bg-muted"
      onClick={() => onSort(field)}
    >
      {label}
      {isActive && sortState.direction === "asc" && <ArrowUp className="ml-1 h-3 w-3" />}
      {isActive && sortState.direction === "desc" && <ArrowDown className="ml-1 h-3 w-3" />}
      {!isActive && <ArrowUpDown className="ml-1 h-3 w-3 opacity-50" />}
    </Button>
  );
}

export function FinanceiroParcelasTable({ data }: FinanceiroParcelasTableProps) {
  const [sortState, setSortState] = useState<SortState>({ field: "dataVencimento", direction: "desc" });
  const [searchTerm, setSearchTerm] = useState("");

  const handleSort = (field: SortField) => {
    setSortState(prev => {
      if (prev.field === field) {
        // Ciclar: desc -> asc -> null -> desc
        if (prev.direction === "desc") return { field, direction: "asc" };
        if (prev.direction === "asc") return { field: null, direction: null };
        return { field, direction: "desc" };
      }
      return { field, direction: "desc" };
    });
  };

  // Filtrar por termo de busca
  const filteredData = useMemo(() => {
    if (!searchTerm.trim()) return data;
    const term = searchTerm.toLowerCase();
    return data.filter(p => 
      p.pessoaNome?.toLowerCase().includes(term) ||
      p.documento?.toLowerCase().includes(term) ||
      p.empresaNome?.toLowerCase().includes(term) ||
      p.contaDescricao?.toLowerCase().includes(term)
    );
  }, [data, searchTerm]);

  // Ordenar dados
  const sortedData = useMemo(() => {
    if (!sortState.field || !sortState.direction) return filteredData;
    
    return [...filteredData].sort((a, b) => {
      const field = sortState.field!;
      let aVal = a[field];
      let bVal = b[field];

      // Tratar nulos
      if (aVal === null || aVal === undefined) aVal = "";
      if (bVal === null || bVal === undefined) bVal = "";

      // Comparar datas
      if (field.includes("data") || field.includes("Data")) {
        const dateA = aVal ? new Date(aVal as string).getTime() : 0;
        const dateB = bVal ? new Date(bVal as string).getTime() : 0;
        return sortState.direction === "asc" ? dateA - dateB : dateB - dateA;
      }

      // Comparar números
      if (typeof aVal === "number" && typeof bVal === "number") {
        return sortState.direction === "asc" ? aVal - bVal : bVal - aVal;
      }

      // Comparar strings
      const strA = String(aVal).toLowerCase();
      const strB = String(bVal).toLowerCase();
      return sortState.direction === "asc" 
        ? strA.localeCompare(strB, 'pt-BR')
        : strB.localeCompare(strA, 'pt-BR');
    });
  }, [filteredData, sortState]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center justify-between">
          <span>Parcelas</span>
          <span className="text-sm font-normal text-muted-foreground">
            {sortedData.length} de {data.length} registro(s)
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <DataTableToolbar
          exportOptions={{
            filename: `financeiro-parcelas-${new Date().toISOString().split('T')[0]}`,
            title: "Relatório de Parcelas Financeiras",
            columns: exportColumns,
            data: sortedData,
          }}
        >
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por cliente, documento, empresa..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
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

        <div className="overflow-x-auto border rounded-md">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead>
                  <SortableHeader label="Empresa" field="empresaNome" sortState={sortState} onSort={handleSort} />
                </TableHead>
                <TableHead>
                  <SortableHeader label="Tipo" field="tipoLancamento" sortState={sortState} onSort={handleSort} />
                </TableHead>
                <TableHead>
                  <SortableHeader label="Situação" field="situacao" sortState={sortState} onSort={handleSort} />
                </TableHead>
                <TableHead>
                  <SortableHeader label="Cliente/Fornecedor" field="pessoaNome" sortState={sortState} onSort={handleSort} />
                </TableHead>
                <TableHead>
                  <SortableHeader label="Documento" field="documento" sortState={sortState} onSort={handleSort} />
                </TableHead>
                <TableHead>
                  <SortableHeader label="Emissão" field="dataEmissao" sortState={sortState} onSort={handleSort} />
                </TableHead>
                <TableHead>
                  <SortableHeader label="Vencimento" field="dataVencimento" sortState={sortState} onSort={handleSort} />
                </TableHead>
                <TableHead>
                  <SortableHeader label="Pagamento" field="dataPagamento" sortState={sortState} onSort={handleSort} />
                </TableHead>
                <TableHead className="text-right">
                  <SortableHeader label="Valor" field="valor" sortState={sortState} onSort={handleSort} />
                </TableHead>
                <TableHead>
                  <SortableHeader label="Conta" field="contaDescricao" sortState={sortState} onSort={handleSort} />
                </TableHead>
                <TableHead>
                  <SortableHeader label="Forma Pgto" field="formaPagamentoTipo" sortState={sortState} onSort={handleSort} />
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedData.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={11} className="text-center text-muted-foreground py-8">
                    {data.length === 0 ? "Nenhuma parcela encontrada" : "Nenhum resultado para a busca"}
                  </TableCell>
                </TableRow>
              ) : (
                sortedData.map((p, index) => (
                  <TableRow key={`${p.codEmpresa}-${p.documento}-${index}`}>
                    <TableCell className="font-medium text-sm">
                      {p.empresaNome || `Empresa ${p.codEmpresa}`}
                    </TableCell>
                    <TableCell>{getTipoBadge(p.tipoLancamento)}</TableCell>
                    <TableCell>{getSituacaoBadge(p.situacao)}</TableCell>
                    <TableCell className="max-w-[200px] truncate" title={p.pessoaNome}>
                      {p.pessoaNome || "—"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {p.documento || "—"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm">
                      {formatDate(p.dataEmissao)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm">
                      {formatDate(p.dataVencimento)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm">
                      {formatDate(p.dataPagamento)}
                    </TableCell>
                    <TableCell className="text-right font-medium whitespace-nowrap">
                      {formatCurrency(p.valor)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[150px] truncate" title={p.contaDescricao || ""}>
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
  );
}
