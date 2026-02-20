import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { Loader2, FlaskConical, Save, RefreshCw } from "lucide-react";
import { Navigate } from "react-router-dom";

interface HoyaEmpresaConfig {
  id: string;
  cod_empresa: number;
  alias: string | null;
  cnpj: string | null;
  cod_cliente_hoya: number | null;
  ativo: boolean;
  updated_at: string;
}

interface EditingRow {
  cnpj: string;
  cod_cliente_hoya: string;
  alias: string;
}

export default function AdminHoyaConfigPage() {
  const { isAdmin, isLoading: authLoading } = useAuth();
  const [configs, setConfigs] = useState<HoyaEmpresaConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [editing, setEditing] = useState<Record<string, EditingRow>>({});

  const fetchData = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("hoya_empresa_config" as never)
      .select("*")
      .order("cod_empresa");

    if (error) {
      toast({ title: "Erro ao carregar configurações", description: error.message, variant: "destructive" });
    } else if (data) {
      const rows = data as HoyaEmpresaConfig[];
      setConfigs(rows);
      // Inicializa os campos de edição com os valores atuais
      const initial: Record<string, EditingRow> = {};
      rows.forEach((r) => {
        initial[r.id] = {
          cnpj: r.cnpj || "",
          cod_cliente_hoya: r.cod_cliente_hoya != null ? String(r.cod_cliente_hoya) : "",
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
    setEditing((prev) => ({
      ...prev,
      [id]: { ...prev[id], [field]: value },
    }));
  };

  const handleSave = async (config: HoyaEmpresaConfig) => {
    const row = editing[config.id];
    if (!row) return;

    const codCliente = row.cod_cliente_hoya.trim() !== "" ? parseInt(row.cod_cliente_hoya, 10) : null;
    if (row.cod_cliente_hoya.trim() !== "" && isNaN(codCliente!)) {
      toast({ title: "Código inválido", description: "O código do cliente Hoya deve ser numérico.", variant: "destructive" });
      return;
    }

    setSaving(config.id);
    const { error } = await supabase
      .from("hoya_empresa_config" as never)
      .update({
        cnpj: row.cnpj.trim() || null,
        cod_cliente_hoya: codCliente,
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

  const isRowChanged = (config: HoyaEmpresaConfig) => {
    const row = editing[config.id];
    if (!row) return false;
    return (
      row.cnpj !== (config.cnpj || "") ||
      row.cod_cliente_hoya !== (config.cod_cliente_hoya != null ? String(config.cod_cliente_hoya) : "") ||
      row.alias !== (config.alias || "")
    );
  };

  const totalConfiguradas = configs.filter((c) => c.cod_cliente_hoya != null && c.cnpj).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FlaskConical className="h-5 w-5 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Configuração Hoya por Empresa</h1>
            <p className="text-sm text-muted-foreground">
              Mapeamento de CNPJ e código de cliente Hoya para cada unidade
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </div>

      {/* Resumo */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{configs.length}</div>
            <p className="text-xs text-muted-foreground mt-1">Empresas ativas</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-primary">{totalConfiguradas}</div>
            <p className="text-xs text-muted-foreground mt-1">Completamente configuradas</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-destructive">{configs.length - totalConfiguradas}</div>
            <p className="text-xs text-muted-foreground mt-1">Pendentes de configuração</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Empresas</CardTitle>
          <CardDescription>
            Insira o CNPJ e o código de cliente Hoya para cada empresa. O alias é o nome de exibição usado nos pedidos.
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
                  <TableHead className="w-16">Cód.</TableHead>
                  <TableHead className="w-40">Alias / Nome</TableHead>
                  <TableHead className="w-44">CNPJ</TableHead>
                  <TableHead className="w-36">Cód. Cliente Hoya</TableHead>
                  <TableHead className="w-24">Status</TableHead>
                  <TableHead className="w-20 text-right">Ação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {configs.map((config) => {
                  const row = editing[config.id] || { cnpj: "", cod_cliente_hoya: "", alias: "" };
                  const changed = isRowChanged(config);
                  const isSaving = saving === config.id;
                  const configurada = config.cod_cliente_hoya != null && config.cnpj;

                  return (
                    <TableRow key={config.id} className={changed ? "bg-amber-50 dark:bg-amber-950/20" : ""}>
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
                          type="number"
                          value={row.cod_cliente_hoya}
                          onChange={(e) => handleChange(config.id, "cod_cliente_hoya", e.target.value)}
                          placeholder="Ex: 12345"
                        />
                      </TableCell>
                      <TableCell>
                        {configurada ? (
                          <Badge variant="default" className="text-xs">
                            Configurada
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs text-muted-foreground">
                            Pendente
                          </Badge>
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
                          {isSaving ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Save className="h-3 w-3" />
                          )}
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
