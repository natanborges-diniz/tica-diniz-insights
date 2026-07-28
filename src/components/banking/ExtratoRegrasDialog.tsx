// E4 — CRUD de regras de classificação de tarifas (SPEC_P1_CONCILIACAO_3VIAS.md §3.3/§6)
// Regras casam por regex na descrição do extrato; quando auto_conciliar=true e
// valor ≤ valor_max, o motor cria o lançamento de tarifa automaticamente —
// único caminho de criação automática de lançamento.
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Globe } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BaseDialog } from "@/components/system/BaseDialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { PlanoContaSelect, type PlanoConta } from "@/components/banking/PlanoContaSelect";

interface Regra {
  id: string;
  cod_empresa: number | null;
  padrao_descricao: string;
  tipo: string;
  natureza: string;
  categoria: string | null;
  auto_conciliar: boolean;
  valor_max: number | null;
  ativo: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  codEmpresa: number;
}

export function ExtratoRegrasDialog({ open, onOpenChange, codEmpresa }: Props) {
  const queryClient = useQueryClient();

  const [novoPadrao, setNovoPadrao] = useState("");
  const [novoTipo, setNovoTipo] = useState("DEBITO");
  const [novaConta, setNovaConta] = useState<PlanoConta | null>(null);
  const [novoValorMax, setNovoValorMax] = useState("500");
  const [novoGlobal, setNovoGlobal] = useState(false);

  const { data: regras = [], isLoading } = useQuery<Regra[]>({
    queryKey: ["extrato-regras", codEmpresa],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("extrato_regras_classificacao")
        .select("*")
        .or(`cod_empresa.eq.${codEmpresa},cod_empresa.is.null`)
        .order("cod_empresa", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Regra[];
    },
    enabled: open,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["extrato-regras"] });

  const criarMutation = useMutation({
    mutationFn: async () => {
      if (!novoPadrao.trim()) throw new Error("Padrão (regex) é obrigatório");
      if (!novaConta) throw new Error("Selecione a conta do plano");
      try {
        new RegExp(novoPadrao); // valida a regex antes de salvar
      } catch {
        throw new Error("Regex inválida");
      }
      // Padrão do DRE: natureza = grupo_dre, categoria = categoria do plano
      const { error } = await supabase.from("extrato_regras_classificacao").insert({
        cod_empresa: novoGlobal ? null : codEmpresa,
        padrao_descricao: novoPadrao.trim(),
        tipo: novoTipo,
        natureza: novaConta.grupo_dre,
        categoria: novaConta.categoria,
        auto_conciliar: true,
        valor_max: novoValorMax ? Number(novoValorMax) : null,
        ativo: true,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Regra criada");
      setNovoPadrao("");
      invalidate();
    },
    onError: (e: Error) => toast.error(`Erro ao criar regra: ${e.message}`),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ regra, campo }: { regra: Regra; campo: "ativo" | "auto_conciliar" }) => {
      const { error } = await supabase
        .from("extrato_regras_classificacao")
        .update({ [campo]: !regra[campo] })
        .eq("id", regra.id);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(`Erro ao atualizar regra: ${e.message}`),
  });

  const excluirMutation = useMutation({
    mutationFn: async (regra: Regra) => {
      const { error } = await supabase.from("extrato_regras_classificacao").delete().eq("id", regra.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Regra excluída");
      invalidate();
    },
    onError: (e: Error) => toast.error(`Erro ao excluir regra: ${e.message}`),
  });

  return (
    <BaseDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Regras de tarifas e recorrências"
      description="Regex aplicada na descrição do extrato. Com auto-conciliar ligado e valor até o teto, o motor cria o lançamento de tarifa sozinho — único caminho de criação automática."
    >
      <div className="space-y-4">
        {/* Nova regra */}
        <div className="flex flex-wrap items-end gap-2 p-3 rounded-lg border bg-muted/30">
          <div className="space-y-1 flex-1 min-w-[180px]">
            <label className="text-xs text-muted-foreground">Padrão (regex)</label>
            <Input value={novoPadrao} onChange={(e) => setNovoPadrao(e.target.value)} placeholder="ex.: TARIFA|TAR\." />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Tipo</label>
            <Select value={novoTipo} onValueChange={setNovoTipo}>
              <SelectTrigger className="w-[110px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="DEBITO">Débito</SelectItem>
                <SelectItem value="CREDITO">Crédito</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Conta do plano (grupo DRE)</label>
            <PlanoContaSelect
              className="w-[240px]"
              value={novaConta?.conta_numero ?? null}
              onChange={setNovaConta}
              grupos={novoTipo === "CREDITO" ? ["RECEITA_BRUTA", "OUTRAS_RECEITAS"] : undefined}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Valor máx. (R$)</label>
            <Input type="number" value={novoValorMax} onChange={(e) => setNovoValorMax(e.target.value)} className="w-[110px]" />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground flex items-center gap-1">
              <Globe className="h-3 w-3" /> Global
            </label>
            <Switch checked={novoGlobal} onCheckedChange={setNovoGlobal} />
          </div>
          <Button size="sm" onClick={() => criarMutation.mutate()} disabled={criarMutation.isPending}>
            <Plus className="h-4 w-4 mr-1" />
            Adicionar
          </Button>
        </div>

        {/* Lista */}
        <div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Padrão</TableHead>
                <TableHead className="w-[80px]">Tipo</TableHead>
                <TableHead>Natureza</TableHead>
                <TableHead className="w-[100px] text-right">Valor máx.</TableHead>
                <TableHead className="w-[80px] text-center">Escopo</TableHead>
                <TableHead className="w-[70px] text-center">Auto</TableHead>
                <TableHead className="w-[70px] text-center">Ativa</TableHead>
                <TableHead className="w-[50px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-6 text-muted-foreground">Carregando...</TableCell>
                </TableRow>
              ) : regras.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-6 text-muted-foreground">Nenhuma regra cadastrada.</TableCell>
                </TableRow>
              ) : (
                regras.map((r) => (
                  <TableRow key={r.id} className={r.ativo ? "" : "opacity-50"}>
                    <TableCell className="font-mono text-xs max-w-[200px] truncate">{r.padrao_descricao}</TableCell>
                    <TableCell className="text-xs">{r.tipo}</TableCell>
                    <TableCell className="text-xs">
                      {r.natureza}
                      {r.categoria && <span className="text-muted-foreground"> / {r.categoria}</span>}
                    </TableCell>
                    <TableCell className="text-xs text-right">
                      {r.valor_max != null ? `R$ ${Number(r.valor_max).toFixed(0)}` : "—"}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant={r.cod_empresa == null ? "secondary" : "outline"} className="text-[10px]">
                        {r.cod_empresa == null ? "Global" : `Emp. ${r.cod_empresa}`}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <Switch
                        checked={r.auto_conciliar}
                        onCheckedChange={() => toggleMutation.mutate({ regra: r, campo: "auto_conciliar" })}
                      />
                    </TableCell>
                    <TableCell className="text-center">
                      <Switch
                        checked={r.ativo}
                        onCheckedChange={() => toggleMutation.mutate({ regra: r, campo: "ativo" })}
                      />
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={() => excluirMutation.mutate(r)}
                        disabled={excluirMutation.isPending}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-danger" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </BaseDialog>
  );
}
