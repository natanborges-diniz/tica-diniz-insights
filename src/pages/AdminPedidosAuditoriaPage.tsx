// src/pages/AdminPedidosAuditoriaPage.tsx
// Admin: Auditoria de pedidos para fornecedores

import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, RefreshCw, Package, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listarHistoricoPedidos, PedidoFornecedorRecord } from "@/services/hoyaService";
import { useEmpresas } from "@/hooks/useEmpresas";

export default function AdminPedidosAuditoriaPage() {
  const { empresas } = useEmpresas();
  const [empresa, setEmpresa] = useState<string>("ALL");
  const [pedidos, setPedidos] = useState<PedidoFornecedorRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPedidos = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listarHistoricoPedidos(empresa, 100);
      setPedidos(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao buscar pedidos");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPedidos();
  }, [empresa]);

  function statusBadge(status: string | null) {
    if (!status) return <Badge variant="secondary">—</Badge>;
    const s = status.toUpperCase();
    if (s === "ERRO") return <Badge variant="destructive">Erro</Badge>;
    if (s.includes("ENVI") || s.includes("PROD")) return <Badge className="bg-emerald-500/15 text-emerald-700 border-emerald-300">{status}</Badge>;
    return <Badge variant="secondary">{status}</Badge>;
  }

  function envBadge(env: string | null) {
    if (env === "production") return <Badge className="bg-red-500/15 text-red-700 border-red-300">Produção</Badge>;
    return <Badge className="bg-amber-500/15 text-amber-700 border-amber-300">Staging</Badge>;
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link to="/admin/health">
                <Button variant="ghost" size="icon"><ArrowLeft className="h-5 w-5" /></Button>
              </Link>
              <div className="flex items-center gap-2">
                <Package className="h-6 w-6 text-primary" />
                <h1 className="text-xl font-bold">Auditoria de Pedidos</h1>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Select value={empresa} onValueChange={setEmpresa}>
                <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Todas as empresas</SelectItem>
                  {empresas.map(e => (
                    <SelectItem key={e.codEmpresa} value={String(e.codEmpresa)}>
                      {e.nome || `Empresa ${e.codEmpresa}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" onClick={fetchPedidos} disabled={loading}>
                <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
                Atualizar
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 space-y-6">
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Histórico de Pedidos ({pedidos.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>OS</TableHead>
                    <TableHead>Empresa</TableHead>
                    <TableHead>Nº Pedido</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Ambiente</TableHead>
                    <TableHead>Solicitante</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pedidos.map(p => (
                    <TableRow key={p.id}>
                      <TableCell className="text-xs font-mono">
                        {p.requested_at ? new Date(p.requested_at).toLocaleString("pt-BR") : new Date(p.created_at).toLocaleString("pt-BR")}
                      </TableCell>
                      <TableCell className="font-medium">{p.cod_os}</TableCell>
                      <TableCell>{p.cod_empresa}</TableCell>
                      <TableCell className="font-mono">{p.numero_pedido || "—"}</TableCell>
                      <TableCell>{statusBadge(p.status)}</TableCell>
                      <TableCell>{envBadge(p.hoya_environment)}</TableCell>
                      <TableCell className="text-xs font-mono text-muted-foreground">
                        {p.requested_by ? p.requested_by.slice(0, 8) + "…" : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                  {pedidos.length === 0 && !loading && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                        Nenhum pedido encontrado
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
