import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";

import {
  Shield, CheckCircle2, XCircle, RefreshCw, ExternalLink,
  Landmark, AlertTriangle, Settings2, KeyRound,
  Eye, EyeOff, Save, Loader2, Globe, ChevronDown, ChevronUp, Copy,
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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
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

async function callBtgExtrato(action: string, body?: Record<string, unknown>) {
  const headers = await getAuthHeaders();
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/btg-extrato`;
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

const isEmbeddedPreview = () => {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
};

// ─── Main Component ─────────────────────────────────────────
export default function AdminBtgValidacaoPage() {
  const { isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const [manualAuthorizeUrl, setManualAuthorizeUrl] = useState<Record<number, string>>({});
  const [contaInputs, setContaInputs] = useState<Record<number, { agencia: string; conta: string }>>({});

  // Handle callback redirect from BTG OAuth
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("btg_callback") === "success") {
      const codEmpresa = params.get("cod_empresa");
      toast.success(`Autorização BTG concluída para empresa ${codEmpresa}!`);
      window.history.replaceState({}, "", window.location.pathname);
      setTimeout(() => queryClient.invalidateQueries({ queryKey: ["btg-status"] }), 1000);
    }
  }, [queryClient]);

  // Fetch empresas
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

  // Fetch token status
  const { data: tokenStatus, isLoading: loadingStatus, refetch: refetchStatus } = useQuery({
    queryKey: ["btg-status"],
    queryFn: async () => {
      const headers = await getAuthHeaders();
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/btg-auth`;
      const res = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify({ action: "status" }),
      });
      if (!res.ok) throw new Error("Falha ao buscar status");
      return res.json() as Promise<TokenStatus[]>;
    },
    enabled: isAdmin,
    refetchInterval: 60000,
  });

  // Authorize mutation
  const authorizeMutation = useMutation({
    mutationFn: async (codEmpresa: number) =>
      callBtgAuth("authorize", { cod_empresa: codEmpresa }) as Promise<{ authorize_url?: string }>,
  });

  const handleAuthorize = (codEmpresa: number) => {
    setManualAuthorizeUrl((prev) => { const next = { ...prev }; delete next[codEmpresa]; return next; });

    authorizeMutation.mutate(codEmpresa, {
      onSuccess: (data) => {
        if (!data?.authorize_url) {
          toast.error("URL de autorização não retornada.");
          return;
        }

        const inEmbeddedPreview = isEmbeddedPreview();
        if (inEmbeddedPreview) {
          // Em preview (iframe), tenta sair para navegação top-level para evitar bloqueios de popup/COOP.
          setManualAuthorizeUrl((prev) => ({ ...prev, [codEmpresa]: data.authorize_url }));
          try {
            window.top?.location.assign(data.authorize_url);
          } catch {
            // mantém fallback manual abaixo do botão
          }
          return;
        }

        toast.success("Redirecionando para autorização BTG...");
        window.location.assign(data.authorize_url);
      },
      onError: (err: Error) => {
        toast.error(`Erro ao autorizar: ${err.message}`);
      },
    });
  };

  // Refresh token mutation
  const refreshMutation = useMutation({
    mutationFn: async (codEmpresa: number) => callBtgAuth("refresh", { cod_empresa: codEmpresa }),
    onSuccess: () => {
      toast.success("Token renovado com sucesso!");
      queryClient.invalidateQueries({ queryKey: ["btg-status"] });
    },
    onError: (err: Error) => toast.error(`Erro ao renovar: ${err.message}`),
  });

  // Save account_id mutation (constructs from agencia + conta)
  const contasMutation = useMutation({
    mutationFn: async ({ codEmpresa, agencia, conta }: { codEmpresa: number; agencia: string; conta: string }) =>
      callBtgExtrato("contas", { cod_empresa: codEmpresa, agencia, conta }),
    onSuccess: (data) => {
      toast.success(`Account ID configurado: ${data.account_id}`);
      queryClient.invalidateQueries({ queryKey: ["btg-contas"] });
    },
    onError: (err: Error) => toast.error(`Erro ao configurar conta: ${err.message}`),
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

  const hasActiveToken = tokenStatus?.some((t) => t.autenticado && !t.token_expirado);
  const hasExpiredToken = tokenStatus?.some((t) => t.autenticado && t.token_expirado);

  return (
    <div className="space-y-6">
      <ModuleHeader
        title="Configuração BTG Banking"
        subtitle="Setup inicial da integração bancária — ambiente, credenciais e autorização OAuth"
      />

      {/* ── Status Geral ──────────────────────────────────── */}
      <div className="flex items-center gap-3 px-1">
        {hasActiveToken ? (
          <Badge variant="default" className="bg-emerald-600 gap-1.5 py-1 px-3">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Conexão ativa
          </Badge>
        ) : hasExpiredToken ? (
          <Badge variant="secondary" className="bg-amber-100 text-amber-800 gap-1.5 py-1 px-3">
            <AlertTriangle className="h-3.5 w-3.5" />
            Token expirado — renove abaixo
          </Badge>
        ) : (
          <Badge variant="outline" className="gap-1.5 py-1 px-3">
            <XCircle className="h-3.5 w-3.5" />
            Sem autorização
          </Badge>
        )}
        <span className="text-xs text-muted-foreground">
          {contas.length} conta(s) cadastrada(s)
        </span>
      </div>


      {/* ── 1. Ambiente ───────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Settings2 className="h-4 w-4 text-primary" />
            Ambiente
          </CardTitle>
          <CardDescription>
            Define qual ambiente BTG (sandbox ou produção) será usado em todas as chamadas.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <BtgEnvironmentToggle />
        </CardContent>
      </Card>

      {/* ── 2. Credenciais (colapsável) ───────────────────── */}
      <BtgCredenciaisSection />

      {/* ── 3. Contas & Conexão OAuth ─────────────────────── */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Landmark className="h-4 w-4" />
              Contas Bancárias & Autorização
            </CardTitle>
            <CardDescription className="mt-1">
              Gerencie as contas BTG vinculadas e o status de autorização OAuth de cada empresa.
            </CardDescription>
          </div>
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
            <div className="text-center py-8 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
              Carregando...
            </div>
          ) : contas.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Nenhuma conta cadastrada. Adicione contas na tabela <code className="text-xs bg-muted px-1 py-0.5 rounded">btg_contas_bancarias</code>.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Empresa</TableHead>
                  <TableHead>CNPJ</TableHead>
                  <TableHead>Account ID</TableHead>
                  <TableHead>Status OAuth</TableHead>
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
                        {conta.account_id ? (
                          <span className="text-emerald-700">{conta.account_id}</span>
                        ) : (
                          <span className="text-muted-foreground">não descoberto</span>
                        )}
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
                      <TableCell className="text-xs">
                        {status?.token_expira_em
                          ? format(new Date(status.token_expira_em), "dd/MM/yyyy HH:mm")
                          : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex gap-2 justify-end flex-wrap items-center">
                          {/* Configure account_id */}
                          {isAuth && !conta.account_id && (
                            <div className="flex gap-1 items-center">
                              <Input
                                placeholder="Agência"
                                className="w-20 h-8 text-xs"
                                value={contaInputs[conta.cod_empresa]?.agencia || ""}
                                onChange={(e) => setContaInputs(prev => ({
                                  ...prev,
                                  [conta.cod_empresa]: { ...prev[conta.cod_empresa], agencia: e.target.value, conta: prev[conta.cod_empresa]?.conta || "" }
                                }))}
                              />
                              <Input
                                placeholder="Conta"
                                className="w-28 h-8 text-xs"
                                value={contaInputs[conta.cod_empresa]?.conta || ""}
                                onChange={(e) => setContaInputs(prev => ({
                                  ...prev,
                                  [conta.cod_empresa]: { agencia: prev[conta.cod_empresa]?.agencia || "", conta: e.target.value }
                                }))}
                              />
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => {
                                  const inp = contaInputs[conta.cod_empresa];
                                  if (!inp?.agencia || !inp?.conta) {
                                    toast.error("Preencha agência e conta");
                                    return;
                                  }
                                  contasMutation.mutate({ codEmpresa: conta.cod_empresa, agencia: inp.agencia, conta: inp.conta });
                                }}
                                disabled={contasMutation.isPending}
                              >
                                {contasMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                              </Button>
                            </div>
                          )}
                          {/* Account ID configurado — setup completo */}
                          {isAuth && conta.account_id && (() => {
                            const requiredScopes = [
                              "brn:btg:empresas:receivables:credit-card.readonly",
                              "brn:btg:empresas:receivables:credit-card",
                            ];
                            const currentScopes: string[] = (status?.scopes as string[]) || [];
                            const missingScopes = requiredScopes.some(s => !currentScopes.includes(s));
                            return (
                              <>
                                {missingScopes ? (
                                  <Badge variant="outline" className="text-amber-700 border-amber-300">
                                    <AlertTriangle className="h-3 w-3 mr-1" />
                                    Escopos incompletos
                                  </Badge>
                                ) : (
                                  <Badge variant="outline" className="text-emerald-700 border-emerald-300">
                                    <CheckCircle2 className="h-3 w-3 mr-1" />
                                    Setup completo
                                  </Badge>
                                )}
                              </>
                            );
                          })()}
                          {!isAuth && (
                            <Button
                              size="sm"
                              onClick={() => handleAuthorize(conta.cod_empresa)}
                              disabled={authorizeMutation.isPending}
                            >
                              <ExternalLink className="h-3 w-3 mr-1" />
                              Autorizar
                            </Button>
                          )}
                          {isAuth && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleAuthorize(conta.cod_empresa)}
                              disabled={authorizeMutation.isPending}
                            >
                              <KeyRound className="h-3 w-3 mr-1" />
                              Re-autorizar
                            </Button>
                          )}
                          {manualAuthorizeUrl[conta.cod_empresa] && (
                            <>
                              <Button size="sm" variant="secondary" asChild>
                                <a href={manualAuthorizeUrl[conta.cod_empresa]} target="_top" rel="noreferrer">
                                  <ExternalLink className="h-3 w-3 mr-1" />
                                  Abrir BTG
                                </a>
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={async () => {
                                  try {
                                    await navigator.clipboard.writeText(manualAuthorizeUrl[conta.cod_empresa]);
                                    toast.success("URL do BTG copiada.");
                                  } catch {
                                    toast.error("Não foi possível copiar a URL.");
                                  }
                                }}
                              >
                                <Copy className="h-3 w-3 mr-1" />
                                Copiar URL
                              </Button>
                            </>
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
    </div>
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

// ─── Credenciais Section (collapsible) ──────────────────────
function BtgCredenciaisSection() {
  const [isOpen, setIsOpen] = useState(false);
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
        .select("id, api_key, api_key_staging, api_key_production, base_url_staging, base_url_production, redirect_uri_staging, redirect_uri_production, ambiente")
        .eq("fornecedor", "btg")
        .single();
      if (data) {
        setConfig(data as typeof config);
        const d = data as Record<string, string | null>;
        setForm({
          api_key: d.api_key || "",
          api_key_staging: d.api_key_staging || "",
          api_key_production: d.api_key_production || "",
          base_url_staging: d.base_url_staging || "",
          base_url_production: d.base_url_production || "",
          redirect_uri_staging: d.redirect_uri_staging || "",
          redirect_uri_production: d.redirect_uri_production || "",
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
        redirect_uri_staging: form.redirect_uri_staging || null,
        redirect_uri_production: form.redirect_uri_production || null,
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

  const hasAllCredentials = config.api_key && (config.api_key_staging || config.api_key_production);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/30 transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <KeyRound className="h-4 w-4 text-primary" />
                  Credenciais & URLs
                </CardTitle>
                {hasAllCredentials ? (
                  <Badge variant="default" className="bg-emerald-600 text-xs">
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    Configurado
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-xs">
                    Pendente
                  </Badge>
                )}
              </div>
              {isOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
            </div>
            <CardDescription>
              Client ID, Client Secret, Auth URLs e Redirect URIs por ambiente.
            </CardDescription>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="space-y-6 pt-0">
            {/* Client ID */}
            <div className="space-y-2">
              <Label className="text-sm font-medium flex items-center gap-2">
                Client ID (OAuth)
                {config.api_key && <CheckCircle2 className="h-3 w-3 text-emerald-600" />}
              </Label>
              <p className="text-xs text-muted-foreground">
                Identificador do aplicativo no portal BTG. Mesmo valor para ambos os ambientes.
              </p>
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
            </div>

            <div className="border-t" />

            {/* Client Secrets */}
            <div className="space-y-4">
              <Label className="text-sm font-medium">Client Secret (OAuth)</Label>
              <p className="text-xs text-muted-foreground -mt-2">
                Chave secreta separada por ambiente. Apenas a do ambiente ativo será usada.
              </p>
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-muted-foreground inline-block" />
                    Homologação
                    {config.ambiente !== "production" && <span className="text-xs font-medium text-primary">(ativa)</span>}
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      type={showKeySt ? "text" : "password"}
                      value={form.api_key_staging}
                      onChange={(e) => setForm((f) => ({ ...f, api_key_staging: e.target.value }))}
                      placeholder="••••••••"
                      className="font-mono text-sm flex-1"
                    />
                    <Button variant="outline" size="icon" onClick={() => setShowKeySt((v) => !v)} type="button">
                      {showKeySt ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-primary inline-block" />
                    Produção
                    {config.ambiente === "production" && <span className="text-xs font-medium text-primary">(ativa)</span>}
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      type={showKeyProd ? "text" : "password"}
                      value={form.api_key_production}
                      onChange={(e) => setForm((f) => ({ ...f, api_key_production: e.target.value }))}
                      placeholder="••••••••"
                      className="font-mono text-sm flex-1"
                    />
                    <Button variant="outline" size="icon" onClick={() => setShowKeyProd((v) => !v)} type="button">
                      {showKeyProd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            <div className="border-t" />

            {/* Auth URLs */}
            <div className="space-y-4">
              <Label className="text-sm font-medium flex items-center gap-2">
                <Globe className="h-3.5 w-3.5" />
                Auth URLs (BTG ID)
              </Label>
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs">Homologação</Label>
                  <Input
                    value={form.base_url_staging}
                    onChange={(e) => setForm((f) => ({ ...f, base_url_staging: e.target.value }))}
                    placeholder="https://id.sandbox.btgpactual.com"
                    className="font-mono text-sm"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Produção</Label>
                  <Input
                    value={form.base_url_production}
                    onChange={(e) => setForm((f) => ({ ...f, base_url_production: e.target.value }))}
                    placeholder="https://id.btgpactual.com"
                    className="font-mono text-sm"
                  />
                </div>
              </div>
            </div>

            <div className="border-t" />

            {/* Redirect URIs */}
            <div className="space-y-4">
              <Label className="text-sm font-medium flex items-center gap-2">
                <ExternalLink className="h-3.5 w-3.5" />
                Redirect URI (Callback)
              </Label>
              <p className="text-xs text-muted-foreground -mt-2">
                Deve ser idêntica à cadastrada no Portal do Desenvolvedor BTG para cada ambiente.
              </p>
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs">Homologação</Label>
                  <Input
                    value={form.redirect_uri_staging}
                    onChange={(e) => setForm((f) => ({ ...f, redirect_uri_staging: e.target.value }))}
                    placeholder="https://...supabase.co/functions/v1/btg-auth"
                    className="font-mono text-sm"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Produção</Label>
                  <Input
                    value={form.redirect_uri_production}
                    onChange={(e) => setForm((f) => ({ ...f, redirect_uri_production: e.target.value }))}
                    placeholder="https://...supabase.co/functions/v1/btg-auth"
                    className="font-mono text-sm"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <Button onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                Salvar Credenciais
              </Button>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
