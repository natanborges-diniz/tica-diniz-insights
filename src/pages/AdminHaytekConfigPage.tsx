import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "@/hooks/use-toast";
import { Loader2, Box, Save, RefreshCw, Info } from "lucide-react";
import { Navigate } from "react-router-dom";

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

interface EditingRow {
  cnpj: string;
  store_id: string;
  address_id: string;
  alias: string;
}

export default function AdminHaytekConfigPage() {
  const { isAdmin, isLoading: authLoading } = useAuth();
  const [configs, setConfigs] = useState<HaytekEmpresaConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [editing, setEditing] = useState<Record<string, EditingRow>>({});

  const fetchData = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("haytek_empresa_config" as never)
      .select("*")
      .order("cod_empresa");

    if (error) {
      toast({ title: "Erro ao carregar configurações", description: error.message, variant: "destructive" });
    } else if (data) {
      const rows = data as HaytekEmpresaConfig[];
      setConfigs(rows);
      const initial: Record<string, EditingRow> = {};
      rows.forEach((r) => {
        initial[r.id] = {
          cnpj: r.cnpj || "",
          store_id: r.store_id || "",
          address_id: r.address_id || "",
          alias: r.alias || "",
        };
      });
      setEditing(initial);
    }
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

  const handleChange = (id: string, field: keyof EditingRow, value: string) => {
    setEditing((prev) => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
  };

  const handleSave = async (config: HaytekEmpresaConfig) => {
    const row = editing[config.id];
    if (!row) return;
    setSaving(config.id);
    const { error } = await supabase
      .from("haytek_empresa_config" as never)
      .update({
        cnpj: row.cnpj.trim() || null,
        store_id: row.store_id.trim() || null,
        address_id: row.address_id.trim() || null,
        alias: row.alias.trim() || null,
      } as never)
      .eq("id", config.id);

    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Configuração salva", description: `Empresa ${config.cod_empresa} atualizada.` });
      fetchData();
    }
    setSaving(null);
  };

  const isRowChanged = (config: HaytekEmpresaConfig) => {
    const row = editing[config.id];
    if (!row) return false;
    return (
      row.cnpj !== (config.cnpj || "") ||
      row.store_id !== (config.store_id || "") ||
      row.address_id !== (config.address_id || "") ||
      row.alias !== (config.alias || "")
    );
  };

  const configuradas = configs.filter((c) => !!c.store_id && !!c.cnpj).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Box className="h-5 w-5 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">CONFIGURAÇÃO HAYTEK / HITECH POR EMPRESA</h1>
            <p className="text-sm text-muted-foreground">
              Mapeamento de CNPJ, Store ID e Address ID por loja. O token de acesso é único e configurado em Fornecedores.
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </div>

      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription className="text-sm">
          O token de acesso à API Haytek é <strong>único</strong> (staging ou produção) e fica em
          <em> Admin &gt; Configuração de Fornecedores</em>. Aqui você apenas mapeia os identificadores
          de cada loja (Store ID, CNPJ e Address ID opcional).
        </AlertDescription>
      </Alert>

      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{configs.length}</div>
            <p className="text-xs text-muted-foreground mt-1">Empresas cadastradas</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-success">{configuradas}</div>
            <p className="text-xs text-muted-foreground mt-1">Configuradas (CNPJ + Store ID)</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>EMPRESAS</CardTitle>
          <CardDescription>
            Configure CNPJ, Store ID e Address ID (opcional) para cada loja.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center p-8">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">Cód.</TableHead>
                  <TableHead className="w-44">Alias</TableHead>
                  <TableHead className="w-44">CNPJ</TableHead>
                  <TableHead className="w-28">Store ID</TableHead>
                  <TableHead className="w-28">Address ID</TableHead>
                  <TableHead className="w-28">Status</TableHead>
                  <TableHead className="w-20 text-right">Ação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {configs.map((config) => {
                  const row = editing[config.id];
                  if (!row) return null;
                  const changed = isRowChanged(config);
                  const isSaving = saving === config.id;
                  const configurada = !!row.store_id && !!row.cnpj;

                  return (
                    <TableRow key={config.id} className={changed ? "bg-warning-soft" : ""}>
                      <TableCell className="font-mono font-bold text-muted-foreground">
                        {config.cod_empresa}
                      </TableCell>
                      <TableCell>
                        <Input
                          className="h-8 text-sm"
                          value={row.alias}
                          onChange={(e) => handleChange(config.id, "alias", e.target.value)}
                          placeholder="Nome da loja"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          className="h-8 text-sm font-mono"
                          value={row.cnpj}
                          onChange={(e) => handleChange(config.id, "cnpj", e.target.value)}
                          placeholder="00.000.000/0001-00"
                          maxLength={18}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          className="h-8 text-sm font-mono"
                          value={row.store_id}
                          onChange={(e) => handleChange(config.id, "store_id", e.target.value)}
                          placeholder="SP0156"
                          maxLength={6}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          className="h-8 text-sm font-mono"
                          value={row.address_id}
                          onChange={(e) => handleChange(config.id, "address_id", e.target.value)}
                          placeholder="opcional"
                          maxLength={8}
                        />
                      </TableCell>
                      <TableCell>
                        {configurada ? (
                          <Badge className="text-xs bg-success text-success-foreground">Configurada</Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs text-muted-foreground">Pendente</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant={changed ? "default" : "ghost"}
                          className="h-8"
                          onClick={() => handleSave(config)}
                          disabled={!changed || isSaving}
                        >
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
