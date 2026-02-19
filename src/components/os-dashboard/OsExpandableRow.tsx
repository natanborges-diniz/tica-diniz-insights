// src/components/os-dashboard/OsExpandableRow.tsx
// Linha expansível da tabela de OS com visual aprimorado e badges Rx/Foto

import React, { useState } from "react";
import { OsRecord } from "@/services/osService";
import { getStatusColor, getStatusLabel } from "@/utils/osMetrics";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TableCell, TableRow } from "@/components/ui/table";
import { ChevronDown, ChevronRight, Glasses, Loader2, Calendar, User, Phone, Clock, ExternalLink } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface Props {
  os: OsRecord;
  onOpenRecipe: (codOs: number, codEmpresa?: number) => void;
  loadingRecipe: boolean;
  pedidoFornecedor?: { numero_pedido: string | null; fornecedor: string; status: string } | null;
}

function formatDate(value: string | null) {
  if (!value) return "—";
  try { return new Date(value).toLocaleDateString("pt-BR"); } catch { return "—"; }
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

export const OsExpandableRow: React.FC<Props> = ({ os, onOpenRecipe, loadingRecipe, pedidoFornecedor }) => {
  const [open, setOpen] = useState(false);

  return (
    <Collapsible asChild open={open} onOpenChange={setOpen}>
      <>
        <CollapsibleTrigger asChild>
          <TableRow className="cursor-pointer hover:bg-muted/50 transition-colors">
            <TableCell className="w-[40px] px-2">
              {open ? (
                <ChevronDown className="h-4 w-4 text-primary transition-transform" />
              ) : (
                <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform" />
              )}
            </TableCell>
            <TableCell className="font-mono font-semibold text-primary">{os.os || os.codOs}</TableCell>
            <TableCell className="text-xs">{os.empresa || "—"}</TableCell>
            <TableCell className="max-w-[200px] truncate font-medium" title={os.cliente}>
              {os.cliente || "—"}
            </TableCell>
            <TableCell>
              <span className="text-xs bg-muted px-2 py-0.5 rounded-md">{os.etapa || "—"}</span>
            </TableCell>
            <TableCell>
              <Badge variant="outline" className={getStatusColor(os.statusAtraso)}>
                {getStatusLabel(os.statusAtraso)}
              </Badge>
            </TableCell>
            <TableCell className="text-center">
              {os.statusAtraso === "ENTREGUE" ? (
                <span className="text-muted-foreground">—</span>
              ) : os.atrasoDias > 0 ? (
                <span className="text-destructive font-bold">{os.atrasoDias}d</span>
              ) : (
                <span className="text-muted-foreground">{os.atrasoDias}</span>
              )}
            </TableCell>
            <TableCell className="text-right font-medium">{formatCurrency(os.total)}</TableCell>
          </TableRow>
        </CollapsibleTrigger>

        <CollapsibleContent asChild>
          <TableRow className="bg-primary/[0.02] border-l-2 border-l-primary/30">
            <TableCell colSpan={8} className="p-4">
              <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm flex-1">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-3.5 w-3.5 text-blue-500" />
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Emissão</p>
                      <p className="font-medium text-xs">{formatDate(os.dataEmissao)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="h-3.5 w-3.5 text-amber-500" />
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Previsão</p>
                      <p className="font-medium text-xs">{formatDate(os.dataPrevisao)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <User className="h-3.5 w-3.5 text-muted-foreground" />
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Vendedor</p>
                      <p className="font-medium text-xs">{os.vendedor || os.usuario || "—"}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Telefone</p>
                      <p className="font-medium text-xs">{os.telefone || "—"}</p>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {pedidoFornecedor?.numero_pedido && (
                    <Badge variant="outline" className="gap-1 bg-orange-500/10 text-orange-700 border-orange-300">
                      <ExternalLink className="h-3 w-3" />
                      Pedido {pedidoFornecedor.fornecedor}: {pedidoFornecedor.numero_pedido}
                    </Badge>
                  )}
                  <Button
                    variant="default"
                    size="sm"
                    className="gap-2 shadow-sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenRecipe(os.codOs, os.codEmpresa ?? undefined);
                    }}
                    disabled={loadingRecipe}
                  >
                    {loadingRecipe ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Glasses className="h-4 w-4" />
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
