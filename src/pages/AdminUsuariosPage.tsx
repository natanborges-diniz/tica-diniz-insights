import { useEffect, useState, useCallback, useMemo } from "react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { Loader2, Shield, Users, Eye, Store, KeyRound, Info, Plus, Save, X, ChevronDown, ChevronRight, Lock, Undo2 } from "lucide-react";
import { Navigate } from "react-router-dom";
import { useEmpresas } from "@/hooks/useEmpresas";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import type { ModuleKey } from "@/components/layout/AppLayout";

type AppRole = "admin" | "gestor" | "vendedor";

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
];

const ROLE_INFO: Record<AppRole, { label: string; desc: string; color: string }> = {
  admin: {
    label: "Administrador",
    desc: "Acesso total ao sistema, gestão de usuários e configurações",
    color: "bg-destructive/10 text-destructive border-destructive/20",
  },
  gestor: {
    label: "Gestor",
    desc: "Pode editar metas, configurações e visualizar relatórios",
    color: "bg-primary/10 text-primary border-primary/20",
  },
  vendedor: {
    label: "Vendedor",
    desc: "Visualização de dados da sua loja",
    color: "bg-muted text-muted-foreground border-border",
  },
};

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

// ─── Create User Dialog ─────────────────────────────────────────────
function CreateUserDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (v: boolean) => void; onCreated: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nome, setNome] = useState("");
  const [saving, setSaving] = useState(false);

  const handleCreate = async () => {
    if (!email || !password) {
      toast({ title: "Preencha email e senha", variant: "destructive" });
      return;
    }
    if (password.length < 6) {
      toast({ title: "Senha deve ter no mínimo 6 caracteres", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-manage-users", {
        body: { action: "create", email, password, nome },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast({ title: "Usuário criado com sucesso!" });
      setEmail("");
      setPassword("");
      setNome("");
      onOpenChange(false);
      onCreated();
    } catch (err: any) {
      toast({ title: "Erro ao criar usuário", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            Novo Usuário
          </DialogTitle>
          <DialogDescription>
            Crie um novo usuário. Após criar, configure as permissões na lista.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="nome">Nome</Label>
            <Input id="nome" placeholder="Nome do usuário" value={nome} onChange={(e) => setNome(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email *</Label>
            <Input id="email" type="email" placeholder="usuario@empresa.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Senha *</Label>
            <Input id="password" type="password" placeholder="Mínimo 6 caracteres" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleCreate} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Criar Usuário
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Reset Password Dialog ──────────────────────────────────────────
function ResetPasswordDialog({ open, onOpenChange, userId, userName }: { open: boolean; onOpenChange: (v: boolean) => void; userId: string; userName: string }) {
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);

  const handleReset = async () => {
    if (password.length < 6) {
      toast({ title: "Senha deve ter no mínimo 6 caracteres", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-manage-users", {
        body: { action: "reset_password", user_id: userId, password },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast({ title: "Senha alterada com sucesso!" });
      setPassword("");
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: "Erro ao alterar senha", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock className="h-5 w-5" />
            Redefinir Senha
          </DialogTitle>
          <DialogDescription>
            Nova senha para <strong>{userName}</strong>
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 py-2">
          <Label htmlFor="new-password">Nova Senha</Label>
          <Input id="new-password" type="password" placeholder="Mínimo 6 caracteres" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleReset} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Salvar Senha
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── User Card with Draft State ─────────────────────────────────────
function UserCard({
  profile, serverRoles, serverModulePerms, serverEmpresaPerms, empresas,
  onSave, onResetPassword,
}: {
  profile: ProfileRow;
  serverRoles: AppRole[];
  serverModulePerms: ModulePermRow[];
  serverEmpresaPerms: EmpresaPermRow[];
  empresas: { codEmpresa: number; nome: string }[];
  onSave: (data: {
    nome: string;
    roles: AppRole[];
    modules: Record<string, string>;
    empresaCods: number[];
  }) => Promise<void>;
  onResetPassword: () => void;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [saving, setSaving] = useState(false);

  // Draft state
  const [draftName, setDraftName] = useState(profile.nome || "");
  const [draftRoles, setDraftRoles] = useState<AppRole[]>(serverRoles);
  const [draftModules, setDraftModules] = useState<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    ALL_MODULES.forEach(m => { map[m.key] = "nenhum"; });
    serverModulePerms.forEach(p => { map[p.module] = p.access_level; });
    return map;
  });
  const [draftEmpresas, setDraftEmpresas] = useState<number[]>(
    serverEmpresaPerms.map(p => p.cod_empresa)
  );

  // Reset draft when server data changes
  useEffect(() => {
    setDraftName(profile.nome || "");
    setDraftRoles(serverRoles);
    const map: Record<string, string> = {};
    ALL_MODULES.forEach(m => { map[m.key] = "nenhum"; });
    serverModulePerms.forEach(p => { map[p.module] = p.access_level; });
    setDraftModules(map);
    setDraftEmpresas(serverEmpresaPerms.map(p => p.cod_empresa));
  }, [profile, serverRoles, serverModulePerms, serverEmpresaPerms]);

  const isAdminUser = draftRoles.includes("admin");

  // Detect changes
  const hasChanges = useMemo(() => {
    if (draftName !== (profile.nome || "")) return true;
    if (JSON.stringify([...draftRoles].sort()) !== JSON.stringify([...serverRoles].sort())) return true;
    const serverModMap: Record<string, string> = {};
    ALL_MODULES.forEach(m => { serverModMap[m.key] = "nenhum"; });
    serverModulePerms.forEach(p => { serverModMap[p.module] = p.access_level; });
    if (JSON.stringify(draftModules) !== JSON.stringify(serverModMap)) return true;
    const serverEmpCods = serverEmpresaPerms.map(p => p.cod_empresa).sort((a, b) => a - b);
    const draftEmpCods = [...draftEmpresas].sort((a, b) => a - b);
    if (JSON.stringify(draftEmpCods) !== JSON.stringify(serverEmpCods)) return true;
    return false;
  }, [draftName, draftRoles, draftModules, draftEmpresas, profile, serverRoles, serverModulePerms, serverEmpresaPerms]);

  const handleDiscard = () => {
    setDraftName(profile.nome || "");
    setDraftRoles(serverRoles);
    const map: Record<string, string> = {};
    ALL_MODULES.forEach(m => { map[m.key] = "nenhum"; });
    serverModulePerms.forEach(p => { map[p.module] = p.access_level; });
    setDraftModules(map);
    setDraftEmpresas(serverEmpresaPerms.map(p => p.cod_empresa));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave({
        nome: draftName,
        roles: draftRoles,
        modules: draftModules,
        empresaCods: draftEmpresas,
      });
      toast({ title: "Permissões salvas com sucesso!" });
    } catch (err: any) {
      toast({ title: "Erro ao salvar", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const toggleRole = (role: AppRole) => {
    setDraftRoles(prev =>
      prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role]
    );
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

  const moduleCount = isAdminUser
    ? ALL_MODULES.length
    : Object.values(draftModules).filter(v => v !== "nenhum").length;
  const empresaCount = draftEmpresas.length;

  return (
    <Card className={isExpanded ? "ring-1 ring-primary/30" : hasChanges ? "ring-1 ring-amber-400/50" : ""}>
      <CardHeader
        className="cursor-pointer hover:bg-accent/30 transition-colors py-4"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
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
            {hasChanges && !isExpanded && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-400 text-amber-600 bg-amber-50 shrink-0">
                Não salvo
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {draftRoles.map((r) => (
              <Badge key={r} variant="outline" className={`text-[10px] px-1.5 py-0 ${ROLE_INFO[r].color}`}>
                {ROLE_INFO[r].label}
              </Badge>
            ))}
            {draftRoles.length === 0 && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-muted-foreground">
                Sem acesso
              </Badge>
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 gap-1">
                  <Eye className="h-2.5 w-2.5" />
                  {moduleCount}/{ALL_MODULES.length}
                </Badge>
              </TooltipTrigger>
              <TooltipContent>Telas visíveis</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge
                  variant="secondary"
                  className={`text-[10px] px-1.5 py-0 gap-1 ${!isAdminUser && empresaCount === 0 ? "border-destructive/50 text-destructive" : ""}`}
                >
                  <Store className="h-2.5 w-2.5" />
                  {isAdminUser ? "Todas" : `${empresaCount}/${empresas.length}`}
                </Badge>
              </TooltipTrigger>
              <TooltipContent>Lojas com acesso</TooltipContent>
            </Tooltip>
          </div>
        </div>
      </CardHeader>

      {isExpanded && (
        <CardContent className="pt-0 pb-5">
          <Separator className="mb-4" />

          {/* Editable Name + Actions */}
          <div className="flex items-center gap-2 mb-4 p-3 rounded-md bg-accent/30">
            <div className="flex-1 space-y-1">
              <Label className="text-xs text-muted-foreground">Nome do usuário</Label>
              <Input
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                className="h-8 text-sm"
                placeholder="Nome do usuário"
              />
            </div>
            <Button size="sm" variant="outline" className="h-8 gap-1.5 shrink-0" onClick={(e) => { e.stopPropagation(); onResetPassword(); }}>
              <Lock className="h-3.5 w-3.5" />
              Redefinir Senha
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Column 1: Nível de Acesso */}
            <div>
              <SectionHeader icon={KeyRound} title="Nível de Acesso" description="O que o usuário pode fazer" />
              <div className="space-y-2">
                {(["admin", "gestor", "vendedor"] as AppRole[]).map((role) => {
                  const info = ROLE_INFO[role];
                  const hasRole = draftRoles.includes(role);
                  return (
                    <label key={role} className="flex items-start gap-2 p-2 rounded-md border cursor-pointer hover:bg-accent/50 transition-colors">
                      <Checkbox checked={hasRole} onCheckedChange={() => toggleRole(role)} className="mt-0.5" />
                      <div>
                        <span className="text-sm font-medium">{info.label}</span>
                        <p className="text-[11px] text-muted-foreground leading-tight">{info.desc}</p>
                      </div>
                    </label>
                  );
                })}
              </div>
              {isAdminUser && (
                <p className="text-[11px] text-muted-foreground mt-2 flex items-center gap-1">
                  <Info className="h-3 w-3" /> Admin tem acesso total automático
                </p>
              )}
            </div>

            {/* Column 2: Telas Visíveis */}
            <div>
              <SectionHeader icon={Eye} title="Telas Visíveis" description="Nível de acesso por módulo" />
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

            {/* Column 3: Lojas */}
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
                <p className="text-[11px] text-destructive mt-2 flex items-center gap-1">
                  <Info className="h-3 w-3" /> Sem lojas = sem acesso a dados
                </p>
              )}
            </div>
          </div>

          {/* Save / Discard bar */}
          <Separator className="mt-5 mb-4" />
          <div className="flex items-center justify-between">
            <div className="text-xs text-muted-foreground">
              {hasChanges ? (
                <span className="text-amber-600 font-medium">● Alterações não salvas</span>
              ) : (
                <span className="text-green-600">✓ Tudo salvo</span>
              )}
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={handleDiscard} disabled={!hasChanges || saving} className="gap-1.5">
                <Undo2 className="h-3.5 w-3.5" />
                Descartar
              </Button>
              <Button size="sm" onClick={handleSave} disabled={!hasChanges || saving} className="gap-1.5">
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                Salvar Permissões
              </Button>
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────
export default function AdminUsuariosPage() {
  const { isAdmin, isLoading: authLoading } = useAuth();
  const { empresas } = useEmpresas();
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [userRoles, setUserRoles] = useState<RoleRow[]>([]);
  const [modulePerms, setModulePerms] = useState<ModulePermRow[]>([]);
  const [empresaPerms, setEmpresaPerms] = useState<EmpresaPermRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [resetTarget, setResetTarget] = useState<{ id: string; name: string } | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [profilesRes, rolesRes, permsRes, empresaPermsRes] = await Promise.all([
      supabase.from("profiles").select("id, email, nome, cod_empresa"),
      supabase.from("user_roles").select("user_id, role"),
      supabase.from("user_module_permissions").select("user_id, module, access_level"),
      supabase.from("user_empresa_permissions").select("user_id, cod_empresa"),
    ]);
    if (profilesRes.data) setProfiles(profilesRes.data);
    if (rolesRes.data) setUserRoles(rolesRes.data as RoleRow[]);
    if (permsRes.data) setModulePerms(permsRes.data as ModulePermRow[]);
    if (empresaPermsRes.data) setEmpresaPerms(empresaPermsRes.data as EmpresaPermRow[]);
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
    data: { nome: string; roles: AppRole[]; modules: Record<string, string>; empresaCods: number[] }
  ) => {
    const currentProfile = profiles.find(p => p.id === userId);
    const currentRoles = userRoles.filter(r => r.user_id === userId).map(r => r.role);
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

    // 2. Save roles (add missing, remove extra)
    const rolesToAdd = data.roles.filter(r => !currentRoles.includes(r));
    const rolesToRemove = currentRoles.filter(r => !data.roles.includes(r));
    for (const role of rolesToAdd) {
      promises.push(
        (async () => {
          const { error } = await supabase.from("user_roles").insert({ user_id: userId, role });
          if (error) throw error;
        })()
      );
    }
    for (const role of rolesToRemove) {
      promises.push(
        (async () => {
          const { error } = await supabase.from("user_roles").delete().eq("user_id", userId).eq("role", role);
          if (error) throw error;
        })()
      );
    }

    // 3. Save modules (access_level)
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

    // 4. Save empresas (add missing, remove extra)
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

    await Promise.all(promises);
    await fetchData();
  };

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

        {/* Legend */}
        <Card className="border-dashed">
          <CardContent className="pt-4 pb-3">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
              <div className="flex items-start gap-2">
                <KeyRound className="h-3.5 w-3.5 mt-0.5 text-muted-foreground shrink-0" />
                <div>
                  <span className="font-semibold">Nível de Acesso</span>
                  <p className="text-muted-foreground">Define o que o usuário pode <strong>fazer</strong> (editar metas, gerenciar usuários, etc)</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Eye className="h-3.5 w-3.5 mt-0.5 text-muted-foreground shrink-0" />
                <div>
                  <span className="font-semibold">Telas Visíveis</span>
                  <p className="text-muted-foreground">Quais módulos <strong>aparecem</strong> no menu do usuário</p>
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
              const currentRoles = userRoles.filter(r => r.user_id === p.id).map(r => r.role);
              const userModPerms = modulePerms.filter(mp => mp.user_id === p.id);
              const userEmpPerms = empresaPerms.filter(ep => ep.user_id === p.id);
              return (
                <UserCard
                  key={p.id}
                  profile={p}
                  serverRoles={currentRoles}
                  serverModulePerms={userModPerms}
                  serverEmpresaPerms={userEmpPerms}
                  empresas={empresas}
                  onSave={(data) => handleSaveUser(p.id, data)}
                  onResetPassword={() => setResetTarget({ id: p.id, name: p.nome || p.email || "Usuário" })}
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
    </TooltipProvider>
  );
}
