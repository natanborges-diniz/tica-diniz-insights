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
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "@/hooks/use-toast";
import {
  Loader2, Save, RefreshCw, Eye, EyeOff, FlaskConical,
  Building2, Globe, KeyRound, CheckCircle2, AlertCircle, Settings2, Trash2,
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
  api_key_staging: string | null;
  api_key_production: string | null;
  api_user_staging: string | null;
  api_user_production: string | null;
  ativo: boolean;
  updated_at: string;
}

interface EmpresaConfig {
  id: string;
  cod_empresa: number;
  alias: string | null;
  cnpj: string | null;
  cod_cliente_hoya: string | null;
  ativo: boolean;
  updated_at: string;
}

// ─────────────────────────────────────────
// Sub-component: Seção de Credenciais
// ─────────────────────────────────────────
function CredenciaisSection({
  config,
  onSaved,
  fornecedor,
}: {
  config: FornecedorConfig;
  onSaved: () => void;
  fornecedor: string;
}) {
  const isBtg = fornecedor.toLowerCase() === "btg";
  const [form, setForm] = useState({
    ambiente: config.ambiente,
    base_url_staging: config.base_url_staging || "",
    base_url_production: config.base_url_production || "",
    api_key: config.api_key || "",
    api_key_staging: config.api_key_staging || "",
    api_key_production: config.api_key_production || "",
    api_user_staging: config.api_user_staging || "",
    api_user_production: config.api_user_production || "",
  });
  const [showClientId, setShowClientId] = useState(false);
  const [showKeySt, setShowKeySt] = useState(false);
  const [showKeyProd, setShowKeyProd] = useState(false);
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
        api_key_staging: form.api_key_staging || null,
        api_key_production: form.api_key_production || null,
        api_user_staging: form.api_user_staging || null,
        api_user_production: form.api_user_production || null,
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

      {/* Client ID (BTG only) */}
      {isBtg && (
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
      )}

      {/* API Keys / Client Secrets separadas por ambiente */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-primary" />
            {isBtg ? "Client Secret (OAuth)" : "Credenciais de Acesso (API Keys)"}
          </CardTitle>
          <CardDescription>
            {isBtg
              ? "Chave secreta do aplicativo BTG, separada por ambiente. Apenas a chave do ambiente ativo será utilizada."
              : "Chaves de autenticação fornecidas pelo laboratório, separadas por ambiente. Apenas a chave do ambiente ativo será utilizada."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Key Homologação */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2 text-sm">
              <span className="h-2 w-2 rounded-full bg-muted-foreground inline-block" />
              {isBtg ? "Client Secret" : "API Key"} — Homologação (Staging)
              {!isProduction && <span className="text-xs font-medium text-primary ml-1">(ativa)</span>}
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
                {isBtg ? "Client Secret" : "API Key"} de homologação configurada.
              </p>
            )}
          </div>

          <div className="border-t" />

          <div className="space-y-2">
            <Label className="flex items-center gap-2 text-sm">
              <span className="h-2 w-2 rounded-full bg-primary inline-block" />
              {isBtg ? "Client Secret" : "API Key"} — Produção
              {isProduction && <span className="text-xs font-medium text-primary ml-1">(ativa)</span>}
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
                {isBtg ? "Client Secret" : "API Key"} de produção configurada.
                <span className="ml-1 font-mono">
                  Prefixo: {config.api_key_production.slice(0, 10)}… ({config.api_key_production.length} chars)
                </span>
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Usuário API (não BTG) */}
      {!isBtg && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-primary" />
              Usuário API
            </CardTitle>
            <CardDescription>
              Email/usuário de acesso à API do fornecedor, separado por ambiente.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label className="flex items-center gap-2 text-sm">
                <span className="h-2 w-2 rounded-full bg-muted-foreground inline-block" />
                Usuário — Homologação (Staging)
                {!isProduction && <span className="text-xs font-medium text-primary ml-1">(ativo)</span>}
              </Label>
              <Input
                value={form.api_user_staging}
                onChange={(e) => setForm((f) => ({ ...f, api_user_staging: e.target.value }))}
                placeholder="usuario@exemplo.com"
                className="font-mono text-sm"
              />
              {config.api_user_staging && (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3 text-primary" />
                  Usuário de homologação configurado.
                </p>
              )}
            </div>
            <div className="border-t" />
            <div className="space-y-2">
              <Label className="flex items-center gap-2 text-sm">
                <span className="h-2 w-2 rounded-full bg-primary inline-block" />
                Usuário — Produção
                {isProduction && <span className="text-xs font-medium text-primary ml-1">(ativo)</span>}
              </Label>
              <Input
                value={form.api_user_production}
                onChange={(e) => setForm((f) => ({ ...f, api_user_production: e.target.value }))}
                placeholder="usuario@exemplo.com"
                className="font-mono text-sm"
              />
              {config.api_user_production && (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3 text-primary" />
                  Usuário de produção configurado.
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

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
// Sub-component: Mapeamento por empresa (Hoya)
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
        const cnpjDigits = (r.cnpj || "").replace(/\D/g, "");
        initial[r.id] = {
          cnpj: formatCnpjDisplay(cnpjDigits),
          cod_cliente_hoya: r.cod_cliente_hoya || "",
          alias: r.alias || "",
        };
      });
      setEditing(initial);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleChange = (id: string, field: keyof EditingRow, value: string) => {
    if (field === "cnpj") {
      value = formatCnpj(value);
    } else if (field === "cod_cliente_hoya") {
      value = value.replace(/\D/g, "");
    }
    setEditing((prev) => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
  };

  const handleSave = async (config: EmpresaConfig) => {
    const row = editing[config.id];
    if (!row) return;
    const codClienteStr = row.cod_cliente_hoya.trim();
    const cnpjDigits = row.cnpj.replace(/\D/g, "") || null;
    setSaving(config.id);
    const { error } = await supabase
      .from("hoya_empresa_config" as never)
      .update({ cnpj: cnpjDigits, cod_cliente_hoya: codClienteStr || null, alias: row.alias.trim() || null } as never)
      .eq("id", config.id);

    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
    } else {
      toast({ title: `Empresa ${config.cod_empresa} atualizada` });
      fetchData();
    }
    setSaving(null);
  };

  const handleDelete = async (config: EmpresaConfig) => {
    const { error } = await supabase
      .from("hoya_empresa_config" as never)
      .delete()
      .eq("id", config.id);
    if (error) {
      toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" });
    } else {
      toast({ title: `Empresa ${config.cod_empresa} removida` });
      fetchData();
    }
  };

  const isChanged = (config: EmpresaConfig) => {
    const row = editing[config.id];
    if (!row) return false;
    const cnpjDigitsRow = row.cnpj.replace(/\D/g, "");
    const cnpjDigitsConfig = (config.cnpj || "").replace(/\D/g, "");
    return cnpjDigitsRow !== cnpjDigitsConfig ||
      row.cod_cliente_hoya !== (config.cod_cliente_hoya || "") ||
      row.alias !== (config.alias || "");
  };

  const totalOk = configs.filter((c) => c.cod_cliente_hoya != null && c.cnpj).length;

  return (
    <EmpresasTable
      configs={configs}
      editing={editing}
      loading={loading}
      saving={saving}
      totalOk={totalOk}
      codLabel="Cód. Cliente Hoya"
      codField="cod_cliente_hoya"
      fornecedorName="Hoya"
      onChange={handleChange}
      onSave={handleSave}
      onDelete={handleDelete}
      isChanged={isChanged}
    />
  );
}

// ─────────────────────────────────────────
// Sub-component: Mapeamento por empresa (Zeiss)
// ─────────────────────────────────────────
interface ZeissEmpresaConfig {
  id: string;
  cod_empresa: number;
  alias: string | null;
  cnpj: string | null;
  cod_cliente_sao: string | null;
  ativo: boolean;
  updated_at: string;
}

interface ZeissEditingRow {
  cnpj: string;
  cod_cliente_sao: string;
  alias: string;
}

function ZeissEmpresasSection() {
  const [configs, setConfigs] = useState<ZeissEmpresaConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [editing, setEditing] = useState<Record<string, ZeissEditingRow>>({});

  const fetchData = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("zeiss_empresa_config" as never)
      .select("*")
      .order("cod_empresa");

    if (error) {
      toast({ title: "Erro ao carregar", description: error.message, variant: "destructive" });
    } else if (data) {
      const rows = data as ZeissEmpresaConfig[];
      setConfigs(rows);
      const initial: Record<string, ZeissEditingRow> = {};
      rows.forEach((r) => {
        const cnpjDigits = (r.cnpj || "").replace(/\D/g, "");
        initial[r.id] = {
          cnpj: formatCnpjDisplay(cnpjDigits),
          cod_cliente_sao: r.cod_cliente_sao || "",
          alias: r.alias || "",
        };
      });
      setEditing(initial);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleChange = (id: string, field: keyof ZeissEditingRow, value: string) => {
    if (field === "cnpj") {
      value = formatCnpj(value);
    } else if (field === "cod_cliente_sao") {
      value = value.replace(/\D/g, "");
    }
    setEditing((prev) => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
  };

  const handleSave = async (config: ZeissEmpresaConfig) => {
    const row = editing[config.id];
    if (!row) return;
    const codClienteStr = row.cod_cliente_sao.trim();
    const cnpjDigits = row.cnpj.replace(/\D/g, "") || null;
    setSaving(config.id);
    const { error } = await supabase
      .from("zeiss_empresa_config" as never)
      .update({ cnpj: cnpjDigits, cod_cliente_sao: codClienteStr || null, alias: row.alias.trim() || null } as never)
      .eq("id", config.id);

    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
    } else {
      toast({ title: `Empresa ${config.cod_empresa} atualizada` });
      fetchData();
    }
    setSaving(null);
  };

  const handleDelete = async (config: ZeissEmpresaConfig) => {
    const { error } = await supabase
      .from("zeiss_empresa_config" as never)
      .delete()
      .eq("id", config.id);
    if (error) {
      toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" });
    } else {
      toast({ title: `Empresa ${config.cod_empresa} removida` });
      fetchData();
    }
  };

  const isChanged = (config: ZeissEmpresaConfig) => {
    const row = editing[config.id];
    if (!row) return false;
    const cnpjDigitsRow = row.cnpj.replace(/\D/g, "");
    const cnpjDigitsConfig = (config.cnpj || "").replace(/\D/g, "");
    return cnpjDigitsRow !== cnpjDigitsConfig ||
      row.cod_cliente_sao !== (config.cod_cliente_sao || "") ||
      row.alias !== (config.alias || "");
  };

  const totalOk = configs.filter((c) => c.cod_cliente_sao != null && c.cnpj).length;

  // Adapt to shared table component
  const adaptedConfigs = configs.map(c => ({
    ...c,
    cod_cliente_hoya: c.cod_cliente_sao,
  })) as unknown as EmpresaConfig[];

  const adaptedEditing: Record<string, EditingRow> = {};
  Object.entries(editing).forEach(([k, v]) => {
    adaptedEditing[k] = { cnpj: v.cnpj, cod_cliente_hoya: v.cod_cliente_sao, alias: v.alias };
  });

  return (
    <EmpresasTable
      configs={adaptedConfigs}
      editing={adaptedEditing}
      loading={loading}
      saving={saving}
      totalOk={totalOk}
      codLabel="Cód. Cliente SAO"
      codField="cod_cliente_hoya"
      fornecedorName="Zeiss"
      onChange={(id, field, value) => {
        const zeissField = field === "cod_cliente_hoya" ? "cod_cliente_sao" : field;
        handleChange(id, zeissField as keyof ZeissEditingRow, value);
      }}
      onSave={(config) => {
        const original = configs.find(c => c.id === config.id);
        if (original) handleSave(original);
      }}
      onDelete={(config) => {
        const original = configs.find(c => c.id === config.id);
        if (original) handleDelete(original);
      }}
      isChanged={(config) => {
        const original = configs.find(c => c.id === config.id);
        if (original) return isChanged(original);
        return false;
      }}
    />
  );
}

// ─────────────────────────────────────────
// Sub-component: Mapeamento por empresa (Haytek)
// ─────────────────────────────────────────
interface HaytekEmpresaConfig {
  id: string;
  cod_empresa: number;
  alias: string | null;
  cnpj: string | null;
  store_id: string | null;
  address_id: string | null;
  ativo: boolean;
  updated_at: string;
}

interface HaytekEditingRow {
  cnpj: string;
  store_id: string;
  address_id: string;
  alias: string;
}

interface OptviewEmpresaConfig {
  id: string;
  cod_empresa: number;
  alias: string | null;
  cnpj: string | null;
  codigo_cadastral_optview: string | null;
  login_site: string | null;
  senha_site: string | null;
  login_restrito: string | null;
  ativo: boolean;
  updated_at: string;
}

interface OptviewEditingRow {
  alias: string;
  cnpj: string;
  codigo_cadastral_optview: string;
  login_site: string;
  senha_site: string;
  login_restrito: string;
  ativo: boolean;
}

function HaytekEmpresasSection() {
  const [configs, setConfigs] = useState<HaytekEmpresaConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [editing, setEditing] = useState<Record<string, HaytekEditingRow>>({});

  const fetchData = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("haytek_empresa_config" as never)
      .select("*")
      .order("cod_empresa");

    if (error) {
      toast({ title: "Erro ao carregar", description: error.message, variant: "destructive" });
    } else if (data) {
      const rows = data as HaytekEmpresaConfig[];
      setConfigs(rows);
      const initial: Record<string, HaytekEditingRow> = {};
      rows.forEach((r) => {
        const cnpjDigits = (r.cnpj || "").replace(/\D/g, "");
        initial[r.id] = {
          cnpj: formatCnpjDisplay(cnpjDigits),
          store_id: r.store_id || "",
          address_id: r.address_id || "",
          alias: r.alias || "",
        };
      });
      setEditing(initial);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleChange = (id: string, field: keyof HaytekEditingRow, value: string) => {
    if (field === "cnpj") value = formatCnpj(value);
    setEditing((prev) => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
  };

  const handleSave = async (config: HaytekEmpresaConfig) => {
    const row = editing[config.id];
    if (!row) return;
    const cnpjDigits = row.cnpj.replace(/\D/g, "") || null;
    setSaving(config.id);
    const { error } = await supabase
      .from("haytek_empresa_config" as never)
      .update({ cnpj: cnpjDigits, store_id: row.store_id.trim() || null, address_id: row.address_id.trim() || null, alias: row.alias.trim() || null } as never)
      .eq("id", config.id);

    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
    } else {
      toast({ title: `Empresa ${config.cod_empresa} atualizada` });
      fetchData();
    }
    setSaving(null);
  };

  const handleDelete = async (config: HaytekEmpresaConfig) => {
    const { error } = await supabase
      .from("haytek_empresa_config" as never)
      .delete()
      .eq("id", config.id);
    if (error) {
      toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" });
    } else {
      toast({ title: `Empresa ${config.cod_empresa} removida` });
      fetchData();
    }
  };

  const isChanged = (config: HaytekEmpresaConfig) => {
    const row = editing[config.id];
    if (!row) return false;
    const cnpjDigitsRow = row.cnpj.replace(/\D/g, "");
    const cnpjDigitsConfig = (config.cnpj || "").replace(/\D/g, "");
    return cnpjDigitsRow !== cnpjDigitsConfig ||
      row.store_id !== (config.store_id || "") ||
      row.address_id !== (config.address_id || "") ||
      row.alias !== (config.alias || "");
  };

  const totalOk = configs.filter((c) => c.store_id != null && c.cnpj).length;

  // Adapt to shared table — use cod_cliente_hoya for store_id display
  const adaptedConfigs = configs.map(c => ({
    ...c,
    cod_cliente_hoya: c.store_id,
  })) as unknown as EmpresaConfig[];

  const adaptedEditing: Record<string, EditingRow> = {};
  Object.entries(editing).forEach(([k, v]) => {
    adaptedEditing[k] = { cnpj: v.cnpj, cod_cliente_hoya: v.store_id, alias: v.alias };
  });

  return (
    <div className="space-y-4">
      <EmpresasTable
        configs={adaptedConfigs}
        editing={adaptedEditing}
        loading={loading}
        saving={saving}
        totalOk={totalOk}
        codLabel="Store ID"
        codField="cod_cliente_hoya"
        fornecedorName="Haytek"
        onChange={(id, field, value) => {
          const haytekField = field === "cod_cliente_hoya" ? "store_id" : field;
          handleChange(id, haytekField as keyof HaytekEditingRow, value);
        }}
        onSave={(config) => {
          const original = configs.find(c => c.id === config.id);
          if (original) handleSave(original);
        }}
        onDelete={(config) => {
          const original = configs.find(c => c.id === config.id);
          if (original) handleDelete(original);
        }}
        isChanged={(config) => {
          const original = configs.find(c => c.id === config.id);
          if (original) return isChanged(original);
          return false;
        }}
      />
      {/* Address ID inline for each row — shown separately */}
      {configs.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Building2 className="h-4 w-4 text-primary" />
              Address ID por Empresa
            </CardTitle>
            <CardDescription>Código de endereço de entrega Haytek (addressId)</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {configs.map((c) => {
                const row = editing[c.id];
                if (!row) return null;
                const changed = isChanged(c);
                const isSaving = saving === c.id;
                return (
                  <div key={c.id} className="flex items-center gap-3">
                    <span className="font-mono text-sm text-muted-foreground w-10">{c.cod_empresa}</span>
                    <Input
                      className="h-8 text-sm font-mono max-w-[200px]"
                      value={row.address_id}
                      onChange={(e) => handleChange(c.id, "address_id", e.target.value)}
                      placeholder="Ex: RJ106205"
                    />
                    <Button
                      size="sm"
                      variant={changed ? "default" : "ghost"}
                      className="h-8"
                      onClick={() => handleSave(c)}
                      disabled={!changed || isSaving}
                    >
                      {isSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3 mr-1" />}
                      Salvar
                    </Button>
                    <span className="text-xs text-muted-foreground">{row.alias || ""}</span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function OptviewEmpresasSection() {
  const [configs, setConfigs] = useState<OptviewEmpresaConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [editing, setEditing] = useState<Record<string, OptviewEditingRow>>({});
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});

  const fetchData = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("optview_empresa_config" as never)
      .select("*")
      .order("cod_empresa");

    if (error) {
      toast({ title: "Erro ao carregar", description: error.message, variant: "destructive" });
    } else if (data) {
      const rows = data as OptviewEmpresaConfig[];
      setConfigs(rows);
      const initial: Record<string, OptviewEditingRow> = {};
      rows.forEach((r) => {
        initial[r.id] = {
          alias: r.alias || "",
          cnpj: formatCnpjDisplay((r.cnpj || "").replace(/\D/g, "")),
          codigo_cadastral_optview: r.codigo_cadastral_optview || "",
          login_site: r.login_site || "",
          senha_site: r.senha_site || "",
          login_restrito: r.login_restrito || "",
          ativo: r.ativo,
        };
      });
      setEditing(initial);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleChange = (id: string, field: keyof OptviewEditingRow, value: string | boolean) => {
    setEditing((prev) => {
      const current = prev[id];
      if (!current) return prev;

      if (field === "cnpj" && typeof value === "string") {
        return { ...prev, [id]: { ...current, cnpj: formatCnpj(value) } };
      }

      return { ...prev, [id]: { ...current, [field]: value } };
    });
  };

  const handleSave = async (config: OptviewEmpresaConfig) => {
    const row = editing[config.id];
    if (!row) return;

    setSaving(config.id);
    const { error } = await supabase
      .from("optview_empresa_config" as never)
      .update({
        alias: row.alias.trim() || null,
        cnpj: row.cnpj.replace(/\D/g, "") || null,
        codigo_cadastral_optview: row.codigo_cadastral_optview.trim() || null,
        login_site: row.login_site.trim() || null,
        senha_site: row.senha_site.trim() || null,
        login_restrito: row.login_restrito.trim() || null,
        ativo: row.ativo,
      } as never)
      .eq("id", config.id);

    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
    } else {
      toast({ title: `Empresa ${config.cod_empresa} atualizada` });
      fetchData();
    }
    setSaving(null);
  };

  const isChanged = (config: OptviewEmpresaConfig) => {
    const row = editing[config.id];
    if (!row) return false;
    return (
      row.alias !== (config.alias || "") ||
      row.cnpj.replace(/\D/g, "") !== (config.cnpj || "").replace(/\D/g, "") ||
      row.codigo_cadastral_optview !== (config.codigo_cadastral_optview || "") ||
      row.login_site !== (config.login_site || "") ||
      row.senha_site !== (config.senha_site || "") ||
      row.login_restrito !== (config.login_restrito || "") ||
      row.ativo !== config.ativo
    );
  };

  const totalOk = configs.filter((config) => {
    const row = editing[config.id];
    return Boolean(row?.alias.trim() && row?.login_site.trim() && row?.senha_site.trim());
  }).length;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        <Card><CardContent className="pt-5">
          <div className="text-2xl font-bold">{configs.length}</div>
          <p className="text-xs text-muted-foreground mt-1">Lojas OptView</p>
        </CardContent></Card>
        <Card><CardContent className="pt-5">
          <div className="text-2xl font-bold text-primary">{totalOk}</div>
          <p className="text-xs text-muted-foreground mt-1">Configuradas</p>
        </CardContent></Card>
        <Card><CardContent className="pt-5">
          <div className="text-2xl font-bold text-muted-foreground">{configs.length - totalOk}</div>
          <p className="text-xs text-muted-foreground mt-1">Pendentes</p>
        </CardContent></Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Building2 className="h-4 w-4 text-primary" />
            Empresas OptView
          </CardTitle>
          <CardDescription>
            Configure login e senha por loja para que o pedido carregue automaticamente a credencial correta pelo código da empresa.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
            O alias deve seguir o padrão interno da loja para rastreabilidade do payload e auditoria operacional.
          </div>

          {loading ? (
            <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-14">Cód.</TableHead>
                  <TableHead className="min-w-[180px]">Alias</TableHead>
                  <TableHead className="min-w-[150px]">Login</TableHead>
                  <TableHead className="min-w-[160px]">Senha</TableHead>
                  <TableHead className="min-w-[130px]">Login restrito</TableHead>
                  <TableHead className="min-w-[150px]">Código cadastral</TableHead>
                  <TableHead className="w-[150px]">CNPJ</TableHead>
                  <TableHead className="w-24">Status</TableHead>
                  <TableHead className="w-20">Ativo</TableHead>
                  <TableHead className="w-20 text-right">Ação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {configs.map((config) => {
                  const row = editing[config.id];
                  if (!row) return null;
                  const changed = isChanged(config);
                  const isSaving = saving === config.id;
                  const isConfigured = Boolean(row.alias.trim() && row.login_site.trim() && row.senha_site.trim());
                  const showPassword = showPasswords[config.id] || false;

                  return (
                    <TableRow key={config.id} className={changed ? "bg-muted/50" : ""}>
                      <TableCell className="font-mono font-bold text-muted-foreground text-sm">{config.cod_empresa}</TableCell>
                      <TableCell>
                        <Input className="h-8 text-sm" value={row.alias} onChange={(e) => handleChange(config.id, "alias", e.target.value)} placeholder="Nome da loja" />
                      </TableCell>
                      <TableCell>
                        <Input className="h-8 text-sm font-mono" value={row.login_site} onChange={(e) => handleChange(config.id, "login_site", e.target.value)} placeholder="usuario@optview" />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Input className="h-8 text-sm font-mono" type={showPassword ? "text" : "password"} value={row.senha_site} onChange={(e) => handleChange(config.id, "senha_site", e.target.value)} placeholder="••••••••" />
                          <Button type="button" variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={() => setShowPasswords((prev) => ({ ...prev, [config.id]: !showPassword }))}>
                            {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Input className="h-8 text-sm font-mono" value={row.login_restrito} onChange={(e) => handleChange(config.id, "login_restrito", e.target.value)} placeholder="Opcional" />
                      </TableCell>
                      <TableCell>
                        <Input className="h-8 text-sm font-mono" value={row.codigo_cadastral_optview} onChange={(e) => handleChange(config.id, "codigo_cadastral_optview", e.target.value)} placeholder="CD_CODIGOCADASTRAL" />
                      </TableCell>
                      <TableCell>
                        <Input className="h-8 text-sm font-mono" value={row.cnpj} onChange={(e) => handleChange(config.id, "cnpj", e.target.value)} placeholder="00.000.000/0001-00" maxLength={18} />
                      </TableCell>
                      <TableCell>
                        {isConfigured ? (
                          <Badge variant="default" className="text-xs">Configurada</Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs text-muted-foreground">Pendente</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Switch checked={row.ativo} onCheckedChange={(checked) => handleChange(config.id, "ativo", checked)} />
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
// Shared CNPJ helpers
// ─────────────────────────────────────────
function formatCnpjDisplay(digits: string): string {
  const d = digits.replace(/\D/g, "").slice(0, 14);
  if (d.length <= 2) return d;
  if (d.length <= 5) return `${d.slice(0,2)}.${d.slice(2)}`;
  if (d.length <= 8) return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5)}`;
  if (d.length <= 12) return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8)}`;
  return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8,12)}-${d.slice(12)}`;
}

function formatCnpj(value: string): string {
  return formatCnpjDisplay(value);
}

// ─────────────────────────────────────────
// Shared: Empresas Table Component
// ─────────────────────────────────────────
function EmpresasTable({
  configs,
  editing,
  loading,
  saving,
  totalOk,
  codLabel,
  codField,
  fornecedorName,
  onChange,
  onSave,
  onDelete,
  isChanged,
}: {
  configs: EmpresaConfig[];
  editing: Record<string, EditingRow>;
  loading: boolean;
  saving: string | null;
  totalOk: number;
  codLabel: string;
  codField: string;
  fornecedorName: string;
  onChange: (id: string, field: keyof EditingRow, value: string) => void;
  onSave: (config: EmpresaConfig) => void;
  onDelete: (config: EmpresaConfig) => void;
  isChanged: (config: EmpresaConfig) => boolean;
}) {
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
            Associe o CNPJ e o código de cliente {fornecedorName} para cada unidade. O alias é usado nos pedidos.
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
                  <TableHead className="w-36">{codLabel}</TableHead>
                  <TableHead className="w-24">Status</TableHead>
                  <TableHead className="w-24 text-right">Ações</TableHead>
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
                        <Input className="h-8 text-sm" value={row.alias} onChange={(e) => onChange(config.id, "alias", e.target.value)} placeholder="Nome da loja" />
                      </TableCell>
                      <TableCell>
                        <Input className="h-8 text-sm font-mono" value={row.cnpj} onChange={(e) => onChange(config.id, "cnpj", e.target.value)} placeholder="00.000.000/0001-00" maxLength={18} />
                      </TableCell>
                      <TableCell>
                        <Input className="h-8 text-sm font-mono" type="text" inputMode="numeric" value={row.cod_cliente_hoya} onChange={(e) => onChange(config.id, "cod_cliente_hoya", e.target.value)} placeholder="Ex: 00123" />
                      </TableCell>
                      <TableCell>
                        {ok
                          ? <Badge variant="default" className="text-xs">Configurada</Badge>
                          : <Badge variant="outline" className="text-xs text-muted-foreground">Pendente</Badge>}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button size="sm" variant={changed ? "default" : "ghost"} className="h-8" onClick={() => onSave(config)} disabled={!changed || isSaving}>
                            {isSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button size="sm" variant="ghost" className="h-8 text-destructive hover:text-destructive hover:bg-destructive/10">
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Excluir empresa {config.cod_empresa}?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Esta ação removerá o mapeamento da empresa <strong>{row.alias || config.cod_empresa}</strong> do fornecedor {fornecedorName}. Isso não pode ser desfeito.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                  onClick={() => onDelete(config)}
                                >
                                  Excluir
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
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

// ─────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────
const FORNECEDORES = ["HOYA", "ZEISS", "HAYTEK", "OPTVIEW"] as const;
const FORNECEDOR_LABELS: Record<string, string> = {
  HOYA: "Hoya",
  ZEISS: "Zeiss",
  HAYTEK: "Haytek (Dmax)",
  OPTVIEW: "OptView",
};

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
                {FORNECEDOR_LABELS[f] || f}
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
                      <CredenciaisSection config={cfg} onSaved={fetchConfigs} fornecedor={fornecedor} />
                    </TabsContent>
                    <TabsContent value="empresas" className="mt-4">
                      {fornecedor === "ZEISS"
                        ? <ZeissEmpresasSection />
                        : fornecedor === "HAYTEK"
                          ? <HaytekEmpresasSection />
                          : fornecedor === "OPTVIEW"
                            ? <OptviewEmpresasSection />
                            : <EmpresasSection />}
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
