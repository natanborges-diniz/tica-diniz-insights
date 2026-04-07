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
import { Badge } from "@/components/ui/badge";
import { DreLinha } from "@/services/financeiroDreService";

interface Props {
  data: DreLinha[];
  modo?: "realizado" | "projetado";
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
    INVESTIMENTOS: "Investimentos",
    RESULTADO_FINANCEIRO: "Resultado Financeiro",
  };
  return labels[grupo] || grupo;
}

export function DreTable({ data, modo = "realizado" }: Props) {
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

  const grupoOrder = ["RECEITA_BRUTA", "DEDUCOES", "CUSTO_MERCADORIA", "DESPESAS_OPERACIONAIS", "RESULTADO_FINANCEIRO", "OUTRAS_RECEITAS", "OUTRAS_DESPESAS", "INVESTIMENTOS"];

  const sortedData = [...data].sort((a, b) => {
    const aIndex = grupoOrder.indexOf(a.grupo);
    const bIndex = grupoOrder.indexOf(b.grupo);
    if (aIndex !== bIndex) return (aIndex === -1 ? 99 : aIndex) - (bIndex === -1 ? 99 : bIndex);
    return (a.subgrupo || "").localeCompare(b.subgrupo || "");
  });

  const isProjetado = modo === "projetado";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Detalhamento do DRE
          {isProjetado && (
            <Badge variant="outline" className="text-xs font-normal">
              Inclui previstos
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Competência</TableHead>
              <TableHead>Grupo</TableHead>
              <TableHead>Subgrupo</TableHead>
              <TableHead className="text-right">Valor</TableHead>
              {isProjetado && <TableHead className="text-center w-[90px]">Status</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedData.map((linha, idx) => (
              <TableRow
                key={`${linha.competencia}-${linha.grupo}-${linha.subgrupo}-${idx}`}
                className={!linha.realizado && isProjetado ? "bg-muted/30" : ""}
              >
                <TableCell>{linha.competencia}</TableCell>
                <TableCell className="font-medium">{formatGrupo(linha.grupo)}</TableCell>
                <TableCell className="text-muted-foreground">{linha.subgrupo || "—"}</TableCell>
                <TableCell className={`text-right font-mono ${linha.valorTotal < 0 ? "text-destructive" : ""}`}>
                  {formatCurrency(linha.valorTotal)}
                </TableCell>
                {isProjetado && (
                  <TableCell className="text-center">
                    {linha.realizado ? (
                      <Badge variant="default" className="text-[10px] px-1.5">Pago</Badge>
                    ) : (
                      <Badge variant="secondary" className="text-[10px] px-1.5">Previsto</Badge>
                    )}
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
