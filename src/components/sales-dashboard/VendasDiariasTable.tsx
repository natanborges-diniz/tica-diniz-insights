// src/components/sales-dashboard/VendasDiariasTable.tsx
// Tabela expansível de vendas diárias
// Nível 1: Mostra resumo por dia com formas de pagamento
// Nível 2: Ao expandir, mostra detalhes individuais

import { useState, useEffect, useMemo } from "react";
import { ChevronDown, ChevronRight, RefreshCw, AlertCircle, Banknote, CreditCard, Smartphone, Wallet } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { ResumoDiario, DetalheDia } from "@/hooks/useVendasDiarias";
import { AuditoriaLight } from "@/services/auditoriaService";

// ============================================
// INTERFACES
// ============================================

interface VendasDiariasTableProps {
  resumosDiarios: ResumoDiario[];
  loading: boolean;
  error: string | null;
  onExpandir: (data: string, codEmpresa: number) => void;
  onRecolher: (data: string, codEmpresa: number) => void;
  isExpanded: (data: string, codEmpresa: number) => boolean;
  getDetalhes: (data: string, codEmpresa: number) => DetalheDia | undefined;
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

function DetalhesExpandidos({ detalhes }: { detalhes: DetalheDia }) {
  if (detalhes.carregando) {
    return (
      <div className="p-4 bg-muted/30 space-y-2">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <RefreshCw className="h-4 w-4 animate-spin" />
          Carregando detalhes...
        </div>
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-8 w-full" />
        ))}
      </div>
    );
  }
  
  if (detalhes.erro) {
    return (
      <div className="p-4 bg-muted/30">
        <Alert variant="destructive" className="bg-destructive/10">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{detalhes.erro}</AlertDescription>
        </Alert>
      </div>
    );
  }
  
  if (detalhes.itens.length === 0) {
    return (
      <div className="p-4 bg-muted/30 text-center text-muted-foreground text-sm">
        Nenhum detalhe encontrado para este dia.
      </div>
    );
  }
  
  // Agrupar por vendedor
  const porVendedor = detalhes.itens.reduce((acc, item) => {
    const vendedor = item.vendedor || 'Sem vendedor';
    if (!acc[vendedor]) acc[vendedor] = [];
    acc[vendedor].push(item);
    return acc;
  }, {} as Record<string, AuditoriaLight[]>);
  
  return (
    <div className="p-4 bg-muted/30 space-y-3">
      <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        Detalhes por Vendedor
      </div>
      <div className="grid gap-2">
        {Object.entries(porVendedor).map(([vendedor, itens]) => {
          const totalVendedor = itens.reduce((sum, i) => sum + i.totalLiquido, 0);
          const qtdVendas = itens.reduce((sum, i) => sum + i.qtdVendas, 0);
          
          return (
            <div key={vendedor} className="bg-background rounded-md p-3 border">
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium text-sm">{vendedor}</span>
                <div className="flex items-center gap-3 text-sm">
                  <span className="text-muted-foreground">{qtdVendas} vendas</span>
                  <span className="font-semibold text-primary">{formatarMoeda(totalVendedor)}</span>
                </div>
              </div>
              <div className="flex flex-wrap gap-1">
                {itens.map((item, idx) => (
                  <Badge 
                    key={idx} 
                    variant="outline" 
                    className={cn("text-xs", getCorFormaPagamento(item.formaPagamento))}
                  >
                    {item.formaPagamento}: {formatarMoeda(item.totalLiquido)}
                  </Badge>
                ))}
              </div>
            </div>
          );
        })}
      </div>
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
  onExpandir,
  onRecolher,
  isExpanded,
  getDetalhes,
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
    mapa.forEach((resumos, data) => {
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
          <CardTitle className="text-lg">Vendas por Dia</CardTitle>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="flex items-center justify-between">
              <span>{error}</span>
              {onReload && (
                <Button variant="outline" size="sm" onClick={onReload}>
                  <RefreshCw className="h-3 w-3 mr-1" />
                  Tentar novamente
                </Button>
              )}
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  if (resumosDiarios.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Vendas por Dia</CardTitle>
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
          <CardTitle className="text-lg">Vendas por Dia</CardTitle>
          <Badge variant="secondary" className="font-normal">
            {diasAgrupados.length} dias • {resumosDiarios.length} registros
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          Clique em uma linha para ver os detalhes por vendedor
        </p>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y">
          {diasAgrupados.map(([data, resumos]) => (
            <div key={data}>
              {resumos.map((resumo) => {
                const expanded = isExpanded(resumo.data, resumo.codEmpresa);
                const detalhes = getDetalhes(resumo.data, resumo.codEmpresa);
                
                return (
                  <div key={`${resumo.data}-${resumo.codEmpresa}`}>
                    <button
                      className={cn(
                        "w-full px-4 py-3 hover:bg-muted/50 transition-colors text-left flex items-start gap-3",
                        expanded && "bg-muted/30"
                      )}
                      onClick={() => {
                        if (expanded) {
                          onRecolher(resumo.data, resumo.codEmpresa);
                        } else {
                          onExpandir(resumo.data, resumo.codEmpresa);
                        }
                      }}
                    >
                      {/* Ícone de expansão */}
                      <div className="mt-1 text-muted-foreground">
                        {expanded ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                      </div>
                      
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
                    </button>
                    
                    {/* Detalhes expandidos */}
                    {expanded && detalhes && (
                      <DetalhesExpandidos detalhes={detalhes} />
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
