// src/components/sales-dashboard/VendasDiariasTable.tsx
// Tabela de vendas diárias - apenas resumo por dia (sem expansão)

import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertCircle, RefreshCw, CreditCard, Banknote, Smartphone, Wallet, Calendar } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ResumoDiario } from '@/hooks/useVendasDiarias';

// ============================================
// INTERFACES
// ============================================

interface VendasDiariasTableProps {
  resumosDiarios: ResumoDiario[];
  loading: boolean;
  error: string | null;
  onReload?: () => void;
}

// ============================================
// HELPERS
// ============================================

function formatarMoeda(valor: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(valor);
}

function formatarData(data: string): string {
  const d = new Date(data + 'T12:00:00');
  return d.toLocaleDateString('pt-BR', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
  });
}

function getIconeFormaPagamento(forma: string) {
  const formaUpper = forma.toUpperCase();
  if (formaUpper.includes('DINHEIRO')) return Banknote;
  if (formaUpper.includes('CARTAO') || formaUpper.includes('CARTÃO') || formaUpper.includes('CREDITO') || formaUpper.includes('DÉBITO')) return CreditCard;
  if (formaUpper.includes('PIX')) return Smartphone;
  return Wallet;
}

function getCorFormaPagamento(forma: string): string {
  const formaUpper = forma.toUpperCase();
  if (formaUpper.includes('DINHEIRO')) return 'bg-green-500/10 text-green-700 dark:text-green-400';
  if (formaUpper.includes('PIX')) return 'bg-teal-500/10 text-teal-700 dark:text-teal-400';
  if (formaUpper.includes('CARTAO') || formaUpper.includes('CARTÃO')) {
    if (formaUpper.includes('CREDITO') || formaUpper.includes('CRÉDITO')) return 'bg-blue-500/10 text-blue-700 dark:text-blue-400';
    if (formaUpper.includes('DEBITO') || formaUpper.includes('DÉBITO')) return 'bg-purple-500/10 text-purple-700 dark:text-purple-400';
    return 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-400';
  }
  if (formaUpper.includes('DEVOLUCAO') || formaUpper.includes('DEVOLUÇÃO')) return 'bg-red-500/10 text-red-700 dark:text-red-400';
  if (formaUpper.includes('CREDITO') && !formaUpper.includes('CARTAO')) return 'bg-amber-500/10 text-amber-700 dark:text-amber-400';
  return 'bg-gray-500/10 text-gray-700 dark:text-gray-400';
}

// ============================================
// COMPONENTES AUXILIARES
// ============================================

function FormasPagamentoBadges({ formasPagamento }: { formasPagamento: ResumoDiario['formasPagamento'] }) {
  // Ordenar por valor total (maior primeiro)
  const formasOrdenadas = Object.entries(formasPagamento)
    .sort((a, b) => b[1].totalVendido - a[1].totalVendido)
    .slice(0, 4); // Mostrar apenas as 4 principais
  
  const temMais = Object.keys(formasPagamento).length > 4;
  
  return (
    <div className="flex flex-wrap gap-1.5">
      {formasOrdenadas.map(([forma, valores]) => {
        const Icon = getIconeFormaPagamento(forma);
        return (
          <Badge 
            key={forma} 
            variant="secondary" 
            className={cn("text-xs font-normal gap-1", getCorFormaPagamento(forma))}
          >
            <Icon className="h-3 w-3" />
            <span className="hidden sm:inline">{forma}</span>
            <span className="font-medium">{formatarMoeda(valores.totalVendido)}</span>
          </Badge>
        );
      })}
      {temMais && (
        <Badge variant="outline" className="text-xs">
          +{Object.keys(formasPagamento).length - 4}
        </Badge>
      )}
    </div>
  );
}

// ============================================
// COMPONENTE PRINCIPAL
// ============================================

export function VendasDiariasTable({
  resumosDiarios,
  loading,
  error,
  onReload,
}: VendasDiariasTableProps) {
  // Agrupar por data (todas as lojas no mesmo dia)
  const diasAgrupados = useMemo(() => {
    const mapa = new Map<string, ResumoDiario[]>();
    
    resumosDiarios.forEach((r) => {
      const existing = mapa.get(r.data) || [];
      existing.push(r);
      mapa.set(r.data, existing);
    });
    
    // Ordenar cada grupo por total
    mapa.forEach((resumos) => {
      resumos.sort((a, b) => b.totalDia - a.totalDia);
    });
    
    return Array.from(mapa.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [resumosDiarios]);

  if (loading && resumosDiarios.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <RefreshCw className="h-4 w-4 animate-spin" />
            Carregando vendas diárias...
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Vendas por Dia
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <AlertCircle className="h-10 w-10 text-destructive mb-3" />
            <p className="text-destructive font-medium mb-2">Erro ao carregar dados</p>
            <p className="text-muted-foreground text-sm mb-4">{error}</p>
            {onReload && (
              <Button variant="outline" size="sm" onClick={onReload}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Tentar novamente
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (resumosDiarios.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Vendas por Dia
          </CardTitle>
        </CardHeader>
        <CardContent className="text-center py-8 text-muted-foreground">
          Nenhum dado diário disponível para este período.
          <br />
          <span className="text-sm">Os dados são sincronizados automaticamente a cada dia.</span>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Vendas por Dia
          </CardTitle>
          <Badge variant="secondary" className="font-normal">
            {diasAgrupados.length} dias • {resumosDiarios.length} registros
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y">
          {diasAgrupados.map(([data, resumos]) => (
            <div key={data}>
              {resumos.map((resumo) => (
                <div
                  key={`${resumo.data}-${resumo.codEmpresa}`}
                  className="px-4 py-3 hover:bg-muted/50 transition-colors flex items-start gap-3"
                >
                  {/* Data e Loja */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-sm">
                        {formatarData(resumo.data)}
                      </span>
                      <span className="text-muted-foreground">•</span>
                      <span className="text-sm text-muted-foreground truncate">
                        {resumo.empresa}
                      </span>
                    </div>
                    
                    {/* Formas de pagamento */}
                    <FormasPagamentoBadges formasPagamento={resumo.formasPagamento} />
                  </div>
                  
                  {/* Totais */}
                  <div className="text-right shrink-0">
                    <div className="font-semibold text-primary">
                      {formatarMoeda(resumo.totalDia)}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {resumo.qtdVendasDia} vendas
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
