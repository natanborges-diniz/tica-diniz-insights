// src/components/otb/OtbSugestaoCoberturaIA.tsx
// Componente para sugestão de mínimos por loja via IA com comparativo

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
  Settings,
  ArrowRight,
  Save
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import type { OtbItem } from '@/hooks/useOtb';

interface OtbSugestaoCoberturaIAProps {
  itens: OtbItem[];
  codEmpresa?: number;
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
  codEmpresa,
}: OtbSugestaoCoberturaIAProps) {
  const [configMinimos, setConfigMinimos] = useState<ConfigMinimo[]>([]);
  const [loadingMinimos, setLoadingMinimos] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [ultimoFiltroHash, setUltimoFiltroHash] = useState<string>('');

  // Hash para detectar mudanças nos itens (baseado em quantidade e categorias)
  const filtroHash = useMemo(() => {
    if (itens.length === 0) return '';
    const categorias = [...new Set(itens.map(i => i.tipo.split(' ')[0]))].sort().join(',');
    return `${itens.length}-${categorias}`;
  }, [itens]);

  // Detectar mudanças nos filtros
  useEffect(() => {
    if (filtroHash !== ultimoFiltroHash && filtroHash !== '') {
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
      
      // Quantos SKUs estão com estoque zerado?
      const skusZerados = itensGrupo.filter(i => i.estoqueAtual === 0 && i.qtdVendidos > 0).length;
      const percZerado = (skusZerados / itensGrupo.length) * 100;
      
      // Sugestão de mínimo:
      // Base: 1 para todos
      // Curva A: mínimo 3-4 para garantir exposição
      // Curva B: mínimo 2-3
      // Curva C: mínimo 1
      // Se há muita ruptura, aumentar
      
      let minimoBase = 1;
      if (curva === 'A') {
        minimoBase = 3;
        if (percZerado > 20) minimoBase = 4; // Muita ruptura em curva A = problema
      } else if (curva === 'B') {
        minimoBase = 2;
        if (percZerado > 30) minimoBase = 3;
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
    const categoriasOrdem = ['ARMACOES', 'LENTES', 'ACESSORIOS', 'OUTROS'];
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

  // Salvar todos os mínimos sugeridos
  const salvarTodos = async () => {
    if (!codEmpresa || minimosSugeridos.length === 0) return;
    
    setSalvando(true);
    try {
      // Preparar dados para upsert
      const dados = minimosSugeridos.map(s => ({
        cod_empresa: codEmpresa,
        categoria: s.categoria,
        curva_abc: s.curva,
        quantidade_minima: s.minimo,
        updated_at: new Date().toISOString(),
      }));
      
      // Upsert para cada item
      for (const item of dados) {
        const { error } = await supabase
          .from('estoque_minimo_loja')
          .upsert(item, { 
            onConflict: 'cod_empresa,categoria,curva_abc',
          });
        
        if (error) throw error;
      }
      
      // Recarregar configurações
      const { data, error } = await supabase
        .from('estoque_minimo_loja')
        .select('categoria, curva_abc, quantidade_minima')
        .eq('cod_empresa', codEmpresa);
      
      if (!error && data) {
        setConfigMinimos(data);
      }
      
      toast({
        title: "Mínimos atualizados",
        description: `${dados.length} configurações salvas com sucesso`,
      });
    } catch (err) {
      console.error('[OtbSugestaoCoberturaIA] Erro ao salvar:', err);
      toast({
        title: "Erro ao salvar",
        description: err instanceof Error ? err.message : "Erro desconhecido",
        variant: "destructive",
      });
    } finally {
      setSalvando(false);
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

  // Verificar se há alterações a fazer
  const temAlteracoes = comparativo.some(l => l.status !== 'igual');

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
              Comparativo entre configuração atual e sugestão baseada em dados de vendas
            </CardDescription>
          </div>
          {temAlteracoes && codEmpresa && (
            <Button 
              onClick={salvarTodos} 
              disabled={salvando}
              className="gap-2"
            >
              {salvando ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {salvando ? 'Salvando...' : 'Aplicar Sugestões'}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {loadingMinimos && (
          <div className="space-y-3">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-20 w-full" />
          </div>
        )}

        {!loadingMinimos && itens.length > 0 && (
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
                  Selecione uma empresa específica para ver/configurar mínimos
                </p>
              </div>
            )}

            {/* Info sobre a lógica */}
            <div className="p-3 bg-muted/50 rounded-lg text-sm text-muted-foreground">
              <strong>Como a sugestão é calculada:</strong>
              <ul className="list-disc list-inside mt-1 space-y-1">
                <li><strong>Curva A:</strong> Mínimo 3-4 un. (produtos que mais vendem)</li>
                <li><strong>Curva B:</strong> Mínimo 2-3 un. (vendas moderadas)</li>
                <li><strong>Curva C:</strong> Mínimo 1 un. (exposição)</li>
                <li>Se há muita ruptura no grupo, o mínimo é aumentado automaticamente</li>
              </ul>
            </div>
          </div>
        )}

        {!loadingMinimos && itens.length === 0 && (
          <div className="text-center py-6 text-muted-foreground">
            <p className="text-sm">Carregue os dados do OTB para ver sugestões</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
