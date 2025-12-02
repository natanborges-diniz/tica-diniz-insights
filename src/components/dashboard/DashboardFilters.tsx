import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';

interface Loja {
  id_loja: number;
  nome: string;
}

interface DashboardFiltersProps {
  dataInicio: string;
  dataFim: string;
  lojaId?: number;
  lojas: Loja[];
  onDataInicioChange: (value: string) => void;
  onDataFimChange: (value: string) => void;
  onLojaChange: (value: number | undefined) => void;
  onRefresh: () => void;
  isLoading?: boolean;
}

export function DashboardFilters({
  dataInicio,
  dataFim,
  lojaId,
  lojas,
  onDataInicioChange,
  onDataFimChange,
  onLojaChange,
  onRefresh,
  isLoading,
}: DashboardFiltersProps) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex flex-wrap gap-4 items-end">
          <div className="flex-1 min-w-[150px]">
            <Label htmlFor="dataInicio" className="text-sm font-medium">
              Data Início
            </Label>
            <Input
              id="dataInicio"
              type="date"
              value={dataInicio}
              onChange={(e) => onDataInicioChange(e.target.value)}
              className="mt-1"
            />
          </div>

          <div className="flex-1 min-w-[150px]">
            <Label htmlFor="dataFim" className="text-sm font-medium">
              Data Fim
            </Label>
            <Input
              id="dataFim"
              type="date"
              value={dataFim}
              onChange={(e) => onDataFimChange(e.target.value)}
              className="mt-1"
            />
          </div>

          <div className="flex-1 min-w-[200px]">
            <Label htmlFor="loja" className="text-sm font-medium">
              Loja
            </Label>
            <Select 
              value={lojaId?.toString() || 'todas'} 
              onValueChange={(v) => onLojaChange(v === 'todas' ? undefined : parseInt(v))}
            >
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Todas as lojas" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas as lojas</SelectItem>
                {lojas.map((loja) => (
                  <SelectItem key={loja.id_loja} value={loja.id_loja.toString()}>
                    {loja.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button onClick={onRefresh} disabled={isLoading} variant="outline">
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
