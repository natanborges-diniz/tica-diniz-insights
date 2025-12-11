// src/components/financeiro-dashboard/FinanceiroParcelasTable.tsx

import React, { useMemo } from "react";
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
import { FinanceiroParcela } from "../../services/financeiroService";

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
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("pt-BR");
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

export function FinanceiroParcelasTable({ data }: FinanceiroParcelasTableProps) {
  // Ordenar por vencimento DESC
  const sortedData = useMemo(() => {
    return [...data].sort((a, b) => {
      const dateA = a.dataVencimento ? new Date(a.dataVencimento).getTime() : 0;
      const dateB = b.dataVencimento ? new Date(b.dataVencimento).getTime() : 0;
      return dateB - dateA;
    });
  }, [data]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center justify-between">
          <span>Parcelas</span>
          <span className="text-sm font-normal text-muted-foreground">
            {data.length} registro(s)
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
                <TableHead>Emissão</TableHead>
                <TableHead>Vencimento</TableHead>
                <TableHead>Pagamento</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Conta</TableHead>
                <TableHead>Forma Pgto</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedData.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={11} className="text-center text-muted-foreground py-8">
                    Nenhuma parcela encontrada
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
