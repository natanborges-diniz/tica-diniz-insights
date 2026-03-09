import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  Shield, CheckCircle2, XCircle, RefreshCw, ExternalLink,
  Landmark, Clock, AlertTriangle, Zap,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { ModuleHeader } from "@/components/system/ModuleHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";

// ─── Types ───────────────────────────────────────────────────
interface ContaBancaria {
  id: string;
  cod_empresa: number;
  cnpj: string | null;
  company_id: string | null;
  account_id: string | null;
  agencia: string | null;
  conta: string | null;
  ativa: boolean;
}

interface TokenStatus {
  cod_empresa: number;
  cnpj: string | null;
  company_id: string | null;
  ativa: boolean;
  autenticado: boolean;
  token_expira_em: string | null;
  token_expirado: boolean;
  scopes: string[];
}

interface ExtratoTestResult {
  success: boolean;
  count: number;
  saldo?: number;
  error?: string;
}

// ─── Helpers ─────────────────────────────────────────────────
async function getAuthHeaders() {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) throw new Error("Sessão não encontrada. Faça login.");
  return {
    Authorization: `Bearer ${token}`,
    apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    "Content-Type": "application/json",
  };
}

async function callBtgAuth(action: string, body?: Record<string, unknown>) {
  const headers = await getAuthHeaders();
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/btg-auth`;
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ action, ...body }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `Erro ${res.status}`);
  }
  return res.json();
}

async function callBtgExtrato(codEmpresa: number) {
  const headers = await getAuthHeaders();
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/btg-extrato`;
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ cod_empresa: codEmpresa }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Erro ${res.status}`);
  return data;
}

// ─── Component ───────────────────────────────────────────────
export default function AdminBtgValidacaoPage() {
  const { isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const [extratoResult, setExtratoResult] = useState<ExtratoTestResult | null>(null);
  const [authDiagnostico, setAuthDiagnostico] = useState<Record<string, unknown> | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  // Handle callback redirect from BTG OAuth
  useState(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("btg_callback") === "success") {
      const codEmpresa = params.get("cod_empresa");
      toast.success(`Autorização BTG concluída para empresa ${codEmpresa}!`);
      // Clean up URL params
      window.history.replaceState({}, "", window.location.pathname);
      // Refresh status
      setTimeout(() => queryClient.invalidateQueries({ queryKey: ["btg-status"] }), 1000);
    }
  });

  // Fetch empresas for name resolution
  const { data: empresas = [] } = useQuery({
    queryKey: ["empresas-btg"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("empresa")
        .select("cod_empresa, nome_fantasia")
        .eq("ativa", true)
        .order("cod_empresa");
      if (error) throw error;
      return data as { cod_empresa: number; nome_fantasia: string | null }[];
    },
    enabled: isAdmin,
  });

  const getEmpresaNome = (codEmpresa: number) => {
    const emp = empresas.find(e => e.cod_empresa === codEmpresa);
    return emp?.nome_fantasia || `Loja ${codEmpresa}`;
  };

  // Fetch contas bancárias
  const { data: contas = [], isLoading: loadingContas } = useQuery({
    queryKey: ["btg-contas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("btg_contas_bancarias")
        .select("*")
        .order("cod_empresa");
      if (error) throw error;
      return data as ContaBancaria[];
    },
    enabled: isAdmin,
  });

  // Fetch token status via edge function
  const { data: tokenStatus, isLoading: loadingStatus, refetch: refetchStatus } = useQuery({
    queryKey: ["btg-status"],
    queryFn: async () => {
      const headers = await getAuthHeaders();
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/btg-auth?action=status`;
      const res = await fetch(url, { method: "GET", headers });
      if (!res.ok) {
        // Try POST fallback
        const res2 = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/btg-auth`, {
          method: "POST",
          headers,
          body: JSON.stringify({ action: "status" }),
        });
        if (!res2.ok) throw new Error("Falha ao buscar status");
        return res2.json() as Promise<TokenStatus[]>;
      }
      return res.json() as Promise<TokenStatus[]>;
    },
    enabled: isAdmin,
    refetchInterval: 30000,
  });

  // Authorize mutation
  const authorizeMutation = useMutation({
    mutationFn: async (codEmpresa: number) => {
      setAuthDiagnostico(null);
      setAuthError(null);
      return callBtgAuth("authorize", { cod_empresa: codEmpresa });
    },
    onSuccess: (data) => {
      // Store diagnostics
      if (data._diagnostico) {
        setAuthDiagnostico(data._diagnostico);
      }

      if (data.authorize_url) {
        setAuthDiagnostico(prev => ({
          ...prev,
          authorize_url: data.authorize_url,
        }));
        toast.success("Redirecionando para autorização BTG...");
        window.location.href = data.authorize_url;
      }
    },
    onError: (err: Error) => {
      setAuthError(err.message);
      toast.error(`Erro ao autorizar: ${err.message}`);
    },
  });

  // Refresh token mutation
  const refreshMutation = useMutation({
    mutationFn: async (codEmpresa: number) => {
      return callBtgAuth("refresh", { cod_empresa: codEmpresa });
    },
    onSuccess: () => {
      toast.success("Token renovado com sucesso!");
      queryClient.invalidateQueries({ queryKey: ["btg-status"] });
    },
    onError: (err: Error) => {
      toast.error(`Erro ao renovar: ${err.message}`);
    },
  });

  // Test extrato
  const testExtratoMutation = useMutation({
    mutationFn: async (codEmpresa: number) => {
      return callBtgExtrato(codEmpresa);
    },
    onSuccess: (data) => {
      const items = Array.isArray(data) ? data : data.items || [];
      setExtratoResult({
        success: true,
        count: items.length,
        saldo: items.length > 0 ? items[items.length - 1]?.saldo_apos : undefined,
      });
      toast.success(`Extrato retornou ${items.length} lançamentos`);
    },
    onError: (err: Error) => {
      setExtratoResult({ success: false, count: 0, error: err.message });
      toast.error(`Erro no extrato: ${err.message}`);
    },
  });

  const getStatusForEmpresa = (codEmpresa: number) =>
    tokenStatus?.find((t) => t.cod_empresa === codEmpresa);

  if (!isAdmin) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        Acesso restrito a administradores.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ModuleHeader
        title="Validação BTG Banking"
        subtitle="Teste de autenticação OAuth, status de tokens e extrato bancário"
      />

      {/* ── Etapas do Plano ────────────────────────────────── */}
      <div className="grid gap-4 md:grid-cols-4">
        <StepCard
          step={1}
          title="Contas Cadastradas"
          status={contas.length > 0 ? "done" : "pending"}
          detail={`${contas.length} conta(s) no banco`}
        />
        <StepCard
          step={2}
          title="OAuth Autorizado"
          status={
            tokenStatus?.some((t) => t.autenticado && !t.token_expirado)
              ? "done"
              : tokenStatus?.some((t) => t.autenticado)
                ? "warning"
                : "pending"
          }
          detail={
            tokenStatus?.some((t) => t.autenticado && !t.token_expirado)
              ? "Token ativo"
              : tokenStatus?.some((t) => t.autenticado)
                ? "Token expirado"
                : "Aguardando autorização"
          }
        />
        <StepCard
          step={3}
          title="Token Válido"
          status={
            tokenStatus?.some((t) => t.autenticado && !t.token_expirado)
              ? "done"
              : "pending"
          }
          detail={
            tokenStatus?.find((t) => t.token_expira_em)
              ? `Expira: ${format(new Date(tokenStatus.find((t) => t.token_expira_em)!.token_expira_em!), "dd/MM HH:mm")}`
              : "Sem token"
          }
        />
        <StepCard
          step={4}
          title="Extrato Testado"
          status={
            extratoResult?.success
              ? "done"
              : extratoResult
                ? "error"
                : "pending"
          }
          detail={
            extratoResult?.success
              ? `${extratoResult.count} lançamentos`
              : extratoResult?.error
                ? "Falhou"
                : "Aguardando"
          }
        />
      </div>

      {/* ── Tabela de Contas & Ações ──────────────────────── */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Landmark className="h-4 w-4" />
            Contas Bancárias BTG
          </CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              refetchStatus();
              queryClient.invalidateQueries({ queryKey: ["btg-contas"] });
            }}
          >
            <RefreshCw className="h-3 w-3 mr-1" />
            Atualizar
          </Button>
        </CardHeader>
        <CardContent>
          {loadingContas || loadingStatus ? (
            <div className="text-center py-8 text-muted-foreground">Carregando...</div>
          ) : contas.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Nenhuma conta cadastrada em btg_contas_bancarias
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Empresa</TableHead>
                  <TableHead>CNPJ</TableHead>
                  <TableHead>Company ID</TableHead>
                  <TableHead>Status OAuth</TableHead>
                  <TableHead>Scopes</TableHead>
                  <TableHead>Expira em</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contas.map((conta) => {
                  const status = getStatusForEmpresa(conta.cod_empresa);
                  const isAuth = status?.autenticado && !status?.token_expirado;
                  const isExpired = status?.autenticado && status?.token_expirado;

                  return (
                    <TableRow key={conta.id}>
                      <TableCell className="font-medium">
                        {getEmpresaNome(conta.cod_empresa)}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {conta.cnpj || "—"}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {conta.company_id || <span className="text-muted-foreground">não definido</span>}
                      </TableCell>
                      <TableCell>
                        {isAuth ? (
                          <Badge variant="default" className="bg-emerald-600">
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            Ativo
                          </Badge>
                        ) : isExpired ? (
                          <Badge variant="secondary" className="bg-amber-100 text-amber-800">
                            <AlertTriangle className="h-3 w-3 mr-1" />
                            Expirado
                          </Badge>
                        ) : (
                          <Badge variant="outline">
                            <XCircle className="h-3 w-3 mr-1" />
                            Não autorizado
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {status?.scopes?.map((s, i) => (
                            <Badge key={i} variant="outline" className="text-[10px] px-1">
                              {s.replace("brn:btg:empresas:", "")}
                            </Badge>
                          )) || "—"}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs">
                        {status?.token_expira_em
                          ? format(new Date(status.token_expira_em), "dd/MM/yyyy HH:mm")
                          : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex gap-2 justify-end">
                          {!isAuth && (
                            <Button
                              size="sm"
                              onClick={() => authorizeMutation.mutate(conta.cod_empresa)}
                              disabled={authorizeMutation.isPending}
                            >
                              <ExternalLink className="h-3 w-3 mr-1" />
                              Autorizar
                            </Button>
                          )}
                          {(isAuth || isExpired) && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => refreshMutation.mutate(conta.cod_empresa)}
                              disabled={refreshMutation.isPending}
                            >
                              <RefreshCw className="h-3 w-3 mr-1" />
                              Renovar
                            </Button>
                          )}
                          {isAuth && (
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => testExtratoMutation.mutate(conta.cod_empresa)}
                              disabled={testExtratoMutation.isPending}
                            >
                              <Zap className="h-3 w-3 mr-1" />
                              Testar Extrato
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ── Resultado do Teste de Extrato ─────────────────── */}
      {extratoResult && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Zap className="h-4 w-4" />
              Resultado do Teste de Extrato
            </CardTitle>
          </CardHeader>
          <CardContent>
            {extratoResult.success ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-emerald-600">
                  <CheckCircle2 className="h-4 w-4" />
                  <span className="font-medium">Sucesso!</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  Retornou <strong>{extratoResult.count}</strong> lançamentos.
                  {extratoResult.saldo !== undefined && (
                    <> Último saldo: <strong>R$ {extratoResult.saldo.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</strong></>
                  )}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-destructive">
                  <XCircle className="h-4 w-4" />
                  <span className="font-medium">Falhou</span>
                </div>
                <p className="text-sm text-muted-foreground">{extratoResult.error}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Diagnóstico de Autorização ─────────────────── */}
      {(authDiagnostico || authError) && (
        <Card className="border-blue-200 bg-blue-50/30">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Shield className="h-4 w-4 text-blue-600" />
              Diagnóstico da Autorização
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {authError && (
              <div className="flex items-center gap-2 text-destructive">
                <XCircle className="h-4 w-4" />
                <span className="font-medium">Erro: {authError}</span>
              </div>
            )}
            {authDiagnostico && (
              <>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-muted-foreground">Ambiente:</span>
                    <Badge variant="outline" className="ml-2">
                      {String(authDiagnostico.environment || "?")}
                    </Badge>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Sandbox:</span>
                    <Badge variant={authDiagnostico.is_sandbox ? "secondary" : "default"} className="ml-2">
                      {authDiagnostico.is_sandbox ? "Sim (sandbox)" : "Não (produção)"}
                    </Badge>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Auth Base:</span>
                    <code className="ml-2 text-xs bg-muted px-1 py-0.5 rounded">
                      {String(authDiagnostico.auth_base || "?")}
                    </code>
                  </div>
                  <div>
                    <span className="text-muted-foreground">API Base:</span>
                    <code className="ml-2 text-xs bg-muted px-1 py-0.5 rounded">
                      {String(authDiagnostico.api_base || "?")}
                    </code>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Redirect URI:</span>
                    <code className="ml-2 text-xs bg-muted px-1 py-0.5 rounded break-all">
                      {String(authDiagnostico.redirect_uri || "?")}
                    </code>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Client ID (prefixo):</span>
                    <code className="ml-2 text-xs bg-muted px-1 py-0.5 rounded">
                      {String(authDiagnostico.client_id_prefix || "?")}...
                    </code>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Popup abriu:</span>
                    <Badge variant={authDiagnostico.popup_opened ? "default" : "destructive"} className="ml-2">
                      {authDiagnostico.popup_opened ? "Sim" : "Bloqueado!"}
                    </Badge>
                  </div>
                </div>

                {authDiagnostico.scopes && (
                  <div>
                    <span className="text-sm text-muted-foreground">Scopes solicitados:</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {(authDiagnostico.scopes as string[]).map((s, i) => (
                        <Badge key={i} variant="outline" className="text-[10px]">{s}</Badge>
                      ))}
                    </div>
                  </div>
                )}

                {authDiagnostico.authorize_url && (
                  <div className="mt-2">
                    <span className="text-sm text-muted-foreground">URL completa (copie se popup bloqueou):</span>
                    <div className="mt-1 p-2 bg-muted rounded text-xs font-mono break-all select-all max-h-20 overflow-y-auto">
                      {String(authDiagnostico.authorize_url)}
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-2"
                      onClick={() => {
                        navigator.clipboard.writeText(String(authDiagnostico.authorize_url));
                        toast.success("URL copiada!");
                      }}
                    >
                      Copiar URL
                    </Button>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Log de Ambiente ───────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Configuração do Ambiente
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">BTG_ENVIRONMENT:</span>
              <Badge variant="outline" className="ml-2">
                configurado no servidor
              </Badge>
            </div>
            <div>
              <span className="text-muted-foreground">BTG_CLIENT_ID:</span>
              <Badge variant="outline" className="ml-2 bg-emerald-50 text-emerald-700">
                ✓ configurado
              </Badge>
            </div>
            <div>
              <span className="text-muted-foreground">BTG_CLIENT_SECRET:</span>
              <Badge variant="outline" className="ml-2 bg-emerald-50 text-emerald-700">
                ✓ configurado
              </Badge>
            </div>
            <div>
              <span className="text-muted-foreground">BTG_REDIRECT_URI:</span>
              <Badge variant="outline" className="ml-2 bg-emerald-50 text-emerald-700">
                ✓ configurado
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Step Card ───────────────────────────────────────────────
function StepCard({
  step,
  title,
  status,
  detail,
}: {
  step: number;
  title: string;
  status: "done" | "pending" | "warning" | "error";
  detail: string;
}) {
  const colors = {
    done: "border-emerald-200 bg-emerald-50/50",
    pending: "border-border bg-card",
    warning: "border-amber-200 bg-amber-50/50",
    error: "border-destructive/30 bg-destructive/5",
  };
  const icons = {
    done: <CheckCircle2 className="h-5 w-5 text-emerald-600" />,
    pending: <Clock className="h-5 w-5 text-muted-foreground" />,
    warning: <AlertTriangle className="h-5 w-5 text-amber-600" />,
    error: <XCircle className="h-5 w-5 text-destructive" />,
  };

  return (
    <Card className={`${colors[status]} transition-colors`}>
      <CardContent className="pt-4 pb-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-medium text-muted-foreground">Etapa {step}</span>
          {icons[status]}
        </div>
        <p className="font-semibold text-sm">{title}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{detail}</p>
      </CardContent>
    </Card>
  );
}
