import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RefreshCw, Calendar, Building2, Loader2, AlertTriangle } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useEmpresas } from '@/hooks/useEmpresas';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface SalesFiltersProps {
  dataInicio: string;
  dataFim: string;
  empresa: string;
  onDataInicioChange: (value: string) => void;
  onDataFimChange: (value: string) => void;
  onEmpresaChange: (value: string) => void;
  onRefresh: () => void;
  isLoading?: boolean;
  /** Alerta para períodos longos */
  alertaPeriodo?: string | null;
}

export function SalesFilters({
  dataInicio,
  dataFim,
  empresa,
  onDataInicioChange,
  onDataFimChange,
  onEmpresaChange,
  onRefresh,
  isLoading,
  alertaPeriodo
}: SalesFiltersProps) {
  const { empresas, isLoading: empresasLoading } = useEmpresas();

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-end gap-4">
            {/* Filtro de Empresa */}
            <div className="flex flex-col gap-2">
              <Label className="flex items-center gap-1">
                <Building2 className="h-4 w-4" />
                Empresa
              </Label>
              <Select
                value={empresa}
                onValueChange={onEmpresaChange}
                disabled={empresasLoading}
              >
                <SelectTrigger className="w-[200px]">
                  {empresasLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <SelectValue placeholder="Selecione" />
                  )}
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Todas as Empresas</SelectItem>
                  {empresas.map((e) => (
                    <SelectItem key={e.codEmpresa} value={String(e.codEmpresa)}>
                      {e.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Filtro de Data Início */}
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
            
            {/* Filtro de Data Fim */}
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
          
          {/* OTIMIZAÇÃO 3: Alerta para períodos longos */}
          {alertaPeriodo && (
            <Alert variant="default" className="border-yellow-500/50 bg-yellow-500/10">
              <AlertTriangle className="h-4 w-4 text-yellow-600" />
              <AlertDescription className="text-yellow-700">
                {alertaPeriodo}
              </AlertDescription>
            </Alert>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
