// src/components/otb/OtbResumoVisual.tsx
// Cards visuais de resumo do estoque com indicadores coloridos

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { 
  Package, 
  TrendingUp,
  TrendingDown,
  Clock,
  DollarSign,
  BarChart3,
  Layers
} from "lucide-react";
import type { OtbMetrics, OtbItem } from "@/hooks/useOtb";
import { useMemo } from "react";

interface OtbResumoVisualProps {
  metrics: OtbMetrics;
  itens: OtbItem[];
  coberturaDias: number;
}

export function OtbResumoVisual({ metrics, itens, coberturaDias }: OtbResumoVisualProps) {
  
  const indicadores = useMemo(() => {
    if (itens.length === 0) return null;
    
    // Estoque total em valor
    const estoqueValor = itens.reduce((acc, i) => acc + (i.estoqueAtual * i.precoCusto), 0);
    
    // Giro médio
    const giroMedio = itens.reduce((acc, i) => acc + i.giroEstoque, 0) / itens.length;
    
    // Cobertura média
    const coberturaMedia = itens.reduce((acc, i) => acc + Math.min(i.coberturaAtual, 365), 0) / itens.length;
    
    // Margem média ponderada
    const totalVendido = itens.reduce((acc, i) => acc + i.totalVendido, 0);
    const margemPonderada = totalVendido > 0 
      ? itens.reduce((acc, i) => acc + (i.margemBruta * i.totalVendido), 0) / totalVendido
      : 0;
    
    // % do estoque em cada situação
    const totalPecas = metrics.totalEstoque;
    const pecasUrgente = itens.filter(i => i.classificacao === 'COMPRAR_URGENTE').reduce((acc, i) => acc + i.estoqueAtual, 0);
    const pecasComprar = itens.filter(i => i.classificacao === 'COMPRAR').reduce((acc, i) => acc + i.estoqueAtual, 0);
    const pecasOk = itens.filter(i => i.classificacao === 'ESTOQUE_OK').reduce((acc, i) => acc + i.estoqueAtual, 0);
    const pecasExcesso = itens.filter(i => i.classificacao === 'EXCESSO').reduce((acc, i) => acc + i.estoqueAtual, 0);
    
    // Curva ABC em valor
    const curvaAValor = itens.filter(i => i.curvaABC === 'A').reduce((acc, i) => acc + (i.estoqueAtual * i.precoCusto), 0);
    const curvaBValor = itens.filter(i => i.curvaABC === 'B').reduce((acc, i) => acc + (i.estoqueAtual * i.precoCusto), 0);
    const curvaCValor = itens.filter(i => i.curvaABC === 'C').reduce((acc, i) => acc + (i.estoqueAtual * i.precoCusto), 0);
    
    return {
      estoqueValor,
      giroMedio,
      coberturaMedia,
      margemPonderada,
      distribuicao: {
        urgente: { pecas: pecasUrgente, pct: (pecasUrgente / totalPecas) * 100 },
        comprar: { pecas: pecasComprar, pct: (pecasComprar / totalPecas) * 100 },
        ok: { pecas: pecasOk, pct: (pecasOk / totalPecas) * 100 },
        excesso: { pecas: pecasExcesso, pct: (pecasExcesso / totalPecas) * 100 },
      },
      curvaABC: {
        a: { valor: curvaAValor, pct: (curvaAValor / estoqueValor) * 100 },
        b: { valor: curvaBValor, pct: (curvaBValor / estoqueValor) * 100 },
        c: { valor: curvaCValor, pct: (curvaCValor / estoqueValor) * 100 },
      }
    };
  }, [itens, metrics]);

  if (!indicadores) return null;

  return (
    <div className="space-y-4">
      {/* Linha 1: KPIs Principais */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Estoque Total */}
        <Card className="bg-gradient-to-br from-primary/5 to-background border-primary/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Package className="h-4 w-4 text-primary" />
              Estoque Total
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">
              {metrics.totalEstoque.toLocaleString('pt-BR')}
            </div>
            <p className="text-xs text-muted-foreground">
              {metrics.totalSkus.toLocaleString('pt-BR')} SKUs
            </p>
          </CardContent>
        </Card>

        {/* Valor em Estoque */}
        <Card className="bg-gradient-to-br from-emerald-500/5 to-background border-emerald-500/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-emerald-600" />
              Valor em Estoque
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600">
              R$ {(indicadores.estoqueValor / 1000).toFixed(0)}k
            </div>
            <p className="text-xs text-muted-foreground">
              a preço de custo
            </p>
          </CardContent>
        </Card>

        {/* Giro Médio */}
        <Card className="bg-gradient-to-br from-amber-500/5 to-background border-amber-500/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-amber-600" />
              Giro Médio
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">
              {indicadores.giroMedio.toFixed(1)}x
            </div>
            <p className="text-xs text-muted-foreground">
              no período analisado
            </p>
          </CardContent>
        </Card>

        {/* Cobertura Média */}
        <Card className="bg-gradient-to-br from-blue-500/5 to-background border-blue-500/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Clock className="h-4 w-4 text-blue-600" />
              Cobertura Média
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              {Math.round(indicadores.coberturaMedia)} dias
            </div>
            <p className="text-xs text-muted-foreground">
              meta: {coberturaDias} dias
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Linha 2: Distribuição Visual */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Saúde do Estoque */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Saúde do Estoque (por peças)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {/* Barra empilhada */}
            <div className="flex h-8 rounded-lg overflow-hidden mb-3">
              <div 
                className="bg-red-500 transition-all" 
                style={{ width: `${indicadores.distribuicao.urgente.pct}%` }}
                title={`Urgente: ${indicadores.distribuicao.urgente.pct.toFixed(1)}%`}
              />
              <div 
                className="bg-orange-400 transition-all" 
                style={{ width: `${indicadores.distribuicao.comprar.pct}%` }}
                title={`Comprar: ${indicadores.distribuicao.comprar.pct.toFixed(1)}%`}
              />
              <div 
                className="bg-emerald-500 transition-all" 
                style={{ width: `${indicadores.distribuicao.ok.pct}%` }}
                title={`OK: ${indicadores.distribuicao.ok.pct.toFixed(1)}%`}
              />
              <div 
                className="bg-slate-400 transition-all" 
                style={{ width: `${indicadores.distribuicao.excesso.pct}%` }}
                title={`Excesso: ${indicadores.distribuicao.excesso.pct.toFixed(1)}%`}
              />
            </div>
            
            {/* Legenda */}
            <div className="grid grid-cols-4 gap-2 text-xs">
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded bg-red-500" />
                <span>Urgente</span>
                <span className="font-medium ml-auto">{indicadores.distribuicao.urgente.pct.toFixed(0)}%</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded bg-orange-400" />
                <span>Comprar</span>
                <span className="font-medium ml-auto">{indicadores.distribuicao.comprar.pct.toFixed(0)}%</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded bg-emerald-500" />
                <span>OK</span>
                <span className="font-medium ml-auto">{indicadores.distribuicao.ok.pct.toFixed(0)}%</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded bg-slate-400" />
                <span>Excesso</span>
                <span className="font-medium ml-auto">{indicadores.distribuicao.excesso.pct.toFixed(0)}%</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Curva ABC */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Layers className="h-4 w-4" />
              Distribuição Curva ABC (por valor)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {/* Barra empilhada */}
            <div className="flex h-8 rounded-lg overflow-hidden mb-3">
              <div 
                className="bg-primary transition-all" 
                style={{ width: `${indicadores.curvaABC.a.pct}%` }}
                title={`Curva A: ${indicadores.curvaABC.a.pct.toFixed(1)}%`}
              />
              <div 
                className="bg-primary/60 transition-all" 
                style={{ width: `${indicadores.curvaABC.b.pct}%` }}
                title={`Curva B: ${indicadores.curvaABC.b.pct.toFixed(1)}%`}
              />
              <div 
                className="bg-primary/30 transition-all" 
                style={{ width: `${indicadores.curvaABC.c.pct}%` }}
                title={`Curva C: ${indicadores.curvaABC.c.pct.toFixed(1)}%`}
              />
            </div>
            
            {/* Legenda */}
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded bg-primary" />
                  <span className="font-medium">Curva A</span>
                </div>
                <p className="text-muted-foreground pl-4">
                  R$ {(indicadores.curvaABC.a.valor / 1000).toFixed(0)}k ({indicadores.curvaABC.a.pct.toFixed(0)}%)
                </p>
              </div>
              <div>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded bg-primary/60" />
                  <span className="font-medium">Curva B</span>
                </div>
                <p className="text-muted-foreground pl-4">
                  R$ {(indicadores.curvaABC.b.valor / 1000).toFixed(0)}k ({indicadores.curvaABC.b.pct.toFixed(0)}%)
                </p>
              </div>
              <div>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded bg-primary/30" />
                  <span className="font-medium">Curva C</span>
                </div>
                <p className="text-muted-foreground pl-4">
                  R$ {(indicadores.curvaABC.c.valor / 1000).toFixed(0)}k ({indicadores.curvaABC.c.pct.toFixed(0)}%)
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
