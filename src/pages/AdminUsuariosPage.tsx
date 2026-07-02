import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useModuleInsights } from "@/hooks/useModuleInsights";
import { ModuleInsightsPanel } from "@/components/ia/ModuleInsightsPanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "@/hooks/use-toast";
import { Loader2, Shield, Users, Eye, Store, Info, Plus, Lock, Undo2, Check, FileText } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Navigate } from "react-router-dom";
import { useEmpresas } from "@/hooks/useEmpresas";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Separator } from "@/components/ui/separator";
import { Label } from "@/components/ui/label";
import { BaseDialog } from "@/components/system/BaseDialog";
import { BaseSheet } from "@/components/system/BaseSheet";
import { useDirtyGuard } from "@/components/system/dirty/useDirtyGuard";
import type { ModuleKey } from "@/components/layout/AppLayout";
import { PAGES_BY_MODULE } from "@/lib/pageCatalog";

interface PagePermRow {
  user_id: string;
  page_key: string;
}

type AppRole = "admin";

interface ProfileRow {
  id: string;
  email: string | null;
  nome: string | null;
  cod_empresa: number;
}

interface RoleRow {
  user_id: string;
  role: AppRole;
}

interface ModulePermRow {
  user_id: string;
  module: string;
  access_level: string;
}

interface EmpresaPermRow {
  user_id: string;
  cod_empresa: number;
}

const ALL_MODULES: { key: ModuleKey; label: string; desc: string }[] = [
  { key: "vendas", label: "Vendas", desc: "Dashboards de vendas e análises" },
  { key: "estoque", label: "Estoque", desc: "Visão de estoque e OTB" },
  { key: "monitor", label: "Monitor", desc: "Acompanhamento de OS" },
  { key: "financeiro", label: "Financeiro", desc: "DRE, fluxo de caixa e parcelas" },
  { key: "ia", label: "Central IA", desc: "Análises inteligentes" },
  { key: "config", label: "Config", desc: "Metas e configurações" },
  { key: "comunicacao", label: "Comunicação", desc: "CRM e comunicação (acesso externo)" },
];

function SectionHeader({ icon: Icon, title, description }: { icon: React.ElementType; title: string; description: string }) {
  return (
    <div className="flex items-start gap-2 mb-3">
      <Icon className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

// ─── Create User Dialog (BaseDialog) ────────────────────────────────
function CreateUserDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (v: boolean) => void; onCreated: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nome, setNome] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nomeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setError(null);
      setTimeout(() => nomeRef.current?.focus(), 100);
    }
  }, [open]);

  const handleCreate = async () => {
    setError(null);
    if (!email || !password) {
      setError("Preencha email e senha");
      return;
    }
    if (password.length < 6) {
      setError("Senha deve ter no mínimo 6 caracteres");
      return;
    }
    setSaving(true);
    try {
      const { data, error: fnError } = await supabase.functions.invoke("admin-manage-users", {
        body: { action: "create", email, password, nome },
      });
      if (fnError) throw fnError;
      if (data?.error) throw new Error(data.error);
      toast({ title: "Usuário criado com sucesso!" });
      setEmail("");
      setPassword("");
      setNome("");
      onOpenChange(false);
      onCreated();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <BaseDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Novo Usuário"
      description="Crie um novo usuário. Após criar, configure as permissões na lista."
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleCreate} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Criar Usuário
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && (
          <p className="text-sm text-danger bg-danger-soft px-3 py-2 rounded-md">{error}</p>
        )}
        <div className="space-y-2">
          <Label htmlFor="create-nome">Nome</Label>
          <Input ref={nomeRef} id="create-nome" placeholder="Nome do usuário" value={nome} onChange={(e) => setNome(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="create-email">Email *</Label>
          <Input id="create-email" type="email" placeholder="usuario@empresa.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="create-password">Senha *</Label>
          <Input id="create-password" type="password" placeholder="Mínimo 6 caracteres" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
      </div>
    </BaseDialog>
  );
}

// ─── Reset Password Dialog (BaseDialog) ─────────────────────────────
function ResetPasswordDialog({ open, onOpenChange, userId, userName }: { open: boolean; onOpenChange: (v: boolean) => void; userId: string; userName: string }) {
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setPassword("");
      setError(null);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  const handleReset = async () => {
    setError(null);
    if (password.length < 6) {
      setError("Senha deve ter no mínimo 6 caracteres");
      return;
    }
    setSaving(true);
    try {
      const { data, error: fnError } = await supabase.functions.invoke("admin-manage-users", {
        body: { action: "reset_password", user_id: userId, password },
      });
      if (fnError) throw fnError;
      if (data?.error) throw new Error(data.error);
      toast({ title: "Senha alterada com sucesso!" });
      setPassword("");
      onOpenChange(false);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <BaseDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Redefinir Senha"
      description={`Nova senha para ${userName}`}
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleReset} disabled={saving || password.length < 6}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Salvar Senha
          </Button>
        </>
      }
    >
      <div className="space-y-2">
        {error && (
          <p className="text-sm text-danger bg-danger-soft px-3 py-2 rounded-md">{error}</p>
        )}
        <Label htmlFor="new-password">Nova Senha</Label>
        <Input ref={inputRef} id="new-password" type="password" placeholder="Mínimo 6 caracteres" value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>
    </BaseDialog>
  );
}

// ─── User Row (clickable summary) ───────────────────────────────────
function UserRow({
  profile,
  isAdmin,
  moduleCount,
  empresaCount,
  totalModules,
  totalEmpresas,
  onClick,
}: {
  profile: ProfileRow;
  isAdmin: boolean;
  moduleCount: number;
  empresaCount: number;
  totalModules: number;
  totalEmpresas: number;
  onClick: () => void;
}) {
  return (
    <Card
      className="cursor-pointer hover:bg-accent/30 transition-colors"
      onClick={onClick}
    >
      <CardHeader className="py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <Users className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0">
              <CardTitle className="text-sm font-medium truncate">
                {profile.nome || profile.email || "Sem nome"}
              </CardTitle>
              {profile.nome && (
                <CardDescription className="text-xs truncate">{profile.email}</CardDescription>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {isAdmin && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-danger-soft text-danger border-danger/20">
                Admin
              </Badge>
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 gap-1">
                  <Eye className="h-2.5 w-2.5" />
                  {isAdmin ? totalModules : moduleCount}/{totalModules}
                </Badge>
              </TooltipTrigger>
              <TooltipContent>Telas visíveis</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge
                  variant="secondary"
                  className={cn(
                    "text-[10px] px-1.5 py-0 gap-1",
                    !isAdmin && empresaCount === 0 && "border-danger/50 text-danger"
                  )}
                >
                  <Store className="h-2.5 w-2.5" />
                  {isAdmin ? "Todas" : `${empresaCount}/${totalEmpresas}`}
                </Badge>
              </TooltipTrigger>
              <TooltipContent>Lojas com acesso</TooltipContent>
            </Tooltip>
          </div>
        </div>
      </CardHeader>
    </Card>
  );
}

// ─── User Edit Sheet (BaseSheet + DirtyGuard) ───────────────────────
function UserEditSheet({
  open,
  onOpenChange,
  profile,
  serverRoles,
  serverModulePerms,
  serverEmpresaPerms,
  serverPagePerms,
  empresas,
  onSave,
  onResetPassword,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  profile: ProfileRow | null;
  serverRoles: AppRole[];
  serverModulePerms: ModulePermRow[];
  serverEmpresaPerms: EmpresaPermRow[];
  serverPagePerms: PagePermRow[];
  empresas: { codEmpresa: number; nome: string }[];
  onSave: (data: { nome: string; isAdmin: boolean; modules: Record<string, string>; empresaCods: number[]; pageKeys: string[] }) => Promise<void>;
  onResetPassword: () => void;
}) {
  const { isDirty, setDirty, setClean, guardClose } = useDirtyGuard();
  const [saveStatus, setSaveStatus] = useState<"idle" | "loading" | "success">("idle");

  // Draft state
  const [draftName, setDraftName] = useState("");
  const [draftIsAdmin, setDraftIsAdmin] = useState(false);
  const [draftModules, setDraftModules] = useState<Record<string, string>>({});
  const [draftEmpresas, setDraftEmpresas] = useState<number[]>([]);
  const [draftPages, setDraftPages] = useState<Set<string>>(new Set());

  // Reset draft when profile/server data changes
  useEffect(() => {
    if (!profile) return;
    setDraftName(profile.nome || "");
    setDraftIsAdmin(serverRoles.includes("admin"));
    const map: Record<string, string> = {};
    ALL_MODULES.forEach(m => { map[m.key] = "nenhum"; });
    serverModulePerms.forEach(p => { map[p.module] = p.access_level; });
    setDraftModules(map);
    setDraftEmpresas(serverEmpresaPerms.map(p => p.cod_empresa));
    setDraftPages(new Set(serverPagePerms.map(p => p.page_key)));
    setClean();
    setSaveStatus("idle");
  }, [profile, serverRoles, serverModulePerms, serverEmpresaPerms, serverPagePerms, setClean]);

  const isAdminUser = draftIsAdmin;

  // Detect changes
  const hasChanges = useMemo(() => {
    if (!profile) return false;
    if (draftName !== (profile.nome || "")) return true;
    if (draftIsAdmin !== serverRoles.includes("admin")) return true;
    const serverModMap: Record<string, string> = {};
    ALL_MODULES.forEach(m => { serverModMap[m.key] = "nenhum"; });
    serverModulePerms.forEach(p => { serverModMap[p.module] = p.access_level; });
    if (JSON.stringify(draftModules) !== JSON.stringify(serverModMap)) return true;
    const serverEmpCods = serverEmpresaPerms.map(p => p.cod_empresa).sort((a, b) => a - b);
    const draftEmpCods = [...draftEmpresas].sort((a, b) => a - b);
    if (JSON.stringify(draftEmpCods) !== JSON.stringify(serverEmpCods)) return true;
    const serverPageKeys = serverPagePerms.map(p => p.page_key).sort();
    const draftPageKeys = [...draftPages].sort();
    if (JSON.stringify(serverPageKeys) !== JSON.stringify(draftPageKeys)) return true;
    return false;
  }, [draftName, draftIsAdmin, draftModules, draftEmpresas, draftPages, profile, serverRoles, serverModulePerms, serverEmpresaPerms, serverPagePerms]);

  // Sync dirty state
  useEffect(() => {
    if (hasChanges) setDirty();
    else setClean();
  }, [hasChanges, setDirty, setClean]);

  const handleDiscard = () => {
    if (!profile) return;
    setDraftName(profile.nome || "");
    setDraftIsAdmin(serverRoles.includes("admin"));
    const map: Record<string, string> = {};
    ALL_MODULES.forEach(m => { map[m.key] = "nenhum"; });
    serverModulePerms.forEach(p => { map[p.module] = p.access_level; });
    setDraftModules(map);
    setDraftEmpresas(serverEmpresaPerms.map(p => p.cod_empresa));
    setDraftPages(new Set(serverPagePerms.map(p => p.page_key)));
  };

  const handleSave = async () => {
    setSaveStatus("loading");
    try {
      await onSave({
        nome: draftName,
        isAdmin: draftIsAdmin,
        modules: draftModules,
        empresaCods: draftEmpresas,
        pageKeys: [...draftPages],
      });
      setSaveStatus("success");
      toast({ title: "Permissões salvas com sucesso!" });
      setTimeout(() => {
        setSaveStatus("idle");
        onOpenChange(false);
      }, 1500);
    } catch (err: any) {
      setSaveStatus("idle");
      toast({ title: "Erro ao salvar", description: err.message, variant: "destructive" });
    }
  };

  const togglePage = (pageKey: string) => {
    setDraftPages(prev => {
      const next = new Set(prev);
      if (next.has(pageKey)) next.delete(pageKey);
      else next.add(pageKey);
      return next;
    });
  };


  const handleOpenChange = (v: boolean) => {
    if (guardClose(v)) onOpenChange(v);
  };

  const setModuleLevel = (key: string, level: string) => {
    setDraftModules(prev => ({ ...prev, [key]: level }));
  };

  const toggleEmpresa = (cod: number) => {
    setDraftEmpresas(prev =>
      prev.includes(cod) ? prev.filter(c => c !== cod) : [...prev, cod]
    );
  };

  const toggleAllEmpresas = () => {
    if (draftEmpresas.length >= empresas.length) {
      setDraftEmpresas([]);
    } else {
      setDraftEmpresas(empresas.map(e => e.codEmpresa));
    }
  };

  if (!profile) return null;

  const footer = (
    <div className="flex items-center justify-between w-full">
      <div className="text-sm text-muted-foreground">
        {saveStatus === "success" ? (
          <span className="text-success flex items-center gap-1.5 font-medium">
            <Check className="h-4 w-4" /> Salvo com sucesso
          </span>
        ) : isDirty ? (
          <span className="text-warning font-medium">● Alterações não salvas</span>
        ) : null}
      </div>
      <div className="flex gap-2">
        <Button variant="ghost" size="sm" onClick={handleDiscard} disabled={!isDirty || saveStatus === "loading"} className="gap-1.5">
          <Undo2 className="h-3.5 w-3.5" />
          Descartar
        </Button>
        <Button size="sm" onClick={handleSave} disabled={!isDirty || saveStatus === "loading" || saveStatus === "success"} className="gap-1.5">
          {saveStatus === "loading" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {saveStatus === "success" && <Check className="h-3.5 w-3.5" />}
          Salvar Permissões
        </Button>
      </div>
    </div>
  );

  return (
    <BaseSheet
      open={open}
      onOpenChange={handleOpenChange}
      title={profile.nome || profile.email || "Usuário"}
      description={profile.email || undefined}
      headerExtra={
        isAdminUser ? (
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-danger-soft text-danger border-danger/20">
            Admin
          </Badge>
        ) : undefined
      }
      size="wide"
      footer={footer}
    >
      <div className="space-y-6">
        {/* Name + Reset Password */}
        <div className="flex items-end gap-3 p-3 rounded-md bg-accent/30">
          <div className="flex-1 space-y-1">
            <Label className="text-xs text-muted-foreground">Nome do usuário</Label>
            <Input
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              className="h-8 text-sm"
              placeholder="Nome do usuário"
            />
          </div>
          <Button size="sm" variant="outline" className="h-8 gap-1.5 shrink-0" onClick={onResetPassword}>
            <Lock className="h-3.5 w-3.5" />
            Redefinir Senha
          </Button>
        </div>

        <Separator />

        {/* Admin toggle */}
        <div>
          <div className="flex items-center justify-between p-3 rounded-md border">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-danger" />
              <div>
                <span className="text-sm font-medium">Administrador</span>
                <p className="text-[11px] text-muted-foreground">Acesso total ao sistema</p>
              </div>
            </div>
            <Switch checked={draftIsAdmin} onCheckedChange={setDraftIsAdmin} />
          </div>
          {isAdminUser && (
            <p className="text-[11px] text-muted-foreground mt-2 flex items-center gap-1">
              <Info className="h-3 w-3" /> Admin tem acesso total automático a todos os módulos e lojas
            </p>
          )}
        </div>

        <Separator />

        {/* Modules section */}
        <div>
          <SectionHeader icon={Eye} title="Módulos" description="Nível de acesso por módulo" />
          <div className="space-y-2">
            {ALL_MODULES.map((mod) => {
              const level = isAdminUser ? "total" : (draftModules[mod.key] || "nenhum");
              return (
                <div key={mod.key} className="p-2 rounded-md border">
                  <div className="flex items-center justify-between mb-1.5">
                    <div>
                      <span className="text-sm font-medium">{mod.label}</span>
                      <span className="text-[10px] text-muted-foreground ml-1.5">{mod.desc}</span>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    {(["nenhum", "consulta", "edita", "total"] as const).map((lvl) => (
                      <button
                        key={lvl}
                        disabled={isAdminUser}
                        onClick={() => setModuleLevel(mod.key, lvl)}
                        className={cn(
                          "px-2 py-0.5 text-[11px] rounded-md border transition-colors capitalize",
                          level === lvl
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-background text-muted-foreground border-border hover:bg-accent/50",
                          isAdminUser && "opacity-50 cursor-not-allowed"
                        )}
                      >
                        {lvl}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <Separator />

        {/* Stores section */}
        <div>
          <SectionHeader icon={Store} title="Lojas" description="De quais lojas pode ver dados" />
          <div className="space-y-1.5">
            <label className="flex items-center gap-2 p-1.5 rounded-md hover:bg-accent/50 cursor-pointer transition-colors border-b border-border pb-2 mb-1">
              <Checkbox
                checked={isAdminUser || draftEmpresas.length >= empresas.length}
                disabled={isAdminUser}
                onCheckedChange={() => toggleAllEmpresas()}
                className="h-3.5 w-3.5"
              />
              <span className="text-sm font-medium">Todas as lojas</span>
            </label>
            {empresas.map((emp) => {
              const enabled = isAdminUser || draftEmpresas.includes(emp.codEmpresa);
              return (
                <label key={emp.codEmpresa} className="flex items-center gap-2 p-1.5 rounded-md hover:bg-accent/50 cursor-pointer transition-colors">
                  <Checkbox
                    checked={enabled}
                    disabled={isAdminUser}
                    onCheckedChange={() => toggleEmpresa(emp.codEmpresa)}
                    className="h-3.5 w-3.5"
                  />
                  <span className="text-sm">{emp.nome}</span>
                </label>
              );
            })}
          </div>
          {!isAdminUser && draftEmpresas.length === 0 && (
            <p className="text-[11px] text-danger mt-2 flex items-center gap-1">
              <Info className="h-3 w-3" /> Sem lojas = sem acesso a dados
            </p>
          )}
        </div>

        <Separator />

        {/* Páginas específicas (aditivo — só relevantes quando o módulo NÃO está liberado) */}
        <div>
          <SectionHeader
            icon={FileText}
            title="Páginas específicas"
            description="Libera páginas individuais mesmo sem acesso ao módulo inteiro"
          />
          <div className="space-y-3">
            {ALL_MODULES.map((mod) => {
              const pages = PAGES_BY_MODULE[mod.key] || [];
              if (pages.length === 0) return null;
              const moduleLevel = draftModules[mod.key] || "nenhum";
              const moduleGrantsAll = isAdminUser || moduleLevel !== "nenhum";
              return (
                <div key={mod.key} className="p-2 rounded-md border">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm font-medium">{mod.label}</span>
                    {moduleGrantsAll && (
                      <span className="text-[10px] text-muted-foreground">Módulo liberado — todas as páginas incluídas</span>
                    )}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                    {pages.map((pg) => {
                      const checked = moduleGrantsAll || draftPages.has(pg.key);
                      return (
                        <label
                          key={pg.key}
                          className={cn(
                            "flex items-center gap-2 p-1.5 rounded-md hover:bg-accent/50 cursor-pointer transition-colors",
                            moduleGrantsAll && "opacity-60 cursor-not-allowed"
                          )}
                        >
                          <Checkbox
                            checked={checked}
                            disabled={moduleGrantsAll}
                            onCheckedChange={() => togglePage(pg.key)}
                            className="h-3.5 w-3.5"
                          />
                          <span className="text-sm">{pg.title}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

    </BaseSheet>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────
export default function AdminUsuariosPage() {
  const { isAdmin, isLoading: authLoading } = useAuth();
  const { empresas } = useEmpresas();
  const insightsData = useModuleInsights({ module: "admin", enabled: isAdmin });
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [userRoles, setUserRoles] = useState<RoleRow[]>([]);
  const [modulePerms, setModulePerms] = useState<ModulePermRow[]>([]);
  const [empresaPerms, setEmpresaPerms] = useState<EmpresaPermRow[]>([]);
  const [pagePerms, setPagePerms] = useState<PagePermRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [resetTarget, setResetTarget] = useState<{ id: string; name: string } | null>(null);
  const [editUserId, setEditUserId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [profilesRes, rolesRes, permsRes, empresaPermsRes, pagePermsRes] = await Promise.all([
      supabase.from("profiles").select("id, email, nome, cod_empresa"),
      supabase.from("user_roles").select("user_id, role"),
      supabase.from("user_module_permissions").select("user_id, module, access_level"),
      supabase.from("user_empresa_permissions").select("user_id, cod_empresa"),
      supabase.from("user_page_permissions" as any).select("user_id, page_key"),
    ]);
    if (profilesRes.data) setProfiles(profilesRes.data);
    if (rolesRes.data) setUserRoles(rolesRes.data as RoleRow[]);
    if (permsRes.data) setModulePerms(permsRes.data as ModulePermRow[]);
    if (empresaPermsRes.data) setEmpresaPerms(empresaPermsRes.data as EmpresaPermRow[]);
    if (pagePermsRes.data) setPagePerms(pagePermsRes.data as unknown as PagePermRow[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (isAdmin) fetchData();
  }, [isAdmin]);

  if (authLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAdmin) return <Navigate to="/" replace />;

  const handleSaveUser = async (
    userId: string,
    data: { nome: string; isAdmin: boolean; modules: Record<string, string>; empresaCods: number[]; pageKeys: string[] }
  ) => {
    const currentProfile = profiles.find(p => p.id === userId);
    const currentIsAdmin = userRoles.some(r => r.user_id === userId && r.role === "admin");
    const currentModules = modulePerms.filter(p => p.user_id === userId);
    const currentEmpresas = empresaPerms.filter(p => p.user_id === userId).map(p => p.cod_empresa);

    const promises: Promise<any>[] = [];

    // 1. Save name via edge function
    if (data.nome !== (currentProfile?.nome || "")) {
      promises.push(
        (async () => {
          const { data: d, error } = await supabase.functions.invoke("admin-manage-users", {
            body: { action: "update_profile", user_id: userId, nome: data.nome },
          });
          if (error) throw error;
          if (d?.error) throw new Error(d.error);
        })()
      );
    }

    // 2. Save admin role
    if (data.isAdmin !== currentIsAdmin) {
      if (data.isAdmin) {
        promises.push(
          (async () => {
            const { error } = await supabase.from("user_roles").insert({ user_id: userId, role: "admin" as any });
            if (error) throw error;
          })()
        );
      } else {
        promises.push(
          (async () => {
            const { error } = await supabase.from("user_roles").delete().eq("user_id", userId).eq("role", "admin");
            if (error) throw error;
          })()
        );
      }
    }

    // 3. Save modules
    for (const mod of ALL_MODULES) {
      const serverLevel = currentModules.find(p => p.module === mod.key)?.access_level ?? "nenhum";
      const draftLevel = data.modules[mod.key] ?? "nenhum";
      if (draftLevel !== serverLevel) {
        promises.push(
          (async () => {
            const { error } = await supabase
              .from("user_module_permissions")
              .upsert({ user_id: userId, module: mod.key, access_level: draftLevel } as any, { onConflict: "user_id,module" });
            if (error) throw error;
          })()
        );
      }
    }

    // 4. Save empresas
    const empresasToAdd = data.empresaCods.filter(c => !currentEmpresas.includes(c));
    const empresasToRemove = currentEmpresas.filter(c => !data.empresaCods.includes(c));
    if (empresasToAdd.length > 0) {
      promises.push(
        (async () => {
          const { error } = await supabase
            .from("user_empresa_permissions")
            .insert(empresasToAdd.map(c => ({ user_id: userId, cod_empresa: c })));
          if (error) throw error;
        })()
      );
    }
    for (const cod of empresasToRemove) {
      promises.push(
        (async () => {
          const { error } = await supabase
            .from("user_empresa_permissions")
            .delete()
            .eq("user_id", userId)
            .eq("cod_empresa", cod);
          if (error) throw error;
        })()
      );
    }

    // 5. Save page permissions (aditivo)
    const currentPages = pagePerms.filter(p => p.user_id === userId).map(p => p.page_key);
    const pagesToAdd = data.pageKeys.filter(k => !currentPages.includes(k));
    const pagesToRemove = currentPages.filter(k => !data.pageKeys.includes(k));
    if (pagesToAdd.length > 0) {
      promises.push(
        (async () => {
          const { error } = await supabase
            .from("user_page_permissions" as any)
            .insert(pagesToAdd.map(k => ({ user_id: userId, page_key: k })) as any);
          if (error) throw error;
        })()
      );
    }
    if (pagesToRemove.length > 0) {
      promises.push(
        (async () => {
          const { error } = await supabase
            .from("user_page_permissions" as any)
            .delete()
            .eq("user_id", userId)
            .in("page_key", pagesToRemove);
          if (error) throw error;
        })()
      );
    }

    await Promise.all(promises);
    await fetchData();
  };

  const editProfile = editUserId ? profiles.find(p => p.id === editUserId) || null : null;
  const editRoles = editUserId ? userRoles.filter(r => r.user_id === editUserId).map(r => r.role) : [];
  const editModPerms = editUserId ? modulePerms.filter(mp => mp.user_id === editUserId) : [];
  const editEmpPerms = editUserId ? empresaPerms.filter(ep => ep.user_id === editUserId) : [];
  const editPagePerms = editUserId ? pagePerms.filter(pp => pp.user_id === editUserId) : [];

  return (
    <TooltipProvider>
      <div className="space-y-6 max-w-5xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            <div>
              <h1 className="text-2xl font-bold">Gestão de Usuários</h1>
              <p className="text-sm text-muted-foreground">Crie, edite e configure permissões de cada usuário</p>
            </div>
          </div>
          <Button onClick={() => setCreateOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            Novo Usuário
          </Button>
        </div>


        {/* IA Insights */}
        <ModuleInsightsPanel
          insights={insightsData.insights}
          loading={insightsData.loading}
          error={insightsData.error}
          onRetry={insightsData.refetch}
        />

        {/* Legend */}
        <Card className="border-dashed">
          <CardContent className="pt-4 pb-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div className="flex items-start gap-2">
                <Eye className="h-3.5 w-3.5 mt-0.5 text-muted-foreground shrink-0" />
                <div>
                  <span className="font-semibold">Módulos</span>
                  <p className="text-muted-foreground">Define quais módulos o usuário pode <strong>ver e o que pode fazer</strong> (nenhum, consulta, edita, total)</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Store className="h-3.5 w-3.5 mt-0.5 text-muted-foreground shrink-0" />
                <div>
                  <span className="font-semibold">Lojas</span>
                  <p className="text-muted-foreground">De quais lojas o usuário pode <strong>ver os dados</strong></p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {loading ? (
          <div className="flex justify-center p-8">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : (
          <div className="space-y-3">
            {profiles.map((p) => {
              const isUserAdmin = userRoles.some(r => r.user_id === p.id && r.role === "admin");
              const userModPerms = modulePerms.filter(mp => mp.user_id === p.id);
              const userEmpPerms = empresaPerms.filter(ep => ep.user_id === p.id);
              const moduleCount = isUserAdmin
                ? ALL_MODULES.length
                : userModPerms.filter(mp => mp.access_level !== "nenhum").length;

              return (
                <UserRow
                  key={p.id}
                  profile={p}
                  isAdmin={isUserAdmin}
                  moduleCount={moduleCount}
                  empresaCount={userEmpPerms.length}
                  totalModules={ALL_MODULES.length}
                  totalEmpresas={empresas.length}
                  onClick={() => setEditUserId(p.id)}
                />
              );
            })}
          </div>
        )}
      </div>

      <CreateUserDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={fetchData} />

      {resetTarget && (
        <ResetPasswordDialog
          open={!!resetTarget}
          onOpenChange={(v) => !v && setResetTarget(null)}
          userId={resetTarget.id}
          userName={resetTarget.name}
        />
      )}

      <UserEditSheet
        open={!!editUserId}
        onOpenChange={(v) => !v && setEditUserId(null)}
        profile={editProfile}
        serverRoles={editRoles}
        serverModulePerms={editModPerms}
        serverEmpresaPerms={editEmpPerms}
        empresas={empresas}
        onSave={(data) => handleSaveUser(editUserId!, data)}
        onResetPassword={() => {
          const p = profiles.find(pr => pr.id === editUserId);
          setResetTarget({ id: editUserId!, name: p?.nome || p?.email || "Usuário" });
        }}
      />
    </TooltipProvider>
  );
}
