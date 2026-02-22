// src/components/otb/OtbPainelAcoes.tsx
// Painel de Ações Priorizadas para o módulo OTB - Baseado em Mínimo por Loja

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

export function OtbPainelAcoes({ itens, metrics, onFiltrarCategoria }: OtbPainelAcoesProps) {
  
  const acoes = useMemo((): AcaoItem[] => {
    if (itens.length === 0) return [];
    
    const acoesList: AcaoItem[] = [];
    
    // =====================================================
    // 1. RUPTURA DE ESTOQUE
    // =====================================================
    
    const curvaACritico = itens.filter(i => 
      i.curvaABC === 'A' && 
      i.estoqueMinimo > 0 &&
      i.estoqueAtual < i.estoqueMinimo * 0.3
    );
    
    if (curvaACritico.length > 0) {
      const valorPerdaPotencial = curvaACritico.reduce((acc, i) => acc + i.totalVendido, 0);
      acoesList.push({
        tipo: 'RUPTURA',
        prioridade: 1,
        titulo: '🔥 Ruptura Iminente - Curva A',
        descricao: `${curvaACritico.length} produtos TOP com menos de 30% do mínimo configurado`,
        justificativa: 'Itens Curva A representam 80% do seu faturamento. Ruptura nesses itens causa perda direta de vendas.',
        impacto: `Potencial de perda: R$ ${(valorPerdaPotencial / 1000).toFixed(0)}k/período`,
        valor: valorPerdaPotencial,
        qtd: curvaACritico.length,
        itens: curvaACritico,
        icon: <Flame className="h-5 w-5" />,
        cor: 'text-danger',
        corBg: 'bg-danger-soft border-danger-muted',
      });
    }
    
    const compraUrgente = itens.filter(i => 
      i.classificacao === 'COMPRAR_URGENTE' &&
      !curvaACritico.includes(i)
    );
    
    if (compraUrgente.length > 0) {
      const investimentoNecessario = compraUrgente.reduce((acc, i) => acc + i.otbValor, 0);
      acoesList.push({
        tipo: 'RUPTURA',
        prioridade: 2,
        titulo: '⚠️ Estoque Abaixo do Mínimo',
        descricao: `${compraUrgente.length} SKUs precisam de reposição urgente`,
        justificativa: 'Estoque abaixo do mínimo configurado pode gerar rupturas.',
        impacto: `Investimento para repor: R$ ${(investimentoNecessario / 1000).toFixed(0)}k`,
        valor: investimentoNecessario,
        qtd: compraUrgente.length,
        itens: compraUrgente,
        icon: <AlertTriangle className="h-5 w-5" />,
        cor: 'text-warning',
        corBg: 'bg-warning-soft border-warning-muted',
      });
    }
    
    // =====================================================
    // 2. CAPITAL PARADO
    // =====================================================
    
    const curvaCExcesso = itens.filter(i => 
      i.curvaABC === 'C' && 
      i.diasDesdeUltimaVenda > 180
    );
    
    if (curvaCExcesso.length > 0) {
      const capitalImobilizado = curvaCExcesso.reduce((acc, i) => acc + (i.estoqueAtual * i.precoCusto), 0);
      acoesList.push({
        tipo: 'CAPITAL_PARADO',
        prioridade: 3,
        titulo: '❄️ Capital Congelado - Curva C',
        descricao: `${curvaCExcesso.length} SKUs de baixo giro parados há +180 dias`,
        justificativa: 'Produtos Curva C parados representam capital que poderia estar em itens de alta demanda.',
        impacto: `Capital imobilizado: R$ ${(capitalImobilizado / 1000).toFixed(0)}k`,
        valor: capitalImobilizado,
        qtd: curvaCExcesso.length,
        itens: curvaCExcesso,
        icon: <Snowflake className="h-5 w-5" />,
        cor: 'text-info',
        corBg: 'bg-info-soft border-info-muted',
      });
    }
    
    const excessoGeral = itens.filter(i => 
      i.classificacao === 'EXCESSO' &&
      !curvaCExcesso.includes(i)
    );
    
    if (excessoGeral.length > 0) {
      const capitalExcesso = excessoGeral.reduce((acc, i) => {
        const excesso = Math.max(0, i.estoqueAtual - (i.estoqueMinimo * 2));
        return acc + (excesso * i.precoCusto);
      }, 0);
      
      acoesList.push({
        tipo: 'CAPITAL_PARADO',
        prioridade: 4,
        titulo: '📦 Estoque Acima do Ideal',
        descricao: `${excessoGeral.length} SKUs com estoque superior a 2x o mínimo`,
        justificativa: 'Excesso de estoque compromete capital de giro e aumenta risco de obsolescência.',
        impacto: `Excesso estimado: R$ ${(capitalExcesso / 1000).toFixed(0)}k`,
        valor: capitalExcesso,
        qtd: excessoGeral.length,
        itens: excessoGeral,
        icon: <Package className="h-5 w-5" />,
        cor: 'text-neutral-600',
        corBg: 'bg-neutral-100 border-neutral-200',
      });
    }
    
    // =====================================================
    // 3. SAÚDE DO MIX
    // =====================================================
    
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
        cor: 'text-chart-4',
        corBg: 'bg-chart-4/10 border-chart-4/30',
      });
    }
    
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
        cor: 'text-warning',
        corBg: 'bg-warning-soft border-warning-muted',
      });
    }
    
    return acoesList.sort((a, b) => a.prioridade - b.prioridade);
  }, [itens]);

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
        <Card className="border-2 border-danger-muted bg-gradient-to-br from-danger-soft to-background">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2 text-danger">
                <TrendingDown className="h-5 w-5" />
                Risco de Ruptura
              </CardTitle>
              <Badge variant="destructive" className="text-lg px-3">
                {resumoPilares.ruptura.qtd}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-danger">
              R$ {(resumoPilares.ruptura.valor / 1000).toFixed(0)}k
            </div>
            <p className="text-xs text-muted-foreground">em potencial de perda/investimento</p>
            <Progress 
              value={Math.min((resumoPilares.ruptura.qtd / metrics.totalSkus) * 100, 100)} 
              className="mt-2 h-2 bg-danger-soft"
            />
          </CardContent>
        </Card>

        {/* Pilar 2: Capital Parado */}
        <Card className="border-2 border-info-muted bg-gradient-to-br from-info-soft to-background">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2 text-info">
                <DollarSign className="h-5 w-5" />
                Capital Parado
              </CardTitle>
              <Badge className="text-lg px-3 bg-info text-info-foreground">
                {resumoPilares.capital.qtd}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-info">
              R$ {(resumoPilares.capital.valor / 1000).toFixed(0)}k
            </div>
            <p className="text-xs text-muted-foreground">imobilizado em excesso de estoque</p>
            <Progress 
              value={Math.min((resumoPilares.capital.qtd / metrics.totalSkus) * 100, 100)} 
              className="mt-2 h-2 bg-info-soft"
            />
          </CardContent>
        </Card>

        {/* Pilar 3: Saúde do Mix */}
        <Card className="border-2 border-chart-4/30 bg-gradient-to-br from-chart-4/5 to-background">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2 text-chart-4">
                <Target className="h-5 w-5" />
                Saúde do Mix
              </CardTitle>
              <Badge className="text-lg px-3 bg-chart-4 text-white">
                {resumoPilares.saude.qtd}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-chart-4">
              R$ {(resumoPilares.saude.valor / 1000).toFixed(0)}k
            </div>
            <p className="text-xs text-muted-foreground">em oportunidades e problemas de giro</p>
            <Progress 
              value={Math.min((resumoPilares.saude.qtd / metrics.totalSkus) * 100, 100)} 
              className="mt-2 h-2 bg-chart-4/10"
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
