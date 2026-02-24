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
import { useNavigate } from "react-router-dom";

interface Props {
  os: OsRecord;
  onOpenRecipe: (codOs: number, codEmpresa?: number) => void;
  loadingRecipe: boolean;
  pedidoFornecedor?: { numero_pedido: string | null; fornecedor: string; status: string; created_at?: string | null; voucher?: string | null } | null;
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
  const navigate = useNavigate();
  // Helper: detecta status negativo (cancelado, rejeitado, etc.)
  const isNegativeStatus = (s: string) => {
    const lower = s.toLowerCase();
    return lower.includes("cancel") || lower.includes("rejeit") || lower.includes("falha") || lower.includes("recusa");
  };

  // pedido confirmado = tem numero_pedido E status não é negativo
  const hasPedidoConfirmado = !!pedidoFornecedor?.numero_pedido && !isNegativeStatus(pedidoFornecedor.status);
  // pedido cancelado/rejeitado = tem número mas status negativo
  const hasPedidoCancelado = !!pedidoFornecedor?.numero_pedido && isNegativeStatus(pedidoFornecedor.status);
  // tentativa com erro = existe registro mas sem número de pedido
  const hasPedidoErro = !!pedidoFornecedor && !pedidoFornecedor.numero_pedido && pedidoFornecedor.status === "ERRO";


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
                        <span
                          role="button"
                          tabIndex={0}
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/os/tracking?pedido=${pedidoFornecedor!.numero_pedido}`);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") navigate(`/os/tracking?pedido=${pedidoFornecedor!.numero_pedido}`);
                          }}
                          className="cursor-pointer"
                        >
                          <PackageCheck className="h-3.5 w-3.5 text-green-600 shrink-0 hover:scale-110 transition-transform" />
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="right" className="text-xs space-y-1">
                        <p className="font-semibold text-foreground">{pedidoFornecedor!.fornecedor}</p>
                        <p className="font-mono">{pedidoFornecedor!.numero_pedido}</p>
                        {pedidoFornecedor!.voucher && (
                          <p
                            className="font-mono text-primary cursor-pointer hover:underline"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigator.clipboard.writeText(pedidoFornecedor!.voucher!);
                            }}
                            title="Clique para copiar"
                          >
                            🎟️ Voucher: {pedidoFornecedor!.voucher}
                          </p>
                        )}
                        {pedidoFornecedor!.created_at && (
                          <p className="text-muted-foreground">
                            {new Date(pedidoFornecedor!.created_at).toLocaleString("pt-BR")}
                          </p>
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
                  {hasPedidoCancelado && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span
                          role="button"
                          tabIndex={0}
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/os/tracking?pedido=${pedidoFornecedor!.numero_pedido}`);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") navigate(`/os/tracking?pedido=${pedidoFornecedor!.numero_pedido}`);
                          }}
                          className="cursor-pointer"
                        >
                          <PackageX className="h-3.5 w-3.5 text-amber-500 shrink-0 hover:scale-110 transition-transform" />
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="right" className="text-xs space-y-1 max-w-[260px]">
                        <p className="font-semibold text-amber-600">{pedidoFornecedor!.fornecedor} — {pedidoFornecedor!.status}</p>
                        <p className="font-mono">{pedidoFornecedor!.numero_pedido}</p>
                        <p className="text-muted-foreground">Pedido cancelado/rejeitado. É possível refazer o pedido.</p>
                        {pedidoFornecedor!.created_at && (
                          <p className="text-muted-foreground">
                            {new Date(pedidoFornecedor!.created_at).toLocaleString("pt-BR")}
                          </p>
                        )}
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
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm flex-1 mt-2">
                    <div className="flex items-center gap-2">
                      <User className="h-3.5 w-3.5 text-emerald-500" />
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Paciente</p>
                        <p className="font-medium text-xs">{os.paciente || os.cliente || "—"}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <User className="h-3.5 w-3.5 text-muted-foreground" />
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">CPF</p>
                        <p className="font-medium text-xs font-mono">{os.cpf || "—"}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Nascimento</p>
                        <p className="font-medium text-xs">{formatDate(os.dataNascimento)}</p>
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
