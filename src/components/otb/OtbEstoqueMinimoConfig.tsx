// src/components/otb/OtbEstoqueMinimoConfig.tsx
// Configuração de estoque mínimo por loja, categoria e curva ABC

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Settings, Save, Plus, Trash2, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import type { Empresa } from '@/services/empresaService';

interface EstoqueMinimoConfig {
  id?: string;
  cod_empresa: number;
  categoria: string;
  curva_abc: string;
  quantidade_minima: number;
}

interface OtbEstoqueMinimoConfigProps {
  empresas: Empresa[];
}

const CATEGORIAS = ['TODOS', 'ARMACOES', 'LENTES', 'ACESSORIOS'];
const CURVAS = ['A', 'B', 'C'];

export function OtbEstoqueMinimoConfig({ empresas }: OtbEstoqueMinimoConfigProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [configuracoes, setConfiguracoes] = useState<EstoqueMinimoConfig[]>([]);
  
  // Form para nova configuração
  const [novaConfig, setNovaConfig] = useState<Partial<EstoqueMinimoConfig>>({
    cod_empresa: undefined,
    categoria: 'TODOS',
    curva_abc: 'A',
    quantidade_minima: 1,
  });

  // Carregar configurações existentes
  useEffect(() => {
    if (open) {
      carregarConfiguracoes();
    }
  }, [open]);

  const carregarConfiguracoes = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('estoque_minimo_loja')
        .select('*')
        .order('cod_empresa', { ascending: true })
        .order('categoria', { ascending: true })
        .order('curva_abc', { ascending: true });
      
      if (error) throw error;
      setConfiguracoes(data || []);
    } catch (err) {
      console.error('Erro ao carregar configurações:', err);
      toast({
        title: 'Erro ao carregar',
        description: 'Não foi possível carregar as configurações',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const salvarConfiguracao = async () => {
    if (!novaConfig.cod_empresa) {
      toast({
        title: 'Selecione uma loja',
        variant: 'destructive',
      });
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from('estoque_minimo_loja')
        .upsert({
          cod_empresa: novaConfig.cod_empresa,
          categoria: novaConfig.categoria || 'TODOS',
          curva_abc: novaConfig.curva_abc || 'A',
          quantidade_minima: novaConfig.quantidade_minima || 1,
        }, {
          onConflict: 'cod_empresa,categoria,curva_abc',
        });
      
      if (error) throw error;
      
      toast({
        title: 'Configuração salva',
        description: 'Mínimo de estoque atualizado com sucesso',
      });
      
      carregarConfiguracoes();
      setNovaConfig({
        cod_empresa: novaConfig.cod_empresa,
        categoria: 'TODOS',
        curva_abc: 'A',
        quantidade_minima: 1,
      });
    } catch (err) {
      console.error('Erro ao salvar:', err);
      toast({
        title: 'Erro ao salvar',
        description: 'Não foi possível salvar a configuração',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const excluirConfiguracao = async (id: string) => {
    try {
      const { error } = await supabase
        .from('estoque_minimo_loja')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
      
      toast({
        title: 'Configuração excluída',
      });
      
      setConfiguracoes(prev => prev.filter(c => c.id !== id));
    } catch (err) {
      console.error('Erro ao excluir:', err);
      toast({
        title: 'Erro ao excluir',
        variant: 'destructive',
      });
    }
  };

  const getNomeLoja = (codEmpresa: number) => {
    const empresa = empresas.find(e => e.codEmpresa === codEmpresa);
    return empresa?.nome || `Loja ${codEmpresa}`;
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Settings className="h-4 w-4" />
          Mínimo por Loja
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Configuração de Estoque Mínimo</DialogTitle>
          <DialogDescription>
            Defina a quantidade mínima de estoque por loja, categoria e curva ABC.
            Esses valores são usados no cálculo OTB como piso mínimo.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Formulário de Nova Configuração */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Plus className="h-4 w-4" />
                Adicionar/Atualizar Configuração
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <div>
                  <Label className="text-xs">Loja</Label>
                  <Select
                    value={novaConfig.cod_empresa?.toString()}
                    onValueChange={(v) => setNovaConfig(prev => ({ ...prev, cod_empresa: parseInt(v) }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      {empresas.map(e => (
                        <SelectItem key={e.codEmpresa} value={e.codEmpresa.toString()}>
                          {e.nome || `Loja ${e.codEmpresa}`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-xs">Categoria</Label>
                  <Select
                    value={novaConfig.categoria}
                    onValueChange={(v) => setNovaConfig(prev => ({ ...prev, categoria: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORIAS.map(cat => (
                        <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-xs">Curva ABC</Label>
                  <Select
                    value={novaConfig.curva_abc}
                    onValueChange={(v) => setNovaConfig(prev => ({ ...prev, curva_abc: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CURVAS.map(curva => (
                        <SelectItem key={curva} value={curva}>Curva {curva}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-xs">Qtd Mínima</Label>
                  <Input
                    type="number"
                    min={0}
                    value={novaConfig.quantidade_minima}
                    onChange={(e) => setNovaConfig(prev => ({ ...prev, quantidade_minima: parseInt(e.target.value) || 0 }))}
                  />
                </div>

                <div className="flex items-end">
                  <Button 
                    onClick={salvarConfiguracao} 
                    disabled={saving}
                    className="w-full gap-2"
                  >
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Salvar
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Tabela de Configurações */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Configurações Existentes</CardTitle>
              <CardDescription>
                {configuracoes.length} configurações cadastradas
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : configuracoes.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Settings className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p>Nenhuma configuração cadastrada</p>
                  <p className="text-sm">Use o formulário acima para adicionar</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Loja</TableHead>
                      <TableHead>Categoria</TableHead>
                      <TableHead>Curva</TableHead>
                      <TableHead className="text-center">Qtd Mínima</TableHead>
                      <TableHead className="w-12"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {configuracoes.map(config => (
                      <TableRow key={config.id}>
                        <TableCell className="font-medium">
                          {getNomeLoja(config.cod_empresa)}
                        </TableCell>
                        <TableCell>{config.categoria}</TableCell>
                        <TableCell>
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                            config.curva_abc === 'A' ? 'bg-primary/10 text-primary' :
                            config.curva_abc === 'B' ? 'bg-amber-500/10 text-amber-600' :
                            'bg-slate-500/10 text-slate-600'
                          }`}>
                            Curva {config.curva_abc}
                          </span>
                        </TableCell>
                        <TableCell className="text-center font-medium">
                          {config.quantidade_minima}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => config.id && excluirConfiguracao(config.id)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  );
}
