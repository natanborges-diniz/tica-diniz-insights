// src/components/otb/OtbMinimoLojaConfig.tsx
// Configuração de mínimo de peças por loja/categoria

import { useState } from 'react';
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
  DialogFooter,
} from '@/components/ui/dialog';
import { 
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Settings2, Store, Save, Info } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

export interface MinimoLojaConfig {
  codEmpresa: number;
  nomeEmpresa: string;
  minimoArmacoes: number;
  minimoLentes: number;
  minimoAcessorios: number;
}

interface OtbMinimoLojaConfigProps {
  empresas: { codEmpresa: number; nome: string }[];
  configuracoes: MinimoLojaConfig[];
  onSave: (configs: MinimoLojaConfig[]) => void;
}

const DEFAULT_MINIMOS = {
  armacoes: 200,
  lentes: 100,
  acessorios: 50,
};

export function OtbMinimoLojaConfig({ 
  empresas, 
  configuracoes, 
  onSave 
}: OtbMinimoLojaConfigProps) {
  const [open, setOpen] = useState(false);
  const [configs, setConfigs] = useState<MinimoLojaConfig[]>(() => {
    // Inicializar com configurações existentes ou padrão
    return empresas.map(emp => {
      const existente = configuracoes.find(c => c.codEmpresa === emp.codEmpresa);
      return existente || {
        codEmpresa: emp.codEmpresa,
        nomeEmpresa: emp.nome,
        minimoArmacoes: DEFAULT_MINIMOS.armacoes,
        minimoLentes: DEFAULT_MINIMOS.lentes,
        minimoAcessorios: DEFAULT_MINIMOS.acessorios,
      };
    });
  });

  const handleChange = (
    codEmpresa: number, 
    campo: 'minimoArmacoes' | 'minimoLentes' | 'minimoAcessorios', 
    valor: number
  ) => {
    setConfigs(prev => prev.map(c => 
      c.codEmpresa === codEmpresa ? { ...c, [campo]: valor } : c
    ));
  };

  const handleSave = () => {
    onSave(configs);
    setOpen(false);
    toast({
      title: "Configurações salvas",
      description: "Os mínimos por loja foram atualizados",
    });
  };

  const handleAplicarPadrao = () => {
    setConfigs(prev => prev.map(c => ({
      ...c,
      minimoArmacoes: DEFAULT_MINIMOS.armacoes,
      minimoLentes: DEFAULT_MINIMOS.lentes,
      minimoAcessorios: DEFAULT_MINIMOS.acessorios,
    })));
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Settings2 className="h-4 w-4" />
          Mínimo por Loja
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Store className="h-5 w-5" />
            Configurar Mínimo de Peças por Loja
          </DialogTitle>
          <DialogDescription>
            Defina a quantidade mínima de peças que cada loja deve manter por categoria.
            O OTB usará o maior valor entre: mínimo configurado ou cobertura calculada.
          </DialogDescription>
        </DialogHeader>

        <div className="p-4 bg-muted/50 rounded-lg border mb-4">
          <div className="flex items-start gap-2">
            <Info className="h-4 w-4 mt-0.5 text-muted-foreground" />
            <div className="text-sm text-muted-foreground">
              <p><strong>Exemplo:</strong> Se você configurar mínimo de 200 armações e a cobertura 
              calculada sugere 150, o sistema indicará compra de 200.</p>
              <p className="mt-1">Isso garante que as prateleiras nunca fiquem vazias, 
              independente do ritmo de vendas.</p>
            </div>
          </div>
        </div>

        <div className="flex justify-end mb-4">
          <Button variant="ghost" size="sm" onClick={handleAplicarPadrao}>
            Aplicar padrão em todas
          </Button>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Loja</TableHead>
              <TableHead className="text-center">Mín. Armações</TableHead>
              <TableHead className="text-center">Mín. Lentes</TableHead>
              <TableHead className="text-center">Mín. Acessórios</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {configs.map((config) => (
              <TableRow key={config.codEmpresa}>
                <TableCell className="font-medium">{config.nomeEmpresa}</TableCell>
                <TableCell>
                  <Input
                    type="number"
                    min={0}
                    step={10}
                    value={config.minimoArmacoes}
                    onChange={(e) => handleChange(
                      config.codEmpresa, 
                      'minimoArmacoes', 
                      parseInt(e.target.value) || 0
                    )}
                    className="w-24 text-center mx-auto"
                  />
                </TableCell>
                <TableCell>
                  <Input
                    type="number"
                    min={0}
                    step={10}
                    value={config.minimoLentes}
                    onChange={(e) => handleChange(
                      config.codEmpresa, 
                      'minimoLentes', 
                      parseInt(e.target.value) || 0
                    )}
                    className="w-24 text-center mx-auto"
                  />
                </TableCell>
                <TableCell>
                  <Input
                    type="number"
                    min={0}
                    step={10}
                    value={config.minimoAcessorios}
                    onChange={(e) => handleChange(
                      config.codEmpresa, 
                      'minimoAcessorios', 
                      parseInt(e.target.value) || 0
                    )}
                    className="w-24 text-center mx-auto"
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} className="gap-2">
            <Save className="h-4 w-4" />
            Salvar Configurações
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
