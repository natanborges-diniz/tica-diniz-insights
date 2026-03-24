import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ModuleHeader } from "@/components/system/ModuleHeader";
import { LoadingState, EmptyState } from "@/components/system/states";
import { toast } from "sonner";
import {
  Loader2, Save, Plus, Eye, EyeOff, CreditCard,
  CheckCircle2, AlertCircle, Trash2, Wifi,
} from "lucide-react";
import { Navigate } from "react-router-dom";
import { useEmpresas } from "@/hooks/useEmpresas";

interface AdquirenteConfig {
  id: string;
  cod_empresa: number;
  adquirente: string;
  ambiente: string;
  merchant_id: string | null;
  merchant_id_production: string | null;
  integration_key_encrypted: string | null;
  integration_key_production: string | null;
  pv_matriz: string | null;
  pv_matriz_production: string | null;
  ativo: boolean;
  created_at: string;
  updated_at: string;
}

interface EditForm {
  ambiente: string;
  merchant_id: string;
  merchant_id_production: string;
  integration_key_encrypted: string;
  integration_key_production: string;
  pv_matriz: string;
  pv_matriz_production: string;
  ativo: boolean;
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
  const [editForms, setEditForms] = useState<Record<string, EditForm>>({});
  const [showAddForm, setShowAddForm] = useState(false);
  const [newForm, setNewForm] = useState({
    cod_empresa: 0,
    adquirente: "REDE",
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
      const forms: Record<string, EditForm> = {};
      rows.forEach(r => {
        forms[r.id] = {
          ambiente: r.ambiente,
          merchant_id: r.merchant_id || "",
          merchant_id_production: r.merchant_id_production || "",
          integration_key_encrypted: r.integration_key_encrypted || "",
          integration_key_production: r.integration_key_production || "",
          pv_matriz: r.pv_matriz || "",
          pv_matriz_production: r.pv_matriz_production || "",
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
        merchant_id_production: form.merchant_id_production || null,
        integration_key_encrypted: form.integration_key_encrypted || null,
        integration_key_production: form.integration_key_production || null,
        pv_matriz: form.pv_matriz || null,
        pv_matriz_production: form.pv_matriz_production || null,
        ativo: form.ativo,
      } as any)
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
        ambiente: "sandbox",
        merchant_id: newForm.merchant_id || null,
        integration_key_encrypted: newForm.integration_key_encrypted || null,
      });

    if (error) {
      toast.error("Erro ao adicionar: " + error.message);
    } else {
      toast.success("Adquirente configurada com sucesso");
      setShowAddForm(false);
      setNewForm({ cod_empresa: 0, adquirente: "REDE", merchant_id: "", integration_key_encrypted: "" });
      fetchConfigs();
    }
    setSaving(null);
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("adquirentes_config").delete().eq("id", id);
    if (error) {
      toast.error("Erro ao excluir: " + error.message);
    } else {
      toast.success("Configuração removida");
      fetchConfigs();
    }
  };

  const handleTestErede = async (config: AdquirenteConfig, targetAmbiente: "sandbox" | "production") => {
    const testId = `${config.id}-erede-${targetAmbiente}`;
    setTesting(testId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Sessão expirada");

      // Temporarily save the config with target ambiente before testing
      const form = editForms[config.id];
      const { data, error } = await supabase.functions.invoke("rede-proxy", {
        body: { action: "health", cod_empresa: config.cod_empresa },
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (error) throw error;
      if (data?.ok) {
        toast.success(`e.Rede OK — ${data.ambiente}`);
      } else {
        toast.error(`Falha e.Rede: ${data?.error || "Erro desconhecido"}`);
      }
    } catch (e) {
      toast.error(`Erro: ${(e as Error).message}`);
    } finally {
      setTesting(null);
    }
  };

  const handleTestGV = async (config: AdquirenteConfig, targetAmbiente: "sandbox" | "production") => {
    const form = editForms[config.id];
    const pvMatriz = targetAmbiente === "production"
      ? (form?.pv_matriz_production || form?.pv_matriz)
      : form?.pv_matriz;

    if (!pvMatriz) {
      toast.error(`Configure o PV Matriz (${targetAmbiente}) primeiro`);
      return;
    }

    const testId = `${config.id}-gv-${targetAmbiente}`;
    setTesting(testId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Sessão expirada");

      const { data, error } = await supabase.functions.invoke("rede-gestao-vendas", {
        body: { action: "health", ambiente: targetAmbiente, parentCompanyNumber: pvMatriz },
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (error) throw error;
      if (data?.ok) {
        toast.success(`Gestão de Vendas OK — ${data.ambiente}`);
      } else {
        toast.error(`Falha GV: ${data?.error || "Erro desconhecido"}`);
      }
    } catch (e) {
      toast.error(`Erro GV: ${(e as Error).message}`);
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
      || form.merchant_id_production !== (config.merchant_id_production || "")
      || form.integration_key_encrypted !== (config.integration_key_encrypted || "")
      || form.integration_key_production !== (config.integration_key_production || "")
      || form.pv_matriz !== (config.pv_matriz || "")
      || form.pv_matriz_production !== (config.pv_matriz_production || "")
      || form.ativo !== config.ativo;
  };

  const getEmpresaNome = (cod: number) => {
    const emp = empresas.find(e => e.codEmpresa === cod);
    return emp?.nome || `Empresa ${cod}`;
  };

  const CredentialBlock = ({ configId, label, ambiente, form }: {
    configId: string; label: string; ambiente: "sandbox" | "production"; form: EditForm;
  }) => {
    const prefix = ambiente === "production" ? "_production" : "";
    const pvField = ambiente === "production" ? "merchant_id_production" : "merchant_id";
    const keyField = ambiente === "production" ? "integration_key_production" : "integration_key_encrypted";
    const pvMatrizField = ambiente === "production" ? "pv_matriz_production" : "pv_matriz";

    const pvValue = (form as any)[pvField] || "";
    const keyValue = (form as any)[keyField] || "";
    const pvMatrizValue = (form as any)[pvMatrizField] || "";
    const keyVisibleId = `${configId}-${ambiente}`;
    const isKeyVisible = showKeys[keyVisibleId];
    const isActive = form.ambiente === ambiente;

    return (
      <div className={`p-3 rounded-lg border space-y-2 ${isActive ? "border-primary/40 bg-primary/5" : "border-border/50 bg-muted/20 opacity-75"}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Badge variant={isActive ? "default" : "secondary"} className="text-[10px]">
              {label}
            </Badge>
            {isActive && (
              <Badge variant="outline" className="text-[10px] text-primary border-primary/30">
                ATIVO
              </Badge>
            )}
          </div>
          {pvValue && <CheckCircle2 className="h-3 w-3 text-primary" />}
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div className="space-y-0.5">
            <Label className="text-[10px] text-muted-foreground">PV</Label>
            <Input
              value={pvValue}
              onChange={e => updateForm(configId, pvField, e.target.value)}
              className="font-mono text-xs h-7"
              placeholder="Nº filiação"
            />
          </div>
          <div className="space-y-0.5">
            <Label className="text-[10px] text-muted-foreground">Chave</Label>
            <div className="flex gap-0.5">
              <Input
                type={isKeyVisible ? "text" : "password"}
                value={keyValue}
                onChange={e => updateForm(configId, keyField, e.target.value)}
                className="font-mono text-xs h-7"
                placeholder="••••"
              />
              <Button
                variant="ghost" size="icon" className="h-7 w-7 shrink-0"
                onClick={() => setShowKeys(prev => ({ ...prev, [keyVisibleId]: !prev[keyVisibleId] }))}
              >
                {isKeyVisible ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
              </Button>
            </div>
          </div>
          <div className="space-y-0.5">
            <Label className="text-[10px] text-muted-foreground">PV Matriz (GV)</Label>
            <Input
              value={pvMatrizValue}
              onChange={e => updateForm(configId, pvMatrizField, e.target.value)}
              className="font-mono text-xs h-7"
              placeholder="PV Matriz"
            />
          </div>
        </div>
      </div>
    );
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
                <Label className="text-xs">PV Sandbox</Label>
                <Input
                  value={newForm.merchant_id}
                  onChange={e => setNewForm(f => ({ ...f, merchant_id: e.target.value }))}
                  placeholder="Número de filiação"
                  className="font-mono text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Chave Sandbox</Label>
                <Input
                  type="password"
                  value={newForm.integration_key_encrypted}
                  onChange={e => setNewForm(f => ({ ...f, integration_key_encrypted: e.target.value }))}
                  placeholder="••••••••••"
                  className="font-mono text-sm"
                />
              </div>
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

      {loading ? (
        <LoadingState />
      ) : configs.length === 0 ? (
        <EmptyState
          title="Nenhuma adquirente configurada"
          description="Adicione a primeira configuração para integrar com Rede, Cielo, Stone ou outra adquirente."
        />
      ) : (
        <div className="space-y-4">
          {configs.map(config => {
            const form = editForms[config.id];
            if (!form) return null;
            const changed = isChanged(config);

            return (
              <Card key={config.id}>
                <CardContent className="p-4 space-y-3">
                  {/* Header row */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div>
                        <span className="font-medium text-sm">{getEmpresaNome(config.cod_empresa)}</span>
                        <span className="text-xs text-muted-foreground ml-1">({config.cod_empresa})</span>
                      </div>
                      <Badge variant="outline">{config.adquirente}</Badge>
                    </div>
                    <div className="flex items-center gap-3">
                      {/* Ambiente toggle */}
                      <div className="flex items-center gap-2">
                        <span className={`text-xs ${form.ambiente === "sandbox" ? "font-medium text-foreground" : "text-muted-foreground"}`}>
                          Sandbox
                        </span>
                        <Switch
                          checked={form.ambiente === "production"}
                          onCheckedChange={v => updateForm(config.id, "ambiente", v ? "production" : "sandbox")}
                        />
                        <span className={`text-xs ${form.ambiente === "production" ? "font-medium text-primary" : "text-muted-foreground"}`}>
                          Produção
                        </span>
                      </div>
                      {/* Ativo toggle */}
                      <div className="flex items-center gap-1.5">
                        <Switch
                          checked={form.ativo}
                          onCheckedChange={v => updateForm(config.id, "ativo", v)}
                        />
                        <Badge variant={form.ativo ? "default" : "secondary"} className="text-[10px]">
                          {form.ativo ? "Ativa" : "Inativa"}
                        </Badge>
                      </div>
                    </div>
                  </div>

                  {/* Dual credential blocks */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <CredentialBlock configId={config.id} label="Sandbox" ambiente="sandbox" form={form} />
                    <CredentialBlock configId={config.id} label="Produção" ambiente="production" form={form} />
                  </div>

                  {/* Actions */}
                  <div className="flex items-center justify-between pt-1">
                    <div className="flex gap-1.5 flex-wrap">
                      {/* e.Rede tests */}
                      <Button
                        size="sm" variant="outline" className="text-xs h-7"
                        disabled={testing?.startsWith(config.id + "-erede") || false}
                        onClick={() => handleTestErede(config, "sandbox")}
                        title="Testar e.Rede Sandbox"
                      >
                        {testing === `${config.id}-erede-sandbox` ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Wifi className="h-3 w-3 mr-1" />}
                        e.Rede SB
                      </Button>
                      <Button
                        size="sm" variant="outline" className="text-xs h-7"
                        disabled={testing?.startsWith(config.id + "-erede") || false}
                        onClick={() => handleTestErede(config, "production")}
                        title="Testar e.Rede Produção"
                      >
                        {testing === `${config.id}-erede-production` ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Wifi className="h-3 w-3 mr-1" />}
                        e.Rede Prod
                      </Button>

                      {/* GV tests (Rede only) */}
                      {config.adquirente === "REDE" && (
                        <>
                          <Button
                            size="sm" variant="outline" className="text-xs h-7"
                            disabled={testing?.startsWith(config.id + "-gv") || false}
                            onClick={() => handleTestGV(config, "sandbox")}
                            title="Testar GV Sandbox"
                          >
                            {testing === `${config.id}-gv-sandbox` ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                            GV SB
                          </Button>
                          <Button
                            size="sm" variant="outline" className="text-xs h-7"
                            disabled={testing?.startsWith(config.id + "-gv") || false}
                            onClick={() => handleTestGV(config, "production")}
                            title="Testar GV Produção"
                          >
                            {testing === `${config.id}-gv-production` ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                            GV Prod
                          </Button>
                        </>
                      )}
                    </div>

                    <div className="flex gap-1.5">
                      <Button
                        size="sm" variant={changed ? "default" : "outline"} className="h-7"
                        disabled={!changed || saving === config.id}
                        onClick={() => handleSave(config)}
                      >
                        {saving === config.id ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Save className="h-3 w-3 mr-1" />}
                        Salvar
                      </Button>
                      <Button
                        size="sm" variant="ghost" className="h-7 text-destructive hover:text-destructive"
                        onClick={() => handleDelete(config.id)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Card className="bg-muted/30">
        <CardContent className="pt-4 pb-3">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
            <div className="text-sm text-muted-foreground space-y-1">
              <p><strong>Sandbox:</strong> Credenciais de teste. Nenhuma transação real é processada.</p>
              <p><strong>Produção:</strong> Credenciais reais. Transações processadas com cobrança efetiva.</p>
              <p><strong>Ambiente Ativo:</strong> O toggle define qual conjunto de credenciais as integrações (links de pagamento, sync de vendas) utilizam.</p>
              <p><strong>GV (Gestão de Vendas):</strong> API OAuth 2.0 para visibilidade de vendas POS. PV Matriz = PV da empresa mãe.</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
