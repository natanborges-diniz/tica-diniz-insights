import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  FileSearch, Download, RefreshCw, CheckCircle2, XCircle,
  Link2, AlertTriangle, PieChart, Eye,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useEmpresas } from "@/hooks/useEmpresas";
import { useDefaultEmpresa } from "@/hooks/useDefaultEmpresa";
import { ModuleHeader } from "@/components/system/ModuleHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";

interface DdaTitulo {
  id: string;
  cod_empresa: number;
  btg_dda_id: string | null;
  emissor: string | null;
  documento_emissor: string | null;
  numero_documento: string | null;
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
};

export default function BankingDdaDashboard() {
  const { empresas } = useEmpresas();
  const { codEmpresa: codEmpresaDefault } = useDefaultEmpresa();
  const queryClient = useQueryClient();

  const [codEmpresa, setCodEmpresa] = useState<number>(codEmpresaDefault || 1);
  const [filtroStatus, setFiltroStatus] = useState<string>("todos");
  const [filtroConciliado, setFiltroConciliado] = useState<string>("todos");

  const [autoImported, setAutoImported] = useState(false);

  const { data: titulos = [], isLoading } = useQuery<DdaTitulo[]>({
    queryKey: ["btg-dda", codEmpresa, filtroStatus, filtroConciliado],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("btg-dda", {
        body: { action: "listar", cod_empresa: codEmpresa },
      });
      if (error) throw error;
      let items = Array.isArray(data) ? data : [];

      // Auto-import from BTG if no local data exists
      if (items.length === 0 && !autoImported) {
        setAutoImported(true);
        try {
          const { data: importResult } = await supabase.functions.invoke("btg-dda", {
            body: { action: "importar", cod_empresa: codEmpresa },
          });
          if (importResult?.importados > 0) {
            const { data: refetched } = await supabase.functions.invoke("btg-dda", {
              body: { action: "listar", cod_empresa: codEmpresa },
            });
            items = Array.isArray(refetched) ? refetched : [];
            toast.success(`${importResult.importados} títulos DDA importados do BTG`);
          }
        } catch (e) {
          console.warn("Auto-import DDA failed:", e);
        }
      }

      if (filtroStatus !== "todos") items = items.filter((i: DdaTitulo) => i.status === filtroStatus);
      if (filtroConciliado !== "todos") items = items.filter((i: DdaTitulo) => String(i.conciliado) === filtroConciliado);
      return items;
    },
  });

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
      toast.success(`${data.importados} títulos importados (${data.duplicados} duplicados)`);
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
          <CardContent><p className="text-2xl font-bold text-destructive">{indicadores?.pendentes ?? "—"}</p></CardContent>
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
          <CardTitle className="text-base">Títulos DDA</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[90px]">Vencimento</TableHead>
                  <TableHead>Emissor</TableHead>
                  <TableHead className="w-[140px]">CNPJ Emissor</TableHead>
                  <TableHead className="w-[100px]">Nº Doc</TableHead>
                  <TableHead className="w-[120px] text-right">Valor</TableHead>
                  <TableHead className="w-[120px]">Status</TableHead>
                  <TableHead className="w-[100px] text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>
                ) : titulos.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Nenhum título DDA. Importe do BTG.</TableCell></TableRow>
                ) : titulos.map((t) => {
                  const sc = STATUS_CONFIG[t.status] || { label: t.status, variant: "outline" as const };
                  return (
                    <TableRow key={t.id} className={t.conciliado ? "opacity-60" : ""}>
                      <TableCell className="text-sm">
                        {format(new Date(t.data_vencimento + "T12:00:00"), "dd/MM/yy")}
                      </TableCell>
                      <TableCell className="text-sm">{t.emissor || "—"}</TableCell>
                      <TableCell className="text-xs font-mono">{t.documento_emissor || "—"}</TableCell>
                      <TableCell className="text-sm">{t.numero_documento || "—"}</TableCell>
                      <TableCell className="text-sm text-right font-medium">{fmtCurrency(t.valor)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Badge variant={sc.variant}>{sc.label}</Badge>
                          {t.conciliado && <Link2 className="h-3 w-3 text-muted-foreground" />}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        {t.status === "PENDENTE" && !t.conciliado && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => ignorarMutation.mutate(t.id)}
                            disabled={ignorarMutation.isPending}
                          >
                            <XCircle className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
