import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "@/hooks/use-toast";
import { Loader2, Box, Save, RefreshCw, Eye, EyeOff, Info, ShieldCheck, Beaker } from "lucide-react";
import { Navigate } from "react-router-dom";

type Ambiente = "global" | "staging" | "production";

interface HaytekEmpresaConfig {
  id: string;
  cod_empresa: number;
  alias: string | null;
  cnpj: string | null;
  store_id: string | null;
  address_id: string | null;
  api_key_production: string | null;
  ambiente_override: string | null;
  ativo: boolean;
  updated_at: string;
}

interface EditingRow {
  cnpj: string;
  store_id: string;
  address_id: string;
  alias: string;
  api_key_production: string;
  ambiente: Ambiente;
  showToken: boolean;
  tokenDirty: boolean; // true = usuário digitou novo token
}

export default function AdminHaytekConfigPage() {
  const { isAdmin, isLoading: authLoading } = useAuth();
  const [configs, setConfigs] = useState<HaytekEmpresaConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [editing, setEditing] = useState<Record<string, EditingRow>>({});
  const [showAdvanced, setShowAdvanced] = useState(false);

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
          api_key_production: "", // nunca exibir cru
          ambiente: (r.ambiente_override as Ambiente) || "global",
          showToken: false,
          tokenDirty: false,
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

  const handleChange = (id: string, field: keyof EditingRow, value: string | boolean) => {
    setEditing((prev) => {
      const cur = prev[id];
      const next = { ...cur, [field]: value };
      if (field === "api_key_production") {
        next.tokenDirty = true;
      }
      return { ...prev, [id]: next };
    });
  };

  const handleSave = async (config: HaytekEmpresaConfig) => {
    const row = editing[config.id];
    if (!row) return;

    setSaving(config.id);
    const updatePayload: Record<string, unknown> = {
      cnpj: row.cnpj.trim() || null,
      store_id: row.store_id.trim() || null,
      address_id: row.address_id.trim() || null,
      alias: row.alias.trim() || null,
      ambiente_override: row.ambiente === "global" ? null : row.ambiente,
    };
    // Só persiste o token se o usuário digitou algo novo
    if (row.tokenDirty) {
      updatePayload.api_key_production = row.api_key_production.trim() || null;
    }

    const { error } = await supabase
      .from("haytek_empresa_config" as never)
      .update(updatePayload as never)
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
    const ambienteAtual = (config.ambiente_override as Ambiente) || "global";
    return (
      row.cnpj !== (config.cnpj || "") ||
      row.store_id !== (config.store_id || "") ||
      row.address_id !== (config.address_id || "") ||
      row.alias !== (config.alias || "") ||
      row.ambiente !== ambienteAtual ||
      row.tokenDirty
    );
  };

  const empresasEmProducao = configs.filter((c) => c.ambiente_override === "production" && c.api_key_production).length;
  const empresasEmStaging = configs.filter((c) => c.ambiente_override !== "production").length;
  const empresasProdSemToken = configs.filter((c) => c.ambiente_override === "production" && !c.api_key_production).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Box className="h-5 w-5 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">CONFIGURAÇÃO HAYTEK / HITECH POR EMPRESA</h1>
            <p className="text-sm text-muted-foreground">
              Token de produção individual por loja. Staging usa token global compartilhado.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Switch checked={showAdvanced} onCheckedChange={setShowAdvanced} id="adv" />
            <label htmlFor="adv" className="cursor-pointer">Campos avançados</label>
          </div>
          <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
        </div>
      </div>

      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription className="text-sm">
          O <strong>token de staging</strong> é único e fica em <em>Admin &gt; Configuração de Fornecedores</em>.
          Em <strong>produção</strong>, cada loja precisa do seu próprio token. Defina o ambiente da loja como "Produção"
          e cole o token específico recebido da HiTech para aquela unidade.
        </AlertDescription>
      </Alert>

      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{configs.length}</div>
            <p className="text-xs text-muted-foreground mt-1">Empresas cadastradas</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-success flex items-center gap-2">
              <ShieldCheck className="h-5 w-5" /> {empresasEmProducao}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Em produção (token OK)</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-muted-foreground flex items-center gap-2">
              <Beaker className="h-5 w-5" /> {empresasEmStaging}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Em staging (homologação)</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-destructive">{empresasProdSemToken}</div>
            <p className="text-xs text-muted-foreground mt-1">Produção sem token</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>EMPRESAS</CardTitle>
          <CardDescription>
            Configure CNPJ, Store ID, ambiente e o token de produção para cada loja.
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
                  <TableHead className="w-36">Alias</TableHead>
                  <TableHead className="w-40">CNPJ</TableHead>
                  <TableHead className="w-24">Store ID</TableHead>
                  {showAdvanced && <TableHead className="w-24">Address ID</TableHead>}
                  <TableHead className="w-36">Ambiente</TableHead>
                  <TableHead>Token Produção</TableHead>
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
                  const tokenSalvo = !!config.api_key_production;
                  const isProd = row.ambiente === "production";
                  const configurada = !!config.store_id && !!config.cnpj && (!isProd || tokenSalvo || row.tokenDirty);

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
                      {showAdvanced && (
                        <TableCell>
                          <Input
                            className="h-8 text-sm font-mono"
                            value={row.address_id}
                            onChange={(e) => handleChange(config.id, "address_id", e.target.value)}
                            placeholder="opcional"
                            maxLength={8}
                          />
                        </TableCell>
                      )}
                      <TableCell>
                        <Select
                          value={row.ambiente}
                          onValueChange={(v) => handleChange(config.id, "ambiente", v as Ambiente)}
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="global">Staging (global)</SelectItem>
                            <SelectItem value="staging">Staging (forçado)</SelectItem>
                            <SelectItem value="production">Produção</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Input
                            className="h-8 text-xs font-mono"
                            type={row.showToken ? "text" : "password"}
                            value={row.api_key_production}
                            onChange={(e) => handleChange(config.id, "api_key_production", e.target.value)}
                            placeholder={tokenSalvo ? "•••••• (token salvo — digite para substituir)" : "Cole o token de produção"}
                            disabled={!isProd}
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                            onClick={() => handleChange(config.id, "showToken", !row.showToken)}
                            disabled={!isProd}
                          >
                            {row.showToken ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell>
                        {!configurada ? (
                          <Badge variant="outline" className="text-xs text-muted-foreground">
                            Pendente
                          </Badge>
                        ) : isProd ? (
                          <Badge className="text-xs bg-success text-success-foreground">
                            Produção
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="text-xs">
                            Staging
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
