// src/components/metas/GruposTab.tsx
// Fase 2b — grupos de lojas para metas/visão de SUPERVISOR
// (docs/REVISAO_VENDAS_METAS.md §5.2/§7.6). A meta do supervisor é a soma das
// metas semanais das lojas do grupo (derivada na leitura, não materializada).

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Building2, Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { Empresa } from "@/services/empresaService";
import {
  getGruposLojas,
  upsertGrupoLojas,
  deleteGrupoLojas,
  type GrupoLojas,
} from "@/services/metasSemanaisService";

interface GruposTabProps {
  empresas: Empresa[];
}

export function GruposTab({ empresas }: GruposTabProps) {
  const [grupos, setGrupos] = useState<GrupoLojas[]>([]);
  const [loading, setLoading] = useState(true);

  const [dialogAberto, setDialogAberto] = useState(false);
  const [editando, setEditando] = useState<GrupoLojas | null>(null);
  const [nome, setNome] = useState("");
  const [membrosSel, setMembrosSel] = useState<Set<number>>(new Set());
  const [salvando, setSalvando] = useState(false);

  const nomeLoja = (cod: number) =>
    empresas.find((e) => e.codEmpresa === cod)?.nome ?? `Loja ${cod}`;

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      setGrupos(await getGruposLojas());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao carregar grupos");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const abrirNovo = () => {
    setEditando(null);
    setNome("");
    setMembrosSel(new Set());
    setDialogAberto(true);
  };

  const abrirEdicao = (grupo: GrupoLojas) => {
    setEditando(grupo);
    setNome(grupo.nome);
    setMembrosSel(new Set(grupo.membros));
    setDialogAberto(true);
  };

  const toggleMembro = (cod: number) => {
    const novo = new Set(membrosSel);
    if (novo.has(cod)) novo.delete(cod);
    else novo.add(cod);
    setMembrosSel(novo);
  };

  const handleSalvar = async () => {
    if (!nome.trim()) {
      toast.error("Informe o nome do grupo");
      return;
    }
    if (!membrosSel.size) {
      toast.error("Selecione ao menos uma loja");
      return;
    }
    setSalvando(true);
    try {
      await upsertGrupoLojas(nome.trim(), [...membrosSel], editando?.codGrupo);
      toast.success(editando ? "Grupo atualizado" : "Grupo criado");
      setDialogAberto(false);
      await carregar();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar grupo");
    } finally {
      setSalvando(false);
    }
  };

  const handleExcluir = async (grupo: GrupoLojas) => {
    if (!window.confirm(`Excluir o grupo "${grupo.nome}"?`)) return;
    try {
      await deleteGrupoLojas(grupo.codGrupo);
      toast.success("Grupo excluído");
      await carregar();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao excluir grupo");
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Grupos de Lojas (Supervisores)
          </CardTitle>
          <CardDescription>
            A meta do supervisor é a soma das metas das lojas do grupo.
          </CardDescription>
        </div>
        <Button onClick={abrirNovo}>
          <Plus className="h-4 w-4 mr-2" />
          Novo grupo
        </Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-muted-foreground text-center py-6">Carregando...</p>
        ) : grupos.length === 0 ? (
          <p className="text-muted-foreground text-center py-6">
            Nenhum grupo criado. Crie um grupo para configurar a visão de supervisor.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Grupo</TableHead>
                <TableHead>Lojas</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {grupos.map((g) => (
                <TableRow key={g.codGrupo}>
                  <TableCell className="font-medium">{g.nome}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {g.membros.map((m) => (
                        <Badge key={m} variant="secondary">{nomeLoja(m)}</Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => abrirEdicao(g)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleExcluir(g)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <Dialog open={dialogAberto} onOpenChange={setDialogAberto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editando ? "Editar grupo" : "Novo grupo"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nome do grupo</Label>
              <Input
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Ex.: Região Centro"
              />
            </div>
            <div className="space-y-2">
              <Label>Lojas do grupo ({membrosSel.size})</Label>
              <div className="max-h-56 overflow-y-auto border rounded-md p-2 space-y-1">
                {empresas.map((emp) => (
                  <label
                    key={emp.codEmpresa}
                    className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted rounded px-1 py-0.5"
                  >
                    <Checkbox
                      checked={membrosSel.has(emp.codEmpresa)}
                      onCheckedChange={() => toggleMembro(emp.codEmpresa)}
                    />
                    {emp.nome}
                  </label>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogAberto(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSalvar} disabled={salvando}>
              {salvando ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
