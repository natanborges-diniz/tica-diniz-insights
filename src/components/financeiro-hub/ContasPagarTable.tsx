import { format } from "date-fns";
import {
  Pencil, CreditCard, XCircle, ArrowDown, RotateCcw,
  MoreHorizontal, Unlink,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface Lancamento {
  id: string;
  cod_empresa: number;
  tipo: string;
  status: string;
  natureza: string | null;
  categoria: string | null;
  subcategoria: string | null;
  descricao: string;
  pessoa_nome: string | null;
  pessoa_documento: string | null;
  valor: number;
  valor_pago: number | null;
  data_emissao: string | null;
  data_vencimento: string;
  data_pagamento: string | null;
  data_baixa: string | null;
  forma_pagamento: string | null;
  origem: string;
  requer_validacao: boolean;
  bordero_id: string | null;
  btg_dda_id: string | null;
  dados_extras: Record<string, unknown> | null;
  created_at: string;
}

const STATUS_CONFIG: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  PREVISTO: { label: "Previsto", variant: "secondary" },
  CLASSIFICADO: { label: "Classificado", variant: "outline" },
  BORDERO: { label: "Borderô", variant: "outline" },
  AUTORIZADO: { label: "Autorizado", variant: "default" },
  PROCESSANDO: { label: "Processando", variant: "outline" },
  BAIXADO: { label: "Baixado", variant: "default" },
  CANCELADO: { label: "Cancelado", variant: "destructive" },
  CONCILIADO_CARTAO: { label: "Conciliado", variant: "default" },
};

interface ContasPagarTableProps {
  lancamentos: Lancamento[];
  isLoading: boolean;
  selectedIds: Set<string>;
  isAdmin: boolean;
  stepFilter?: number | null;
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: () => void;
  onClassificar: (l: Lancamento) => void;
  onPrepararPagamento: (l: Lancamento) => void;
  onBaixaManual: (l: Lancamento) => void;
  onCancelar: (id: string) => void;
  onReabrir: (id: string) => void;
  onRemoverDoBordero?: (lancamento: Lancamento) => void;
  isCancelando: boolean;
  isReabrindo: boolean;
  isRemovendoDoBordero?: boolean;
}

const fmtCurrency = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

const hasPaymentData = (l: Lancamento) => {
  const d = l.dados_extras || {};
  return !!(d.btg_payment_type || d.linha_digitavel || d.pix_key);
};

const getDdaBadge = (l: Lancamento) => {
  if (l.btg_dda_id && l.origem === "DDA" && l.requer_validacao) {
    return <Badge variant="outline" className="text-[10px] bg-orange-50 text-orange-700 border-orange-200">DDA SEM ERP</Badge>;
  }
  if (l.btg_dda_id) {
    return <Badge variant="outline" className="text-[10px] bg-green-50 text-green-700 border-green-200">✓ DDA</Badge>;
  }
  if (l.tipo === "PAGAR" && !l.btg_dda_id && l.status === "PREVISTO") {
    return <Badge variant="outline" className="text-[10px] bg-yellow-50 text-yellow-700 border-yellow-200">⚠ SEM DDA</Badge>;
  }
  return null;
};

export function ContasPagarTable({
  lancamentos: rawLancamentos, isLoading, selectedIds, isAdmin, stepFilter,
  onToggleSelect, onToggleSelectAll,
  onClassificar, onPrepararPagamento, onBaixaManual,
  onCancelar, onReabrir, onRemoverDoBordero, isCancelando, isReabrindo, isRemovendoDoBordero,
}: ContasPagarTableProps) {
  // Apply step-based filtering
  const lancamentos = stepFilter ? rawLancamentos.filter(l => {
    if (stepFilter === 1) return true; // show all
    if (stepFilter === 2) return l.status === "PREVISTO" && !l.subcategoria; // unclassified
    if (stepFilter === 3) return l.status === "PREVISTO" && !!l.subcategoria && !hasPaymentData(l); // classified, no payment
    return true;
  }) : rawLancamentos;

  const previstosPagar = lancamentos.filter(l => l.tipo === "PAGAR" && l.status === "PREVISTO");

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Contas a Pagar</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[40px]">
                  <Checkbox
                    checked={previstosPagar.length > 0 && selectedIds.size === previstosPagar.length}
                    onCheckedChange={onToggleSelectAll}
                  />
                </TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>Fornecedor</TableHead>
                <TableHead className="w-[95px]">Vencimento</TableHead>
                <TableHead className="w-[110px] text-right">Valor</TableHead>
                <TableHead className="w-[140px]">Conta</TableHead>
                <TableHead className="w-[100px]">Status</TableHead>
                <TableHead className="w-[70px]">DDA</TableHead>
                <TableHead className="w-[120px] text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>
              ) : lancamentos.length === 0 ? (
                <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Nenhum lançamento encontrado.</TableCell></TableRow>
              ) : lancamentos.map(l => {
                const sc = STATUS_CONFIG[l.status] || { label: l.status, variant: "outline" as const };
                const isVencido = l.status === "PREVISTO" && new Date(l.data_vencimento) < new Date();
                const canSelect = l.tipo === "PAGAR" && l.status === "PREVISTO";
                const hasPay = hasPaymentData(l);
                const contaNome = l.subcategoria || (l.dados_extras?.conta_descricao as string) || null;
                const isClassificado = !!contaNome;

                // Determine primary action
                const renderPrimaryAction = () => {
                  if (l.status === "BAIXADO" || l.status === "CANCELADO") return null;

                  if (!isClassificado && ["PREVISTO"].includes(l.status)) {
                    return (
                      <Button size="sm" variant="default" className="h-7 text-xs" onClick={() => onClassificar(l)}>
                        <Pencil className="h-3 w-3 mr-1" /> Classificar
                      </Button>
                    );
                  }

                  if (isClassificado && !hasPay && l.status === "PREVISTO" && l.tipo === "PAGAR") {
                    return (
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => onPrepararPagamento(l)}>
                        <CreditCard className="h-3 w-3 mr-1" /> Preparar Pgto
                      </Button>
                    );
                  }

                  if (isClassificado && hasPay && l.status === "PREVISTO") {
                    return (
                      <Badge variant="outline" className="text-[10px] bg-primary/5 text-primary border-primary/20">
                        ✓ PRONTO P/ BORDERÔ
                      </Badge>
                    );
                  }

                  return null;
                };

                // Secondary actions for "..." menu
                const secondaryActions: { label: string; icon: React.ElementType; onClick: () => void; destructive?: boolean }[] = [];

                if (isClassificado) {
                  secondaryActions.push({ label: "Editar Conta", icon: Pencil, onClick: () => onClassificar(l) });
                }
                if (hasPay && l.status === "PREVISTO" && l.tipo === "PAGAR") {
                  secondaryActions.push({ label: "Editar Pagamento", icon: CreditCard, onClick: () => onPrepararPagamento(l) });
                }
                if (["PREVISTO", "AUTORIZADO"].includes(l.status) && isAdmin && !l.bordero_id) {
                  secondaryActions.push({ label: "Baixa Manual", icon: ArrowDown, onClick: () => onBaixaManual(l) });
                }
                if (l.status === "PREVISTO") {
                  secondaryActions.push({ label: "Cancelar", icon: XCircle, onClick: () => onCancelar(l.id), destructive: true });
                }
                if (l.status === "BAIXADO" && isAdmin) {
                  secondaryActions.push({ label: "Reabrir", icon: RotateCcw, onClick: () => onReabrir(l.id) });
                }

                return (
                  <TableRow key={l.id} className={isVencido ? "bg-destructive/5" : undefined}>
                    <TableCell>
                      {canSelect && (
                        <Checkbox
                          checked={selectedIds.has(l.id)}
                          onCheckedChange={() => onToggleSelect(l.id)}
                        />
                      )}
                    </TableCell>
                    <TableCell className="text-sm max-w-[200px] truncate">
                      {l.descricao.toUpperCase()}
                      {l.requer_validacao && <Badge variant="outline" className="ml-2 text-[10px]">VALIDAR</Badge>}
                    </TableCell>
                    <TableCell className="text-sm">{l.pessoa_nome?.toUpperCase() || "—"}</TableCell>
                    <TableCell className="text-sm">{format(new Date(l.data_vencimento), "dd/MM/yy")}</TableCell>
                    <TableCell className="text-sm text-right font-medium">{fmtCurrency(l.valor)}</TableCell>
                    <TableCell className="text-xs">
                      {contaNome ? (
                        <Tooltip>
                          <TooltipTrigger>
                            <span className="font-medium">{contaNome.toUpperCase()}</span>
                          </TooltipTrigger>
                          <TooltipContent>
                            {l.natureza?.replace(/_/g, " ") || "—"} › {l.categoria?.replace(/_/g, " ") || "—"}
                          </TooltipContent>
                        </Tooltip>
                      ) : (
                        <span className="text-muted-foreground italic">Não classificado</span>
                      )}
                    </TableCell>
                    <TableCell><Badge variant={sc.variant}>{sc.label}</Badge></TableCell>
                    <TableCell>{getDdaBadge(l)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end items-center gap-1">
                        {renderPrimaryAction()}
                        {secondaryActions.length > 0 && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0">
                                <MoreHorizontal className="h-3.5 w-3.5" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {secondaryActions.map(a => {
                                const Icon = a.icon;
                                return (
                                  <DropdownMenuItem
                                    key={a.label}
                                    onClick={a.onClick}
                                    className={a.destructive ? "text-destructive" : ""}
                                    disabled={a.destructive ? isCancelando : a.label === "Reabrir" ? isReabrindo : false}
                                  >
                                    <Icon className="h-3.5 w-3.5 mr-2" /> {a.label}
                                  </DropdownMenuItem>
                                );
                              })}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
