// src/components/os-dashboard/OsExpandableRow.tsx
// Linha expansível da tabela de OS com detalhes e botão de receita

import React, { useState } from "react";
import { OsRecord } from "@/services/osService";
import { getStatusColor, getStatusLabel } from "@/utils/osMetrics";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TableCell, TableRow } from "@/components/ui/table";
import { ChevronDown, ChevronRight, FileText, Loader2 } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface Props {
  os: OsRecord;
  onOpenRecipe: (codOs: number) => void;
  loadingRecipe: boolean;
}

function formatDate(value: string | null) {
  if (!value) return "-";
  try { return new Date(value).toLocaleDateString("pt-BR"); } catch { return "-"; }
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

export const OsExpandableRow: React.FC<Props> = ({ os, onOpenRecipe, loadingRecipe }) => {
  const [open, setOpen] = useState(false);

  return (
    <Collapsible asChild open={open} onOpenChange={setOpen}>
      <>
        <CollapsibleTrigger asChild>
          <TableRow className="cursor-pointer hover:bg-muted/50">
            <TableCell className="w-[40px] px-2">
              {open ? (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              )}
            </TableCell>
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
              {os.statusAtraso === "ENTREGUE" ? "-" : (
                <span className={os.atrasoDias > 0 ? "text-destructive font-medium" : ""}>
                  {os.atrasoDias}
                </span>
              )}
            </TableCell>
            <TableCell className="text-right">{formatCurrency(os.total)}</TableCell>
          </TableRow>
        </CollapsibleTrigger>

        <CollapsibleContent asChild>
          <TableRow className="bg-muted/30 hover:bg-muted/40">
            <TableCell colSpan={8} className="p-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Emissão</p>
                  <p className="font-medium">{formatDate(os.dataEmissao)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Previsão</p>
                  <p className="font-medium">{formatDate(os.dataPrevisao)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Entrada</p>
                  <p className="font-medium">{formatDate(os.dataHoraEntrada)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Saída</p>
                  <p className="font-medium">{formatDate(os.dataHoraSaida)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Usuário</p>
                  <p className="font-medium">{os.usuario || "-"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Telefone</p>
                  <p className="font-medium">{os.telefone || "-"}</p>
                </div>
                <div className="md:col-span-2 flex items-end">
                  <Button
                    variant="default"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenRecipe(os.codOs);
                    }}
                    disabled={loadingRecipe}
                  >
                    {loadingRecipe ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <FileText className="h-4 w-4 mr-2" />
                    )}
                    Ver Receita
                  </Button>
                </div>
              </div>
            </TableCell>
          </TableRow>
        </CollapsibleContent>
      </>
    </Collapsible>
  );
};
