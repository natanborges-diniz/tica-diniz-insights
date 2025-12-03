import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RefreshCw, Calendar } from 'lucide-react';

interface SalesFiltersProps {
  dataInicio: string;
  dataFim: string;
  onDataInicioChange: (value: string) => void;
  onDataFimChange: (value: string) => void;
  onRefresh: () => void;
  isLoading?: boolean;
}

export function SalesFilters({
  dataInicio,
  dataFim,
  onDataInicioChange,
  onDataFimChange,
  onRefresh,
  isLoading
}: SalesFiltersProps) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="dataInicio" className="flex items-center gap-1">
              <Calendar className="h-4 w-4" />
              Data Início
            </Label>
            <Input
              id="dataInicio"
              type="date"
              value={dataInicio}
              onChange={(e) => onDataInicioChange(e.target.value)}
              className="w-[160px]"
            />
          </div>
          
          <div className="flex flex-col gap-2">
            <Label htmlFor="dataFim" className="flex items-center gap-1">
              <Calendar className="h-4 w-4" />
              Data Fim
            </Label>
            <Input
              id="dataFim"
              type="date"
              value={dataFim}
              onChange={(e) => onDataFimChange(e.target.value)}
              className="w-[160px]"
            />
          </div>
          
          <Button 
            onClick={onRefresh} 
            disabled={isLoading}
            className="flex items-center gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
