// src/components/otb/OtbSugestaoCoberturaIA.tsx
// Componente para sugestão de cobertura ideal via IA

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Sparkles, Loader2, RefreshCw, CheckCircle2, AlertTriangle, Info } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import type { OtbItem } from '@/hooks/useOtb';

interface OtbSugestaoCoberturaIAProps {
  itens: OtbItem[];
  coberturaAtual: number;
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

export function OtbSugestaoCoberturaIA({ 
  itens, 
  coberturaAtual,
  onSugestaoCoberturaChange 
}: OtbSugestaoCoberturaIAProps) {
  const [loading, setLoading] = useState(false);
  const [resultado, setResultado] = useState<ResultadoIA | null>(null);

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
        const tipo = item.tipo.split(' ')[0] || 'OUTROS'; // Pegar só o prefixo
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

      // Calcular médias
      const categorias = Array.from(porTipo.entries()).map(([tipo, dados]) => ({
        tipo,
        qtdSkus: dados.qtdSkus,
        estoqueTotal: dados.estoqueTotal,
        vendaTotal: dados.vendaTotal,
        coberturaMedia: dados.qtdSkus > 0 ? dados.coberturaMedia / dados.qtdSkus : 0,
        percCurvaA: dados.qtdSkus > 0 ? (dados.skusCurvaA / dados.qtdSkus) * 100 : 0,
        percCurvaC: dados.qtdSkus > 0 ? (dados.skusCurvaC / dados.qtdSkus) * 100 : 0,
      }));

      // Totais gerais
      const totalSkus = itens.length;
      const totalEstoque = itens.reduce((acc, i) => acc + i.estoqueAtual, 0);
      const totalVendido = itens.reduce((acc, i) => acc + i.totalVendido, 0);
      const coberturaMediaGeral = itens.reduce((acc, i) => acc + i.coberturaAtual, 0) / totalSkus;

      // Chamar edge function
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

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Sparkles className="h-5 w-5 text-primary" />
              Sugestão de Cobertura via IA
            </CardTitle>
            <CardDescription>
              Análise inteligente para definir dias de cobertura ideais
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
            {loading ? 'Analisando...' : resultado ? 'Atualizar' : 'Gerar Sugestão'}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading && (
          <div className="space-y-3">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-20 w-full" />
          </div>
        )}

        {!loading && !resultado && itens.length > 0 && (
          <div className="text-center py-6 text-muted-foreground">
            <Info className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">
              Clique em "Gerar Sugestão" para que a IA analise seus dados 
              de vendas e estoque e sugira os dias de cobertura ideais.
            </p>
          </div>
        )}

        {!loading && resultado && (
          <div className="space-y-4">
            {/* Resumo */}
            <div className="p-3 bg-muted/50 rounded-lg">
              <p className="text-sm">{resultado.resumo}</p>
            </div>

            {/* Sugestão Global */}
            <div className="flex items-center justify-between p-4 bg-primary/5 border border-primary/20 rounded-lg">
              <div>
                <div className="text-sm text-muted-foreground">Cobertura Sugerida</div>
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

            {/* Sugestões por categoria */}
            {resultado.sugestoes.length > 0 && (
              <div>
                <h4 className="text-sm font-medium mb-2">Por Categoria:</h4>
                <div className="space-y-2">
                  {resultado.sugestoes.map((sug, idx) => (
                    <div 
                      key={idx}
                      className="flex items-center justify-between p-2 border rounded"
                    >
                      <div className="flex items-center gap-3">
                        <Badge className={getConfiancaColor(sug.confianca)}>
                          {sug.diasSugeridos}d
                        </Badge>
                        <div>
                          <div className="font-medium text-sm">{sug.categoria}</div>
                          <div className="text-xs text-muted-foreground">{sug.justificativa}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

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
          </div>
        )}

        {!loading && itens.length === 0 && (
          <div className="text-center py-6 text-muted-foreground">
            <p className="text-sm">
              Carregue os dados do OTB primeiro para gerar sugestões.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
