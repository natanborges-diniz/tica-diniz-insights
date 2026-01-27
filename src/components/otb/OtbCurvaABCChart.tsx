// src/components/otb/OtbCurvaABCChart.tsx
// Gráfico visual de Curva ABC - Giro vs Estoque

import { useMemo } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, AlertTriangle, Package } from 'lucide-react';
import type { OtbItem } from '@/hooks/useOtb';

interface OtbCurvaABCChartProps {
  itens: OtbItem[];
  onCurvaClick?: (curva: 'A' | 'B' | 'C' | null) => void;
  selectedCurva?: 'A' | 'B' | 'C' | null;
}

const CURVA_COLORS = {
  A: 'hsl(142, 76%, 36%)', // Verde - Alto giro
  B: 'hsl(48, 96%, 53%)',  // Amarelo - Giro médio
  C: 'hsl(0, 84%, 60%)',   // Vermelho - Baixo giro
};

const CURVA_LABELS = {
  A: 'Alto Giro (A)',
  B: 'Giro Médio (B)',
  C: 'Baixo Giro (C)',
};

export function OtbCurvaABCChart({ itens, onCurvaClick, selectedCurva }: OtbCurvaABCChartProps) {
  // Calcular distribuição por curva ABC
  const distribuicao = useMemo(() => {
    const curvaA = itens.filter(i => i.curvaABC === 'A');
    const curvaB = itens.filter(i => i.curvaABC === 'B');
    const curvaC = itens.filter(i => i.curvaABC === 'C');

    return {
      A: {
        skus: curvaA.length,
        estoque: curvaA.reduce((acc, i) => acc + i.estoqueAtual, 0),
        vendas: curvaA.reduce((acc, i) => acc + i.totalVendido, 0),
        otb: curvaA.reduce((acc, i) => acc + i.otb, 0),
      },
      B: {
        skus: curvaB.length,
        estoque: curvaB.reduce((acc, i) => acc + i.estoqueAtual, 0),
        vendas: curvaB.reduce((acc, i) => acc + i.totalVendido, 0),
        otb: curvaB.reduce((acc, i) => acc + i.otb, 0),
      },
      C: {
        skus: curvaC.length,
        estoque: curvaC.reduce((acc, i) => acc + i.estoqueAtual, 0),
        vendas: curvaC.reduce((acc, i) => acc + i.totalVendido, 0),
        otb: curvaC.reduce((acc, i) => acc + i.otb, 0),
      },
    };
  }, [itens]);

  const totalEstoque = distribuicao.A.estoque + distribuicao.B.estoque + distribuicao.C.estoque;
  const totalVendas = distribuicao.A.vendas + distribuicao.B.vendas + distribuicao.C.vendas;

  // Dados para gráfico de pizza
  const pieDataEstoque = [
    { name: 'A - Alto Giro', value: distribuicao.A.estoque, curva: 'A' as const },
    { name: 'B - Giro Médio', value: distribuicao.B.estoque, curva: 'B' as const },
    { name: 'C - Baixo Giro', value: distribuicao.C.estoque, curva: 'C' as const },
  ].filter(d => d.value > 0);

  const pieDataVendas = [
    { name: 'A - Alto Giro', value: distribuicao.A.vendas, curva: 'A' as const },
    { name: 'B - Giro Médio', value: distribuicao.B.vendas, curva: 'B' as const },
    { name: 'C - Baixo Giro', value: distribuicao.C.vendas, curva: 'C' as const },
  ].filter(d => d.value > 0);

  // Dados para comparativo de barras
  const barData = [
    {
      categoria: 'Alto Giro (A)',
      curva: 'A' as const,
      '% Estoque': totalEstoque > 0 ? (distribuicao.A.estoque / totalEstoque) * 100 : 0,
      '% Vendas': totalVendas > 0 ? (distribuicao.A.vendas / totalVendas) * 100 : 0,
    },
    {
      categoria: 'Giro Médio (B)',
      curva: 'B' as const,
      '% Estoque': totalEstoque > 0 ? (distribuicao.B.estoque / totalEstoque) * 100 : 0,
      '% Vendas': totalVendas > 0 ? (distribuicao.B.vendas / totalVendas) * 100 : 0,
    },
    {
      categoria: 'Baixo Giro (C)',
      curva: 'C' as const,
      '% Estoque': totalEstoque > 0 ? (distribuicao.C.estoque / totalEstoque) * 100 : 0,
      '% Vendas': totalVendas > 0 ? (distribuicao.C.vendas / totalVendas) * 100 : 0,
    },
  ];

  const handleClick = (curva: 'A' | 'B' | 'C') => {
    if (onCurvaClick) {
      onCurvaClick(selectedCurva === curva ? null : curva);
    }
  };

  // Identificar problema: muito estoque C, pouco estoque A
  const percEstoqueC = totalEstoque > 0 ? (distribuicao.C.estoque / totalEstoque) * 100 : 0;
  const percVendasC = totalVendas > 0 ? (distribuicao.C.vendas / totalVendas) * 100 : 0;
  const temProblemaEstoque = percEstoqueC > 40 || (percEstoqueC > percVendasC * 2);

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Curva ABC - Qualidade do Estoque
            </CardTitle>
            <CardDescription>
              Classificação por velocidade de giro dos produtos
            </CardDescription>
          </div>
          {temProblemaEstoque && (
            <Badge variant="destructive" className="gap-1">
              <AlertTriangle className="h-3 w-3" />
              Estoque desbalanceado
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {/* Resumo rápido */}
        <div className="grid grid-cols-3 gap-4 mb-4">
          {(['A', 'B', 'C'] as const).map((curva) => (
            <button
              key={curva}
              onClick={() => handleClick(curva)}
              className={`p-3 rounded-lg border-2 transition-all cursor-pointer hover:shadow-md ${
                selectedCurva === curva 
                  ? 'border-primary shadow-md' 
                  : 'border-transparent bg-muted/50'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span 
                  className="text-lg font-bold"
                  style={{ color: CURVA_COLORS[curva] }}
                >
                  Curva {curva}
                </span>
                <Badge variant="outline">{distribuicao[curva].skus} SKUs</Badge>
              </div>
              <div className="text-xs text-muted-foreground">
                <div className="flex justify-between">
                  <span>Estoque:</span>
                  <span>{distribuicao[curva].estoque.toLocaleString('pt-BR')} pçs</span>
                </div>
                <div className="flex justify-between">
                  <span>OTB:</span>
                  <span className={distribuicao[curva].otb > 0 ? 'text-primary font-medium' : ''}>
                    {distribuicao[curva].otb.toLocaleString('pt-BR')} pçs
                  </span>
                </div>
              </div>
            </button>
          ))}
        </div>

        <Tabs defaultValue="comparativo" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="comparativo">Comparativo</TabsTrigger>
            <TabsTrigger value="estoque">Estoque</TabsTrigger>
            <TabsTrigger value="vendas">Vendas</TabsTrigger>
          </TabsList>

          <TabsContent value="comparativo" className="mt-4">
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={barData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
                <YAxis dataKey="categoria" type="category" width={100} tick={{ fontSize: 11 }} />
                <Tooltip 
                  formatter={(value: number) => `${value.toFixed(1)}%`}
                  labelStyle={{ color: 'hsl(var(--foreground))' }}
                />
                <Legend />
                <Bar 
                  dataKey="% Estoque" 
                  fill="hsl(var(--muted-foreground))" 
                  name="% do Estoque" 
                  radius={[0, 4, 4, 0]}
                />
                <Bar 
                  dataKey="% Vendas" 
                  fill="hsl(var(--primary))" 
                  name="% das Vendas" 
                  radius={[0, 4, 4, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
            {temProblemaEstoque && (
              <div className="mt-3 p-3 bg-destructive/10 rounded-lg border border-destructive/20">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-destructive mt-0.5" />
                  <div className="text-sm">
                    <p className="font-medium text-destructive">Atenção: Estoque concentrado em itens de baixo giro</p>
                    <p className="text-muted-foreground">
                      {percEstoqueC.toFixed(0)}% do estoque está em produtos Curva C (baixo giro), 
                      que representam apenas {percVendasC.toFixed(0)}% das vendas. 
                      Considere liquidar estes itens e investir em Curva A.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="estoque" className="mt-4">
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={pieDataEstoque}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={2}
                  dataKey="value"
                  onClick={(data) => handleClick(data.curva)}
                  style={{ cursor: 'pointer' }}
                >
                  {pieDataEstoque.map((entry) => (
                    <Cell 
                      key={entry.curva} 
                      fill={CURVA_COLORS[entry.curva]}
                      opacity={selectedCurva && selectedCurva !== entry.curva ? 0.3 : 1}
                    />
                  ))}
                </Pie>
                <Tooltip 
                  formatter={(value: number) => `${value.toLocaleString('pt-BR')} peças`}
                />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </TabsContent>

          <TabsContent value="vendas" className="mt-4">
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={pieDataVendas}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={2}
                  dataKey="value"
                  onClick={(data) => handleClick(data.curva)}
                  style={{ cursor: 'pointer' }}
                >
                  {pieDataVendas.map((entry) => (
                    <Cell 
                      key={entry.curva} 
                      fill={CURVA_COLORS[entry.curva]}
                      opacity={selectedCurva && selectedCurva !== entry.curva ? 0.3 : 1}
                    />
                  ))}
                </Pie>
                <Tooltip 
                  formatter={(value: number) => 
                    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
                  }
                />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </TabsContent>
        </Tabs>

        {/* Legenda */}
        <div className="mt-4 pt-4 border-t text-xs text-muted-foreground space-y-1">
          <p><strong>Curva A:</strong> Produtos com alto giro (&gt;80% das vendas em ~20% SKUs) - Prioridade de reposição</p>
          <p><strong>Curva B:</strong> Produtos com giro médio (~15% das vendas) - Reposição normal</p>
          <p><strong>Curva C:</strong> Produtos com baixo giro ou parados (&lt;5% vendas) - Avaliar liquidação</p>
        </div>
      </CardContent>
    </Card>
  );
}
