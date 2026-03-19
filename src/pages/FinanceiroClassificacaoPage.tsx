import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Tags, Check, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useDefaultEmpresa } from "@/hooks/useDefaultEmpresa";
import { ModuleHeader } from "@/components/system/ModuleHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BaseSheet } from "@/components/system/BaseSheet";
import { toast } from "sonner";
import { LoadingState } from "@/components/system/states";

interface Lancamento {
  id: string;
  cod_empresa: number;
  tipo: string;
  status: string;
  descricao: string;
  pessoa_nome: string | null;
  valor: number;
  data_vencimento: string;
  categoria: string | null;
  natureza: string | null;
  subcategoria: string | null;
  origem: string;
  created_at: string;
}

const NATUREZAS = [
  "RECEITA_BRUTA", "RECEITA_FINANCEIRA", "DEVOLUCOES",
  "DESPESAS_OPERACIONAIS", "DESPESAS_ADMINISTRATIVAS", "DESPESAS_FINANCEIRAS",
  "CUSTOS_MERCADORIA", "IMPOSTOS", "FOLHA_PAGAMENTO",
  "TAXA_ADQUIRENTE", "OUTROS",
];

const CATEGORIAS = [
  "VENDA_PRODUTO", "VENDA_SERVICO", "ALUGUEL", "SALARIOS",
  "ENERGIA", "TELEFONE", "INTERNET", "AGUA", "MANUTENCAO",
  "FORNECEDORES", "IMPOSTOS", "TAXAS_BANCARIAS", "CARTAO",
  "CMV", "CUSTO_MERCADORIA", "TAXA", "OUTRAS_RECEITAS", "OUTRAS_DESPESAS",
  "OUTROS",
];

export default function FinanceiroClassificacaoPage() {
  const { codEmpresa } = useDefaultEmpresa();
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [formCategoria, setFormCategoria] = useState("");
  const [formNatureza, setFormNatureza] = useState("");
  const [formDescricao, setFormDescricao] = useState("");

  const invokeAction = async (action: string, extra: Record<string, unknown> = {}) => {
    const { data: { session } } = await supabase.auth.getSession();
    const { data, error } = await supabase.functions.invoke("financeiro-lancamentos", {
      body: { action, ...extra },
      headers: { Authorization: `Bearer ${session?.access_token}` },
    });
    if (error) throw error;
    return data;
  };

  const { data: pendentes = [], isLoading } = useQuery<Lancamento[]>({
    queryKey: ["pendentes-validacao", codEmpresa],
    queryFn: () => invokeAction("listar_pendentes_validacao", { cod_empresa: codEmpresa, limit: 200 }),
    enabled: !!codEmpresa,
  });

  const classificarMutation = useMutation({
    mutationFn: () => invokeAction("classificar", {
      id: selectedId,
      categoria: formCategoria || null,
      natureza: formNatureza || null,
      descricao: formDescricao || undefined,
    }),
    onSuccess: () => {
      toast.success("Lançamento classificado");
      queryClient.invalidateQueries({ queryKey: ["pendentes-validacao"] });
      setSelectedId(null);
      resetForm();
    },
    onError: () => toast.error("Erro ao classificar"),
  });

  const resetForm = () => {
    setFormCategoria("");
    setFormNatureza("");
    setFormDescricao("");
  };

  const openClassificar = (l: Lancamento) => {
    setSelectedId(l.id);
    setFormCategoria(l.categoria || "");
    setFormNatureza(l.natureza || "");
    setFormDescricao(l.descricao);
  };

  const fmtCurrency = (v: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

  return (
    <div className="space-y-6">
      <ModuleHeader
        title="Classificação de Lançamentos"
        subtitle="Lançamentos pendentes de validação e categorização"
        icon={<Tags className="h-5 w-5" />}
      />

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-warning" />
            {pendentes.length} lançamento(s) pendente(s)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <LoadingState />
          ) : pendentes.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              <Check className="h-8 w-8 mx-auto mb-2 text-success" />
              Todos os lançamentos estão classificados!
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead>Pessoa</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead>Vencimento</TableHead>
                    <TableHead>Origem</TableHead>
                    <TableHead>Categoria</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendentes.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell>
                        <Badge variant={l.tipo === "RECEBER" ? "default" : "secondary"}>
                          {l.tipo}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate">{l.descricao}</TableCell>
                      <TableCell className="max-w-[150px] truncate">{l.pessoa_nome || "—"}</TableCell>
                      <TableCell className="text-right font-mono">{fmtCurrency(l.valor)}</TableCell>
                      <TableCell>{l.data_vencimento ? format(new Date(l.data_vencimento + "T00:00:00"), "dd/MM/yyyy") : "—"}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{l.origem}</Badge>
                      </TableCell>
                      <TableCell>
                        {l.categoria ? (
                          <Badge variant="outline">{l.categoria}</Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground italic">Sem categoria</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Button size="sm" variant="outline" onClick={() => openClassificar(l)}>
                          <Tags className="h-3 w-3 mr-1" /> Classificar
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <BaseSheet
        open={!!selectedId}
        onOpenChange={(open) => { if (!open) { setSelectedId(null); resetForm(); } }}
        title="Classificar Lançamento"
        side="right"
      >
        <div className="space-y-4 py-4">
          <div className="space-y-1">
            <Label>Descrição</Label>
            <Input value={formDescricao} onChange={e => setFormDescricao(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Natureza (DRE)</Label>
            <Select value={formNatureza} onValueChange={setFormNatureza}>
              <SelectTrigger><SelectValue placeholder="Selecione a natureza" /></SelectTrigger>
              <SelectContent>
                {NATUREZAS.map(n => <SelectItem key={n} value={n}>{n.replace(/_/g, " ")}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Categoria</Label>
            <Select value={formCategoria} onValueChange={setFormCategoria}>
              <SelectTrigger><SelectValue placeholder="Selecione a categoria" /></SelectTrigger>
              <SelectContent>
                {CATEGORIAS.map(c => <SelectItem key={c} value={c}>{c.replace(/_/g, " ")}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Button
            className="w-full"
            onClick={() => classificarMutation.mutate()}
            disabled={classificarMutation.isPending}
          >
            <Check className="h-4 w-4 mr-1" /> Confirmar Classificação
          </Button>
        </div>
      </BaseSheet>
    </div>
  );
}
