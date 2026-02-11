import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/hooks/use-toast";
import { Loader2, Shield } from "lucide-react";
import { Navigate } from "react-router-dom";

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

export default function AdminUsuariosPage() {
  const { isAdmin, isLoading: authLoading } = useAuth();
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [userRoles, setUserRoles] = useState<RoleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingEmpresa, setEditingEmpresa] = useState<Record<string, string>>({});

  const fetchData = async () => {
    setLoading(true);
    const [profilesRes, rolesRes] = await Promise.all([
      supabase.from("profiles").select("id, email, nome, cod_empresa"),
      supabase.from("user_roles").select("user_id, role"),
    ]);
    if (profilesRes.data) setProfiles(profilesRes.data);
    if (rolesRes.data) setUserRoles(rolesRes.data as RoleRow[]);
    setLoading(false);
  };

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

  const handleEmpresaChange = async (userId: string) => {
    const val = parseInt(editingEmpresa[userId] || "", 10);
    if (isNaN(val)) return;
    const { error } = await supabase
      .from("profiles")
      .update({ cod_empresa: val })
      .eq("id", userId);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Empresa atualizada" });
      fetchData();
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
        <CardContent>
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
                  <TableHead>Empresa</TableHead>
                  <TableHead>Roles</TableHead>
                  <TableHead>Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {profiles.map((p) => {
                  const currentRoles = getRolesForUser(p.id);
                  return (
                    <TableRow key={p.id}>
                      <TableCell className="text-sm">{p.email}</TableCell>
                      <TableCell className="text-sm">{p.nome || "—"}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Input
                            type="number"
                            className="w-20 h-8 text-sm"
                            defaultValue={p.cod_empresa}
                            onChange={(e) =>
                              setEditingEmpresa((prev) => ({ ...prev, [p.id]: e.target.value }))
                            }
                          />
                          <Button size="sm" variant="outline" className="h-8" onClick={() => handleEmpresaChange(p.id)}>
                            OK
                          </Button>
                        </div>
                      </TableCell>
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
