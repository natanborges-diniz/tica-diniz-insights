import { useState, useMemo } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Pencil, Trash2, Search, Store, Users } from "lucide-react";
import { MetaVenda } from "@/services/metasService";

interface MetasTableProps {
  metas: MetaVenda[];
  onEditar: (meta: MetaVenda) => void;
  onExcluir: (id: string) => void;
  loading?: boolean;
}

const MESES_LABEL: Record<number, string> = {
  1: "Jan", 2: "Fev", 3: "Mar", 4: "Abr", 5: "Mai", 6: "Jun",
  7: "Jul", 8: "Ago", 9: "Set", 10: "Out", 11: "Nov", 12: "Dez"
};

export function MetasTable({ metas, onEditar, onExcluir, loading }: MetasTableProps) {
  const [busca, setBusca] = useState("");

  const metasFiltradas = useMemo(() => {
    if (!busca.trim()) return metas;
    const termo = busca.toLowerCase();
    return metas.filter(m => 
      m.nomeReferencia?.toLowerCase().includes(termo) ||
      String(m.codReferencia).includes(termo)
    );
  }, [metas, busca]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', { 
      style: 'currency', 
      currency: 'BRL',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Metas Cadastradas</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-32 text-muted-foreground">
            Carregando...
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <CardTitle className="text-lg">
            Metas Cadastradas ({metasFiltradas.length})
          </CardTitle>
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="pl-8"
            />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {metasFiltradas.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
            <p>Nenhuma meta encontrada</p>
            <p className="text-sm">Clique em "Buscar" para carregar ou cadastre uma nova meta</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[80px]">Tipo</TableHead>
                  <TableHead>Referência</TableHead>
                  <TableHead className="text-center">Período</TableHead>
                  <TableHead className="text-right">Meta Faturamento</TableHead>
                  <TableHead className="text-right">Ticket Médio</TableHead>
                  <TableHead className="text-right">Qtd Vendas</TableHead>
                  <TableHead className="w-[100px] text-center">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {metasFiltradas.map((meta) => (
                  <TableRow key={meta.id}>
                    <TableCell>
                      <Badge variant={meta.tipo === 'LOJA' ? "default" : "secondary"} className="gap-1">
                        {meta.tipo === 'LOJA' ? <Store className="h-3 w-3" /> : <Users className="h-3 w-3" />}
                        {meta.tipo === 'LOJA' ? 'Loja' : 'Vend.'}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium">
                      {meta.nomeReferencia || `#${meta.codReferencia}`}
                    </TableCell>
                    <TableCell className="text-center">
                      {MESES_LABEL[meta.mes]}/{meta.ano}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {formatCurrency(meta.metaFaturamento)}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {formatCurrency(meta.metaTicketMedio)}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {meta.metaQtdVendas}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-center gap-1">
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8"
                          onClick={() => onEditar(meta)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-8 w-8 text-destructive hover:text-destructive"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Excluir meta?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Tem certeza que deseja excluir a meta de{" "}
                                <strong>{meta.nomeReferencia}</strong> para{" "}
                                {MESES_LABEL[meta.mes]}/{meta.ano}?
                                Esta ação não pode ser desfeita.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction 
                                onClick={() => onExcluir(meta.id)}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                Excluir
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
