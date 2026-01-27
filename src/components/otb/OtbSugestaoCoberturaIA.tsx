// src/components/otb/OtbSugestaoCoberturaIA.tsx
// Componente para sugestão de cobertura ideal via IA com comparativo de mínimos

import { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { 
  Sparkles, 
  Loader2, 
  RefreshCw, 
  CheckCircle2, 
  AlertTriangle, 
  Info,
  ArrowRight,
  Settings
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import type { OtbItem } from '@/hooks/useOtb';

interface OtbSugestaoCoberturaIAProps {
  itens: OtbItem[];
  coberturaAtual: number;
  codEmpresa?: number;
  onSugestaoCoberturaChange?: (dias: number) => void;
}

interface SugestaoCategoria {
  categoria: string;
  diasSugeridos: number;
  justificativa: string;
  confianca: 'alta' | 'media' | 'baixa';
}

interface ResultadoIA {
  resumo: string;
  sugestoes: SugestaoCategoria[];
  coberturaGlobalSugerida: number;
  alertas: string[];
}

interface ConfigMinimo {
  categoria: string;
  curva_abc: string;
  quantidade_minima: number;
}

// Tipo para a tabela comparativa
interface ComparativoLinha {
  categoria: string;
  curva: string;
  minimoAtual: number | null;
  minimoSugerido: number | null;
  diferenca: number;
  status: 'igual' | 'aumentar' | 'diminuir' | 'novo';
}

export function OtbSugestaoCoberturaIA({ 
  itens, 
  coberturaAtual,
  codEmpresa,
  onSugestaoCoberturaChange 
}: OtbSugestaoCoberturaIAProps) {
  const [loading, setLoading] = useState(false);
  const [resultado, setResultado] = useState<ResultadoIA | null>(null);
  const [configMinimos, setConfigMinimos] = useState<ConfigMinimo[]>([]);
  const [loadingMinimos, setLoadingMinimos] = useState(false);
  const [ultimoFiltroHash, setUltimoFiltroHash] = useState<string>('');

  // Hash para detectar mudanças nos itens (baseado em quantidade e categorias)
  const filtroHash = useMemo(() => {
    if (itens.length === 0) return '';
    const categorias = [...new Set(itens.map(i => i.tipo.split(' ')[0]))].sort().join(',');
    return `${itens.length}-${categorias}`;
  }, [itens]);

  // Limpar resultado da IA quando os filtros mudam
  useEffect(() => {
    if (filtroHash !== ultimoFiltroHash && filtroHash !== '') {
      setResultado(null);
      setUltimoFiltroHash(filtroHash);
    }
  }, [filtroHash, ultimoFiltroHash]);

  // Carregar configurações de mínimo da loja atual
  useEffect(() => {
    const carregarMinimos = async () => {
      if (!codEmpresa) return;
      
      setLoadingMinimos(true);
      try {
        const { data, error } = await supabase
          .from('estoque_minimo_loja')
          .select('categoria, curva_abc, quantidade_minima')
          .eq('cod_empresa', codEmpresa);
        
        if (error) throw error;
        setConfigMinimos(data || []);
      } catch (err) {
        console.error('[OtbSugestaoCoberturaIA] Erro ao carregar mínimos:', err);
      } finally {
        setLoadingMinimos(false);
      }
    };
    
    carregarMinimos();
  }, [codEmpresa]);

  // Calcular mínimos sugeridos com base nos dados de vendas
  const minimosSugeridos = useMemo(() => {
    if (itens.length === 0) return [];
    
    const sugestoes: { categoria: string; curva: string; minimo: number }[] = [];
    
    // Agrupar itens por categoria e curva
    const grupos = new Map<string, OtbItem[]>();
    
    itens.forEach(item => {
      const tipoNorm = (item.tipo || '').toUpperCase().trim();
      const categoria = tipoNorm.startsWith('AR ') || tipoNorm === 'AR' || tipoNorm.includes('ARMAC') ? 'ARMACOES'
        : tipoNorm.startsWith('LG ') || tipoNorm.startsWith('GC ') || tipoNorm === 'LG' || tipoNorm === 'GC' || tipoNorm.includes('LENT') ? 'LENTES'
        : tipoNorm.startsWith('AC ') || tipoNorm === 'AC' || tipoNorm.includes('ACESS') ? 'ACESSORIOS'
        : 'OUTROS';
      
      const chave = `${categoria}|${item.curvaABC}`;
      const existente = grupos.get(chave) || [];
      existente.push(item);
      grupos.set(chave, existente);
    });
    
    // Calcular sugestão de mínimo para cada grupo
    grupos.forEach((itensGrupo, chave) => {
      const [categoria, curva] = chave.split('|');
      
      // Lógica de sugestão baseada em dados reais:
      // - Curva A: garantir estoque para não perder vendas (maior mínimo)
      // - Curva B: equilíbrio
      // - Curva C: mínimo para exposição
      
      // Calcular média de venda diária do grupo
      const vendaDiariaMedia = itensGrupo.reduce((acc, i) => acc + i.vendaDiaria, 0) / itensGrupo.length;
      
      // Calcular cobertura média atual
      const coberturaMedia = itensGrupo.reduce((acc, i) => acc + Math.min(i.coberturaAtual, 365), 0) / itensGrupo.length;
      
      // Quantos SKUs estão em ruptura (<15 dias)?
      const skusEmRuptura = itensGrupo.filter(i => i.coberturaAtual < 15).length;
      const percRuptura = (skusEmRuptura / itensGrupo.length) * 100;
      
      // Sugestão de mínimo:
      // Base: 1 para todos
      // Curva A: mínimo 2-3 para garantir exposição
      // Curva B: mínimo 1-2
      // Curva C: mínimo 1
      // Se há muita ruptura, aumentar
      
      let minimoBase = 1;
      if (curva === 'A') {
        minimoBase = 3;
        if (percRuptura > 20) minimoBase = 4; // Muita ruptura em curva A = problema
      } else if (curva === 'B') {
        minimoBase = 2;
        if (percRuptura > 30) minimoBase = 3;
      } else {
        minimoBase = 1;
      }
      
      // Se categoria específica tem giro muito alto, aumentar
      if (vendaDiariaMedia > 0.5) {
        minimoBase += 1;
      }
      
      sugestoes.push({
        categoria,
        curva,
        minimo: minimoBase,
      });
    });
    
    return sugestoes;
  }, [itens]);

  // Gerar tabela comparativa
  const comparativo = useMemo((): ComparativoLinha[] => {
    const linhas: ComparativoLinha[] = [];
    const categoriasOrdem = ['ARMACOES', 'LENTES', 'ACESSORIOS', 'TODOS'];
    const curvasOrdem = ['A', 'B', 'C'];
    
    // Todas as combinações possíveis
    categoriasOrdem.forEach(cat => {
      curvasOrdem.forEach(curva => {
        const configAtual = configMinimos.find(c => c.categoria === cat && c.curva_abc === curva);
        const sugestao = minimosSugeridos.find(s => s.categoria === cat && s.curva === curva);
        
        // Só mostrar se tem config ou sugestão
        if (configAtual || sugestao) {
          const atual = configAtual?.quantidade_minima ?? null;
          const sugerido = sugestao?.minimo ?? null;
          
          let diferenca = 0;
          let status: ComparativoLinha['status'] = 'igual';
          
          if (atual === null && sugerido !== null) {
            status = 'novo';
            diferenca = sugerido;
          } else if (atual !== null && sugerido !== null) {
            diferenca = sugerido - atual;
            if (diferenca > 0) status = 'aumentar';
            else if (diferenca < 0) status = 'diminuir';
          }
          
          linhas.push({
            categoria: cat,
            curva,
            minimoAtual: atual,
            minimoSugerido: sugerido,
            diferenca,
            status,
          });
        }
      });
    });
    
    return linhas;
  }, [configMinimos, minimosSugeridos]);

  const solicitarSugestao = async () => {
    if (itens.length === 0) {
      toast({
        title: "Dados insuficientes",
        description: "Carregue os dados do OTB primeiro",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      // Preparar métricas agregadas por tipo/categoria
      const porTipo = new Map<string, {
        qtdSkus: number;
        estoqueTotal: number;
        vendaTotal: number;
        coberturaMedia: number;
        skusCurvaA: number;
        skusCurvaC: number;
      }>();

      itens.forEach(item => {
        const tipo = item.tipo.split(' ')[0] || 'OUTROS';
        const existente = porTipo.get(tipo) || {
          qtdSkus: 0,
          estoqueTotal: 0,
          vendaTotal: 0,
          coberturaMedia: 0,
          skusCurvaA: 0,
          skusCurvaC: 0,
        };
        
        existente.qtdSkus++;
        existente.estoqueTotal += item.estoqueAtual;
        existente.vendaTotal += item.totalVendido;
        existente.coberturaMedia += item.coberturaAtual;
        if (item.curvaABC === 'A') existente.skusCurvaA++;
        if (item.curvaABC === 'C') existente.skusCurvaC++;
        
        porTipo.set(tipo, existente);
      });

      const categorias = Array.from(porTipo.entries()).map(([tipo, dados]) => ({
        tipo,
        qtdSkus: dados.qtdSkus,
        estoqueTotal: dados.estoqueTotal,
        vendaTotal: dados.vendaTotal,
        coberturaMedia: dados.qtdSkus > 0 ? dados.coberturaMedia / dados.qtdSkus : 0,
        percCurvaA: dados.qtdSkus > 0 ? (dados.skusCurvaA / dados.qtdSkus) * 100 : 0,
        percCurvaC: dados.qtdSkus > 0 ? (dados.skusCurvaC / dados.qtdSkus) * 100 : 0,
      }));

      const totalSkus = itens.length;
      const totalEstoque = itens.reduce((acc, i) => acc + i.estoqueAtual, 0);
      const totalVendido = itens.reduce((acc, i) => acc + i.totalVendido, 0);
      const coberturaMediaGeral = itens.reduce((acc, i) => acc + i.coberturaAtual, 0) / totalSkus;

      const { data, error } = await supabase.functions.invoke('ai-sugestao-cobertura', {
        body: {
          coberturaAtualConfig: coberturaAtual,
          totalSkus,
          totalEstoque,
          totalVendido,
          coberturaMediaGeral,
          categorias,
        }
      });

      if (error) throw error;

      setResultado(data);
      
      toast({
        title: "Sugestão gerada",
        description: `IA sugere cobertura de ${data.coberturaGlobalSugerida} dias`,
      });
    } catch (err) {
      console.error('[OtbSugestaoCoberturaIA] Erro:', err);
      toast({
        title: "Erro ao gerar sugestão",
        description: err instanceof Error ? err.message : "Erro desconhecido",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const aplicarSugestao = (dias: number) => {
    if (onSugestaoCoberturaChange) {
      onSugestaoCoberturaChange(dias);
      toast({
        title: "Cobertura atualizada",
        description: `Cobertura alterada para ${dias} dias`,
      });
    }
  };

  const getConfiancaColor = (confianca: string) => {
    switch (confianca) {
      case 'alta': return 'bg-primary';
      case 'media': return 'bg-warning';
      case 'baixa': return 'bg-muted';
      default: return 'bg-muted';
    }
  };

  const getStatusBadge = (status: ComparativoLinha['status']) => {
    switch (status) {
      case 'aumentar':
        return <Badge className="bg-warning text-warning-foreground">↑ Aumentar</Badge>;
      case 'diminuir':
        return <Badge variant="secondary">↓ Diminuir</Badge>;
      case 'novo':
        return <Badge className="bg-primary">+ Novo</Badge>;
      default:
        return <Badge variant="outline">= OK</Badge>;
    }
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Sparkles className="h-5 w-5 text-primary" />
              Mínimo Configurado vs Sugerido
            </CardTitle>
            <CardDescription>
              Comparativo entre configuração atual e sugestão baseada em dados reais
            </CardDescription>
          </div>
          <Button 
            onClick={solicitarSugestao} 
            disabled={loading || itens.length === 0}
            variant={resultado ? "outline" : "default"}
            className="gap-2"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : resultado ? (
              <RefreshCw className="h-4 w-4" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            {loading ? 'Analisando...' : resultado ? 'Atualizar IA' : 'Análise IA'}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {(loading || loadingMinimos) && (
          <div className="space-y-3">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-20 w-full" />
          </div>
        )}

        {!loading && !loadingMinimos && itens.length > 0 && (
          <div className="space-y-4">
            {/* Tabela Comparativa */}
            {comparativo.length > 0 ? (
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead>Categoria</TableHead>
                      <TableHead>Curva</TableHead>
                      <TableHead className="text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Settings className="h-3 w-3" />
                          Atual
                        </div>
                      </TableHead>
                      <TableHead className="text-center">
                        <ArrowRight className="h-3 w-3 mx-auto" />
                      </TableHead>
                      <TableHead className="text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Sparkles className="h-3 w-3" />
                          Sugerido
                        </div>
                      </TableHead>
                      <TableHead className="text-center">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {comparativo.map((linha, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="font-medium">{linha.categoria}</TableCell>
                        <TableCell>
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                            linha.curva === 'A' ? 'bg-primary/10 text-primary' :
                            linha.curva === 'B' ? 'bg-amber-500/10 text-amber-600' :
                            'bg-slate-500/10 text-slate-600'
                          }`}>
                            Curva {linha.curva}
                          </span>
                        </TableCell>
                        <TableCell className="text-center">
                          {linha.minimoAtual !== null ? (
                            <span className="font-mono">{linha.minimoAtual}</span>
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center text-muted-foreground">
                          →
                        </TableCell>
                        <TableCell className="text-center">
                          {linha.minimoSugerido !== null ? (
                            <span className="font-mono font-medium text-primary">
                              {linha.minimoSugerido}
                            </span>
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          {getStatusBadge(linha.status)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="text-center py-6 text-muted-foreground border rounded-lg">
                <Settings className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">Nenhuma configuração ou sugestão disponível</p>
                <p className="text-xs mt-1">
                  Configure mínimos por loja ou carregue dados para gerar sugestões
                </p>
              </div>
            )}

            {/* Resultado da IA (se disponível) */}
            {resultado && (
              <>
                {/* Resumo */}
                <div className="p-3 bg-muted/50 rounded-lg">
                  <p className="text-sm">{resultado.resumo}</p>
                </div>

                {/* Sugestão Global de Cobertura */}
                <div className="flex items-center justify-between p-4 bg-primary/5 border border-primary/20 rounded-lg">
                  <div>
                    <div className="text-sm text-muted-foreground">Cobertura Sugerida (dias)</div>
                    <div className="text-3xl font-bold text-primary">
                      {resultado.coberturaGlobalSugerida} dias
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      Atual: {coberturaAtual} dias
                      {resultado.coberturaGlobalSugerida !== coberturaAtual && (
                        <span className={resultado.coberturaGlobalSugerida > coberturaAtual ? 'text-warning' : 'text-primary'}>
                          {' '}({resultado.coberturaGlobalSugerida > coberturaAtual ? '+' : ''}
                          {resultado.coberturaGlobalSugerida - coberturaAtual} dias)
                        </span>
                      )}
                    </div>
                  </div>
                  {onSugestaoCoberturaChange && resultado.coberturaGlobalSugerida !== coberturaAtual && (
                    <Button 
                      onClick={() => aplicarSugestao(resultado.coberturaGlobalSugerida)}
                      className="gap-2"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      Aplicar
                    </Button>
                  )}
                </div>

                {/* Alertas */}
                {resultado.alertas.length > 0 && (
                  <div className="space-y-2">
                    {resultado.alertas.map((alerta, idx) => (
                      <div key={idx} className="flex items-start gap-2 text-sm text-warning">
                        <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                        <span>{alerta}</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {/* Dica sobre configuração */}
            {comparativo.some(c => c.status === 'novo' || c.status === 'aumentar') && (
              <div className="flex items-start gap-2 p-3 bg-muted/30 rounded text-sm">
                <Info className="h-4 w-4 mt-0.5 text-muted-foreground flex-shrink-0" />
                <p className="text-muted-foreground">
                  Para aplicar os mínimos sugeridos, use o botão <strong>"Mínimo por Loja"</strong> no cabeçalho 
                  e atualize as configurações manualmente. Os valores sugeridos são baseados no histórico de vendas.
                </p>
              </div>
            )}
          </div>
        )}

        {!loading && itens.length === 0 && (
          <div className="text-center py-6 text-muted-foreground">
            <p className="text-sm">
              Carregue os dados do OTB primeiro para ver o comparativo.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
