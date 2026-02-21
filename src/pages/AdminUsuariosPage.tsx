import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "@/hooks/use-toast";
import { Loader2, Shield } from "lucide-react";
import { Navigate } from "react-router-dom";
import { useEmpresas } from "@/hooks/useEmpresas";
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

const ALL_MODULES: { key: ModuleKey; label: string }[] = [
  { key: "vendas", label: "Vendas" },
  { key: "estoque", label: "Estoque" },
  { key: "monitor", label: "Monitor" },
  { key: "financeiro", label: "Financeiro" },
  { key: "ia", label: "Central IA" },
  { key: "config", label: "Config" },
];

export default function AdminUsuariosPage() {
  const { isAdmin, isLoading: authLoading } = useAuth();
  const { empresas } = useEmpresas();
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [userRoles, setUserRoles] = useState<RoleRow[]>([]);
  const [modulePerms, setModulePerms] = useState<ModulePermRow[]>([]);
  const [empresaPerms, setEmpresaPerms] = useState<EmpresaPermRow[]>([]);
  const [loading, setLoading] = useState(true);

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
      // Remove permission
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
      // Add permission
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
      // Remove all
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
      // Add all missing
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
        toast({ title: `Role '${role}' removida` });
        fetchData();
      }
    } else {
      const { error } = await supabase
        .from("user_roles")
        .insert({ user_id: userId, role });
      if (error) {
        toast({ title: "Erro", description: error.message, variant: "destructive" });
      } else {
        toast({ title: `Role '${role}' adicionada` });
        fetchData();
      }
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Shield className="h-5 w-5 text-primary" />
        <h1 className="text-2xl font-bold">Gestão de Usuários</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Usuários</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {loading ? (
            <div className="flex justify-center p-4">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>E-mail</TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead>Roles</TableHead>
                  <TableHead>Módulos</TableHead>
                  <TableHead>Lojas Permitidas</TableHead>
                  <TableHead>Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {profiles.map((p) => {
                  const currentRoles = getRolesForUser(p.id);
                  const isAdminUser = currentRoles.includes("admin");
                  const userEmpresaCount = empresaPerms.filter(ep => ep.user_id === p.id).length;
                  const allEmpresasEnabled = userEmpresaCount >= empresas.length;

                  return (
                    <TableRow key={p.id}>
                      <TableCell className="text-sm">{p.email}</TableCell>
                      <TableCell className="text-sm">{p.nome || "—"}</TableCell>
                      <TableCell>
                        <div className="flex gap-1 flex-wrap">
                          {currentRoles.map((r) => (
                            <span key={r} className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                              {r}
                            </span>
                          ))}
                          {currentRoles.length === 0 && <span className="text-xs text-muted-foreground">nenhuma</span>}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2 flex-wrap">
                          {ALL_MODULES.map((mod) => {
                            const enabled = isAdminUser || getModuleEnabled(p.id, mod.key);
                            return (
                              <label key={mod.key} className="flex items-center gap-1 text-xs cursor-pointer">
                                <Checkbox
                                  checked={enabled}
                                  disabled={isAdminUser}
                                  onCheckedChange={() => handleModuleToggle(p.id, mod.key, getModuleEnabled(p.id, mod.key))}
                                  className="h-3.5 w-3.5"
                                />
                                {mod.label}
                              </label>
                            );
                          })}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          {/* Toggle all */}
                          <label className="flex items-center gap-1 text-xs cursor-pointer font-medium border-b pb-1 mb-1 border-border">
                            <Checkbox
                              checked={isAdminUser || allEmpresasEnabled}
                              disabled={isAdminUser}
                              onCheckedChange={() => handleToggleAllEmpresas(p.id)}
                              className="h-3.5 w-3.5"
                            />
                            Todas
                          </label>
                          <div className="flex gap-x-3 gap-y-1 flex-wrap max-w-md">
                            {empresas.map((emp) => {
                              const enabled = isAdminUser || getEmpresaEnabled(p.id, emp.codEmpresa);
                              return (
                                <label key={emp.codEmpresa} className="flex items-center gap-1 text-xs cursor-pointer whitespace-nowrap">
                                  <Checkbox
                                    checked={enabled}
                                    disabled={isAdminUser}
                                    onCheckedChange={() => handleEmpresaToggle(p.id, emp.codEmpresa)}
                                    className="h-3.5 w-3.5"
                                  />
                                  {emp.nome}
                                </label>
                              );
                            })}
                          </div>
                          {!isAdminUser && userEmpresaCount === 0 && (
                            <span className="text-xs text-destructive">Nenhuma loja</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Select onValueChange={(role) => handleRoleToggle(p.id, role as AppRole)}>
                          <SelectTrigger className="w-32 h-8 text-sm">
                            <SelectValue placeholder="+ Role" />
                          </SelectTrigger>
                          <SelectContent>
                            {(["admin", "gestor", "vendedor"] as AppRole[]).map((r) => (
                              <SelectItem key={r} value={r}>
                                {currentRoles.includes(r) ? `✕ ${r}` : `+ ${r}`}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
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
