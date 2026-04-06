import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  Tags, Check, AlertTriangle, ClipboardList,
  ArrowUpCircle, ArrowDownCircle, Filter,
  CheckCircle2, CircleDot,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useDefaultEmpresa } from "@/hooks/useDefaultEmpresa";
import { ModuleHeader } from "@/components/system/ModuleHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BaseSheet } from "@/components/system/BaseSheet";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { LoadingState } from "@/components/system/states";

interface Lancamento {
  id: string;
  cod_empresa: number;
  tipo: string;
  status: string;
  descricao: string;
  pessoa_nome: string | null;
  valor: number;
  data_vencimento: string;
  categoria: string | null;
  natureza: string | null;
  subcategoria: string | null;
  origem: string;
  requer_validacao: boolean;
  dados_extras: Record<string, unknown> | null;
}

interface PlanoContaRow {
  id: string;
  conta_numero: string;
  conta_descricao: string;
  grupo_dre: string;
  categoria: string;
}

type StatusFilter = "TODOS" | "PREVISTO" | "CLASSIFICADO";

export default function FinanceiroClassificacaoPage() {
  const { codEmpresa } = useDefaultEmpresa();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("TODOS");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sheetOpen, setSheetOpen] = useState(false);
  const [formConta, setFormConta] = useState("");
  const [formNatureza, setFormNatureza] = useState("");
  const [formCategoria, setFormCategoria] = useState("");

  // ── helpers ──
  const invokeAction = async (action: string, extra: Record<string, unknown> = {}) => {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) throw new Error("Sessão expirada — faça login novamente");
    const { data, error } = await supabase.functions.invoke("financeiro-lancamentos", {
      body: { action, ...extra },
      headers: { Authorization: `Bearer ${token}` },
    });
    if (error) throw error;
    return data;
  };

  const fmtCurrency = (v: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

  // ── queries ──
  const { data: planoContas = [] } = useQuery<PlanoContaRow[]>({
    queryKey: ["dre-plano-contas-active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dre_plano_contas")
        .select("id, conta_numero, conta_descricao, grupo_dre, categoria")
        .eq("ativo", true)
        .order("conta_descricao");
      if (error) throw error;
      return data || [];
    },
  });

  const { data: lancamentos = [], isLoading } = useQuery<Lancamento[]>({
    queryKey: ["classificacao-lancamentos", codEmpresa],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lancamentos_financeiros")
        .select("id, cod_empresa, tipo, status, descricao, pessoa_nome, valor, data_vencimento, categoria, natureza, subcategoria, origem, requer_validacao, dados_extras")
        .eq("cod_empresa", codEmpresa!)
        .in("status", ["PREVISTO", "CLASSIFICADO"])
        .eq("tipo", "PAGAR")
        .order("data_vencimento", { ascending: true });
      if (error) throw error;
      return (data || []) as Lancamento[];
    },
    enabled: !!codEmpresa,
  });

  // ── derived data ──
  const filtered = useMemo(() => {
    if (statusFilter === "TODOS") return lancamentos;
    return lancamentos.filter(l => l.status === statusFilter);
  }, [lancamentos, statusFilter]);

  const kpis = useMemo(() => {
    const previstos = lancamentos.filter(l => l.status === "PREVISTO");
    const classificados = lancamentos.filter(l => l.status === "CLASSIFICADO");
    const pendentes = lancamentos.filter(l => l.requer_validacao);
    return {
      totalPrevisto: previstos.reduce((s, l) => s + l.valor, 0),
      qtdPrevisto: previstos.length,
      totalClassificado: classificados.reduce((s, l) => s + l.valor, 0),
      qtdClassificado: classificados.length,
      totalPlanejado: lancamentos.reduce((s, l) => s + l.valor, 0),
      qtdTotal: lancamentos.length,
      qtdPendentes: pendentes.length,
    };
  }, [lancamentos]);

  // ── mutations ──
  const classificarMutation = useMutation({
    mutationFn: async () => {
      const ids = Array.from(selectedIds);
      const promises = ids.map(id =>
        invokeAction("classificar", {
          id,
          subcategoria: formConta || null,
          natureza: formNatureza || null,
          categoria: formCategoria || null,
          status: "CLASSIFICADO",
        })
      );
      await Promise.all(promises);
    },
    onSuccess: () => {
      toast.success(`${selectedIds.size} lançamento(s) classificado(s)`);
      queryClient.invalidateQueries({ queryKey: ["classificacao-lancamentos"] });
      setSelectedIds(new Set());
      setSheetOpen(false);
      resetForm();
    },
    onError: () => toast.error("Erro ao classificar"),
  });

  const resetForm = () => {
    setFormConta("");
    setFormNatureza("");
    setFormCategoria("");
  };

  // ── selection ──
  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map(l => l.id)));
    }
  };

  const openClassificar = () => {
    if (selectedIds.size === 0) {
      toast.warning("Selecione ao menos um lançamento");
      return;
    }
    resetForm();
    // Pre-fill if single selection has existing data
    if (selectedIds.size === 1) {
      const l = lancamentos.find(x => selectedIds.has(x.id));
      if (l) {
        setFormConta(l.subcategoria || "");
        setFormNatureza(l.natureza || "");
        setFormCategoria(l.categoria || "");
      }
    }
    setSheetOpen(true);
  };

  const handleContaChange = (val: string) => {
    setFormConta(val);
    const conta = planoContas.find(c => c.conta_descricao === val);
    if (conta) {
      setFormNatureza(conta.grupo_dre);
      setFormCategoria(conta.categoria);
    }
  };

  const getContaNome = (l: Lancamento): string => {
    const nome = l.subcategoria || (l.dados_extras?.conta_descricao as string) || l.categoria || "—";
    return nome.toUpperCase();
  };

  return (
    <div className="space-y-6">
      <ModuleHeader
        title="Contas a Pagar — Planejado"
        subtitle="Visão de previsibilidade: classifique e valide lançamentos antes do pagamento"
        icon={<ClipboardList className="h-5 w-5" />}
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card
          className={`cursor-pointer transition-all ${statusFilter === "PREVISTO" ? "ring-2 ring-primary" : ""}`}
          onClick={() => setStatusFilter(s => s === "PREVISTO" ? "TODOS" : "PREVISTO")}
        >
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1">
              <CircleDot className="h-3.5 w-3.5" /> PREVISTOS
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-bold">{fmtCurrency(kpis.totalPrevisto)}</p>
            <p className="text-xs text-muted-foreground">{kpis.qtdPrevisto} lançamento(s)</p>
          </CardContent>
        </Card>

        <Card
          className={`cursor-pointer transition-all ${statusFilter === "CLASSIFICADO" ? "ring-2 ring-primary" : ""}`}
          onClick={() => setStatusFilter(s => s === "CLASSIFICADO" ? "TODOS" : "CLASSIFICADO")}
        >
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1">
              <CheckCircle2 className="h-3.5 w-3.5" /> CLASSIFICADOS
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-bold text-primary">{fmtCurrency(kpis.totalClassificado)}</p>
            <p className="text-xs text-muted-foreground">{kpis.qtdClassificado} lançamento(s)</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1">
              <AlertTriangle className="h-3.5 w-3.5 text-warning" /> PENDENTES
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-bold text-warning">{kpis.qtdPendentes}</p>
            <p className="text-xs text-muted-foreground">sem classificação</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1">
              <ArrowDownCircle className="h-3.5 w-3.5" /> TOTAL PLANEJADO
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-bold">{fmtCurrency(kpis.totalPlanejado)}</p>
            <p className="text-xs text-muted-foreground">{kpis.qtdTotal} lançamento(s)</p>
          </CardContent>
        </Card>
      </div>

      {/* Action bar */}
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {selectedIds.size > 0
            ? `${selectedIds.size} selecionado(s)`
            : `${filtered.length} lançamento(s)`}
        </p>
        <Button
          size="sm"
          onClick={openClassificar}
          disabled={selectedIds.size === 0}
        >
          <Tags className="h-4 w-4 mr-1" />
          Classificar ({selectedIds.size})
        </Button>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6"><LoadingState /></div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              <Check className="h-8 w-8 mx-auto mb-2 text-primary" />
              Nenhum lançamento pendente neste filtro
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        checked={selectedIds.size === filtered.length && filtered.length > 0}
                        onCheckedChange={toggleAll}
                      />
                    </TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Descrição / Fornecedor</TableHead>
                    <TableHead>Conta</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead>Vencimento</TableHead>
                    <TableHead>Origem</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((l) => (
                    <TooltipProvider key={l.id}>
                      <TableRow className={selectedIds.has(l.id) ? "bg-muted/50" : ""}>
                        <TableCell>
                          <Checkbox
                            checked={selectedIds.has(l.id)}
                            onCheckedChange={() => toggleSelect(l.id)}
                          />
                        </TableCell>
                        <TableCell>
                          <Badge variant={l.status === "CLASSIFICADO" ? "default" : "secondary"}>
                            {l.status === "CLASSIFICADO" ? "Classificado" : "Previsto"}
                          </Badge>
                          {l.requer_validacao && (
                            <AlertTriangle className="h-3 w-3 text-warning inline ml-1" />
                          )}
                        </TableCell>
                        <TableCell className="max-w-[220px]">
                          <p className="truncate font-medium text-sm">{l.descricao?.toUpperCase()}</p>
                          {l.pessoa_nome && (
                            <p className="text-xs text-muted-foreground truncate">{l.pessoa_nome.toUpperCase()}</p>
                          )}
                        </TableCell>
                        <TableCell>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="text-sm font-medium">
                                {getContaNome(l)}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p className="text-xs">{l.natureza || "—"} › {l.categoria || "—"}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">{fmtCurrency(l.valor)}</TableCell>
                        <TableCell className="text-sm">
                          {l.data_vencimento
                            ? format(new Date(l.data_vencimento + "T00:00:00"), "dd/MM/yyyy")
                            : "—"}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px]">{l.origem}</Badge>
                        </TableCell>
                      </TableRow>
                    </TooltipProvider>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Classification Sheet */}
      <BaseSheet
        open={sheetOpen}
        onOpenChange={(open) => { if (!open) { setSheetOpen(false); resetForm(); } }}
        title={`Classificar ${selectedIds.size} lançamento(s)`}
      >
        <div className="space-y-5 py-4">
          <p className="text-sm text-muted-foreground">
            Selecione a conta do plano de contas. A natureza e categoria serão preenchidas automaticamente.
          </p>

          <div className="space-y-1">
            <Label>Conta (Plano de Contas)</Label>
            <Select value={formConta} onValueChange={handleContaChange}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione a conta" />
              </SelectTrigger>
              <SelectContent>
                {planoContas.map(c => (
                  <SelectItem key={c.id} value={c.conta_descricao}>
                    <span className="uppercase">{c.conta_numero} — {c.conta_descricao}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Natureza (DRE)</Label>
              <p className="text-sm font-medium uppercase bg-muted px-3 py-2 rounded-md">
                {formNatureza?.replace(/_/g, " ") || "—"}
              </p>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Categoria</Label>
              <p className="text-sm font-medium uppercase bg-muted px-3 py-2 rounded-md">
                {formCategoria?.replace(/_/g, " ") || "—"}
              </p>
            </div>
          </div>

          <Button
            className="w-full"
            onClick={() => classificarMutation.mutate()}
            disabled={classificarMutation.isPending || !formConta}
          >
            <Check className="h-4 w-4 mr-1" />
            Confirmar Classificação ({selectedIds.size})
          </Button>
        </div>
      </BaseSheet>
    </div>
  );
}
