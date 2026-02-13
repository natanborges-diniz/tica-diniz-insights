import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Loader2, RefreshCw, Clock, CheckCircle, XCircle, AlertTriangle, SkipForward } from "lucide-react";
import { Navigate } from "react-router-dom";

const EMPRESAS = [
  { cod: 1, nome: "Empresa 1" }, { cod: 2, nome: "Empresa 2" },
  { cod: 4, nome: "Empresa 4" }, { cod: 6, nome: "Empresa 6" },
  { cod: 9, nome: "Empresa 9" }, { cod: 13, nome: "Empresa 13" },
  { cod: 14, nome: "Empresa 14" }, { cod: 15, nome: "Empresa 15" },
  { cod: 16, nome: "Empresa 16" }, { cod: 17, nome: "Empresa 17" },
  { cod: 18, nome: "Empresa 18" },
];

function generateCompetencias(): string[] {
  const result: string[] = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    result.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return result;
}

const statusIcon: Record<string, React.ReactNode> = {
  completed: <CheckCircle className="h-4 w-4 text-green-500" />,
  failed: <XCircle className="h-4 w-4 text-destructive" />,
  partial: <AlertTriangle className="h-4 w-4 text-yellow-500" />,
  running: <Loader2 className="h-4 w-4 animate-spin text-blue-500" />,
  pending: <SkipForward className="h-4 w-4 text-muted-foreground" />,
};

const statusLabel: Record<string, string> = {
  completed: "Concluído",
  failed: "Falhou",
  partial: "Parcial",
  running: "Executando",
  pending: "Skipped/Pendente",
};

interface SyncRun {
  id: string;
  status: string;
  modo: string;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  duracao_ms: number | null;
  total_registros: number | null;
  total_erros: number | null;
  error_code: string | null;
  error_message: string | null;
  error_step: string | null;
  is_auto_triggered: boolean | null;
  trigger_type: string;
  request_reason: string | null;
  competencia: string | null;
  empresas: number[] | null;
  entidades: string[];
}

export default function AdminSyncPage() {
  const { isAdmin, isLoading: authLoading } = useAuth();
  const [runs, setRuns] = useState<SyncRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const [selectedEmpresa, setSelectedEmpresa] = useState<string>("all");
  const [selectedCompetencia, setSelectedCompetencia] = useState<string>("");
  const [reason, setReason] = useState("");

  const competencias = generateCompetencias();

  const fetchRuns = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("sync_runs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(20);
    if (data) setRuns(data as unknown as SyncRun[]);
    if (error) console.error("Error fetching runs:", error);
    setLoading(false);
  };

  useEffect(() => {
    if (isAdmin) fetchRuns();
  }, [isAdmin]);

  if (authLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAdmin) return <Navigate to="/" replace />;

  const handleReprocess = async () => {
    if (!selectedCompetencia) {
      toast({ title: "Selecione a competência", variant: "destructive" });
      return;
    }
    if (!reason.trim()) {
      toast({ title: "Informe o motivo do reprocessamento", variant: "destructive" });
      return;
    }

    setSubmitting(true);
    const [ano, mes] = selectedCompetencia.split("-").map(Number);
    const empresas = selectedEmpresa === "all" ? undefined : [Number(selectedEmpresa)];

    try {
      const { data, error } = await supabase.functions.invoke("orchestrate-sync", {
        body: {
          modo: "competencia",
          competenciaAno: ano,
          competenciaMes: mes,
          empresas,
          request_reason: reason.trim(),
        },
      });

      if (error) throw error;

      if (data?.skipped) {
        toast({
          title: "Sync em andamento",
          description: "Outra execução está rodando. Tente novamente em alguns minutos.",
          variant: "destructive",
        });
      } else {
        toast({
          title: data?.success ? "Reprocessamento concluído" : "Reprocessamento com erros",
          description: `${data?.totalRegistros || 0} registros processados, ${data?.totalErros || 0} erros.`,
          variant: data?.success ? "default" : "destructive",
        });
      }

      setReason("");
      fetchRuns();
    } catch (err) {
      toast({
        title: "Erro ao reprocessar",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const empresaLabel = selectedEmpresa === "all" ? "Todas" : `Empresa ${selectedEmpresa}`;
  const impactText = `Será reprocessada a competência ${selectedCompetencia || "?"} para ${empresaLabel}. Os dados existentes desse período serão substituídos (delete + insert).`;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <RefreshCw className="h-5 w-5 text-primary" />
        <h1 className="text-2xl font-bold">Sync & Reprocessamento</h1>
      </div>

      {/* Reprocessing Form */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Reprocessar por Competência</CardTitle>
          <CardDescription>
            Selecione a empresa e competência para reprocessar. Dados existentes serão substituídos (idempotente).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-sm font-medium text-muted-foreground mb-1 block">Empresa</label>
              <Select value={selectedEmpresa} onValueChange={setSelectedEmpresa}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as empresas</SelectItem>
                  {EMPRESAS.map((e) => (
                    <SelectItem key={e.cod} value={String(e.cod)}>
                      {e.nome} (cod {e.cod})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground mb-1 block">Competência</label>
              <Select value={selectedCompetencia} onValueChange={setSelectedCompetencia}>
                <SelectTrigger>
                  <SelectValue placeholder="YYYY-MM" />
                </SelectTrigger>
                <SelectContent>
                  {competencias.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-1">
              <label className="text-sm font-medium text-muted-foreground mb-1 block">Motivo / Justificativa</label>
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Ex: Correção retroativa de vendas..."
                className="h-10 min-h-[40px]"
              />
            </div>
          </div>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button disabled={!selectedCompetencia || !reason.trim() || submitting}>
                {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                Reprocessar
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Confirmar Reprocessamento</AlertDialogTitle>
                <AlertDialogDescription className="space-y-2">
                  <p>{impactText}</p>
                  <p className="text-sm"><strong>Motivo:</strong> {reason}</p>
                  <p className="text-sm text-muted-foreground">
                    Tempo estimado: 2-10 minutos dependendo do volume de dados.
                  </p>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={handleReprocess}>Confirmar e Reprocessar</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>

      {/* Runs History */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-lg">Histórico de Execuções</CardTitle>
            <CardDescription>Últimas 20 execuções do sync</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={fetchRuns} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center p-4">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : runs.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Nenhuma execução registrada.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Status</TableHead>
                    <TableHead>Modo</TableHead>
                    <TableHead>Competência</TableHead>
                    <TableHead>Trigger</TableHead>
                    <TableHead>Registros</TableHead>
                    <TableHead>Erros</TableHead>
                    <TableHead>Duração</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead>Motivo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {runs.map((run) => (
                    <TableRow key={run.id}>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          {statusIcon[run.status] || null}
                          <span className="text-xs">{statusLabel[run.status] || run.status}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">{run.modo}</Badge>
                      </TableCell>
                      <TableCell className="text-xs">{run.competencia || "—"}</TableCell>
                      <TableCell>
                        <Badge variant={run.is_auto_triggered ? "secondary" : "default"} className="text-xs">
                          {run.is_auto_triggered ? "cron" : "manual"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs font-mono">{run.total_registros ?? 0}</TableCell>
                      <TableCell>
                        {(run.total_erros ?? 0) > 0 ? (
                          <span className="text-xs text-destructive font-mono" title={run.error_message || ""}>
                            {run.total_erros} {run.error_step ? `(${run.error_step})` : ""}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">0</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs font-mono">
                        {run.duracao_ms ? `${(run.duracao_ms / 1000).toFixed(1)}s` : "—"}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(run.created_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                      </TableCell>
                      <TableCell className="text-xs max-w-[200px] truncate" title={run.request_reason || ""}>
                        {run.request_reason || "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
