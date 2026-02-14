import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Activity, Wifi, WifiOff, Clock, RefreshCw } from "lucide-react";
import { Navigate } from "react-router-dom";

interface HealthLog {
  id: string;
  checked_at: string;
  status: 'up' | 'degraded' | 'down' | 'timeout';
  latency_ms: number | null;
  error_message: string | null;
  bridge_version: string | null;
}

export default function AdminHealthPage() {
  const { isAdmin, isLoading: authLoading } = useAuth();
  const [logs, setLogs] = useState<HealthLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("bridge_health_logs")
      .select("*")
      .order("checked_at", { ascending: false })
      .limit(100);
    if (data) setLogs(data as HealthLog[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (isAdmin) fetchLogs();
  }, [isAdmin, fetchLogs]);

  const triggerCheck = async () => {
    setChecking(true);
    try {
      await supabase.functions.invoke("bridge-health-check");
      await new Promise(r => setTimeout(r, 1500));
      await fetchLogs();
    } finally {
      setChecking(false);
    }
  };

  if (authLoading) {
    return <div className="flex items-center justify-center p-8"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }
  if (!isAdmin) return <Navigate to="/" replace />;

  const latest = logs[0];
  const isUp = latest?.status === 'up';
  const isDegraded = latest?.status === 'degraded';
  const uptime24h = logs.length > 0
    ? Math.round((logs.filter(l => l.status === 'up' || l.status === 'degraded').length / logs.length) * 100)
    : null;
  const avgLatency = logs.length > 0
    ? Math.round(logs.filter(l => l.latency_ms).reduce((s, l) => s + (l.latency_ms || 0), 0) / Math.max(1, logs.filter(l => l.latency_ms).length))
    : null;
  const recentFailures = logs.filter(l => l.status !== 'up').slice(0, 5);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-primary" />
          <h1 className="text-2xl font-bold">Bridge Health Monitor</h1>
        </div>
        <Button variant="outline" size="sm" onClick={triggerCheck} disabled={checking}>
          {checking ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <RefreshCw className="h-4 w-4 mr-1" />}
          Verificar agora
        </Button>
      </div>

      {/* Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className={isUp ? 'border-green-500/30' : isDegraded ? 'border-yellow-500/30 bg-yellow-500/5' : latest ? 'border-destructive/30 bg-destructive/5' : ''}>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              {isUp ? <Wifi className="h-8 w-8 text-green-500" /> : isDegraded ? <Wifi className="h-8 w-8 text-yellow-500" /> : <WifiOff className="h-8 w-8 text-destructive" />}
              <div className="min-w-0 flex-1">
                <p className="text-sm text-muted-foreground">Status Atual</p>
                <p className={`text-xl font-bold ${isUp ? 'text-green-500' : isDegraded ? 'text-yellow-500' : 'text-destructive'}`}>
                  {latest ? (isUp ? 'Online' : isDegraded ? 'Degradado' : latest.status === 'timeout' ? 'Timeout' : 'Offline') : '—'}
                </p>
                {isDegraded && (
                  <p className="text-xs text-yellow-600 mt-1">Processo OK, banco Firebird desconectado</p>
                )}
                {latest && !isUp && !isDegraded && latest.error_message && (
                  <p className="text-xs text-destructive mt-1 truncate" title={latest.error_message}>{latest.error_message}</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Clock className="h-8 w-8 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">Latência Atual</p>
                <p className="text-xl font-bold">{latest?.latency_ms ? `${latest.latency_ms}ms` : '—'}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div>
              <p className="text-sm text-muted-foreground">Uptime (últimos checks)</p>
              <p className={`text-xl font-bold ${(uptime24h ?? 0) >= 95 ? 'text-green-500' : (uptime24h ?? 0) >= 80 ? 'text-yellow-500' : 'text-destructive'}`}>
                {uptime24h !== null ? `${uptime24h}%` : '—'}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div>
              <p className="text-sm text-muted-foreground">Último Check</p>
              <p className="text-xl font-bold">
                {latest?.checked_at
                  ? new Date(latest.checked_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
                  : '—'}
              </p>
              {latest?.bridge_version && (
                <p className="text-xs text-muted-foreground mt-1">Bridge v{latest.bridge_version}</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Degraded detail banner */}
      {isDegraded && latest?.error_message && (
        <Card className="border-yellow-500/30 bg-yellow-500/5">
          <CardContent className="pt-6 pb-4">
            <div className="flex items-start gap-3">
              <Wifi className="h-5 w-5 text-yellow-600 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-yellow-700">Bridge parcialmente disponível</p>
                <p className="text-xs text-muted-foreground mt-1">
                  O processo Node.js está ativo, mas a conexão com o banco Firebird falhou.
                </p>
                <code className="text-xs bg-yellow-500/10 px-2 py-1 rounded mt-2 inline-block font-mono">
                  {latest.error_message}
                </code>
                <p className="text-xs text-muted-foreground mt-2">
                  Verifique a variável <strong>HEALTH_DB_TIMEOUT_MS</strong> no Railway (padrão: 600–800ms) para reduzir falsos negativos.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent Failures */}
      {recentFailures.length > 0 && (
        <Card className="border-destructive/30">
          <CardHeader>
            <CardTitle className="text-lg text-destructive">Falhas Recentes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {recentFailures.map(f => (
                <div key={f.id} className="flex items-center justify-between text-sm border-b pb-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="destructive" className="text-xs">{f.status}</Badge>
                    <span className="text-muted-foreground">{f.error_message || 'Sem detalhes'}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {new Date(f.checked_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Full Log */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-lg">Histórico de Health Checks</CardTitle>
            <CardDescription>Últimos 100 registros (retenção: 30 dias)</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={fetchLogs} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center p-4"><Loader2 className="h-6 w-6 animate-spin" /></div>
          ) : logs.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Nenhum health check registrado.</p>
          ) : (
            <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Status</TableHead>
                    <TableHead>Latência</TableHead>
                    <TableHead>Versão</TableHead>
                    <TableHead>Erro</TableHead>
                    <TableHead>Data/Hora</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map(log => (
                    <TableRow key={log.id}>
                      <TableCell>
                        <Badge
                          variant={log.status === 'up' ? 'default' : log.status === 'degraded' ? 'outline' : 'destructive'}
                          className={`text-xs ${log.status === 'degraded' ? 'border-yellow-500 text-yellow-600' : ''}`}
                        >
                          {log.status === 'degraded' ? 'degraded' : log.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs font-mono">{log.latency_ms ? `${log.latency_ms}ms` : '—'}</TableCell>
                      <TableCell className="text-xs">{log.bridge_version || '—'}</TableCell>
                      <TableCell className="text-xs max-w-[200px] truncate" title={log.error_message || ''}>
                        {log.error_message || '—'}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(log.checked_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })}
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
