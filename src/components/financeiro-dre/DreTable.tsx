// src/components/financeiro-dre/DreTable.tsx

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DreLinha } from "@/services/financeiroDreService";

interface Props {
  data: DreLinha[];
}

function formatCurrency(value: number): string {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function formatGrupo(grupo: string): string {
  const labels: Record<string, string> = {
    RECEITA_BRUTA: "Receita Bruta",
    DEDUCOES: "Deduções",
    CUSTO_MERCADORIA: "Custo da Mercadoria Vendida",
    DESPESAS_OPERACIONAIS: "Despesas Operacionais",
    OUTRAS_RECEITAS: "Outras Receitas",
    OUTRAS_DESPESAS: "Outras Despesas",
  };
  return labels[grupo] || grupo;
}

export function DreTable({ data }: Props) {
  if (data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Detalhamento do DRE</CardTitle>
        </CardHeader>
        <CardContent className="text-center text-muted-foreground py-8">
          Selecione uma empresa para visualizar os dados
        </CardContent>
      </Card>
    );
  }

  // Ordenar por grupo e subgrupo
  const sortedData = [...data].sort((a, b) => {
    const grupoOrder = ["RECEITA_BRUTA", "DEDUCOES", "CUSTO_MERCADORIA", "DESPESAS_OPERACIONAIS", "OUTRAS_RECEITAS", "OUTRAS_DESPESAS"];
    const aIndex = grupoOrder.indexOf(a.grupo);
    const bIndex = grupoOrder.indexOf(b.grupo);
    if (aIndex !== bIndex) return aIndex - bIndex;
    return (a.subgrupo || "").localeCompare(b.subgrupo || "");
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Detalhamento do DRE</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Competência</TableHead>
              <TableHead>Grupo</TableHead>
              <TableHead>Subgrupo</TableHead>
              <TableHead className="text-right">Valor</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedData.map((linha, idx) => (
              <TableRow key={`${linha.competencia}-${linha.grupo}-${linha.subgrupo}-${idx}`}>
                <TableCell>{linha.competencia}</TableCell>
                <TableCell className="font-medium">{formatGrupo(linha.grupo)}</TableCell>
                <TableCell className="text-muted-foreground">{linha.subgrupo || "—"}</TableCell>
                <TableCell className={`text-right font-mono ${linha.valor < 0 ? "text-red-500" : ""}`}>
                  {formatCurrency(linha.valor)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
