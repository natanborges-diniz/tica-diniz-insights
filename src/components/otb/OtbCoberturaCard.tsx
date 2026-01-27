// src/components/otb/OtbCoberturaCard.tsx
// Card de Cobertura Atual do Estoque

import { useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Clock, AlertTriangle, CheckCircle2, TrendingDown } from 'lucide-react';
import type { OtbItem } from '@/hooks/useOtb';

interface OtbCoberturaCardProps {
  itens: OtbItem[];
  coberturaMeta: number;
}

interface CoberturaFaixa {
  label: string;
  min: number;
  max: number;
  color: string;
  icon: React.ReactNode;
}

const FAIXAS: CoberturaFaixa[] = [
  { label: 'Crítico', min: 0, max: 15, color: 'bg-destructive', icon: <AlertTriangle className="h-4 w-4" /> },
  { label: 'Baixo', min: 15, max: 30, color: 'bg-orange-500', icon: <TrendingDown className="h-4 w-4" /> },
  { label: 'Adequado', min: 30, max: 90, color: 'bg-primary', icon: <CheckCircle2 className="h-4 w-4" /> },
  { label: 'Excesso', min: 90, max: Infinity, color: 'bg-muted-foreground', icon: <Clock className="h-4 w-4" /> },
];

export function OtbCoberturaCard({ itens, coberturaMeta }: OtbCoberturaCardProps) {
  const metricas = useMemo(() => {
    if (itens.length === 0) {
      return { 
        coberturaMedia: 0, 
        distribuicao: { critico: 0, baixo: 0, adequado: 0, excesso: 0 },
        totalPecas: 0,
      };
    }

    let totalPecas = 0;
    let pesoCobertura = 0;
    const distribuicao = { critico: 0, baixo: 0, adequado: 0, excesso: 0 };

    itens.forEach(item => {
      const cobertura = item.coberturaAtual ?? 0;
      const pecas = item.estoqueAtual;
      
      totalPecas += pecas;
      pesoCobertura += cobertura * pecas;

      if (cobertura < 15) distribuicao.critico += pecas;
      else if (cobertura < 30) distribuicao.baixo += pecas;
      else if (cobertura <= coberturaMeta * 1.5) distribuicao.adequado += pecas;
      else distribuicao.excesso += pecas;
    });

    return {
      coberturaMedia: totalPecas > 0 ? pesoCobertura / totalPecas : 0,
      distribuicao,
      totalPecas,
    };
  }, [itens, coberturaMeta]);

  const coberturaMediaDias = Math.round(metricas.coberturaMedia);
  const statusCobertura = coberturaMediaDias < 15 ? 'critico' 
    : coberturaMediaDias < 30 ? 'baixo'
    : coberturaMediaDias <= coberturaMeta * 1.5 ? 'adequado'
    : 'excesso';

  const statusColors = {
    critico: 'text-destructive',
    baixo: 'text-warning',
    adequado: 'text-primary',
    excesso: 'text-muted-foreground',
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Clock className="h-5 w-5" />
              Cobertura Atual do Estoque
            </CardTitle>
            <CardDescription>
              Quantos dias o estoque atual pode sustentar as vendas
            </CardDescription>
          </div>
          <div className="text-right">
            <div className={`text-3xl font-bold ${statusColors[statusCobertura]}`}>
              {coberturaMediaDias}
            </div>
            <div className="text-xs text-muted-foreground">dias de cobertura</div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Barra de progresso visual */}
        <div className="mb-4">
          <div className="flex justify-between text-xs text-muted-foreground mb-1">
            <span>0 dias</span>
            <span className="text-primary font-medium">Meta: {coberturaMeta} dias</span>
            <span>{coberturaMeta * 2}+ dias</span>
          </div>
          <div className="relative">
            <Progress 
              value={Math.min((coberturaMediaDias / (coberturaMeta * 2)) * 100, 100)} 
              className="h-3"
            />
            {/* Marcador da meta */}
            <div 
              className="absolute top-0 h-3 w-0.5 bg-primary"
              style={{ left: '50%' }}
            />
          </div>
        </div>

        {/* Distribuição por faixa */}
        <div className="space-y-2">
          <p className="text-sm font-medium">Distribuição do estoque por faixa:</p>
          
          <div className="grid grid-cols-4 gap-2 text-center">
            <div className="p-2 rounded bg-destructive/10 border border-destructive/20">
              <div className="text-lg font-bold text-destructive">
                {metricas.distribuicao.critico.toLocaleString('pt-BR')}
              </div>
              <div className="text-xs text-muted-foreground">Crítico (&lt;15d)</div>
            </div>
            
            <div className="p-2 rounded bg-warning/10 border border-warning/20">
              <div className="text-lg font-bold text-warning">
                {metricas.distribuicao.baixo.toLocaleString('pt-BR')}
              </div>
              <div className="text-xs text-muted-foreground">Baixo (15-30d)</div>
            </div>
            
            <div className="p-2 rounded bg-primary/10 border border-primary/20">
              <div className="text-lg font-bold text-primary">
                {metricas.distribuicao.adequado.toLocaleString('pt-BR')}
              </div>
              <div className="text-xs text-muted-foreground">Adequado</div>
            </div>
            
            <div className="p-2 rounded bg-muted border">
              <div className="text-lg font-bold text-muted-foreground">
                {metricas.distribuicao.excesso.toLocaleString('pt-BR')}
              </div>
              <div className="text-xs text-muted-foreground">Excesso</div>
            </div>
          </div>

          {/* Percentuais */}
          {metricas.totalPecas > 0 && (
            <div className="flex flex-wrap gap-2 mt-2 text-xs">
              <Badge variant="outline" className="text-destructive border-destructive/30">
                {((metricas.distribuicao.critico / metricas.totalPecas) * 100).toFixed(1)}% crítico
              </Badge>
              <Badge variant="outline" className="text-warning border-warning/30">
                {((metricas.distribuicao.baixo / metricas.totalPecas) * 100).toFixed(1)}% baixo
              </Badge>
              <Badge variant="outline" className="text-primary border-primary/30">
                {((metricas.distribuicao.adequado / metricas.totalPecas) * 100).toFixed(1)}% adequado
              </Badge>
              <Badge variant="outline">
                {((metricas.distribuicao.excesso / metricas.totalPecas) * 100).toFixed(1)}% excesso
              </Badge>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
