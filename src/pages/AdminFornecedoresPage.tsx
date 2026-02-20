// src/pages/AdminFornecedoresPage.tsx
// Módulo completo de configuração de fornecedores externos
// Abas por fornecedor | Ambiente staging/produção | URL | API Key | Mapeamento por empresa

import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "@/hooks/use-toast";
import {
  Loader2, Save, RefreshCw, Eye, EyeOff, FlaskConical,
  Building2, Globe, KeyRound, CheckCircle2, AlertCircle, Settings2,
} from "lucide-react";
import { Navigate } from "react-router-dom";

// ─────────────────────────────────────────
// Types
// ─────────────────────────────────────────
interface FornecedorConfig {
  id: string;
  fornecedor: string;
  ambiente: string;
  base_url_staging: string | null;
  base_url_production: string | null;
  api_key: string | null;
  ativo: boolean;
  updated_at: string;
}

interface EmpresaConfig {
  id: string;
  cod_empresa: number;
  alias: string | null;
  cnpj: string | null;
  cod_cliente_hoya: number | null;
  ativo: boolean;
  updated_at: string;
}

// ─────────────────────────────────────────
// Sub-component: Seção de Credenciais
// ─────────────────────────────────────────
function CredenciaisSection({
  config,
  onSaved,
}: {
  config: FornecedorConfig;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    ambiente: config.ambiente,
    base_url_staging: config.base_url_staging || "",
    base_url_production: config.base_url_production || "",
    api_key: config.api_key || "",
  });
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);

  const isProduction = form.ambiente === "production";

  const handleSave = async () => {
    setSaving(true);
    const { error } = await supabase
      .from("fornecedor_configuracao" as never)
      .update({
        ambiente: form.ambiente,
        base_url_staging: form.base_url_staging || null,
        base_url_production: form.base_url_production || null,
        api_key: form.api_key || null,
      } as never)
      .eq("id", config.id);

    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Configuração salva com sucesso" });
      onSaved();
    }
    setSaving(false);
  };

  return (
    <div className="space-y-6">
      {/* Ambiente Toggle */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Settings2 className="h-4 w-4 text-primary" />
            Ambiente Ativo
          </CardTitle>
          <CardDescription>
            Define qual ambiente será utilizado para envio de pedidos e consultas à API.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between p-4 rounded-lg border bg-muted/30">
            <div className="flex items-center gap-3">
              <div className={`h-3 w-3 rounded-full ${isProduction ? "bg-primary" : "bg-muted-foreground"}`} />
              <div>
                <p className="font-medium text-sm">
                  {isProduction ? "Produção" : "Homologação (Staging)"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {isProduction
                    ? "Pedidos reais serão enviados ao laboratório"
                    : "Ambiente de testes — pedidos NÃO serão processados"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground">Homologação</span>
              <Switch
                checked={isProduction}
                onCheckedChange={(v) => setForm((f) => ({ ...f, ambiente: v ? "production" : "staging" }))}
              />
              <span className="text-xs font-medium text-primary">Produção</span>
            </div>
          </div>
          {isProduction && (
            <div className="mt-3 flex items-center gap-2 text-xs text-destructive bg-destructive/10 px-3 py-2 rounded-md">
              <AlertCircle className="h-3 w-3 shrink-0" />
              Pedidos enviados em modo Produção serão processados pelo laboratório e gerarão cobranças.
            </div>
          )}
        </CardContent>
      </Card>

      {/* URLs */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Globe className="h-4 w-4 text-primary" />
            URLs de Acesso
          </CardTitle>
          <CardDescription>
            Endereços base da API para cada ambiente. A URL do ambiente ativo será utilizada nas chamadas.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label className="flex items-center gap-2 text-sm">
              <span className="h-2 w-2 rounded-full bg-muted-foreground inline-block" />
              URL Homologação (Staging)
            </Label>
            <Input
              value={form.base_url_staging}
              onChange={(e) => setForm((f) => ({ ...f, base_url_staging: e.target.value }))}
              placeholder="https://staging.api.example.com"
              className="font-mono text-sm"
            />
          </div>
          <div className="space-y-2">
            <Label className="flex items-center gap-2 text-sm">
              <span className="h-2 w-2 rounded-full bg-primary inline-block" />
              URL Produção
            </Label>
            <Input
              value={form.base_url_production}
              onChange={(e) => setForm((f) => ({ ...f, base_url_production: e.target.value }))}
              placeholder="https://api.example.com"
              className="font-mono text-sm"
            />
          </div>
        </CardContent>
      </Card>

      {/* API Key */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-primary" />
            Credencial de Acesso (API Key)
          </CardTitle>
          <CardDescription>
            Chave de autenticação fornecida pelo laboratório. Armazenada com acesso restrito a administradores.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Label className="text-sm">API Key</Label>
            <div className="flex gap-2">
              <Input
                type={showKey ? "text" : "password"}
                value={form.api_key}
                onChange={(e) => setForm((f) => ({ ...f, api_key: e.target.value }))}
                placeholder="••••••••••••••••••••"
                className="font-mono text-sm flex-1"
              />
              <Button
                variant="outline"
                size="icon"
                onClick={() => setShowKey((v) => !v)}
                type="button"
              >
                {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
            {config.api_key && (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3 text-primary" />
                API Key configurada. Deixe em branco para manter a atual.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
          Salvar Configurações
        </Button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────
// Sub-component: Mapeamento por empresa
// ─────────────────────────────────────────
interface EditingRow {
  cnpj: string;
  cod_cliente_hoya: string;
  alias: string;
}

function EmpresasSection() {
  const [configs, setConfigs] = useState<EmpresaConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [editing, setEditing] = useState<Record<string, EditingRow>>({});

  const fetchData = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("hoya_empresa_config" as never)
      .select("*")
      .order("cod_empresa");

    if (error) {
      toast({ title: "Erro ao carregar", description: error.message, variant: "destructive" });
    } else if (data) {
      const rows = data as EmpresaConfig[];
      setConfigs(rows);
      const initial: Record<string, EditingRow> = {};
      rows.forEach((r) => {
        // Formata o CNPJ salvo (apenas dígitos) para exibição formatada
        const cnpjDigits = (r.cnpj || "").replace(/\D/g, "");
        const formatCnpjLocal = (d: string) => {
          if (d.length <= 2) return d;
          if (d.length <= 5) return `${d.slice(0,2)}.${d.slice(2)}`;
          if (d.length <= 8) return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5)}`;
          if (d.length <= 12) return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8)}`;
          return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8,12)}-${d.slice(12)}`;
        };
        initial[r.id] = {
          cnpj: formatCnpjLocal(cnpjDigits),
          cod_cliente_hoya: r.cod_cliente_hoya != null ? String(r.cod_cliente_hoya) : "",
          alias: r.alias || "",
        };
      });
      setEditing(initial);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Formata string de dígitos para XX.XXX.XXX/XXXX-XX
  const formatCnpj = (digits: string): string => {
    const d = digits.replace(/\D/g, "").slice(0, 14);
    if (d.length <= 2) return d;
    if (d.length <= 5) return `${d.slice(0,2)}.${d.slice(2)}`;
    if (d.length <= 8) return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5)}`;
    if (d.length <= 12) return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8)}`;
    return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8,12)}-${d.slice(12)}`;
  };

  const handleChange = (id: string, field: keyof EditingRow, value: string) => {
    if (field === "cnpj") {
      value = formatCnpj(value);
    } else if (field === "cod_cliente_hoya") {
      // Permite apenas dígitos (incluindo zeros à esquerda)
      value = value.replace(/\D/g, "");
    }
    setEditing((prev) => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
  };

  const handleSave = async (config: EmpresaConfig) => {
    const row = editing[config.id];
    if (!row) return;
    // Armazena o código do cliente como número no banco mas aceita zeros à esquerda na entrada
    const codClienteStr = row.cod_cliente_hoya.trim();
    const codCliente = codClienteStr !== "" ? parseInt(codClienteStr, 10) : null;
    if (codClienteStr !== "" && (isNaN(codCliente!) || !Number.isFinite(codCliente))) {
      toast({ title: "Código inválido", description: "O código do cliente deve ser numérico.", variant: "destructive" });
      return;
    }
    // Remove formatação do CNPJ para salvar apenas dígitos
    const cnpjDigits = row.cnpj.replace(/\D/g, "") || null;
    setSaving(config.id);
    const { error } = await supabase
      .from("hoya_empresa_config" as never)
      .update({ cnpj: cnpjDigits, cod_cliente_hoya: codCliente, alias: row.alias.trim() || null } as never)
      .eq("id", config.id);

    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
    } else {
      toast({ title: `Empresa ${config.cod_empresa} atualizada` });
      fetchData();
    }
    setSaving(null);
  };

  const isChanged = (config: EmpresaConfig) => {
    const row = editing[config.id];
    if (!row) return false;
    // Compara CNPJ normalizando para apenas dígitos
    const cnpjDigitsRow = row.cnpj.replace(/\D/g, "");
    const cnpjDigitsConfig = (config.cnpj || "").replace(/\D/g, "");
    return cnpjDigitsRow !== cnpjDigitsConfig ||
      row.cod_cliente_hoya !== (config.cod_cliente_hoya != null ? String(config.cod_cliente_hoya) : "") ||
      row.alias !== (config.alias || "");
  };

  const totalOk = configs.filter((c) => c.cod_cliente_hoya != null && c.cnpj).length;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4">
        <Card><CardContent className="pt-5">
          <div className="text-2xl font-bold">{configs.length}</div>
          <p className="text-xs text-muted-foreground mt-1">Empresas ativas</p>
        </CardContent></Card>
        <Card><CardContent className="pt-5">
          <div className="text-2xl font-bold text-primary">{totalOk}</div>
          <p className="text-xs text-muted-foreground mt-1">Configuradas</p>
        </CardContent></Card>
        <Card><CardContent className="pt-5">
          <div className="text-2xl font-bold text-destructive">{configs.length - totalOk}</div>
          <p className="text-xs text-muted-foreground mt-1">Pendentes</p>
        </CardContent></Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Building2 className="h-4 w-4 text-primary" />
            Mapeamento por Empresa
          </CardTitle>
          <CardDescription>
            Associe o CNPJ e o código de cliente Hoya para cada unidade. O alias é usado nos pedidos.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-14">Cód.</TableHead>
                  <TableHead className="w-40">Alias / Nome</TableHead>
                  <TableHead className="w-44">CNPJ</TableHead>
                  <TableHead className="w-36">Cód. Cliente Hoya</TableHead>
                  <TableHead className="w-24">Status</TableHead>
                  <TableHead className="w-16 text-right">Ação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {configs.map((config) => {
                  const row = editing[config.id] || { cnpj: "", cod_cliente_hoya: "", alias: "" };
                  const changed = isChanged(config);
                  const isSaving = saving === config.id;
                  const ok = config.cod_cliente_hoya != null && config.cnpj;
                  return (
                    <TableRow key={config.id} className={changed ? "bg-muted/50" : ""}>
                      <TableCell className="font-mono font-bold text-muted-foreground text-sm">{config.cod_empresa}</TableCell>
                      <TableCell>
                        <Input className="h-8 text-sm" value={row.alias} onChange={(e) => handleChange(config.id, "alias", e.target.value)} placeholder="Nome da loja" />
                      </TableCell>
                      <TableCell>
                        <Input className="h-8 text-sm font-mono" value={row.cnpj} onChange={(e) => handleChange(config.id, "cnpj", e.target.value)} placeholder="00.000.000/0001-00" maxLength={18} />
                      </TableCell>
                      <TableCell>
                        <Input className="h-8 text-sm font-mono" type="text" inputMode="numeric" value={row.cod_cliente_hoya} onChange={(e) => handleChange(config.id, "cod_cliente_hoya", e.target.value)} placeholder="Ex: 00123" />
                      </TableCell>
                      <TableCell>
                        {ok
                          ? <Badge variant="default" className="text-xs">Configurada</Badge>
                          : <Badge variant="outline" className="text-xs text-muted-foreground">Pendente</Badge>}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant={changed ? "default" : "ghost"} className="h-8" onClick={() => handleSave(config)} disabled={!changed || isSaving}>
                          {isSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                        </Button>
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

// ─────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────
const FORNECEDORES = ["HOYA"] as const; // Adicionar novos fornecedores aqui

export default function AdminFornecedoresPage() {
  const { isAdmin, isLoading: authLoading } = useAuth();
  const [configs, setConfigs] = useState<Record<string, FornecedorConfig>>({});
  const [loading, setLoading] = useState(true);

  const fetchConfigs = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("fornecedor_configuracao" as never)
      .select("*");

    if (!error && data) {
      const map: Record<string, FornecedorConfig> = {};
      (data as FornecedorConfig[]).forEach((c) => { map[c.fornecedor] = c; });
      setConfigs(map);
    }
    setLoading(false);
  }, []);

  useEffect(() => { if (isAdmin) fetchConfigs(); }, [isAdmin, fetchConfigs]);

  if (authLoading) {
    return <div className="flex items-center justify-center p-8"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }
  if (!isAdmin) return <Navigate to="/" replace />;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <FlaskConical className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Fornecedores</h1>
            <p className="text-sm text-muted-foreground">
              Configuração de laboratórios e fornecedores externos integrados ao sistema
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={fetchConfigs} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </div>

      {/* Tabs por fornecedor */}
      <Tabs defaultValue="HOYA">
        <TabsList>
          {FORNECEDORES.map((f) => {
            const cfg = configs[f];
            const isProduction = cfg?.ambiente === "production";
            return (
              <TabsTrigger key={f} value={f} className="flex items-center gap-2">
                {f}
                {cfg && (
                  <span className={`h-2 w-2 rounded-full ${isProduction ? "bg-primary" : "bg-yellow-500"}`} />
                )}
              </TabsTrigger>
            );
          })}
        </TabsList>

        {FORNECEDORES.map((fornecedor) => {
          const cfg = configs[fornecedor];
          return (
            <TabsContent key={fornecedor} value={fornecedor} className="mt-6">
              {loading ? (
                <div className="flex justify-center p-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
              ) : !cfg ? (
                <Card>
                  <CardContent className="pt-6 text-center text-muted-foreground">
                    Configuração não encontrada para {fornecedor}.
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-6">
                  {/* Status badge */}
                  <div className="flex items-center gap-3">
                    <Badge variant={cfg.ambiente === "production" ? "default" : "outline"} className="text-sm px-3 py-1">
                      {cfg.ambiente === "production" ? "🟢 Produção Ativa" : "🟡 Homologação Ativa"}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      Última atualização: {new Date(cfg.updated_at).toLocaleString("pt-BR")}
                    </span>
                  </div>

                  {/* Sub-tabs: Credenciais | Empresas */}
                  <Tabs defaultValue="credenciais">
                    <TabsList>
                      <TabsTrigger value="credenciais" className="flex items-center gap-2">
                        <KeyRound className="h-3.5 w-3.5" />
                        Credenciais & Ambiente
                      </TabsTrigger>
                      <TabsTrigger value="empresas" className="flex items-center gap-2">
                        <Building2 className="h-3.5 w-3.5" />
                        Empresas
                      </TabsTrigger>
                    </TabsList>
                    <TabsContent value="credenciais" className="mt-4">
                      <CredenciaisSection config={cfg} onSaved={fetchConfigs} />
                    </TabsContent>
                    <TabsContent value="empresas" className="mt-4">
                      <EmpresasSection />
                    </TabsContent>
                  </Tabs>
                </div>
              )}
            </TabsContent>
          );
        })}
      </Tabs>
    </div>
  );
}
