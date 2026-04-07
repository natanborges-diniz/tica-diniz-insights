import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Pencil, CreditCard, XCircle, ArrowDown, RotateCcw,
  MoreHorizontal, Unlink, ChevronDown, ChevronRight, CheckCircle2,
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
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";

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
  PREVISTO: { label: "Pendente", variant: "secondary" },
  CLASSIFICADO: { label: "Validado", variant: "outline" },
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

const formatMonthTitle = (monthKey: string) => {
  try {
    const d = parseISO(`${monthKey}-01`);
    return format(d, "MMMM yyyy", { locale: ptBR }).replace(/^\w/, c => c.toUpperCase());
  } catch {
    return monthKey;
  }
};

// Shared row renderer
function LancamentoRow({
  l, selectedIds, onToggleSelect, onClassificar, onPrepararPagamento,
  onBaixaManual, onCancelar, onReabrir, onRemoverDoBordero,
  isCancelando, isReabrindo, isRemovendoDoBordero, isAdmin,
}: {
  l: Lancamento;
  selectedIds: Set<string>;
  isAdmin: boolean;
  onToggleSelect: (id: string) => void;
  onClassificar: (l: Lancamento) => void;
  onPrepararPagamento: (l: Lancamento) => void;
  onBaixaManual: (l: Lancamento) => void;
  onCancelar: (id: string) => void;
  onReabrir: (id: string) => void;
  onRemoverDoBordero?: (l: Lancamento) => void;
  isCancelando: boolean;
  isReabrindo: boolean;
  isRemovendoDoBordero?: boolean;
}) {
  const sc = STATUS_CONFIG[l.status] || { label: l.status, variant: "outline" as const };
  const isVencido = l.status === "PREVISTO" && new Date(l.data_vencimento) < new Date();
  const canSelect = l.tipo === "PAGAR" && ["PREVISTO", "CLASSIFICADO"].includes(l.status);
  const hasPay = hasPaymentData(l);
  const contaNome = l.subcategoria || (l.dados_extras?.conta_descricao as string) || null;
  const isClassificado = !!contaNome;

  const renderPrimaryAction = () => {
    if (l.status === "BAIXADO" || l.status === "CANCELADO") return null;

    if (!isClassificado && l.status === "PREVISTO") {
      return (
        <Button size="sm" variant="default" className="h-7 text-xs" onClick={() => onClassificar(l)}>
          <Pencil className="h-3 w-3 mr-1" /> Validar
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

    if (l.status === "CLASSIFICADO" && l.tipo === "PAGAR") {
      return (
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => onPrepararPagamento(l)}>
          <CreditCard className="h-3 w-3 mr-1" /> Preparar Pgto
        </Button>
      );
    }

    return null;
  };

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
  if (l.bordero_id && ["BORDERO", "AUTORIZADO"].includes(l.status) && onRemoverDoBordero) {
    secondaryActions.push({ label: "Remover do Borderô", icon: Unlink, onClick: () => onRemoverDoBordero(l), destructive: true });
  }
  if (!l.bordero_id && l.status === "AUTORIZADO") {
    secondaryActions.push({ label: "Desautorizar", icon: RotateCcw, onClick: () => onReabrir(l.id) });
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
                      disabled={a.destructive ? (a.label === "Remover do Borderô" ? isRemovendoDoBordero : isCancelando) : a.label === "Reabrir" ? isReabrindo : false}
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
}

const TABLE_HEADERS = (
  <TableRow>
    <TableHead className="w-[40px]" />
    <TableHead>Descrição</TableHead>
    <TableHead>Fornecedor</TableHead>
    <TableHead className="w-[95px]">Vencimento</TableHead>
    <TableHead className="w-[110px] text-right">Valor</TableHead>
    <TableHead className="w-[140px]">Conta</TableHead>
    <TableHead className="w-[100px]">Status</TableHead>
    <TableHead className="w-[70px]">DDA</TableHead>
    <TableHead className="w-[120px] text-right">Ações</TableHead>
  </TableRow>
);

export function ContasPagarTable({
  lancamentos: rawLancamentos, isLoading, selectedIds, isAdmin, stepFilter,
  onToggleSelect, onToggleSelectAll,
  onClassificar, onPrepararPagamento, onBaixaManual,
  onCancelar, onReabrir, onRemoverDoBordero, isCancelando, isReabrindo, isRemovendoDoBordero,
}: ContasPagarTableProps) {
  const [pendentesOpen, setPendentesOpen] = useState(true);
  const [validadosOpen, setValidadosOpen] = useState(true);
  const [finalizadosOpen, setFinalizadosOpen] = useState(false);

  // Apply step-based filtering
  const lancamentos = stepFilter ? rawLancamentos.filter(l => {
    if (stepFilter === 1) return true;
    if (stepFilter === 2) return l.status === "PREVISTO" && !l.subcategoria;
    if (stepFilter === 3) return l.status === "PREVISTO" && !!l.subcategoria && !hasPaymentData(l);
    return true;
  }) : rawLancamentos;

  // Split into sections
  const pendentes = useMemo(() => lancamentos.filter(l => l.status === "PREVISTO"), [lancamentos]);
  const validados = useMemo(() => lancamentos.filter(l => ["CLASSIFICADO", "BORDERO", "AUTORIZADO", "PROCESSANDO"].includes(l.status)), [lancamentos]);
  const finalizados = useMemo(() => lancamentos.filter(l => ["BAIXADO", "CANCELADO"].includes(l.status)), [lancamentos]);

  // Group validados by month
  const validadosByMonth = useMemo(() => {
    const map = new Map<string, Lancamento[]>();
    for (const l of validados) {
      const monthKey = l.data_vencimento.substring(0, 7);
      if (!map.has(monthKey)) map.set(monthKey, []);
      map.get(monthKey)!.push(l);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [validados]);

  const totalPendentes = pendentes.reduce((s, l) => s + l.valor, 0);
  const totalValidados = validados.reduce((s, l) => s + l.valor, 0);

  const sharedProps = {
    selectedIds, onToggleSelect, onClassificar, onPrepararPagamento,
    onBaixaManual, onCancelar, onReabrir, onRemoverDoBordero,
    isCancelando, isReabrindo, isRemovendoDoBordero, isAdmin,
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground text-sm">Carregando...</CardContent>
      </Card>
    );
  }

  if (lancamentos.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground text-sm">Nenhum lançamento encontrado.</CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Section: Pendentes de Validação */}
      {pendentes.length > 0 && (
        <Collapsible open={pendentesOpen} onOpenChange={setPendentesOpen}>
          <Card className="border-amber-200/50">
            <CollapsibleTrigger asChild>
              <CardHeader className="pb-2 cursor-pointer hover:bg-muted/30 transition-colors bg-amber-50/50">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    {pendentesOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    <span className="text-amber-800">Pendentes de Validação</span>
                    <Badge variant="secondary" className="text-[10px]">{pendentes.length}</Badge>
                  </CardTitle>
                  <span className="text-sm font-semibold text-amber-700">{fmtCurrency(totalPendentes)}</span>
                </div>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>{TABLE_HEADERS}</TableHeader>
                    <TableBody>
                      {pendentes.map(l => (
                        <LancamentoRow key={l.id} l={l} {...sharedProps} />
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>
      )}

      {/* Section: Contas Validadas — grouped by month */}
      {validados.length > 0 && (
        <Collapsible open={validadosOpen} onOpenChange={setValidadosOpen}>
          <Card className="border-primary/20">
            <CollapsibleTrigger asChild>
              <CardHeader className="pb-2 cursor-pointer hover:bg-muted/30 transition-colors">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    {validadosOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    <CheckCircle2 className="h-4 w-4 text-primary" />
                    Contas Validadas
                    <Badge variant="secondary" className="text-[10px]">{validados.length}</Badge>
                  </CardTitle>
                  <span className="text-sm font-semibold text-primary">{fmtCurrency(totalValidados)}</span>
                </div>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="p-0 space-y-0">
                {validadosByMonth.map(([monthKey, items]) => {
                  const monthTotal = items.reduce((s, l) => s + l.valor, 0);
                  return (
                    <div key={monthKey}>
                      <div className="flex items-center justify-between px-4 py-2 bg-muted/30 border-t border-b">
                        <span className="text-sm font-medium">{formatMonthTitle(monthKey)}</span>
                        <span className="text-xs font-semibold text-muted-foreground">{fmtCurrency(monthTotal)}</span>
                      </div>
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>{TABLE_HEADERS}</TableHeader>
                          <TableBody>
                            {items.map(l => (
                              <LancamentoRow key={l.id} l={l} {...sharedProps} />
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>
      )}

      {/* Section: Finalizados (Baixado/Cancelado) */}
      {finalizados.length > 0 && (
        <Collapsible open={finalizadosOpen} onOpenChange={setFinalizadosOpen}>
          <Card className="opacity-70">
            <CollapsibleTrigger asChild>
              <CardHeader className="pb-2 cursor-pointer hover:bg-muted/30 transition-colors">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2 text-muted-foreground">
                    {finalizadosOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    Finalizados
                    <Badge variant="secondary" className="text-[10px]">{finalizados.length}</Badge>
                  </CardTitle>
                </div>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>{TABLE_HEADERS}</TableHeader>
                    <TableBody>
                      {finalizados.map(l => (
                        <LancamentoRow key={l.id} l={l} {...sharedProps} />
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>
      )}
    </div>
  );
}
