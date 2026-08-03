import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  FileSearch, Download, RefreshCw, CheckCircle2, XCircle,
  Link2, AlertTriangle, PieChart, Search, FilterX,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useEmpresas } from "@/hooks/useEmpresas";
import { useDefaultEmpresa } from "@/hooks/useDefaultEmpresa";
import { ModuleHeader } from "@/components/system/ModuleHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";


interface DdaTitulo {
  id: string;
  cod_empresa: number;
  btg_dda_id: string | null;
  emissor: string | null;
  documento_emissor: string | null;
  banco_emissor: string | null;
  valor: number;
  data_vencimento: string;
  linha_digitavel: string | null;
  status: string;
  conciliado: boolean;
  parcela_id: string | null;
  pagamento_id: string | null;
  created_at: string;
}

interface Indicadores {
  total: number;
  conciliados: number;
  pendentes: number;
  ignorados: number;
  percentual_conciliado: number;
}

const STATUS_CONFIG: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  PENDENTE: { label: "Pendente", variant: "outline" },
  CONCILIADO: { label: "Conciliado", variant: "default" },
  IGNORADO: { label: "Ignorado", variant: "secondary" },
  PAGO: { label: "Pago", variant: "default" },
  // Envelhecido sem par — o BTG devolve todo o histórico da conta, e título
  // vencido há mais de 90 dias sem lançamento não vai mais encontrar um.
  ARQUIVADO: { label: "Arquivado", variant: "secondary" },
};

function formatCnpj(raw: string | null): string {
  if (!raw) return "—";
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 14) {
    return `${digits.slice(0,2)}.${digits.slice(2,5)}.${digits.slice(5,8)}/${digits.slice(8,12)}-${digits.slice(12)}`;
  }
  return raw;
}

export default function BankingDdaDashboard() {
  const { empresas } = useEmpresas();
  const { codEmpresa: codEmpresaDefault } = useDefaultEmpresa();
  const queryClient = useQueryClient();

  const [codEmpresa, setCodEmpresa] = useState<number>(codEmpresaDefault || 1);
  const [filtroStatus, setFiltroStatus] = useState<string>("todos");
  const [filtroConciliado, setFiltroConciliado] = useState<string>("todos");
  const [busca, setBusca] = useState<string>("");
  const [vencDe, setVencDe] = useState<string>("");
  const [vencAte, setVencAte] = useState<string>("");
  const [faixaValor, setFaixaValor] = useState<string>("todos");

  // Auto-import on mount / empresa change
  const [autoImported, setAutoImported] = useState(false);
  useEffect(() => setAutoImported(false), [codEmpresa]);

  useEffect(() => {
    if (autoImported) return;
    setAutoImported(true);
    (async () => {
      try {
        const { data: importResult } = await supabase.functions.invoke("btg-dda", {
          body: { action: "importar", cod_empresa: codEmpresa },
        });
        // Além dos títulos novos, a importação reavalia os órfãos — títulos que
        // chegaram antes da parcela do ERP. É esse número que diz se o boleto
        // encostou no lançamento.
        const novos = Number(importResult?.importados ?? 0);
        const vinculados = Number(importResult?.reconciliados ?? 0);
        const semMatch = Number(importResult?.sem_match ?? 0);

        if (novos > 0 || vinculados > 0) {
          const partes = [];
          if (novos > 0) partes.push(`${novos} novo(s) título(s)`);
          if (vinculados > 0) partes.push(`${vinculados} vinculado(s) a lançamentos`);
          toast.success(`DDA: ${partes.join(" · ")}`);
          queryClient.invalidateQueries({ queryKey: ["btg-dda"] });
          queryClient.invalidateQueries({ queryKey: ["btg-dda-indicadores"] });
        }
        if (semMatch > 0) {
          toast.warning(
            `${semMatch} boleto(s) sem lançamento correspondente — confira se a parcela já foi importada do ERP`,
          );
        }
      } catch (e) {
        console.warn("Auto-import DDA failed:", e);
      }
    })();
  }, [codEmpresa, autoImported, queryClient]);

  const { data: titulosRaw = [], isLoading } = useQuery<DdaTitulo[]>({
    queryKey: ["btg-dda", codEmpresa],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("btg-dda", {
        body: { action: "listar", cod_empresa: codEmpresa },
      });
      if (error) throw error;
      return Array.isArray(data) ? data : [];
    },
  });

  const onlyDigits = (v: string) => v.replace(/\D/g, "");

  const titulos = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const termoDigits = onlyDigits(busca);
    return titulosRaw.filter((t) => {
      if (filtroStatus !== "todos" && t.status !== filtroStatus) return false;
      if (filtroConciliado !== "todos" && String(t.conciliado) !== filtroConciliado) return false;
      if (vencDe && t.data_vencimento < vencDe) return false;
      if (vencAte && t.data_vencimento > vencAte) return false;
      if (faixaValor !== "todos") {
        const [min, max] = faixaValor.split("-").map(Number);
        if (t.valor < min) return false;
        if (max && t.valor > max) return false;
      }
      if (termo) {
        const alvoTexto = [t.emissor, t.banco_emissor].filter(Boolean).join(" ").toLowerCase();
        const alvoDigits = [t.documento_emissor, t.linha_digitavel]
          .filter(Boolean).map((v) => onlyDigits(String(v))).join(" ");
        const valorTexto = String(t.valor).replace(".", ",");
        const casaTexto = alvoTexto.includes(termo);
        const casaDigits = termoDigits.length >= 3 && alvoDigits.includes(termoDigits);
        const casaValor = valorTexto.includes(termo.replace(".", ","));
        if (!casaTexto && !casaDigits && !casaValor) return false;
      }
      return true;
    });
  }, [titulosRaw, filtroStatus, filtroConciliado, busca, vencDe, vencAte, faixaValor]);

  const filtrosAtivos =
    filtroStatus !== "todos" || filtroConciliado !== "todos" ||
    !!busca || !!vencDe || !!vencAte || faixaValor !== "todos";

  const limparFiltros = () => {
    setFiltroStatus("todos");
    setFiltroConciliado("todos");
    setBusca("");
    setVencDe("");
    setVencAte("");
    setFaixaValor("todos");
  };

  const { data: indicadores } = useQuery<Indicadores>({
    queryKey: ["btg-dda-indicadores", codEmpresa],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("btg-dda", {
        body: { action: "indicadores", cod_empresa: codEmpresa },
      });
      if (error) throw error;
      return data as Indicadores;
    },
  });

  const importarMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("btg-dda", {
        body: { action: "importar", cod_empresa: codEmpresa },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      toast.success(
        `${data.importados} importados · ${data.duplicados} já existiam · ` +
        `${data.reconciliados ?? 0} vinculados a lançamentos` +
        (data.sem_match ? ` · ${data.sem_match} sem correspondência` : ""),
      );
      queryClient.invalidateQueries({ queryKey: ["btg-dda"] });
      queryClient.invalidateQueries({ queryKey: ["btg-dda-indicadores"] });
    },
    onError: () => toast.error("Erro ao importar DDA"),
  });

  const conciliarAutoMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("btg-dda", {
        body: { action: "conciliar_auto", cod_empresa: codEmpresa },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      toast.success(`${data.conciliados} conciliados, ${data.sem_match} sem match`);
      queryClient.invalidateQueries({ queryKey: ["btg-dda"] });
      queryClient.invalidateQueries({ queryKey: ["btg-dda-indicadores"] });
    },
    onError: () => toast.error("Erro na conciliação automática"),
  });

  const ignorarMutation = useMutation({
    mutationFn: async (tituloId: string) => {
      const { error } = await supabase.functions.invoke("btg-dda", {
        body: { action: "ignorar", titulo_id: tituloId },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Título ignorado");
      queryClient.invalidateQueries({ queryKey: ["btg-dda"] });
      queryClient.invalidateQueries({ queryKey: ["btg-dda-indicadores"] });
    },
    onError: () => toast.error("Erro ao ignorar"),
  });

  const fmtCurrency = (v: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

  const totalValorPendente = titulos
    .filter(t => t.status === "PENDENTE" && !t.conciliado)
    .reduce((sum, t) => sum + t.valor, 0);

  return (
    <div className="space-y-6">
      <ModuleHeader
        title="Conciliação DDA"
        subtitle="Débito Direto Autorizado — títulos recebidos do banco para conciliação"
        icon={<FileSearch className="h-5 w-5" />}
        actions={
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => importarMutation.mutate()} disabled={importarMutation.isPending}>
              <Download className="h-4 w-4 mr-1" /> Importar DDA
            </Button>
            <Button size="sm" onClick={() => conciliarAutoMutation.mutate()} disabled={conciliarAutoMutation.isPending}>
              <RefreshCw className="h-4 w-4 mr-1" /> Conciliar Auto
            </Button>
          </div>
        }
      />

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Empresa</label>
          <Select value={String(codEmpresa)} onValueChange={(v) => setCodEmpresa(Number(v))}>
            <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {(empresas || []).map((e) => (
                <SelectItem key={e.codEmpresa} value={String(e.codEmpresa)}>
                  {e.nome || `Empresa ${e.codEmpresa}`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Status</label>
          <Select value={filtroStatus} onValueChange={setFiltroStatus}>
            <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Conciliado</label>
          <Select value={filtroConciliado} onValueChange={setFiltroConciliado}>
            <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="true">Sim</SelectItem>
              <SelectItem value="false">Não</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Vencimento de</label>
          <Input type="date" value={vencDe} onChange={(e) => setVencDe(e.target.value)} className="w-[150px]" />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">até</label>
          <Input type="date" value={vencAte} onChange={(e) => setVencAte(e.target.value)} className="w-[150px]" />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Faixa de valor</label>
          <Select value={faixaValor} onValueChange={setFaixaValor}>
            <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="0-100">Até R$ 100</SelectItem>
              <SelectItem value="100-1000">R$ 100 a 1.000</SelectItem>
              <SelectItem value="1000-10000">R$ 1.000 a 10.000</SelectItem>
              <SelectItem value="10000-0">Acima de R$ 10.000</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1 flex-1 min-w-[240px]">
          <label className="text-xs text-muted-foreground">Buscar</label>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Emissor, banco, CNPJ, linha digitável ou valor"
              className="pl-8"
            />
          </div>
        </div>
        {filtrosAtivos && (
          <Button size="sm" variant="ghost" onClick={limparFiltros}>
            <FilterX className="h-4 w-4 mr-1" /> Limpar
          </Button>
        )}
      </div>


      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
              <FileSearch className="h-4 w-4" /> Total Títulos
            </CardTitle>
          </CardHeader>
          <CardContent><p className="text-2xl font-bold">{indicadores?.total ?? "—"}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" /> Conciliados
            </CardTitle>
          </CardHeader>
          <CardContent><p className="text-2xl font-bold">{indicadores?.conciliados ?? "—"}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive" /> Pendentes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-destructive">{indicadores?.pendentes ?? "—"}</p>
            {totalValorPendente > 0 && (
              <p className="text-xs text-muted-foreground mt-1">{fmtCurrency(totalValorPendente)}</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
              <XCircle className="h-4 w-4" /> Ignorados
            </CardTitle>
          </CardHeader>
          <CardContent><p className="text-2xl font-bold">{indicadores?.ignorados ?? "—"}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
              <PieChart className="h-4 w-4" /> % Conciliado
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{indicadores?.percentual_conciliado ?? "—"}%</p>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            Títulos DDA
            <Badge variant="secondary" className="text-[10px]">
              {titulos.length}{filtrosAtivos ? ` de ${titulosRaw.length}` : ""}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <TooltipProvider>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[90px]">Vencimento</TableHead>
                    <TableHead>Emissor</TableHead>
                    <TableHead className="w-[150px]">Documento</TableHead>
                    <TableHead className="w-[140px]">Banco</TableHead>
                    <TableHead className="w-[120px] text-right">Valor</TableHead>
                    <TableHead className="w-[100px]">Status</TableHead>
                    <TableHead className="w-[80px] text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>
                  ) : titulos.length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Nenhum título DDA encontrado.</TableCell></TableRow>
                  ) : titulos.map((t) => {
                    const sc = STATUS_CONFIG[t.status] || { label: t.status, variant: "outline" as const };
                    const isOverdue = t.status === "PENDENTE" && new Date(t.data_vencimento + "T12:00:00") < new Date();
                    return (
                      <TableRow key={t.id} className={t.conciliado ? "opacity-60" : isOverdue ? "bg-destructive/5" : ""}>
                        <TableCell className="text-sm">
                          <span className={isOverdue ? "text-destructive font-medium" : ""}>
                            {format(new Date(t.data_vencimento + "T12:00:00"), "dd/MM/yy")}
                          </span>
                        </TableCell>
                        <TableCell className="text-sm max-w-[200px] truncate" title={t.emissor || undefined}>
                          {t.emissor || "—"}
                        </TableCell>
                        <TableCell className="text-xs font-mono">{formatCnpj(t.documento_emissor)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground truncate max-w-[140px]" title={t.banco_emissor || undefined}>
                          {t.banco_emissor || "—"}
                        </TableCell>
                        <TableCell className="text-sm text-right font-medium">{fmtCurrency(t.valor)}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Badge variant={sc.variant}>{sc.label}</Badge>
                            {t.conciliado && <Link2 className="h-3 w-3 text-muted-foreground" />}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          {t.status === "PENDENTE" && !t.conciliado && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => ignorarMutation.mutate(t.id)}
                                  disabled={ignorarMutation.isPending}
                                >
                                  <XCircle className="h-3.5 w-3.5" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Ignorar título</TooltipContent>
                            </Tooltip>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TooltipProvider>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
