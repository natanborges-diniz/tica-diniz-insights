import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { Loader2, Shield, Users, Eye, Store, KeyRound, Info } from "lucide-react";
import { Navigate } from "react-router-dom";
import { useEmpresas } from "@/hooks/useEmpresas";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Separator } from "@/components/ui/separator";
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
  enabled: boolean;
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

export default function AdminUsuariosPage() {
  const { isAdmin, isLoading: authLoading } = useAuth();
  const { empresas } = useEmpresas();
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [userRoles, setUserRoles] = useState<RoleRow[]>([]);
  const [modulePerms, setModulePerms] = useState<ModulePermRow[]>([]);
  const [empresaPerms, setEmpresaPerms] = useState<EmpresaPermRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedUser, setExpandedUser] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [profilesRes, rolesRes, permsRes, empresaPermsRes] = await Promise.all([
      supabase.from("profiles").select("id, email, nome, cod_empresa"),
      supabase.from("user_roles").select("user_id, role"),
      supabase.from("user_module_permissions").select("user_id, module, enabled"),
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

  const getRolesForUser = (userId: string) =>
    userRoles.filter((r) => r.user_id === userId).map((r) => r.role);

  const getModuleEnabled = (userId: string, module: string) => {
    const perm = modulePerms.find(p => p.user_id === userId && p.module === module);
    return perm?.enabled ?? false;
  };

  const getEmpresaEnabled = (userId: string, codEmpresa: number) => {
    return empresaPerms.some(p => p.user_id === userId && p.cod_empresa === codEmpresa);
  };

  const handleModuleToggle = async (userId: string, module: string, currentlyEnabled: boolean) => {
    const newEnabled = !currentlyEnabled;
    const { error } = await supabase
      .from("user_module_permissions")
      .upsert(
        { user_id: userId, module, enabled: newEnabled },
        { onConflict: "user_id,module" }
      );
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      setModulePerms(prev => {
        const idx = prev.findIndex(p => p.user_id === userId && p.module === module);
        if (idx >= 0) {
          const copy = [...prev];
          copy[idx] = { ...copy[idx], enabled: newEnabled };
          return copy;
        }
        return [...prev, { user_id: userId, module, enabled: newEnabled }];
      });
    }
  };

  const handleEmpresaToggle = async (userId: string, codEmpresa: number) => {
    const isEnabled = getEmpresaEnabled(userId, codEmpresa);
    if (isEnabled) {
      const { error } = await supabase
        .from("user_empresa_permissions")
        .delete()
        .eq("user_id", userId)
        .eq("cod_empresa", codEmpresa);
      if (error) {
        toast({ title: "Erro", description: error.message, variant: "destructive" });
      } else {
        setEmpresaPerms(prev => prev.filter(p => !(p.user_id === userId && p.cod_empresa === codEmpresa)));
      }
    } else {
      const { error } = await supabase
        .from("user_empresa_permissions")
        .insert({ user_id: userId, cod_empresa: codEmpresa });
      if (error) {
        toast({ title: "Erro", description: error.message, variant: "destructive" });
      } else {
        setEmpresaPerms(prev => [...prev, { user_id: userId, cod_empresa: codEmpresa }]);
      }
    }
  };

  const handleToggleAllEmpresas = async (userId: string) => {
    const userEmpresas = empresaPerms.filter(p => p.user_id === userId);
    const allEnabled = userEmpresas.length >= empresas.length;
    if (allEnabled) {
      const { error } = await supabase
        .from("user_empresa_permissions")
        .delete()
        .eq("user_id", userId);
      if (error) {
        toast({ title: "Erro", description: error.message, variant: "destructive" });
      } else {
        setEmpresaPerms(prev => prev.filter(p => p.user_id !== userId));
      }
    } else {
      const existing = new Set(userEmpresas.map(p => p.cod_empresa));
      const toInsert = empresas
        .filter(e => !existing.has(e.codEmpresa))
        .map(e => ({ user_id: userId, cod_empresa: e.codEmpresa }));
      if (toInsert.length > 0) {
        const { error } = await supabase
          .from("user_empresa_permissions")
          .insert(toInsert);
        if (error) {
          toast({ title: "Erro", description: error.message, variant: "destructive" });
        } else {
          setEmpresaPerms(prev => [...prev, ...toInsert]);
        }
      }
    }
  };

  const handleRoleToggle = async (userId: string, role: AppRole) => {
    const hasRole = getRolesForUser(userId).includes(role);
    if (hasRole) {
      const { error } = await supabase
        .from("user_roles")
        .delete()
        .eq("user_id", userId)
        .eq("role", role);
      if (error) {
        toast({ title: "Erro", description: error.message, variant: "destructive" });
      } else {
        fetchData();
      }
    } else {
      const { error } = await supabase
        .from("user_roles")
        .insert({ user_id: userId, role });
      if (error) {
        toast({ title: "Erro", description: error.message, variant: "destructive" });
      } else {
        fetchData();
      }
    }
  };

  return (
    <TooltipProvider>
      <div className="space-y-6 max-w-5xl">
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Gestão de Usuários</h1>
            <p className="text-sm text-muted-foreground">Configure o nível de acesso, telas visíveis e lojas de cada usuário</p>
          </div>
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
              const currentRoles = getRolesForUser(p.id);
              const isAdminUser = currentRoles.includes("admin");
              const isExpanded = expandedUser === p.id;
              const userEmpresaCount = empresaPerms.filter(ep => ep.user_id === p.id).length;
              const moduleCount = isAdminUser
                ? ALL_MODULES.length
                : modulePerms.filter(mp => mp.user_id === p.id && mp.enabled).length;

              return (
                <Card key={p.id} className={isExpanded ? "ring-1 ring-primary/30" : ""}>
                  {/* User Header — always visible */}
                  <CardHeader
                    className="cursor-pointer hover:bg-accent/30 transition-colors py-4"
                    onClick={() => setExpandedUser(isExpanded ? null : p.id)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                          <Users className="h-4 w-4 text-primary" />
                        </div>
                        <div className="min-w-0">
                          <CardTitle className="text-sm font-medium truncate">
                            {p.nome || p.email || "Sem nome"}
                          </CardTitle>
                          {p.nome && (
                            <CardDescription className="text-xs truncate">{p.email}</CardDescription>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {/* Role badges */}
                        {currentRoles.map((r) => (
                          <Badge key={r} variant="outline" className={`text-[10px] px-1.5 py-0 ${ROLE_INFO[r].color}`}>
                            {ROLE_INFO[r].label}
                          </Badge>
                        ))}
                        {currentRoles.length === 0 && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-muted-foreground">
                            Sem acesso
                          </Badge>
                        )}

                        {/* Summary badges */}
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
                              className={`text-[10px] px-1.5 py-0 gap-1 ${!isAdminUser && userEmpresaCount === 0 ? "border-destructive/50 text-destructive" : ""}`}
                            >
                              <Store className="h-2.5 w-2.5" />
                              {isAdminUser ? "Todas" : `${userEmpresaCount}/${empresas.length}`}
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent>Lojas com acesso</TooltipContent>
                        </Tooltip>
                      </div>
                    </div>
                  </CardHeader>

                  {/* Expanded content */}
                  {isExpanded && (
                    <CardContent className="pt-0 pb-5">
                      <Separator className="mb-4" />
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

                        {/* Column 1: Nível de Acesso */}
                        <div>
                          <SectionHeader
                            icon={KeyRound}
                            title="Nível de Acesso"
                            description="O que o usuário pode fazer"
                          />
                          <div className="space-y-2">
                            {(["admin", "gestor", "vendedor"] as AppRole[]).map((role) => {
                              const info = ROLE_INFO[role];
                              const hasRole = currentRoles.includes(role);
                              return (
                                <label
                                  key={role}
                                  className="flex items-start gap-2 p-2 rounded-md border cursor-pointer hover:bg-accent/50 transition-colors"
                                >
                                  <Checkbox
                                    checked={hasRole}
                                    onCheckedChange={() => handleRoleToggle(p.id, role)}
                                    className="mt-0.5"
                                  />
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
                              <Info className="h-3 w-3" />
                              Admin tem acesso total automático
                            </p>
                          )}
                        </div>

                        {/* Column 2: Telas Visíveis */}
                        <div>
                          <SectionHeader
                            icon={Eye}
                            title="Telas Visíveis"
                            description="Quais módulos aparecem no menu"
                          />
                          <div className="space-y-1.5">
                            {ALL_MODULES.map((mod) => {
                              const enabled = isAdminUser || getModuleEnabled(p.id, mod.key);
                              return (
                                <label
                                  key={mod.key}
                                  className="flex items-center gap-2 p-1.5 rounded-md hover:bg-accent/50 cursor-pointer transition-colors"
                                >
                                  <Checkbox
                                    checked={enabled}
                                    disabled={isAdminUser}
                                    onCheckedChange={() => handleModuleToggle(p.id, mod.key, getModuleEnabled(p.id, mod.key))}
                                    className="h-3.5 w-3.5"
                                  />
                                  <div>
                                    <span className="text-sm">{mod.label}</span>
                                    <span className="text-[10px] text-muted-foreground ml-1.5">{mod.desc}</span>
                                  </div>
                                </label>
                              );
                            })}
                          </div>
                        </div>

                        {/* Column 3: Lojas */}
                        <div>
                          <SectionHeader
                            icon={Store}
                            title="Lojas"
                            description="De quais lojas pode ver dados"
                          />
                          <div className="space-y-1.5">
                            {/* Toggle all */}
                            <label className="flex items-center gap-2 p-1.5 rounded-md hover:bg-accent/50 cursor-pointer transition-colors border-b border-border pb-2 mb-1">
                              <Checkbox
                                checked={isAdminUser || userEmpresaCount >= empresas.length}
                                disabled={isAdminUser}
                                onCheckedChange={() => handleToggleAllEmpresas(p.id)}
                                className="h-3.5 w-3.5"
                              />
                              <span className="text-sm font-medium">Todas as lojas</span>
                            </label>
                            {empresas.map((emp) => {
                              const enabled = isAdminUser || getEmpresaEnabled(p.id, emp.codEmpresa);
                              return (
                                <label
                                  key={emp.codEmpresa}
                                  className="flex items-center gap-2 p-1.5 rounded-md hover:bg-accent/50 cursor-pointer transition-colors"
                                >
                                  <Checkbox
                                    checked={enabled}
                                    disabled={isAdminUser}
                                    onCheckedChange={() => handleEmpresaToggle(p.id, emp.codEmpresa)}
                                    className="h-3.5 w-3.5"
                                  />
                                  <span className="text-sm">{emp.nome}</span>
                                </label>
                              );
                            })}
                          </div>
                          {!isAdminUser && userEmpresaCount === 0 && (
                            <p className="text-[11px] text-destructive mt-2 flex items-center gap-1">
                              <Info className="h-3 w-3" />
                              Sem lojas = sem acesso a dados
                            </p>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
