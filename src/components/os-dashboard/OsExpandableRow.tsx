// src/components/os-dashboard/OsExpandableRow.tsx
// Linha expansível do Monitor de OS — badge de pedido Hoya na linha principal com tooltip

import React, { useState } from "react";
import { OsRecord } from "@/services/osService";
import { getStatusColor, getStatusLabel } from "@/utils/osMetrics";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TableCell, TableRow } from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  ChevronDown,
  ChevronRight,
  Glasses,
  Loader2,
  Calendar,
  User,
  Phone,
  Clock,
  PackageCheck,
  PackageX,
} from "lucide-react";
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
  // pedido confirmado = tem numero_pedido preenchido
  const hasPedidoConfirmado = !!pedidoFornecedor?.numero_pedido;
  // tentativa com erro = existe registro mas sem número de pedido
  const hasPedidoErro = !!pedidoFornecedor && !hasPedidoConfirmado && pedidoFornecedor.status === "ERRO";


  return (
    <TooltipProvider delayDuration={200}>
      <Collapsible asChild open={open} onOpenChange={setOpen}>
        <>
          <CollapsibleTrigger asChild>
            <TableRow className="cursor-pointer hover:bg-muted/50 transition-colors">
              {/* Expand chevron */}
              <TableCell className="w-[40px] px-2">
                {open ? (
                  <ChevronDown className="h-4 w-4 text-primary transition-transform" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform" />
                )}
              </TableCell>

              {/* OS */}
              <TableCell className="font-mono font-semibold text-primary">
                <div className="flex items-center gap-1.5">
                  {os.os || os.codOs}
                  {hasPedidoConfirmado && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span onClick={(e) => e.stopPropagation()}>
                          <PackageCheck className="h-3.5 w-3.5 text-green-600 shrink-0" />
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="right" className="text-xs space-y-0.5 max-w-[220px]">
                        <p className="font-semibold">{pedidoFornecedor!.fornecedor}</p>
                        <p>Protocolo: <span className="font-mono">{pedidoFornecedor!.numero_pedido}</span></p>
                        {pedidoFornecedor!.status && (
                          <p className="capitalize text-muted-foreground">{pedidoFornecedor!.status}</p>
                        )}
                      </TooltipContent>
                    </Tooltip>
                  )}
                  {hasPedidoErro && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span onClick={(e) => e.stopPropagation()}>
                          <PackageX className="h-3.5 w-3.5 text-destructive shrink-0" />
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="right" className="text-xs space-y-0.5 max-w-[240px]">
                        <p className="font-semibold text-destructive">{pedidoFornecedor!.fornecedor} — Erro no envio</p>
                        <p className="text-muted-foreground">Pedido não confirmado. Verifique e tente novamente.</p>
                      </TooltipContent>
                    </Tooltip>
                  )}
                </div>
              </TableCell>

              {/* Empresa */}
              <TableCell className="text-xs">{os.empresa || "—"}</TableCell>

              {/* Cliente */}
              <TableCell className="max-w-[200px] truncate font-medium" title={os.cliente}>
                {os.cliente || "—"}
              </TableCell>

              {/* Etapa */}
              <TableCell>
                <span className="text-xs bg-muted px-2 py-0.5 rounded-md">{os.etapa || "—"}</span>
              </TableCell>

              {/* Status atraso */}
              <TableCell>
                <Badge variant="outline" className={getStatusColor(os.statusAtraso)}>
                  {getStatusLabel(os.statusAtraso)}
                </Badge>
              </TableCell>

              {/* Dias de atraso */}
              <TableCell className="text-center">
                {os.statusAtraso === "ENTREGUE" ? (
                  <span className="text-muted-foreground">—</span>
                ) : os.atrasoDias > 0 ? (
                  <span className="text-destructive font-bold">{os.atrasoDias}d</span>
                ) : (
                  <span className="text-muted-foreground">{os.atrasoDias}</span>
                )}
              </TableCell>

              {/* Total */}
              <TableCell className="text-right font-medium">{formatCurrency(os.total)}</TableCell>
            </TableRow>
          </CollapsibleTrigger>

          {/* Detalhes expandidos */}
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

                  {/* Botão Ver Receita */}
                  <div className="flex items-center gap-2">
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
    </TooltipProvider>
  );
};
