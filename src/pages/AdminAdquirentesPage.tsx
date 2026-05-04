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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ModuleHeader } from "@/components/system/ModuleHeader";
import { LoadingState, EmptyState } from "@/components/system/states";
import { toast } from "sonner";
import {
  Loader2, Save, Plus, Eye, EyeOff, CreditCard,
  CheckCircle2, AlertCircle, Trash2, Wifi, ShieldCheck, FlaskConical,
  Send, Code, X, RefreshCw,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
  pvs_matriz_production: string[] | null;
  ativo: boolean;
  created_at: string;
  updated_at: string;
  gv_optin_status?: string | null;
  gv_optin_requested_at?: string | null;
  gv_optin_reference?: string | null;
  gv_optin_external_id?: string | null;
  gv_optin_request_payload?: any;
  gv_optin_response?: any;
  gv_approved_at?: string | null;
  gv_last_healthcheck_at?: string | null;
  gv_last_healthcheck_status?: string | null;
  gv_last_healthcheck_message?: string | null;
  gv_optin_mirrored_from?: number | null;
}

interface EditForm {
  ambiente: string;
  merchant_id: string;
  merchant_id_production: string;
  integration_key_encrypted: string;
  integration_key_production: string;
  pv_matriz: string;
  pv_matriz_production: string;
  pvs_matriz_production: string[];
  ativo: boolean;
}

const ADQUIRENTES = ["REDE", "CIELO", "STONE", "PAGSEGURO", "GETNET"];
let optinAutoVerificationStarted = false;

type OptinAction = "solicitar_compartilhamento" | "verificar_status_optin" | "reset";

function ActivationGVBlock({
  config,
  form,
  onOptin,
  onTestProd,
  busy,
  empresas,
}: {
  config: AdquirenteConfig;
  form: EditForm;
  onOptin: (a: OptinAction) => void;
  onTestProd: () => void;
  busy: string | null;
  empresas?: Array<{ codEmpresa: number; nomeFantasia?: string | null; nome?: string | null }>;
}) {
  const status = config.gv_optin_status || "NAO_SOLICITADO";
  const hasCreds = !!form.merchant_id_production && !!form.integration_key_production;
  const hasPvMatriz = (form.pvs_matriz_production?.length || 0) > 0;
  const isProd = form.ambiente === "production";
  const optinRequested = !!config.gv_optin_requested_at;
  const approved = status === "APROVADO" || !!config.gv_approved_at;
  const healthOk = config.gv_last_healthcheck_status === "ATIVA";
  const mirroredFrom = config.gv_optin_mirrored_from ?? null;
  const mirroredFromName = mirroredFrom != null
    ? (empresas?.find(e => e.codEmpresa === mirroredFrom)?.nomeFantasia
        || empresas?.find(e => e.codEmpresa === mirroredFrom)?.nome
        || `Loja ${mirroredFrom}`)
    : null;

  const fmt = (iso?: string | null) =>
    iso ? new Date(iso).toLocaleString("pt-BR") : "—";

  const Step = ({ done, label, hint }: { done: boolean; label: string; hint?: string }) => (
    <div className="flex items-start gap-2">
      {done ? (
        <CheckCircle2 className="h-4 w-4 text-success mt-0.5 shrink-0" />
      ) : (
        <AlertCircle className="h-4 w-4 text-warning mt-0.5 shrink-0" />
      )}
      <div className="text-xs">
        <div className={done ? "text-foreground" : "text-muted-foreground"}>{label}</div>
        {hint && <div className="text-[10px] text-muted-foreground">{hint}</div>}
      </div>
    </div>
  );

  const statusBadge = approved
    ? <Badge className="bg-success/15 text-success border-success/30 text-[10px]">APROVADO</Badge>
    : status === "AGUARDANDO_ACEITE"
      ? <Badge className="bg-warning/15 text-warning border-warning/30 text-[10px]">AGUARDANDO ACEITE</Badge>
      : <Badge variant="secondary" className="text-[10px]">NÃO SOLICITADO</Badge>;

  return (
    <div className="rounded-lg border border-primary/20 bg-primary/[0.03] p-3 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 flex-wrap">
          <ShieldCheck className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">Ativação Gestão de Vendas (Produção)</span>
          {statusBadge}
          {mirroredFromName && (
            <Badge variant="outline" className="text-[10px] border-primary/40 text-primary">
              Coberto pelo Opt-in de {mirroredFromName}
            </Badge>
          )}
        </div>
      </div>

      {mirroredFromName && (
        <div className="text-[11px] text-muted-foreground bg-primary/5 border border-primary/15 rounded p-2">
          Esta loja compartilha o mesmo PV Matriz Comercial com <strong>{mirroredFromName}</strong>. O aceite no portal da REDE feito por aquela loja já cobre esta — não é necessária nova solicitação. Quando o status mudar para ATIVA, ambas serão liberadas simultaneamente.
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <Step done={hasCreds} label="Credenciais OAuth de produção cadastradas" />
        <Step done={hasPvMatriz} label={hasPvMatriz ? `${form.pvs_matriz_production.length} PV(s) Matriz Comercial(is) cadastrado(s)` : "PVs Matriz Comerciais não cadastrados"} />
        <Step done={isProd} label="Ambiente ativo: PRODUÇÃO" hint={isProd ? undefined : "Alterne o toggle no topo"} />
        <Step
          done={optinRequested}
          label="Opt-in solicitado"
          hint={optinRequested ? `em ${fmt(config.gv_optin_requested_at)}` : "Dispare a solicitação"}
        />
        <Step
          done={approved}
          label="Aceite confirmado no portal da REDE"
          hint={approved ? `em ${fmt(config.gv_approved_at)}` : "O sistema verifica automaticamente — aprove com perfil master no portal"}
        />
        <Step
          done={healthOk}
          label="Teste de conectividade aprovado"
          hint={config.gv_last_healthcheck_at ? `último: ${fmt(config.gv_last_healthcheck_at)} — ${config.gv_last_healthcheck_status}` : "Execute o teste"}
        />
      </div>

      {config.gv_last_healthcheck_message && !healthOk && (
        <div className="text-[11px] text-destructive bg-destructive/10 p-2 rounded">
          {config.gv_last_healthcheck_message}
        </div>
      )}

      {(config.gv_optin_external_id || config.gv_optin_response) && (
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground bg-muted/40 rounded p-2">
          {config.gv_optin_external_id && (
            <span>
              Protocolo REDE: <span className="font-mono text-foreground">{config.gv_optin_external_id}</span>
            </span>
          )}
          {config.gv_optin_response && (
            <Popover>
              <PopoverTrigger asChild>
                <Button size="sm" variant="ghost" className="h-6 text-[10px] px-2">
                  <Code className="h-3 w-3 mr-1" /> Ver response REDE
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-96 max-h-80 overflow-auto">
                <pre className="text-[10px] font-mono whitespace-pre-wrap break-all">
                  {JSON.stringify(config.gv_optin_response, null, 2)}
                </pre>
              </PopoverContent>
            </Popover>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-1.5 pt-1 border-t border-primary/10">
        <Button
          size="sm" variant="outline" className="text-xs"
          disabled={!!busy || !hasCreds || !hasPvMatriz}
          onClick={() => onOptin("solicitar_compartilhamento")}
        >
          {busy === `${config.id}-optin-solicitar_compartilhamento` ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Send className="h-3 w-3 mr-1" />}
          {optinRequested ? "Reenviar Solicitação" : "Solicitar Compartilhamento"}
        </Button>
        <Button
          size="sm" variant="outline" className="text-xs"
          disabled={!!busy || !optinRequested || approved}
          onClick={() => onOptin("verificar_status_optin")}
          title="Consulta o status atual diretamente na API da REDE"
        >
          {busy === `${config.id}-optin-verificar_status_optin` ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <RefreshCw className="h-3 w-3 mr-1" />}
          Verificar na REDE
        </Button>
        <Button
          size="sm" variant="outline" className="text-xs"
          disabled={!!busy || !hasCreds || !hasPvMatriz}
          onClick={onTestProd}
        >
          {busy === `${config.id}-gv-production` ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Wifi className="h-3 w-3 mr-1" />}
          Validar Ativação
        </Button>
        {(optinRequested || approved) && (
          <Button
            size="sm" variant="ghost" className="text-xs text-muted-foreground"
            disabled={!!busy}
            onClick={() => onOptin("reset")}
          >
            Reiniciar
          </Button>
        )}
      </div>
    </div>
  );
}

function PvsMatrizManager({
  configId,
  pvs,
  onChange,
}: {
  configId: string;
  pvs: string[];
  onChange: (next: string[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const v = draft.trim();
    if (!v) return;
    if (pvs.includes(v)) { setDraft(""); return; }
    onChange([...pvs, v]);
    setDraft("");
  };
  const remove = (pv: string) => onChange(pvs.filter(p => p !== pv));

  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium">PVs Matriz Comerciais — Produção</Label>
      <div className="flex gap-1">
        <Input
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          className="font-mono text-sm"
          placeholder="Ex.: 31974325"
          inputMode="numeric"
        />
        <Button variant="outline" size="sm" onClick={add} disabled={!draft.trim()} className="shrink-0">
          <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar
        </Button>
      </div>
      {pvs.length === 0 ? (
        <Badge className="bg-warning/15 text-warning border-warning/30 text-[10px]">PV Matriz não configurado</Badge>
      ) : (
        <div className="flex flex-wrap gap-1 pt-1">
          {pvs.map(pv => (
            <Badge key={`${configId}-${pv}`} variant="secondary" className="font-mono text-xs gap-1 pr-1">
              {pv}
              <button onClick={() => remove(pv)} className="hover:bg-destructive/20 rounded p-0.5" aria-label={`Remover ${pv}`}>
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
      <p className="text-[10px] text-muted-foreground">PV Matriz Comercial de cada CNPJ. Múltiplos PVs por loja são suportados (ex.: Super Shopping). Lojas que compartilham CNPJ podem usar o mesmo PV.</p>
    </div>
  );
}

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
          pvs_matriz_production: Array.isArray(r.pvs_matriz_production) ? r.pvs_matriz_production : [],
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
        pvs_matriz_production: form.pvs_matriz_production || [],
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
      if (!silent || (data?.approved || 0) > 0 || (data?.rejected || 0) > 0) {
        fetchConfigs();
      }
    }
  };

  const handleTestErede = async (config: AdquirenteConfig, targetAmbiente: "sandbox" | "production") => {
    const testId = `${config.id}-erede-${targetAmbiente}`;
    setTesting(testId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Sessão expirada");

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
    const pvsToTest: string[] = targetAmbiente === "production"
      ? ((form?.pvs_matriz_production?.length ? form.pvs_matriz_production : (form?.pv_matriz_production ? [form.pv_matriz_production] : [])))
      : (form?.pv_matriz ? [form.pv_matriz] : []);

    if (pvsToTest.length === 0) {
      toast.error(`Configure ao menos 1 PV Matriz (${targetAmbiente}) primeiro`);
      return;
    }

    const testId = `${config.id}-gv-${targetAmbiente}`;
    setTesting(testId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Sessão expirada");

      const results: Array<{ pv: string; ok: boolean; status?: string; error?: string }> = [];
      for (const pv of pvsToTest) {
        const { data, error } = await supabase.functions.invoke("rede-gestao-vendas", {
          body: { action: "health", ambiente: targetAmbiente, parentCompanyNumber: pv },
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (error) {
          results.push({ pv, ok: false, error: error.message });
        } else {
          results.push({ pv, ok: !!data?.ok, status: data?.status, error: data?.error });
        }
      }

      const okCount = results.filter(r => r.ok).length;
      const allOk = okCount === results.length;

      if (targetAmbiente === "production") {
        const summary = results.map(r => `${r.pv}: ${r.ok ? "OK" : (r.status || r.error || "ERRO")}`).join(" | ");
        await supabase
          .from("adquirentes_config")
          .update({
            gv_last_healthcheck_at: new Date().toISOString(),
            gv_last_healthcheck_status: allOk ? "ATIVA" : (okCount > 0 ? "PARCIAL" : "ERRO"),
            gv_last_healthcheck_message: allOk ? null : summary,
          } as any)
          .eq("id", config.id);
      }

      if (allOk) {
        toast.success(`Gestão de Vendas OK — ${okCount}/${results.length} PV(s) ativos`);
      } else if (okCount > 0) {
        const failed = results.filter(r => !r.ok).map(r => r.pv).join(", ");
        toast.warning(`${okCount}/${results.length} PV(s) OK. Falhou: ${failed}`);
      } else {
        const first = results[0];
        toast.error(`Falha em todos os PVs: ${first.error || first.status || "erro desconhecido"}`);
      }
      fetchConfigs();
    } catch (e) {
      toast.error(`Erro GV: ${(e as Error).message}`);
    } finally {
      setTesting(null);
    }
  };

  const handleSyncVendas = async () => {
    setTesting("sync-vendas");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Sessão expirada");
      const { data, error } = await supabase.functions.invoke("sync-vendas-cartao", {
        body: { ambiente: "production" },
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const unmappedKeys = Object.keys(data?.unmapped || {});
      const unmappedMsg = unmappedKeys.length > 0 ? ` · ${unmappedKeys.length} PV(s) sem mapeamento` : "";
      toast.success(
        `Sync: ${data.inserted} venda(s) inseridas em ${data.pvs_com_dados}/${data.pvs_consultados} PV(s)${unmappedMsg}`,
        { duration: 8000 },
      );
      console.log("[sync-vendas-cartao] resultado:", data);
    } catch (e) {
      toast.error(`Erro sync: ${(e as Error).message}`);
    } finally {
      setTesting(null);
    }
  };

  const handleOptinAction = async (
    config: AdquirenteConfig,
    action: OptinAction,
  ) => {
    const testId = `${config.id}-optin-${action}`;
    setTesting(testId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Sessão expirada");

      const isProd = (editForms[config.id]?.ambiente || config.ambiente) === "production";
      const { data, error } = await supabase.functions.invoke("rede-gestao-acessos", {
        body: {
          action,
          cod_empresa: config.cod_empresa,
          ambiente: isProd ? "production" : "sandbox",
        },
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      // Para a chamada real, exibe resultado estruturado
      if (action === "solicitar_compartilhamento") {
        const okPvs = (data?.pv_results || []).filter((r: any) => r.ok);
        const failPvs = (data?.pv_results || []).filter((r: any) => !r.ok);
        if (okPvs.length > 0) {
          const protocolos = okPvs.map((r: any) => r.request_id).filter(Boolean).join(", ");
          toast.success(`${okPvs.length} PV(s) enviado(s) à REDE${protocolos ? ` (protocolos: ${protocolos})` : ""}. Aguardando aceite no portal.`);
        }
        if (failPvs.length > 0) {
          const err = failPvs[0].error || `HTTP ${failPvs[0].status || "?"}`;
          toast.error(`${failPvs.length} PV(s) recusado(s) pela REDE: ${err}`);
        }
        if ((data?.skipped?.length || 0) > 0) {
          toast.warning(`${data.skipped.length} loja(s) sem PV Matriz cadastrado — pulada(s).`);
        }
      } else if (action === "verificar_status_optin") {
        if (data?.checked === 0) {
          toast.info(data?.message || "Nenhuma solicitação para verificar");
        } else if (data?.approved > 0) {
          toast.success(`Aceite confirmado pela REDE para ${data.approved} solicitação(ões)`);
        } else if (data?.rejected > 0) {
          toast.error(`${data.rejected} solicitação(ões) rejeitada(s)/expirada(s) pela REDE`);
        } else if (data?.pending > 0) {
          const remote = data?.results?.[0]?.remote_status || "PENDING";
          toast.info(`Ainda aguardando aceite no portal da REDE (status: ${remote})`);
        } else if (data?.errors > 0) {
          toast.error(`Erro ao consultar REDE: ${data?.results?.[0]?.error || "verifique os logs"}`);
        }
      } else {
        const labels: Record<string, string> = {
          reset: "Status de Opt-in reiniciado",
          solicitar_compartilhamento: "Solicitação processada",
        };
        toast.success(labels[action] || "Ação executada");
      }
      fetchConfigs();
    } catch (e) {
      toast.error(`Erro Opt-in: ${(e as Error).message}`);
    } finally {
      setTesting(null);
    }
  };

  const handleSolicitarLote = async () => {
    setTesting("lote-rede");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Sessão expirada");
      const { data, error } = await supabase.functions.invoke("rede-gestao-acessos", {
        body: { action: "solicitar_compartilhamento_lote", ambiente: "production" },
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const skipped = (data?.skipped?.length || 0);
      const skipMsg = skipped > 0 ? ` · ${skipped} loja(s) sem PV` : "";
      toast.success(`Lote enviado: ${data.sucesso}/${data.total_pvs} PVs aceitos pela REDE${skipMsg}. Aguardando aceite no portal.`);
      fetchConfigs();
    } catch (e) {
      toast.error(`Erro lote: ${(e as Error).message}`);
    } finally {
      setTesting(null);
    }
  };

  const handleVerificarLotePendentes = useCallback(async (silent = false) => {
    if (!silent) setTesting("lote-verificar");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const { data, error } = await supabase.functions.invoke("rede-gestao-acessos", {
        body: { action: "verificar_status_optin_lote", ambiente: "production" },
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      if (!silent) {
        if ((data?.checked || 0) === 0) {
          toast.info("Nenhuma solicitação pendente para verificar");
        } else {
          const parts: string[] = [];
          if (data.approved > 0) parts.push(`${data.approved} aprovada(s)`);
          if (data.pending > 0) parts.push(`${data.pending} ainda pendente(s)`);
          if (data.rejected > 0) parts.push(`${data.rejected} rejeitada(s)`);
          if (data.errors > 0) parts.push(`${data.errors} erro(s)`);
          toast.success(`Verificação concluída: ${parts.join(" · ")}`);
        }
      } else if ((data?.approved || 0) > 0) {
        toast.success(`${data.approved} aceite(s) confirmado(s) automaticamente pela REDE`);
      }
      fetchConfigs();
    } catch (e) {
      if (!silent) toast.error(`Erro: ${(e as Error).message}`);
      else console.warn("[adquirentes] Verificação automática falhou:", (e as Error).message);
    } finally {
      if (!silent) setTesting(null);
    }
  }, [fetchConfigs]);

  // Verificação automática silenciosa: ao carregar a página, consulta a REDE
  // sobre todos os Opt-ins em AGUARDANDO_ACEITE e atualiza o status.
  useEffect(() => {
    if (loading) return;
    if (optinAutoVerificationStarted) return;
    const hasPending = configs.some(c => c.gv_optin_status === "AGUARDANDO_ACEITE" && c.gv_optin_external_id);
    if (!hasPending) return;
    optinAutoVerificationStarted = true;
    handleVerificarLotePendentes(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, configs]);

  const updateForm = (id: string, field: string, value: string | boolean) => {
    setEditForms(prev => ({
      ...prev,
      [id]: { ...prev[id], [field]: value },
    }));
  };

  const isChanged = (config: AdquirenteConfig) => {
    const form = editForms[config.id];
    if (!form) return false;
    const cfgPvs = Array.isArray(config.pvs_matriz_production) ? config.pvs_matriz_production : [];
    const formPvs = form.pvs_matriz_production || [];
    const pvsChanged = cfgPvs.length !== formPvs.length
      || cfgPvs.some((v, i) => v !== formPvs[i]);
    return form.ambiente !== config.ambiente
      || form.merchant_id !== (config.merchant_id || "")
      || form.merchant_id_production !== (config.merchant_id_production || "")
      || form.integration_key_encrypted !== (config.integration_key_encrypted || "")
      || form.integration_key_production !== (config.integration_key_production || "")
      || form.pv_matriz !== (config.pv_matriz || "")
      || form.pv_matriz_production !== (config.pv_matriz_production || "")
      || pvsChanged
      || form.ativo !== config.ativo;
  };

  const getEmpresaNome = (cod: number) => {
    const emp = empresas.find(e => e.codEmpresa === cod);
    return emp?.nome || `Empresa ${cod}`;
  };

  const CredentialFields = ({ config, ambiente, form }: {
    config: AdquirenteConfig; ambiente: "sandbox" | "production"; form: EditForm;
  }) => {
    const configId = config.id;
    const pvField = ambiente === "production" ? "merchant_id_production" : "merchant_id";
    const keyField = ambiente === "production" ? "integration_key_production" : "integration_key_encrypted";
    const pvMatrizField = ambiente === "production" ? "pv_matriz_production" : "pv_matriz";

    const pvValue = (form as any)[pvField] || "";
    const keyValue = (form as any)[keyField] || "";
    const pvMatrizValue = (form as any)[pvMatrizField] || "";
    const keyVisibleId = `${configId}-${ambiente}`;
    const isKeyVisible = showKeys[keyVisibleId];

    const isSandbox = ambiente === "sandbox";
    const hasCredentials = !!pvValue && !!keyValue;

    return (
      <div className="space-y-4">
        <div className={`flex items-center gap-2 p-2.5 rounded-md ${hasCredentials ? "bg-success/10 text-success" : "bg-warning/10 text-warning"}`}>
          {hasCredentials ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          <span className="text-xs font-medium">
            {hasCredentials
              ? `Credenciais de ${isSandbox ? "teste" : "produção"} configuradas`
              : `Preencha o PV e a Chave de ${isSandbox ? "teste" : "produção"}`}
          </span>
        </div>

        <div className="grid gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">PV (Nº Filiação) — {isSandbox ? "Teste" : "Produção"}</Label>
            <Input value={pvValue} onChange={e => updateForm(configId, pvField, e.target.value)} className="font-mono text-sm" placeholder={isSandbox ? "PV de teste fornecido pela Rede" : "PV real da loja"} />
            <p className="text-[10px] text-muted-foreground">{isSandbox ? "Obtido no Portal do Desenvolvedor e.Rede (ambiente de testes)" : "Número de filiação real da sua loja na Rede"}</p>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Chave de Integração — {isSandbox ? "Teste" : "Produção"}</Label>
            <div className="flex gap-1">
              <Input type={isKeyVisible ? "text" : "password"} value={keyValue} onChange={e => updateForm(configId, keyField, e.target.value)} className="font-mono text-sm" placeholder={isSandbox ? "Chave de teste" : "Chave de produção"} />
              <Button variant="ghost" size="icon" className="shrink-0" onClick={() => setShowKeys(prev => ({ ...prev, [keyVisibleId]: !prev[keyVisibleId] }))}>
                {isKeyVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
          </div>
          {isSandbox ? (
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">PV Matriz (Gestão de Vendas) — Teste</Label>
              <Input value={pvMatrizValue} onChange={e => updateForm(configId, pvMatrizField, e.target.value)} className="font-mono text-sm" placeholder="PV Matriz de teste" />
              <p className="text-[10px] text-muted-foreground">Usado pela API Gestão de Vendas (OAuth 2.0) para consultar vendas POS</p>
            </div>
          ) : (
            <PvsMatrizManager
              configId={configId}
              pvs={form.pvs_matriz_production || []}
              onChange={(next) => setEditForms(prev => ({ ...prev, [configId]: { ...prev[configId], pvs_matriz_production: next } }))}
            />
          )}
        </div>

        <div className="flex gap-2 pt-1">
          <Button size="sm" variant="outline" className="text-xs" disabled={!!testing} onClick={() => handleTestErede(config, ambiente)}>
            {testing === `${configId}-erede-${ambiente}` ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Wifi className="h-3 w-3 mr-1" />}
            Testar e.Rede
          </Button>
          {config.adquirente === "REDE" && (
            <Button size="sm" variant="outline" className="text-xs" disabled={!!testing} onClick={() => handleTestGV(config, ambiente)}>
              {testing === `${configId}-gv-${ambiente}` ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Wifi className="h-3 w-3 mr-1" />}
              Testar GV
            </Button>
          )}
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
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={handleSyncVendas}
              disabled={testing === "sync-vendas"}
            >
              {testing === "sync-vendas" ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <Wifi className="h-4 w-4 mr-1" />
              )}
              Sincronizar vendas (7 dias)
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleSolicitarLote}
              disabled={testing === "lote-rede"}
            >
              {testing === "lote-rede" ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <Send className="h-4 w-4 mr-1" />
              )}
              Solicitar compartilhamento (lote REDE)
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleVerificarLotePendentes(false)}
              disabled={testing === "lote-verificar"}
              title="Consulta a REDE sobre todos os Opt-ins ainda pendentes e atualiza automaticamente os que foram aprovados"
            >
              {testing === "lote-verificar" ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-1" />
              )}
              Verificar aceites pendentes
            </Button>
            <Button size="sm" onClick={() => setShowAddForm(true)}>
              <Plus className="h-4 w-4 mr-1" /> Nova Adquirente
            </Button>
          </div>
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
            const isProduction = form.ambiente === "production";

            return (
              <Card key={config.id}>
                <CardContent className="p-4 space-y-4">
                  {/* Header row */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div>
                        <span className="font-medium text-sm">{getEmpresaNome(config.cod_empresa)}</span>
                        <span className="text-xs text-muted-foreground ml-1">({config.cod_empresa})</span>
                      </div>
                      <Badge variant="outline">{config.adquirente}</Badge>
                      {(config.merchant_id_production === "PENDENTE" || (!config.merchant_id_production && form.ambiente === "production")) && (
                        <Badge className="bg-warning/15 text-warning border-warning/30 text-[10px]">⚠ PV Pendente</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
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

                  {/* Ambiente ativo — clear visual */}
                  <div className={`flex items-center gap-3 p-3 rounded-lg border-2 ${isProduction ? "border-primary bg-primary/5" : "border-warning bg-warning/5"}`}>
                    {isProduction ? (
                      <ShieldCheck className="h-5 w-5 text-primary shrink-0" />
                    ) : (
                      <FlaskConical className="h-5 w-5 text-warning shrink-0" />
                    )}
                    <div className="flex-1">
                      <p className="text-sm font-medium">
                        Ambiente ativo: <span className={isProduction ? "text-primary" : "text-warning"}>{isProduction ? "PRODUÇÃO" : "SANDBOX"}</span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {isProduction
                          ? "Links de pagamento e sync usam as credenciais de produção abaixo"
                          : "Links de pagamento e sync usam as credenciais de teste abaixo — nenhuma transação real"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs ${!isProduction ? "font-semibold" : "text-muted-foreground"}`}>Sandbox</span>
                      <Switch
                        checked={isProduction}
                        onCheckedChange={v => updateForm(config.id, "ambiente", v ? "production" : "sandbox")}
                      />
                      <span className={`text-xs ${isProduction ? "font-semibold text-primary" : "text-muted-foreground"}`}>Produção</span>
                    </div>
                  </div>

                  {/* Tabs for credentials */}
                  <Tabs defaultValue={form.ambiente} className="w-full">
                    <TabsList className="grid w-full grid-cols-2">
                      <TabsTrigger value="sandbox" className="gap-1.5">
                        <FlaskConical className="h-3.5 w-3.5" />
                        Credenciais Sandbox
                        {form.ambiente === "sandbox" && (
                          <Badge variant="secondary" className="text-[9px] ml-1 px-1 py-0">EM USO</Badge>
                        )}
                      </TabsTrigger>
                      <TabsTrigger value="production" className="gap-1.5">
                        <ShieldCheck className="h-3.5 w-3.5" />
                        Credenciais Produção
                        {form.ambiente === "production" && (
                          <Badge variant="secondary" className="text-[9px] ml-1 px-1 py-0">EM USO</Badge>
                        )}
                      </TabsTrigger>
                    </TabsList>

                    <TabsContent value="sandbox" className="mt-3">
                      <CredentialFields config={config} ambiente="sandbox" form={form} />
                    </TabsContent>

                    <TabsContent value="production" className="mt-3">
                      <CredentialFields config={config} ambiente="production" form={form} />
                    </TabsContent>
                  </Tabs>

                  {config.adquirente === "REDE" && (
                    <ActivationGVBlock
                      config={config}
                      form={form}
                      onOptin={(action) => handleOptinAction(config, action)}
                      onTestProd={() => handleTestGV(config, "production")}
                      busy={testing}
                      empresas={empresas}
                    />
                  )}

                  {/* Actions */}
                  <div className="flex items-center justify-between pt-1 border-t">
                    <div />
                    <div className="flex gap-1.5">
                      <Button
                        size="sm" variant={changed ? "default" : "outline"}
                        disabled={!changed || saving === config.id}
                        onClick={() => handleSave(config)}
                      >
                        {saving === config.id ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Save className="h-3 w-3 mr-1" />}
                        Salvar
                      </Button>
                      <Button
                        size="sm" variant="ghost" className="text-destructive hover:text-destructive"
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
              <p><strong>Como funciona:</strong> Cada adquirente tem dois conjuntos de credenciais independentes — Sandbox (teste) e Produção (real).</p>
              <p><strong>Ambiente Ativo:</strong> O toggle no topo define qual conjunto é usado pelos links de pagamento e sync de vendas. Altere para <strong>Produção</strong> quando estiver pronto para transações reais.</p>
              <p><strong>GV (Gestão de Vendas):</strong> O PV Matriz consulta vendas POS de todas as filiais via OAuth 2.0.</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
