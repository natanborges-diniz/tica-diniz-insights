// src/components/otb/OtbFornecedorMarcaConfig.tsx
// Gerenciador de mapeamento marca → fornecedor

import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Settings2, Plus, Trash2, Save, Loader2, Link2 } from "lucide-react";

interface MapeamentoMarca {
  id: string;
  marca: string;
  fornecedor: string;
}

interface MarcaSemFornecedor {
  marca: string;
  qtdSkus: number;
}

interface OtbFornecedorMarcaConfigProps {
  marcasSemFornecedor?: MarcaSemFornecedor[];
}

export function OtbFornecedorMarcaConfig({ marcasSemFornecedor = [] }: OtbFornecedorMarcaConfigProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [mapeamentos, setMapeamentos] = useState<MapeamentoMarca[]>([]);
  const [novaMarca, setNovaMarca] = useState("");
  const [novoFornecedor, setNovoFornecedor] = useState("");

  // Carregar mapeamentos ao abrir
  useEffect(() => {
    if (open) {
      carregarMapeamentos();
    }
  }, [open]);

  const carregarMapeamentos = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('fornecedor_marca')
        .select('*')
        .order('marca');
      
      if (error) throw error;
      setMapeamentos(data || []);
    } catch (err) {
      console.error('Erro ao carregar mapeamentos:', err);
      toast.error('Erro ao carregar mapeamentos');
    } finally {
      setLoading(false);
    }
  };

  const adicionarMapeamento = async () => {
    if (!novaMarca.trim() || !novoFornecedor.trim()) {
      toast.warning('Preencha marca e fornecedor');
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from('fornecedor_marca')
        .insert({
          marca: novaMarca.trim().toUpperCase(),
          fornecedor: novoFornecedor.trim().toUpperCase(),
        });
      
      if (error) {
        if (error.code === '23505') {
          toast.error('Esta marca já está mapeada');
        } else {
          throw error;
        }
        return;
      }

      toast.success('Mapeamento adicionado');
      setNovaMarca("");
      setNovoFornecedor("");
      carregarMapeamentos();
    } catch (err) {
      console.error('Erro ao adicionar:', err);
      toast.error('Erro ao adicionar mapeamento');
    } finally {
      setSaving(false);
    }
  };

  const removerMapeamento = async (id: string) => {
    try {
      const { error } = await supabase
        .from('fornecedor_marca')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
      
      toast.success('Mapeamento removido');
      setMapeamentos(prev => prev.filter(m => m.id !== id));
    } catch (err) {
      console.error('Erro ao remover:', err);
      toast.error('Erro ao remover mapeamento');
    }
  };

  const preencherMarca = (marca: string) => {
    setNovaMarca(marca);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Link2 className="h-4 w-4" />
          Mapear Fornecedores
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings2 className="h-5 w-5" />
            Mapeamento Marca → Fornecedor
          </DialogTitle>
          <DialogDescription>
            Configure o fornecedor padrão para marcas que não têm essa informação no ERP.
            Este mapeamento será usado como fallback no cálculo do OTB.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Marcas detectadas sem fornecedor */}
          {marcasSemFornecedor.length > 0 && (
            <div className="space-y-2">
              <Label className="text-sm font-medium text-muted-foreground">
                Marcas sem fornecedor detectadas ({marcasSemFornecedor.length})
              </Label>
              <div className="flex flex-wrap gap-2">
                {marcasSemFornecedor.slice(0, 20).map((m) => (
                  <Badge 
                    key={m.marca} 
                    variant="outline" 
                    className="cursor-pointer hover:bg-primary/10"
                    onClick={() => preencherMarca(m.marca)}
                  >
                    {m.marca} ({m.qtdSkus})
                  </Badge>
                ))}
                {marcasSemFornecedor.length > 20 && (
                  <Badge variant="secondary">
                    +{marcasSemFornecedor.length - 20} outras
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Clique em uma marca para preencher o formulário
              </p>
            </div>
          )}

          {/* Formulário para adicionar novo mapeamento */}
          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <Label htmlFor="marca">Marca</Label>
              <Input
                id="marca"
                value={novaMarca}
                onChange={(e) => setNovaMarca(e.target.value)}
                placeholder="Ex: RAY-BAN"
                className="uppercase"
              />
            </div>
            <div className="flex-1">
              <Label htmlFor="fornecedor">Fornecedor</Label>
              <Input
                id="fornecedor"
                value={novoFornecedor}
                onChange={(e) => setNovoFornecedor(e.target.value)}
                placeholder="Ex: LUXOTTICA"
                className="uppercase"
              />
            </div>
            <Button 
              onClick={adicionarMapeamento} 
              disabled={saving}
              className="gap-2"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Adicionar
            </Button>
          </div>

          {/* Tabela de mapeamentos existentes */}
          <div className="border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Marca</TableHead>
                  <TableHead>Fornecedor</TableHead>
                  <TableHead className="w-[80px]">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ) : mapeamentos.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center py-8 text-muted-foreground">
                      Nenhum mapeamento configurado
                    </TableCell>
                  </TableRow>
                ) : (
                  mapeamentos.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="font-mono">{m.marca}</TableCell>
                      <TableCell>{m.fornecedor}</TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => removerMapeamento(m.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          <p className="text-xs text-muted-foreground">
            💡 Após adicionar mapeamentos, clique em "Calcular OTB" novamente para aplicar.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
