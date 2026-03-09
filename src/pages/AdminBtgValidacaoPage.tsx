import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";

import {
  Shield, CheckCircle2, XCircle, RefreshCw, ExternalLink,
  Landmark, Clock, AlertTriangle, Zap, Settings2, KeyRound,
  Eye, EyeOff, Save, Loader2, Globe, AlertCircle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { ModuleHeader } from "@/components/system/ModuleHeader";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
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

// ─── BTG Credentials Section ─────────────────────────────────
function BtgCredenciaisSection() {
  const [config, setConfig] = useState<{
    id: string; api_key: string | null; api_key_staging: string | null;
    api_key_production: string | null; base_url_staging: string | null;
    base_url_production: string | null; redirect_uri_staging: string | null;
    redirect_uri_production: string | null; ambiente: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showClientId, setShowClientId] = useState(false);
  const [showKeySt, setShowKeySt] = useState(false);
  const [showKeyProd, setShowKeyProd] = useState(false);
  const [form, setForm] = useState({
    api_key: "", api_key_staging: "", api_key_production: "",
    base_url_staging: "", base_url_production: "",
    redirect_uri_staging: "", redirect_uri_production: "",
  });

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("fornecedor_configuracao")
        .select("id, api_key, api_key_staging, api_key_production, base_url_staging, base_url_production, ambiente")
        .eq("fornecedor", "btg")
        .single();
      if (data) {
        setConfig(data as typeof config);
        setForm({
          api_key: (data as Record<string, string | null>).api_key || "",
          api_key_staging: (data as Record<string, string | null>).api_key_staging || "",
          api_key_production: (data as Record<string, string | null>).api_key_production || "",
          base_url_staging: (data as Record<string, string | null>).base_url_staging || "",
          base_url_production: (data as Record<string, string | null>).base_url_production || "",
        });
      }
      setLoading(false);
    })();
  }, []);

  const handleSave = async () => {
    if (!config) return;
    setSaving(true);
    const { error } = await supabase
      .from("fornecedor_configuracao")
      .update({
        api_key: form.api_key || null,
        api_key_staging: form.api_key_staging || null,
        api_key_production: form.api_key_production || null,
        base_url_staging: form.base_url_staging || null,
        base_url_production: form.base_url_production || null,
      })
      .eq("id", config.id);
    setSaving(false);
    if (error) {
      toast.error("Erro ao salvar: " + error.message);
    } else {
      toast.success("Credenciais BTG salvas com sucesso");
    }
  };

  if (loading) return null;
  if (!config) return null;

  return (
    <div className="space-y-4">
      {/* Client ID */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-primary" />
            Client ID (OAuth)
          </CardTitle>
          <CardDescription>
            Identificador do aplicativo registrado no portal BTG. Mesmo valor para ambos os ambientes.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input
              type={showClientId ? "text" : "password"}
              value={form.api_key}
              onChange={(e) => setForm((f) => ({ ...f, api_key: e.target.value }))}
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              className="font-mono text-sm flex-1"
            />
            <Button variant="outline" size="icon" onClick={() => setShowClientId((v) => !v)} type="button">
              {showClientId ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
          </div>
          {config.api_key && (
            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-2">
              <CheckCircle2 className="h-3 w-3 text-primary" />
              Client ID configurado.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Client Secrets por ambiente */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-primary" />
            Client Secret (OAuth)
          </CardTitle>
          <CardDescription>
            Chave secreta do aplicativo BTG, separada por ambiente. Apenas a chave do ambiente ativo será utilizada.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label className="flex items-center gap-2 text-sm">
              <span className="h-2 w-2 rounded-full bg-muted-foreground inline-block" />
              Client Secret — Homologação (Staging)
              {config.ambiente !== "production" && <span className="text-xs font-medium text-primary ml-1">(ativa)</span>}
            </Label>
            <div className="flex gap-2">
              <Input
                type={showKeySt ? "text" : "password"}
                value={form.api_key_staging}
                onChange={(e) => setForm((f) => ({ ...f, api_key_staging: e.target.value }))}
                placeholder="••••••••••••••••••••"
                className="font-mono text-sm flex-1"
              />
              <Button variant="outline" size="icon" onClick={() => setShowKeySt((v) => !v)} type="button">
                {showKeySt ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
            {config.api_key_staging && (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3 text-primary" />
                Client Secret de homologação configurada.
              </p>
            )}
          </div>
          <div className="border-t" />
          <div className="space-y-2">
            <Label className="flex items-center gap-2 text-sm">
              <span className="h-2 w-2 rounded-full bg-primary inline-block" />
              Client Secret — Produção
              {config.ambiente === "production" && <span className="text-xs font-medium text-primary ml-1">(ativa)</span>}
            </Label>
            <div className="flex gap-2">
              <Input
                type={showKeyProd ? "text" : "password"}
                value={form.api_key_production}
                onChange={(e) => setForm((f) => ({ ...f, api_key_production: e.target.value }))}
                placeholder="••••••••••••••••••••"
                className="font-mono text-sm flex-1"
              />
              <Button variant="outline" size="icon" onClick={() => setShowKeyProd((v) => !v)} type="button">
                {showKeyProd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
            {config.api_key_production && (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3 text-primary" />
                Client Secret de produção configurada.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* URLs */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Globe className="h-4 w-4 text-primary" />
            URLs de Autorização
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label className="text-sm">URL Homologação</Label>
            <Input
              value={form.base_url_staging}
              onChange={(e) => setForm((f) => ({ ...f, base_url_staging: e.target.value }))}
              placeholder="https://id.sandbox.btgpactual.com"
              className="font-mono text-sm"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-sm">URL Produção</Label>
            <Input
              value={form.base_url_production}
              onChange={(e) => setForm((f) => ({ ...f, base_url_production: e.target.value }))}
              placeholder="https://id.btgpactual.com"
              className="font-mono text-sm"
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
          Salvar Credenciais
        </Button>
      </div>
    </div>
  );
}

// ─── Component ───────────────────────────────────────────────
export default function AdminBtgValidacaoPage() {
  const { isAdmin } = useAuth();
  const queryClient = useQueryClient();
  
  const [extratoResult, setExtratoResult] = useState<ExtratoTestResult | null>(null);
  const [authDiagnostico, setAuthDiagnostico] = useState<Record<string, unknown> | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  // Handle callback redirect from BTG OAuth
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("btg_callback") === "success") {
      const codEmpresa = params.get("cod_empresa");
      toast.success(`Autorização BTG concluída para empresa ${codEmpresa}!`);
      window.history.replaceState({}, "", window.location.pathname);
      setTimeout(() => queryClient.invalidateQueries({ queryKey: ["btg-status"] }), 1000);
    }
  }, []);

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

      {/* ── Configuração do Ambiente & Credenciais ─────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Settings2 className="h-4 w-4" />
            Configuração do Ambiente
          </CardTitle>
        </CardHeader>
        <CardContent>
          <BtgEnvironmentToggle />
        </CardContent>
      </Card>

      <BtgCredenciaisSection />
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

// ─── Environment Toggle ─────────────────────────────────────
function BtgEnvironmentToggle() {
  const { data: config, refetch } = useQuery({
    queryKey: ["btg-fornecedor-config"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fornecedor_configuracao")
        .select("id, ambiente, ativo")
        .eq("fornecedor", "btg")
        .single();
      if (error) throw error;
      return data;
    },
  });

  const [saving, setSaving] = useState(false);

  const toggleEnvironment = async () => {
    if (!config) return;
    setSaving(true);
    const newAmbiente = config.ambiente === "production" ? "staging" : "production";
    const { error } = await supabase
      .from("fornecedor_configuracao")
      .update({ ambiente: newAmbiente, updated_at: new Date().toISOString() })
      .eq("id", config.id);
    setSaving(false);
    if (error) {
      toast.error("Erro ao alterar ambiente");
      return;
    }
    toast.success(`Ambiente alterado para ${newAmbiente === "production" ? "Produção" : "Homologação"}`);
    refetch();
  };

  const isProduction = config?.ambiente === "production";

  return (
    <div className="flex items-center justify-between">
      <div>
        <Label className="text-sm font-medium">Ambiente BTG</Label>
        <p className="text-xs text-muted-foreground mt-0.5">
          {isProduction
            ? "Conectado ao ambiente de produção do BTG"
            : "Conectado ao ambiente de homologação (sandbox) do BTG"}
        </p>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-xs text-muted-foreground">Homologação</span>
        <Switch
          checked={isProduction}
          onCheckedChange={toggleEnvironment}
          disabled={saving}
        />
        <span className="text-xs font-medium">Produção</span>
        <Badge variant={isProduction ? "default" : "secondary"}>
          {isProduction ? "PROD" : "SANDBOX"}
        </Badge>
      </div>
    </div>
  );
}
