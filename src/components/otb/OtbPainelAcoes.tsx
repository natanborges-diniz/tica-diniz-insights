// src/components/otb/OtbPainelAcoes.tsx
// Painel de Ações Priorizadas para o módulo OTB

import { useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  AlertTriangle, 
  TrendingDown, 
  Package, 
  DollarSign,
  ArrowRight,
  Flame,
  Snowflake,
  Target,
  AlertCircle
} from 'lucide-react';
import type { OtbItem, OtbMetrics } from '@/hooks/useOtb';

interface OtbPainelAcoesProps {
  itens: OtbItem[];
  metrics: OtbMetrics;
  coberturaDias: number;
  onFiltrarCategoria?: (classificacao: string) => void;
}

interface AcaoItem {
  tipo: 'RUPTURA' | 'CAPITAL_PARADO' | 'SAUDE_MIX';
  prioridade: number;
  titulo: string;
  descricao: string;
  justificativa: string;
  impacto: string;
  valor?: number;
  qtd: number;
  itens: OtbItem[];
  icon: React.ReactNode;
  cor: string;
  corBg: string;
}

export function OtbPainelAcoes({ itens, metrics, coberturaDias, onFiltrarCategoria }: OtbPainelAcoesProps) {
  
  const acoes = useMemo((): AcaoItem[] => {
    if (itens.length === 0) return [];
    
    const acoesList: AcaoItem[] = [];
    
    // =====================================================
    // 1. RUPTURA DE ESTOQUE - Produtos acabando
    // =====================================================
    
    // 1.1 Curva A em ruptura crítica (< 7 dias)
    const curvaACritico = itens.filter(i => 
      i.curvaABC === 'A' && 
      i.coberturaAtual < 7 && 
      i.qtdVendidos > 0
    );
    
    if (curvaACritico.length > 0) {
      const valorPerdaPotencial = curvaACritico.reduce((acc, i) => acc + i.totalVendido, 0);
      acoesList.push({
        tipo: 'RUPTURA',
        prioridade: 1,
        titulo: '🔥 Ruptura Iminente - Curva A',
        descricao: `${curvaACritico.length} produtos TOP de vendas com menos de 7 dias de estoque`,
        justificativa: 'Itens Curva A representam 80% do seu faturamento. Ruptura nesses itens causa perda direta de vendas.',
        impacto: `Potencial de perda: R$ ${(valorPerdaPotencial / 1000).toFixed(0)}k/período`,
        valor: valorPerdaPotencial,
        qtd: curvaACritico.length,
        itens: curvaACritico,
        icon: <Flame className="h-5 w-5" />,
        cor: 'text-red-600',
        corBg: 'bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-800',
      });
    }
    
    // 1.2 Compra urgente geral (< 15 dias)
    const compraUrgente = itens.filter(i => 
      i.classificacao === 'COMPRAR_URGENTE' &&
      !curvaACritico.includes(i)
    );
    
    if (compraUrgente.length > 0) {
      const investimentoNecessario = compraUrgente.reduce((acc, i) => acc + i.otbValor, 0);
      acoesList.push({
        tipo: 'RUPTURA',
        prioridade: 2,
        titulo: '⚠️ Estoque Baixo - Ação Necessária',
        descricao: `${compraUrgente.length} SKUs com menos de 15 dias de cobertura`,
        justificativa: 'Estoque abaixo do mínimo seguro pode gerar rupturas em dias de alta demanda.',
        impacto: `Investimento para repor: R$ ${(investimentoNecessario / 1000).toFixed(0)}k`,
        valor: investimentoNecessario,
        qtd: compraUrgente.length,
        itens: compraUrgente,
        icon: <AlertTriangle className="h-5 w-5" />,
        cor: 'text-orange-600',
        corBg: 'bg-orange-50 border-orange-200 dark:bg-orange-950/30 dark:border-orange-800',
      });
    }
    
    // =====================================================
    // 2. CAPITAL PARADO - Estoque excessivo
    // =====================================================
    
    // 2.1 Excesso em Curva C (produtos que não giram)
    const curvaCExcesso = itens.filter(i => 
      i.curvaABC === 'C' && 
      i.coberturaAtual > 180
    );
    
    if (curvaCExcesso.length > 0) {
      const capitalImobilizado = curvaCExcesso.reduce((acc, i) => acc + (i.estoqueAtual * i.precoCusto), 0);
      acoesList.push({
        tipo: 'CAPITAL_PARADO',
        prioridade: 3,
        titulo: '❄️ Capital Congelado - Curva C',
        descricao: `${curvaCExcesso.length} SKUs de baixo giro com +180 dias de estoque`,
        justificativa: 'Produtos Curva C com excesso representam capital que poderia estar em itens de alta demanda.',
        impacto: `Capital imobilizado: R$ ${(capitalImobilizado / 1000).toFixed(0)}k`,
        valor: capitalImobilizado,
        qtd: curvaCExcesso.length,
        itens: curvaCExcesso,
        icon: <Snowflake className="h-5 w-5" />,
        cor: 'text-blue-600',
        corBg: 'bg-blue-50 border-blue-200 dark:bg-blue-950/30 dark:border-blue-800',
      });
    }
    
    // 2.2 Excesso geral (> 2x cobertura)
    const excessoGeral = itens.filter(i => 
      i.classificacao === 'EXCESSO' &&
      !curvaCExcesso.includes(i)
    );
    
    if (excessoGeral.length > 0) {
      const capitalExcesso = excessoGeral.reduce((acc, i) => {
        const ideal = i.vendaDiaria * coberturaDias;
        const excesso = Math.max(0, i.estoqueAtual - ideal);
        return acc + (excesso * i.precoCusto);
      }, 0);
      
      acoesList.push({
        tipo: 'CAPITAL_PARADO',
        prioridade: 4,
        titulo: '📦 Estoque Acima do Ideal',
        descricao: `${excessoGeral.length} SKUs com estoque superior a 2x a meta de cobertura`,
        justificativa: 'Excesso de estoque compromete capital de giro e aumenta risco de obsolescência.',
        impacto: `Excesso estimado: R$ ${(capitalExcesso / 1000).toFixed(0)}k`,
        valor: capitalExcesso,
        qtd: excessoGeral.length,
        itens: excessoGeral,
        icon: <Package className="h-5 w-5" />,
        cor: 'text-slate-600',
        corBg: 'bg-slate-50 border-slate-200 dark:bg-slate-950/30 dark:border-slate-800',
      });
    }
    
    // =====================================================
    // 3. SAÚDE DO MIX - Oportunidades
    // =====================================================
    
    // 3.1 Curva A sem estoque (vendeu tudo)
    const curvaASemEstoque = itens.filter(i => 
      i.curvaABC === 'A' && 
      i.estoqueAtual === 0 &&
      i.qtdVendidos > 0
    );
    
    if (curvaASemEstoque.length > 0) {
      const potencialVendas = curvaASemEstoque.reduce((acc, i) => acc + (i.vendaDiaria * 30 * i.precoVendaFinal), 0);
      acoesList.push({
        tipo: 'SAUDE_MIX',
        prioridade: 2,
        titulo: '🎯 Oportunidade Perdida - Curva A Zerada',
        descricao: `${curvaASemEstoque.length} produtos TOP sem estoque - vendas sendo perdidas agora`,
        justificativa: 'Produtos campeões de venda zerados significam cliente indo para concorrência.',
        impacto: `Potencial perdido: R$ ${(potencialVendas / 1000).toFixed(0)}k/mês`,
        valor: potencialVendas,
        qtd: curvaASemEstoque.length,
        itens: curvaASemEstoque,
        icon: <Target className="h-5 w-5" />,
        cor: 'text-purple-600',
        corBg: 'bg-purple-50 border-purple-200 dark:bg-purple-950/30 dark:border-purple-800',
      });
    }
    
    // 3.2 Produtos sem venda há muito tempo mas com estoque
    const semVendaComEstoque = itens.filter(i => 
      i.diasDesdeUltimaVenda > 90 && 
      i.estoqueAtual > 0
    );
    
    if (semVendaComEstoque.length > 0) {
      const estoqueParado = semVendaComEstoque.reduce((acc, i) => acc + (i.estoqueAtual * i.precoCusto), 0);
      acoesList.push({
        tipo: 'SAUDE_MIX',
        prioridade: 5,
        titulo: '💤 Estoque Dormindo (+90 dias sem venda)',
        descricao: `${semVendaComEstoque.length} SKUs parados há mais de 3 meses`,
        justificativa: 'Produtos sem giro podem indicar problema de exposição, preço ou obsolescência.',
        impacto: `Valor parado: R$ ${(estoqueParado / 1000).toFixed(0)}k - considere promoção`,
        valor: estoqueParado,
        qtd: semVendaComEstoque.length,
        itens: semVendaComEstoque,
        icon: <AlertCircle className="h-5 w-5" />,
        cor: 'text-amber-600',
        corBg: 'bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-800',
      });
    }
    
    return acoesList.sort((a, b) => a.prioridade - b.prioridade);
  }, [itens, coberturaDias]);

  // Resumo por pilar
  const resumoPilares = useMemo(() => {
    const ruptura = acoes.filter(a => a.tipo === 'RUPTURA');
    const capital = acoes.filter(a => a.tipo === 'CAPITAL_PARADO');
    const saude = acoes.filter(a => a.tipo === 'SAUDE_MIX');
    
    return {
      ruptura: {
        qtd: ruptura.reduce((acc, a) => acc + a.qtd, 0),
        valor: ruptura.reduce((acc, a) => acc + (a.valor || 0), 0),
      },
      capital: {
        qtd: capital.reduce((acc, a) => acc + a.qtd, 0),
        valor: capital.reduce((acc, a) => acc + (a.valor || 0), 0),
      },
      saude: {
        qtd: saude.reduce((acc, a) => acc + a.qtd, 0),
        valor: saude.reduce((acc, a) => acc + (a.valor || 0), 0),
      },
    };
  }, [acoes]);

  if (itens.length === 0) return null;

  return (
    <div className="space-y-4">
      {/* Cards Resumo dos 3 Pilares */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Pilar 1: Ruptura */}
        <Card className="border-2 border-red-200 dark:border-red-800 bg-gradient-to-br from-red-50 to-white dark:from-red-950/20 dark:to-background">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2 text-red-700 dark:text-red-400">
                <TrendingDown className="h-5 w-5" />
                Risco de Ruptura
              </CardTitle>
              <Badge variant="destructive" className="text-lg px-3">
                {resumoPilares.ruptura.qtd}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              R$ {(resumoPilares.ruptura.valor / 1000).toFixed(0)}k
            </div>
            <p className="text-xs text-muted-foreground">em potencial de perda/investimento</p>
            <Progress 
              value={Math.min((resumoPilares.ruptura.qtd / metrics.totalSkus) * 100, 100)} 
              className="mt-2 h-2 bg-red-100"
            />
          </CardContent>
        </Card>

        {/* Pilar 2: Capital Parado */}
        <Card className="border-2 border-blue-200 dark:border-blue-800 bg-gradient-to-br from-blue-50 to-white dark:from-blue-950/20 dark:to-background">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2 text-blue-700 dark:text-blue-400">
                <DollarSign className="h-5 w-5" />
                Capital Parado
              </CardTitle>
              <Badge className="text-lg px-3 bg-blue-600">
                {resumoPilares.capital.qtd}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              R$ {(resumoPilares.capital.valor / 1000).toFixed(0)}k
            </div>
            <p className="text-xs text-muted-foreground">imobilizado em excesso de estoque</p>
            <Progress 
              value={Math.min((resumoPilares.capital.qtd / metrics.totalSkus) * 100, 100)} 
              className="mt-2 h-2 bg-blue-100"
            />
          </CardContent>
        </Card>

        {/* Pilar 3: Saúde do Mix */}
        <Card className="border-2 border-purple-200 dark:border-purple-800 bg-gradient-to-br from-purple-50 to-white dark:from-purple-950/20 dark:to-background">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2 text-purple-700 dark:text-purple-400">
                <Target className="h-5 w-5" />
                Saúde do Mix
              </CardTitle>
              <Badge className="text-lg px-3 bg-purple-600">
                {resumoPilares.saude.qtd}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-600">
              R$ {(resumoPilares.saude.valor / 1000).toFixed(0)}k
            </div>
            <p className="text-xs text-muted-foreground">em oportunidades e problemas de giro</p>
            <Progress 
              value={Math.min((resumoPilares.saude.qtd / metrics.totalSkus) * 100, 100)} 
              className="mt-2 h-2 bg-purple-100"
            />
          </CardContent>
        </Card>
      </div>

      {/* Lista de Ações Priorizadas */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-primary" />
            Painel de Ações - O que fazer agora?
          </CardTitle>
          <CardDescription>
            Ações priorizadas por impacto no negócio - mais urgentes primeiro
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[400px] pr-4">
            <div className="space-y-3">
              {acoes.map((acao, index) => (
                <Card key={index} className={`${acao.corBg} border transition-all hover:shadow-md`}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3 flex-1">
                        <div className={`${acao.cor} mt-0.5`}>
                          {acao.icon}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="font-semibold text-sm">{acao.titulo}</h4>
                            <Badge variant="outline" className="text-xs">
                              {acao.qtd} SKUs
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground mt-1">
                            {acao.descricao}
                          </p>
                          <div className="mt-2 p-2 bg-background/50 rounded text-xs">
                            <strong>Por quê?</strong> {acao.justificativa}
                          </div>
                          <p className="text-sm font-medium mt-2 text-primary">
                            {acao.impacto}
                          </p>
                        </div>
                      </div>
                      <Button 
                        size="sm" 
                        variant="outline"
                        className="shrink-0"
                        onClick={() => onFiltrarCategoria?.(acao.tipo)}
                      >
                        Ver itens
                        <ArrowRight className="h-4 w-4 ml-1" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
              
              {acoes.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  <Package className="h-12 w-12 mx-auto mb-2 opacity-30" />
                  <p>Parabéns! Nenhuma ação urgente identificada.</p>
                  <p className="text-sm">Seu estoque está saudável.</p>
                </div>
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
