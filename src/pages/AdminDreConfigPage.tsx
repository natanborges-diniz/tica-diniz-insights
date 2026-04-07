import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useModulePermissions } from "@/hooks/useModulePermissions";
import { ModuleHeader } from "@/components/system/ModuleHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { BaseDialog } from "@/components/system/BaseDialog";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Settings2, Plus, Pencil, Trash2 } from "lucide-react";

interface PlanoContas {
  id: string;
  conta_numero: string;
  conta_descricao: string;
  grupo_dre: string;
  categoria: string;
  ativo: boolean;
}

const GRUPOS_DRE = [
  "RECEITA_BRUTA", "DEDUCOES", "CUSTO_MERCADORIA",
  "DESPESAS_OPERACIONAIS", "OUTRAS_DESPESAS", "INVESTIMENTOS",
];

const CATEGORIAS_MAP: Record<string, string[]> = {
  RECEITA_BRUTA: ["VENDAS", "OUTRAS_RECEITAS"],
  DEDUCOES: ["IMPOSTOS", "COMISSOES", "TAXAS"],
  CUSTO_MERCADORIA: ["FORNECEDORES_PRODUTO"],
  DESPESAS_OPERACIONAIS: ["PESSOAL", "OCUPACAO", "COMUNICACAO", "MARKETING", "ADMINISTRATIVO", "SERVICOS", "MANUTENCAO", "FINANCEIRO_OPERACIONAL", "SEGURANCA", "DEVOLUCOES"],
  OUTRAS_DESPESAS: ["FINANCEIRO", "PRO_LABORE", "DEVOLUCOES"],
  INVESTIMENTOS: ["INVESTIMENTOS"],
};

export default function AdminDreConfigPage() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editItem, setEditItem] = useState<PlanoContas | null>(null);
  const [filtroGrupo, setFiltroGrupo] = useState("todos");

  // Form
  const [formContaNumero, setFormContaNumero] = useState("");
  const [formContaDescricao, setFormContaDescricao] = useState("");
  const [formGrupoDre, setFormGrupoDre] = useState("");
  const [formCategoria, setFormCategoria] = useState("");

  const { data: contas = [], isLoading } = useQuery<PlanoContas[]>({
    queryKey: ["dre-plano-contas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dre_plano_contas")
        .select("*")
        .order("conta_numero", { ascending: true });
      if (error) throw error;
      return data as PlanoContas[];
    },
  });

  const contasFiltradas = filtroGrupo === "todos" ? contas : contas.filter(c => c.grupo_dre === filtroGrupo);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const record = {
        conta_numero: formContaNumero.trim(),
        conta_descricao: formContaDescricao.trim().toUpperCase(),
        grupo_dre: formGrupoDre,
        categoria: formCategoria,
      };
      if (editItem) {
        const { error } = await supabase.from("dre_plano_contas").update(record).eq("id", editItem.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("dre_plano_contas").insert(record);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editItem ? "Conta atualizada" : "Conta cadastrada");
      queryClient.invalidateQueries({ queryKey: ["dre-plano-contas"] });
      closeDialog();
    },
    onError: (e: Error) => toast.error(e.message || "Erro ao salvar"),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, ativo }: { id: string; ativo: boolean }) => {
      const { error } = await supabase.from("dre_plano_contas").update({ ativo }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dre-plano-contas"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("dre_plano_contas").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Conta removida");
      queryClient.invalidateQueries({ queryKey: ["dre-plano-contas"] });
    },
    onError: (e: Error) => toast.error(e.message || "Erro ao remover"),
  });

  const openEdit = (item: PlanoContas) => {
    setEditItem(item);
    setFormContaNumero(item.conta_numero);
    setFormContaDescricao(item.conta_descricao);
    setFormGrupoDre(item.grupo_dre);
    setFormCategoria(item.categoria);
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setEditItem(null);
    setFormContaNumero("");
    setFormContaDescricao("");
    setFormGrupoDre("");
    setFormCategoria("");
  };

  const categoriasDisponiveis = formGrupoDre ? (CATEGORIAS_MAP[formGrupoDre] || []) : [];

  return (
    <div className="space-y-6">
      <ModuleHeader
        title="Plano de Contas DRE"
        subtitle="Parametrização da classificação automática de lançamentos importados do ERP"
        icon={<Settings2 className="h-5 w-5" />}
        actions={
          <Button size="sm" onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> Nova Conta
          </Button>
        }
      />

      <BaseDialog
        open={dialogOpen}
        onOpenChange={(open) => { if (!open) closeDialog(); }}
        title={editItem ? "Editar Conta" : "Nova Conta"}
        footer={
          <>
            <Button variant="outline" onClick={closeDialog}>Cancelar</Button>
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending || !formContaNumero || !formContaDescricao || !formGrupoDre || !formCategoria}
            >
              {editItem ? "Salvar" : "Cadastrar"}
            </Button>
          </>
        }
      >
        <div className="space-y-4 py-2">
          <div className="bg-muted/50 rounded-lg p-3">
            <p className="text-xs text-muted-foreground">
              O número da conta corresponde ao plano de contas do ERP (ex: 3.4.1 = Salário).
              O sistema usa este mapeamento para classificar automaticamente os lançamentos importados.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Nº Conta *</Label>
              <Input value={formContaNumero} onChange={e => setFormContaNumero(e.target.value)} placeholder="Ex: 3.4.1" />
            </div>
            <div className="space-y-1">
              <Label>Descrição *</Label>
              <Input value={formContaDescricao} onChange={e => setFormContaDescricao(e.target.value)} placeholder="Ex: SALARIO" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Grupo DRE *</Label>
              <Select value={formGrupoDre} onValueChange={(v) => { setFormGrupoDre(v); setFormCategoria(""); }}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {GRUPOS_DRE.map(g => <SelectItem key={g} value={g}>{g.replace(/_/g, " ")}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Categoria *</Label>
              <Select value={formCategoria} onValueChange={setFormCategoria}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {categoriasDisponiveis.map(c => <SelectItem key={c} value={c}>{c.replace(/_/g, " ")}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </BaseDialog>

      <div className="flex items-end gap-3">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Filtrar grupo DRE</label>
          <Select value={filtroGrupo} onValueChange={setFiltroGrupo}>
            <SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os grupos</SelectItem>
              {GRUPOS_DRE.map(g => <SelectItem key={g} value={g}>{g.replace(/_/g, " ")}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Badge variant="secondary">{contasFiltradas.length} contas</Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Contas Cadastradas</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[100px]">Nº Conta</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead className="w-[180px]">Grupo DRE</TableHead>
                  <TableHead className="w-[180px]">Categoria</TableHead>
                  <TableHead className="w-[70px]">Ativo</TableHead>
                  <TableHead className="w-[100px] text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>
                ) : contasFiltradas.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Nenhuma conta encontrada.</TableCell></TableRow>
                ) : contasFiltradas.map(c => (
                  <TableRow key={c.id} className={!c.ativo ? "opacity-50" : undefined}>
                    <TableCell className="font-mono text-sm">{c.conta_numero}</TableCell>
                    <TableCell className="text-sm">{c.conta_descricao}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px]">{c.grupo_dre.replace(/_/g, " ")}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-[10px]">{c.categoria.replace(/_/g, " ")}</Badge>
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={c.ativo}
                        onCheckedChange={(checked) => toggleMutation.mutate({ id: c.id, ativo: checked })}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={() => openEdit(c)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => deleteMutation.mutate(c.id)} disabled={deleteMutation.isPending}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
