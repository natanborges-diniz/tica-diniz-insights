import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ModuleHeader } from "@/components/system/ModuleHeader";
import { LoadingState, EmptyState } from "@/components/system/states";
import { toast } from "sonner";
import {
  Loader2, Save, Plus, Eye, EyeOff, CreditCard,
  Settings2, KeyRound, CheckCircle2, AlertCircle, Trash2, Wifi, WifiOff,
} from "lucide-react";
import { Navigate } from "react-router-dom";
import { useEmpresas } from "@/hooks/useEmpresas";

interface AdquirenteConfig {
  id: string;
  cod_empresa: number;
  adquirente: string;
  ambiente: string;
  merchant_id: string | null;
  integration_key_encrypted: string | null;
  pv_matriz: string | null;
  ativo: boolean;
  created_at: string;
  updated_at: string;
}

const ADQUIRENTES = ["REDE", "CIELO", "STONE", "PAGSEGURO", "GETNET"];

export default function AdminAdquirentesPage() {
  const { isAdmin } = useAuth();
  const { empresas } = useEmpresas();
  const [configs, setConfigs] = useState<AdquirenteConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [testing, setTesting] = useState<string | null>(null);

  // Form state for editing
  const [editForms, setEditForms] = useState<Record<string, {
    ambiente: string;
    merchant_id: string;
    integration_key_encrypted: string;
    ativo: boolean;
  }>>({});

  // New config form
  const [showAddForm, setShowAddForm] = useState(false);
  const [newForm, setNewForm] = useState({
    cod_empresa: 0,
    adquirente: "REDE",
    ambiente: "sandbox",
    merchant_id: "",
    integration_key_encrypted: "",
  });

  const fetchConfigs = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("adquirentes_config")
      .select("*")
      .order("cod_empresa");

    if (error) {
      toast.error("Erro ao carregar configurações: " + error.message);
    } else if (data) {
      const rows = data as AdquirenteConfig[];
      setConfigs(rows);
      const forms: typeof editForms = {};
      rows.forEach(r => {
        forms[r.id] = {
          ambiente: r.ambiente,
          merchant_id: r.merchant_id || "",
          integration_key_encrypted: r.integration_key_encrypted || "",
          ativo: r.ativo,
        };
      });
      setEditForms(forms);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchConfigs(); }, [fetchConfigs]);

  if (!isAdmin) return <Navigate to="/home" replace />;

  const handleSave = async (config: AdquirenteConfig) => {
    const form = editForms[config.id];
    if (!form) return;
    setSaving(config.id);

    const { error } = await supabase
      .from("adquirentes_config")
      .update({
        ambiente: form.ambiente,
        merchant_id: form.merchant_id || null,
        integration_key_encrypted: form.integration_key_encrypted || null,
        ativo: form.ativo,
      })
      .eq("id", config.id);

    if (error) {
      toast.error("Erro ao salvar: " + error.message);
    } else {
      toast.success(`Configuração ${config.adquirente} — Empresa ${config.cod_empresa} salva`);
      fetchConfigs();
    }
    setSaving(null);
  };

  const handleAdd = async () => {
    if (!newForm.cod_empresa || !newForm.merchant_id) {
      toast.error("Preencha empresa e PV/Merchant ID");
      return;
    }
    setSaving("new");
    const { error } = await supabase
      .from("adquirentes_config")
      .insert({
        cod_empresa: newForm.cod_empresa,
        adquirente: newForm.adquirente,
        ambiente: newForm.ambiente,
        merchant_id: newForm.merchant_id || null,
        integration_key_encrypted: newForm.integration_key_encrypted || null,
      });

    if (error) {
      toast.error("Erro ao adicionar: " + error.message);
    } else {
      toast.success("Adquirente configurada com sucesso");
      setShowAddForm(false);
      setNewForm({ cod_empresa: 0, adquirente: "REDE", ambiente: "sandbox", merchant_id: "", integration_key_encrypted: "" });
      fetchConfigs();
    }
    setSaving(null);
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase
      .from("adquirentes_config")
      .delete()
      .eq("id", id);

    if (error) {
      toast.error("Erro ao excluir: " + error.message);
    } else {
      toast.success("Configuração removida");
      fetchConfigs();
    }
  };

  const handleTestConnection = async (config: AdquirenteConfig) => {
    setTesting(config.id);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error("Sessão expirada");

      const { data, error } = await supabase.functions.invoke("rede-proxy", {
        body: { action: "health", cod_empresa: config.cod_empresa },
        headers: { Authorization: `Bearer ${token}` },
      });
      if (error) throw error;
      if (data?.ok) {
        toast.success(`Conexão OK — ${data.ambiente}`);
      } else {
        toast.error(`Falha na conexão: ${data?.error || "Erro desconhecido"}`);
      }
    } catch (e) {
      toast.error(`Erro ao testar: ${(e as Error).message}`);
    } finally {
      setTesting(null);
    }
  };

  const updateForm = (id: string, field: string, value: string | boolean) => {
    setEditForms(prev => ({
      ...prev,
      [id]: { ...prev[id], [field]: value },
    }));
  };

  const isChanged = (config: AdquirenteConfig) => {
    const form = editForms[config.id];
    if (!form) return false;
    return form.ambiente !== config.ambiente
      || form.merchant_id !== (config.merchant_id || "")
      || form.integration_key_encrypted !== (config.integration_key_encrypted || "")
      || form.ativo !== config.ativo;
  };

  const getEmpresaNome = (cod: number) => {
    const emp = empresas.find(e => e.codEmpresa === cod);
    return emp?.nome || `Empresa ${cod}`;
  };

  return (
    <div className="space-y-6">
      <ModuleHeader
        title="Configuração de Adquirentes"
        subtitle="Credenciais e ambientes para integração com maquininhas de cartão"
        icon={<CreditCard className="h-5 w-5" />}
        actions={
          <Button size="sm" onClick={() => setShowAddForm(true)}>
            <Plus className="h-4 w-4 mr-1" /> Nova Adquirente
          </Button>
        }
      />

      {/* Add Form */}
      {showAddForm && (
        <Card className="border-primary/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Nova Configuração de Adquirente</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="space-y-1">
                <Label className="text-xs">Empresa</Label>
                <Select value={String(newForm.cod_empresa || "")} onValueChange={v => setNewForm(f => ({ ...f, cod_empresa: Number(v) }))}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {empresas.map(e => (
                      <SelectItem key={e.codEmpresa} value={String(e.codEmpresa)}>
                        {e.nome || `Empresa ${e.codEmpresa}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Adquirente</Label>
                <Select value={newForm.adquirente} onValueChange={v => setNewForm(f => ({ ...f, adquirente: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ADQUIRENTES.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">PV / Merchant ID</Label>
                <Input
                  value={newForm.merchant_id}
                  onChange={e => setNewForm(f => ({ ...f, merchant_id: e.target.value }))}
                  placeholder="Número de filiação"
                  className="font-mono text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Chave de Integração</Label>
                <Input
                  type="password"
                  value={newForm.integration_key_encrypted}
                  onChange={e => setNewForm(f => ({ ...f, integration_key_encrypted: e.target.value }))}
                  placeholder="••••••••••"
                  className="font-mono text-sm"
                />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground">Sandbox</span>
              <Switch
                checked={newForm.ambiente === "production"}
                onCheckedChange={v => setNewForm(f => ({ ...f, ambiente: v ? "production" : "sandbox" }))}
              />
              <span className="text-xs font-medium text-primary">Produção</span>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setShowAddForm(false)}>Cancelar</Button>
              <Button size="sm" onClick={handleAdd} disabled={saving === "new"}>
                {saving === "new" ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
                Salvar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Configs Table */}
      {loading ? (
        <LoadingState />
      ) : configs.length === 0 ? (
        <EmptyState
          title="Nenhuma adquirente configurada"
          description="Adicione a primeira configuração para integrar com Rede, Cielo, Stone ou outra adquirente."
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Empresa</TableHead>
                  <TableHead>Adquirente</TableHead>
                  <TableHead>PV / Merchant ID</TableHead>
                  <TableHead>Chave de Integração</TableHead>
                  <TableHead>Ambiente</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-32">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {configs.map(config => {
                  const form = editForms[config.id];
                  if (!form) return null;
                  const changed = isChanged(config);
                  const isKeyVisible = showKeys[config.id];

                  return (
                    <TableRow key={config.id}>
                      <TableCell className="font-medium">
                        {getEmpresaNome(config.cod_empresa)}
                        <span className="text-xs text-muted-foreground ml-1">({config.cod_empresa})</span>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{config.adquirente}</Badge>
                      </TableCell>
                      <TableCell>
                        <Input
                          value={form.merchant_id}
                          onChange={e => updateForm(config.id, "merchant_id", e.target.value)}
                          className="font-mono text-sm h-8 w-40"
                          placeholder="PV"
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Input
                            type={isKeyVisible ? "text" : "password"}
                            value={form.integration_key_encrypted}
                            onChange={e => updateForm(config.id, "integration_key_encrypted", e.target.value)}
                            className="font-mono text-sm h-8 w-48"
                            placeholder="••••••••••"
                          />
                          <Button
                            variant="ghost" size="icon" className="h-8 w-8"
                            onClick={() => setShowKeys(prev => ({ ...prev, [config.id]: !prev[config.id] }))}
                          >
                            {isKeyVisible ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                          </Button>
                        </div>
                        {config.integration_key_encrypted && (
                          <p className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
                            <CheckCircle2 className="h-2.5 w-2.5 text-primary" /> Configurada
                          </p>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={form.ambiente === "production"}
                            onCheckedChange={v => updateForm(config.id, "ambiente", v ? "production" : "sandbox")}
                          />
                          <span className="text-xs">
                            {form.ambiente === "production" ? (
                              <span className="text-primary font-medium">Produção</span>
                            ) : (
                              <span className="text-muted-foreground">Sandbox</span>
                            )}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={form.ativo}
                            onCheckedChange={v => updateForm(config.id, "ativo", v)}
                          />
                          <Badge variant={form.ativo ? "default" : "secondary"}>
                            {form.ativo ? "Ativa" : "Inativa"}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button
                            size="sm" variant={changed ? "default" : "outline"}
                            disabled={!changed || saving === config.id}
                            onClick={() => handleSave(config)}
                          >
                            {saving === config.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                          </Button>
                          <Button
                            size="sm" variant="outline"
                            disabled={testing === config.id}
                            onClick={() => handleTestConnection(config)}
                            title="Testar conexão"
                          >
                            {testing === config.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wifi className="h-3 w-3" />}
                          </Button>
                          <Button
                            size="sm" variant="ghost"
                            className="text-destructive hover:text-destructive"
                            onClick={() => handleDelete(config.id)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Info Card */}
      <Card className="bg-muted/30">
        <CardContent className="pt-4 pb-3">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
            <div className="text-sm text-muted-foreground space-y-1">
              <p><strong>Rede (e.Rede):</strong> PV = Número de Filiação. Chave = Integration Key obtida no portal e.Rede.</p>
              <p><strong>Sandbox:</strong> Use <code className="text-xs bg-muted px-1 rounded">sandbox-erede.useredecloud.com.br</code> para testes.</p>
              <p><strong>Produção:</strong> Use <code className="text-xs bg-muted px-1 rounded">api.userede.com.br/erede</code> para transações reais.</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
