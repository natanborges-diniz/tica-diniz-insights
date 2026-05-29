// src/pages/estoque/PlanoMensalPage.tsx
// Wizard 7 etapas — Plano Mensal de Compras
// Sub-Entrega D₄ + Step "Ajuste Final" do plano persistido em plano_compra_historico

import { useState, useMemo, useCallback, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useUserEmpresas } from '@/hooks/useUserEmpresas';
import { getEstoqueCompleto } from '@/services/estoqueCompletoService';
import { getAnaliseSku } from '@/services/vendasService';
import { calcularMixIdealV2, type MixMarcaV2, type MarcaConfigV2 } from '@/lib/estoque/mix-ideal-v2';
import {
  derivarPlanoFinalInicial,
  aplicarAjustePlanoFinal,
  montarPayloadInsert,
  podeAvancarStep,
  totalLacunaSugerida,
  totalPlanoFinal,
  type PlanoFinalMarca,
  type ParametrosPlano,
} from '@/lib/estoque/plano-compra-payload';
import {
  PESO_PECAS,
  PESO_FATURAMENTO,
  JANELA_PARTICIPACAO_DIAS,
  JANELA_CANDIDATOS_DIAS,
  MIX_MINIMO_MARCA,
} from '@/lib/estoque/constants';
import { classificarPorIdade } from '@/lib/estoque/faixas-saneamento';
import { categorizarProduto } from '@/utils/categorizarProduto';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from '@/hooks/use-toast';
import { AlertTriangle, ChevronLeft, ChevronRight, Download, Save } from 'lucide-react';

// ── Tipos internos ────────────────────────────────────────────────────────────

interface MarcaOverride {
  marca: string;
  pct_solar: number | null;
  estrategica: boolean;
  recem_introduzida: boolean;
}

interface ItemLiquidacao {
  codSku: number;
  descricao: string;
  marca: string;
  estoqueAtual: number;
  diasEmEstoque: number;
  faixa: string;
  desconto: number;
  valorCusto: number;
}

// ── Sub-componentes ───────────────────────────────────────────────────────────

const ETAPAS = [
  'Empresa',
  'Diagnóstico',
  'Marcas',
  'Mix Ideal',
  'Plano',
  'Ajuste Final',
  'Exportar',
];

const TOTAL_ETAPAS = ETAPAS.length;

function EtapaProgresso({ step }: { step: number }) {
  return (
    <div className="flex items-center gap-1 mb-6">
      {ETAPAS.map((label, idx) => {
        const num = idx + 1;
        const ativo = num === step;
        const feito = num < step;
        return (
          <div key={label} className="flex items-center gap-1">
            <div
              className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold
                ${feito ? 'bg-green-600 text-white' : ativo ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}
            >
              {feito ? '✓' : num}
            </div>
            <span className={`hidden sm:block text-xs ${ativo ? 'font-semibold text-primary' : 'text-muted-foreground'}`}>
              {label}
            </span>
            {idx < ETAPAS.length - 1 && (
              <div className={`w-6 h-0.5 ${feito ? 'bg-green-400' : 'bg-muted'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function AlertaEstouro({ totalMix, capacidade }: { totalMix: number; capacidade: number }) {
  if (totalMix <= capacidade) return null;
  const excesso = totalMix - capacidade;
  return (
    <Alert className="border-orange-400 bg-orange-50 mb-4">
      <AlertTriangle className="h-4 w-4 text-orange-600" />
      <AlertDescription className="text-orange-700">
        Mix ideal total ({totalMix} peças) excede a capacidade do expositor ({capacidade}) em{' '}
        <strong>{excesso} peças</strong>. Considere descontinuar marcas com status SUGERIR_DESCONTINUAR.
      </AlertDescription>
    </Alert>
  );
}

function PlanoColunaCompra({ marcas }: { marcas: MixMarcaV2[] }) {
  const skus = useMemo(() => {
    const items: Array<{ marca: string; codSku: number; descricao: string; diasGiro: number; qtd: number }> = [];
    marcas.forEach(m => {
      m.skusAlocados.forEach(s => {
        items.push({ marca: m.marca, codSku: s.codSku, descricao: s.descricao, diasGiro: s.diasGiroUltimaPeca, qtd: s.qtdSugerida });
      });
    });
    return items.sort((a, b) => a.diasGiro - b.diasGiro);
  }, [marcas]);

  if (skus.length === 0) {
    return <p className="text-muted-foreground text-sm">Nenhuma compra necessária.</p>;
  }

  return (
    <div className="overflow-auto max-h-96">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Marca</TableHead>
            <TableHead>Descrição</TableHead>
            <TableHead className="text-right">Giro (d)</TableHead>
            <TableHead className="text-right">Qtd Sugerida</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {skus.map(s => (
            <TableRow key={`${s.marca}-${s.codSku}`}>
              <TableCell className="font-medium">{s.marca}</TableCell>
              <TableCell className="max-w-48 truncate">{s.descricao}</TableCell>
              <TableCell className="text-right">{s.diasGiro === 9999 ? '—' : s.diasGiro}</TableCell>
              <TableCell className="text-right font-bold">{s.qtd}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function PlanoColunaLiquidacao({ itens }: { itens: ItemLiquidacao[] }) {
  if (itens.length === 0) {
    return <p className="text-muted-foreground text-sm">Nenhum item para liquidação.</p>;
  }

  return (
    <div className="overflow-auto max-h-96">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Marca</TableHead>
            <TableHead>Descrição</TableHead>
            <TableHead className="text-right">Estoque</TableHead>
            <TableHead className="text-right">Dias</TableHead>
            <TableHead>Faixa</TableHead>
            <TableHead className="text-right">Desconto</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {itens.map(i => (
            <TableRow key={i.codSku}>
              <TableCell className="font-medium">{i.marca}</TableCell>
              <TableCell className="max-w-48 truncate">{i.descricao}</TableCell>
              <TableCell className="text-right">{i.estoqueAtual}</TableCell>
              <TableCell className="text-right">{i.diasEmEstoque}</TableCell>
              <TableCell>
                <Badge variant="outline" className="text-xs">{i.faixa}</Badge>
              </TableCell>
              <TableCell className="text-right">{i.desconto > 0 ? `${i.desconto}%` : '—'}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// ── Página principal ──────────────────────────────────────────────────────────

export default function PlanoMensalPage() {
  const { empresas } = useUserEmpresas();
  const queryClient = useQueryClient();

  // Wizard state
  const [step, setStep] = useState(1);
  const [empresaId, setEmpresaId] = useState<number | null>(null);
  const [overrides, setOverrides] = useState<Map<string, MarcaOverride>>(new Map());
  const [planoFinal, setPlanoFinal] = useState<PlanoFinalMarca[]>([]);

  // Janela de vendas (180 dias fixo — Princípio #6)
  const hoje = new Date();
  const dataFim = hoje.toISOString().split('T')[0];
  const dataInicio = new Date(hoje.getTime() - 180 * 86400000).toISOString().split('T')[0];

  // ── Fetch capacidade expositor ─────────────────────────────────────────────
  const { data: capacidadeRows = [] } = useQuery({
    queryKey: ['capacidade_expositor'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('capacidade_expositor')
        .select('cod_empresa, capacidade_total, percentual_solar');
      if (error) throw error;
      return data as Array<{ cod_empresa: number; capacidade_total: number; percentual_solar: number }>;
    },
  });

  const capRow = empresaId ? capacidadeRows.find(r => r.cod_empresa === empresaId) : null;
  const capacidadeTotal = capRow?.capacidade_total ?? 0;
  const pctSolarDefault = capRow?.percentual_solar ?? 30;

  // ── Fetch marca_config ─────────────────────────────────────────────────────
  const { data: marcaConfigRows = [] } = useQuery({
    queryKey: ['marca_config', empresaId],
    queryFn: async () => {
      if (!empresaId) return [];
      const { data, error } = await supabase
        .from('marca_config')
        .select('marca, pct_solar, estrategica, recem_introduzida')
        .eq('cod_empresa', empresaId);
      if (error) throw error;
      return data as Array<{ marca: string; pct_solar: number | null; estrategica: boolean; recem_introduzida: boolean }>;
    },
    enabled: !!empresaId,
  });

  // Sync marcaConfigRows → overrides state (only on first load per empresa)
  useMemo(() => {
    const m = new Map<string, MarcaOverride>();
    marcaConfigRows.forEach(r => {
      m.set(r.marca, { marca: r.marca, pct_solar: r.pct_solar, estrategica: r.estrategica, recem_introduzida: r.recem_introduzida });
    });
    setOverrides(m);
  }, [marcaConfigRows]);

  // ── Fetch estoque completo ─────────────────────────────────────────────────
  const { data: estoqueData = [], isLoading: loadingEstoque } = useQuery({
    queryKey: ['estoque_completo', empresaId],
    queryFn: () => getEstoqueCompleto({ empresa: empresaId! }),
    enabled: !!empresaId && step >= 2,
    staleTime: 5 * 60 * 1000,
  });

  // ── Fetch vendas sku ───────────────────────────────────────────────────────
  const { data: vendasData = [], isLoading: loadingVendas } = useQuery({
    queryKey: ['analise_sku_plano', empresaId, dataInicio, dataFim],
    queryFn: () => getAnaliseSku({ empresa: empresaId!, dataInicio, dataFim }),
    enabled: !!empresaId && step >= 2,
    staleTime: 5 * 60 * 1000,
  });

  const loading = loadingEstoque || loadingVendas;

  // ── Merge estoque + vendas → ItemMixV2[] ──────────────────────────────────
  const itensMix = useMemo(() => {
    const vendasMap = new Map(vendasData.map(v => [v.codSku, v]));
    const estoqueMap = new Map(estoqueData.map(e => [e.codSku, e]));
    const allSkus = new Set([...vendasMap.keys(), ...estoqueMap.keys()]);

    return Array.from(allSkus).map(codSku => {
      const e = estoqueMap.get(codSku);
      const v = vendasMap.get(codSku);
      const tipo = e?.tipo ?? v?.tipo ?? '';
      const categoria = categorizarProduto(tipo);
      return {
        codSku,
        descricao: e?.descricao ?? v?.descricaoItem ?? '',
        marca: ((e?.marca ?? v?.marca ?? '')).trim() || 'SEM MARCA',
        qtdVendidos: v?.qtdProdutos ?? 0,
        totalVendido: v?.totalVendido ?? 0,
        estoqueAtual: e?.quantidadeEstoque ?? 0,
        isDeadStock: e?.isDeadStock ?? false,
        diasGiroUltimaPeca: e?.diasGiroUltimaPeca ?? v?.diasGiroUltimaPeca ?? null,
        diasEmEstoque: e?.diasEmEstoque ?? 0,
        precoCusto: e?.precoCusto ?? v?.precoCusto ?? 0,
        valorEstoqueCusto: e?.valorEstoqueCusto ?? 0,
        categoria: categoria as string,
      };
    });
  }, [estoqueData, vendasData]);

  // ── Diagnóstico ────────────────────────────────────────────────────────────
  const diagnostico = useMemo(() => {
    const armacoes = itensMix.filter(i => i.categoria === 'ARMACOES');
    const estoqueTotal = armacoes.reduce((s, i) => s + i.estoqueAtual, 0);
    const estoqueEfetivo = armacoes
      .filter(i => i.estoqueAtual > 0 && !i.isDeadStock)
      .reduce((s, i) => s + i.estoqueAtual, 0);
    const deadStockPecas = armacoes
      .filter(i => i.isDeadStock)
      .reduce((s, i) => s + i.estoqueAtual, 0);
    return {
      capacidadeTotal,
      estoqueTotal,
      estoqueEfetivo,
      deadStockPecas,
      lacunaTotal: Math.max(0, capacidadeTotal - estoqueEfetivo),
    };
  }, [itensMix, capacidadeTotal]);

  // ── Mix ideal V2 ──────────────────────────────────────────────────────────
  const marcaConfigsV2 = useMemo((): Map<string, MarcaConfigV2> => {
    const m = new Map<string, MarcaConfigV2>();
    overrides.forEach((cfg, marca) => {
      m.set(marca, {
        pctSolar: cfg.pct_solar,
        estrategica: cfg.estrategica,
        recemIntroduzida: cfg.recem_introduzida,
      });
    });
    return m;
  }, [overrides]);

  const mixMarcas = useMemo((): MixMarcaV2[] => {
    if (itensMix.length === 0 || capacidadeTotal === 0) return [];
    return calcularMixIdealV2({
      itens: itensMix,
      capacidadeTotal,
      marcaConfigs: marcaConfigsV2,
      pctSolarDefault,
    });
  }, [itensMix, capacidadeTotal, marcaConfigsV2, pctSolarDefault]);

  const totalMixIdeal = mixMarcas.reduce((s, m) => s + m.mixTotal, 0);

  // Reset plano final quando o mix muda (overrides, capacidade, dados).
  // Preserva edições do usuário só se as marcas continuam idênticas.
  useEffect(() => {
    setPlanoFinal(prev => {
      const inicial = derivarPlanoFinalInicial(mixMarcas);
      if (prev.length === 0) return inicial;
      const mesmasMarcas =
        prev.length === inicial.length &&
        prev.every((p, i) => p.marca === inicial[i].marca);
      if (!mesmasMarcas) return inicial;
      // Mantém valores ajustados pelo usuário; restante volta ao sugerido.
      return inicial.map((novo, i) => prev[i].ajusteUsuario ? prev[i] : novo);
    });
  }, [mixMarcas]);

  // ── Itens para liquidação (dead stock com faixa) ───────────────────────────
  const itensLiquidacao = useMemo((): ItemLiquidacao[] => {
    return itensMix
      .filter(i => i.isDeadStock && i.estoqueAtual > 0 && i.categoria === 'ARMACOES')
      .map(i => {
        const faixaObj = classificarPorIdade(i.diasEmEstoque);
        return {
          codSku: i.codSku,
          descricao: i.descricao,
          marca: i.marca,
          estoqueAtual: i.estoqueAtual,
          diasEmEstoque: i.diasEmEstoque,
          faixa: faixaObj.rotulo,
          desconto: faixaObj.desconto,
          valorCusto: i.valorEstoqueCusto,
        };
      })
      .sort((a, b) => b.diasEmEstoque - a.diasEmEstoque);
  }, [itensMix]);

  // ── Salvar marca_config ────────────────────────────────────────────────────
  const { mutateAsync: salvarOverrides, isPending: salvandoOverrides } = useMutation({
    mutationFn: async () => {
      if (!empresaId) throw new Error('Empresa não selecionada');
      const rows = Array.from(overrides.values()).map(o => ({
        cod_empresa: empresaId,
        marca: o.marca,
        pct_solar: o.pct_solar,
        estrategica: o.estrategica,
        recem_introduzida: o.recem_introduzida,
      }));
      for (const row of rows) {
        const { error } = await supabase
          .from('marca_config')
          .upsert(row, { onConflict: 'cod_empresa,marca' });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['marca_config', empresaId] });
      toast({ title: 'Configurações de marca salvas.' });
    },
    onError: (e: Error) => toast({ title: 'Erro ao salvar', description: e.message, variant: 'destructive' }),
  });

  // ── Parâmetros do plano (snapshot do que rodou) ────────────────────────────
  const parametrosPlano = useMemo((): ParametrosPlano => ({
    capacidadeTotal,
    pctSolarDefault,
    pesoPecas: PESO_PECAS,
    pesoFaturamento: PESO_FATURAMENTO,
    janelaParticipacaoDias: JANELA_PARTICIPACAO_DIAS,
    janelaCandidatosDias: JANELA_CANDIDATOS_DIAS,
    mixMinimoMarca: MIX_MINIMO_MARCA,
    dataInicio,
    dataFim,
  }), [capacidadeTotal, pctSolarDefault, dataInicio, dataFim]);

  // ── Salvar plano ───────────────────────────────────────────────────────────
  const { mutateAsync: salvarPlano, isPending: salvandoPlano } = useMutation({
    mutationFn: async () => {
      if (!empresaId) throw new Error('Empresa não selecionada');
      const payload = montarPayloadInsert({
        codEmpresa: empresaId,
        mix: mixMarcas,
        planoFinal,
        parametros: parametrosPlano,
      });
      const { error } = await supabase
        .from('plano_compra_historico')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .insert(payload as any);
      if (error) throw error;
    },
    onSuccess: () => toast({ title: 'Plano salvo com sucesso.' }),
    onError: (e: Error) => toast({ title: 'Erro ao salvar plano', description: e.message, variant: 'destructive' }),
  });

  // ── Exportar CSV ──────────────────────────────────────────────────────────
  const exportarCSV = useCallback(() => {
    const linhas: string[] = ['Marca,Mix Total,RX,Solar,Estoque Efetivo,Lacuna,Status'];
    mixMarcas.forEach(m => {
      linhas.push(`${m.marca},${m.mixTotal},${m.mixRX},${m.mixSolar},${m.estoqueEfetivo},${m.lacuna},${m.status}`);
    });
    linhas.push('');
    linhas.push('SKU,Marca,Descrição,Dias Giro,Qtd Sugerida');
    mixMarcas.forEach(m => {
      m.skusAlocados.forEach(s => {
        linhas.push(`${s.codSku},${m.marca},"${s.descricao}",${s.diasGiroUltimaPeca === 9999 ? '' : s.diasGiroUltimaPeca},${s.qtdSugerida}`);
      });
    });
    const blob = new Blob([linhas.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `plano-mensal-loja${empresaId}-${dataFim}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [mixMarcas, empresaId, dataFim]);

  // ── Helpers de navegação ──────────────────────────────────────────────────
  const podeAvancar = () => podeAvancarStep({
    step,
    empresaId,
    loadingDados: loading,
    qtdItens: itensMix.length,
    capacidadeTotal,
    mixVazio: mixMarcas.length === 0,
  });

  const avancar = async () => {
    if (step === 3) await salvarOverrides();
    if (podeAvancar()) setStep(s => Math.min(TOTAL_ETAPAS, s + 1));
  };

  const voltar = () => setStep(s => Math.max(1, s - 1));

  // ── Edição manual do plano final (Step 6) ──────────────────────────────────
  const setAjusteMarca = (marca: string, qtd: number) => {
    setPlanoFinal(prev => aplicarAjustePlanoFinal(prev, mixMarcas, marca, qtd));
  };
  const resetAjustes = () => setPlanoFinal(derivarPlanoFinalInicial(mixMarcas));

  const totalSugerido = useMemo(() => totalLacunaSugerida(mixMarcas), [mixMarcas]);
  const totalFinal = useMemo(() => totalPlanoFinal(planoFinal), [planoFinal]);
  const qtdMarcasAjustadas = useMemo(
    () => planoFinal.filter(p => p.ajusteUsuario).length,
    [planoFinal],
  );

  // ── Override helpers ───────────────────────────────────────────────────────
  const setOverride = (marca: string, field: keyof Omit<MarcaOverride, 'marca'>, value: number | boolean | null) => {
    setOverrides(prev => {
      const next = new Map(prev);
      const curr = next.get(marca) ?? { marca, pct_solar: null, estrategica: false, recem_introduzida: false };
      next.set(marca, { ...curr, [field]: value });
      return next;
    });
  };

  // Marcas com vendas (para etapa 3)
  const marcasComVendas = useMemo(() => {
    const s = new Set<string>();
    itensMix.filter(i => i.categoria === 'ARMACOES' && i.qtdVendidos > 0).forEach(i => s.add(i.marca));
    return Array.from(s).sort();
  }, [itensMix]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="container max-w-5xl py-6">
      <h1 className="text-2xl font-bold mb-2">Plano Mensal de Compras</h1>
      <p className="text-muted-foreground text-sm mb-6">
        Motor V2 — participação proporcional por marca (Princípio #6)
      </p>

      <EtapaProgresso step={step} />

      {/* ── Etapa 1: Empresa ─────────────────────────────────────────────── */}
      {step === 1 && (
        <Card>
          <CardHeader><CardTitle>Etapa 1 — Selecione a Empresa</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <Label htmlFor="empresa-select">Loja</Label>
            <Select
              value={empresaId !== null ? String(empresaId) : ''}
              onValueChange={v => setEmpresaId(Number(v))}
            >
              <SelectTrigger id="empresa-select" className="w-72">
                <SelectValue placeholder="Selecione uma loja" />
              </SelectTrigger>
              <SelectContent>
                {empresas.map(e => (
                  <SelectItem key={e.codEmpresa} value={String(e.codEmpresa)}>
                    {e.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {capacidadeTotal === 0 && empresaId !== null && (
              <p className="text-sm text-amber-600">
                Expositor sem capacidade cadastrada para esta loja. Configure em Capacidades do Expositor.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Etapa 2: Diagnóstico ─────────────────────────────────────────── */}
      {step === 2 && (
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Etapa 2 — Diagnóstico</CardTitle></CardHeader>
            <CardContent>
              {loading ? (
                <p className="text-muted-foreground">Carregando dados de estoque e vendas…</p>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <MetricCard label="Capacidade do Expositor" value={diagnostico.capacidadeTotal} unit="peças" color="text-blue-700" />
                  <MetricCard label="Estoque Total Armações" value={diagnostico.estoqueTotal} unit="peças" color="text-slate-700" />
                  <MetricCard label="Estoque Efetivo" value={diagnostico.estoqueEfetivo} unit="peças" color="text-green-700" />
                  <MetricCard label="Lacuna" value={diagnostico.lacunaTotal} unit="peças" color={diagnostico.lacunaTotal > 0 ? 'text-red-700' : 'text-green-700'} />
                </div>
              )}
              {!loading && diagnostico.deadStockPecas > 0 && (
                <p className="text-sm text-amber-600 mt-4">
                  {diagnostico.deadStockPecas} peças em dead stock (+180d sem venda) excluídas do estoque efetivo.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Etapa 3: Marcas e exceções ───────────────────────────────────── */}
      {step === 3 && (
        <Card>
          <CardHeader>
            <CardTitle>Etapa 3 — Marcas e Exceções</CardTitle>
            <p className="text-sm text-muted-foreground">
              Override de % Solar, status estratégico e marcas novas. Salvo automaticamente ao avançar.
            </p>
          </CardHeader>
          <CardContent>
            <div className="overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Marca</TableHead>
                    <TableHead className="w-32">% Solar override</TableHead>
                    <TableHead className="w-28 text-center">Estratégica</TableHead>
                    <TableHead className="w-28 text-center">Recém Introduzida</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {marcasComVendas.map(marca => {
                    const cfg = overrides.get(marca) ?? { marca, pct_solar: null, estrategica: false, recem_introduzida: false };
                    return (
                      <TableRow key={marca}>
                        <TableCell className="font-medium">{marca}</TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min={0}
                            max={100}
                            placeholder={`${pctSolarDefault}%`}
                            value={cfg.pct_solar != null ? String(cfg.pct_solar) : ''}
                            onChange={e => {
                              const v = e.target.value === '' ? null : Math.min(100, Math.max(0, Number(e.target.value)));
                              setOverride(marca, 'pct_solar', v);
                            }}
                            className="w-24"
                          />
                        </TableCell>
                        <TableCell className="text-center">
                          <Checkbox
                            checked={cfg.estrategica}
                            onCheckedChange={v => setOverride(marca, 'estrategica', !!v)}
                          />
                        </TableCell>
                        <TableCell className="text-center">
                          <Checkbox
                            checked={cfg.recem_introduzida}
                            onCheckedChange={v => setOverride(marca, 'recem_introduzida', !!v)}
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Etapa 4: Mix Ideal ───────────────────────────────────────────── */}
      {step === 4 && (
        <Card>
          <CardHeader><CardTitle>Etapa 4 — Mix Ideal por Marca</CardTitle></CardHeader>
          <CardContent>
            <AlertaEstouro totalMix={totalMixIdeal} capacidade={capacidadeTotal} />
            <div className="overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Marca</TableHead>
                    <TableHead className="text-right">Part. %</TableHead>
                    <TableHead className="text-right">Mix Total</TableHead>
                    <TableHead className="text-right">RX</TableHead>
                    <TableHead className="text-right">Solar</TableHead>
                    <TableHead className="text-right">Ef. Atual</TableHead>
                    <TableHead className="text-right">Lacuna</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {mixMarcas.map(m => (
                    <TableRow key={m.marca}>
                      <TableCell className="font-medium">{m.marca}</TableCell>
                      <TableCell className="text-right">{(m.participacao * 100).toFixed(1)}%</TableCell>
                      <TableCell className="text-right font-bold">{m.mixTotal}</TableCell>
                      <TableCell className="text-right">{m.mixRX}</TableCell>
                      <TableCell className="text-right">{m.mixSolar}</TableCell>
                      <TableCell className="text-right">{m.estoqueEfetivo}</TableCell>
                      <TableCell className={`text-right font-bold ${m.lacuna > 0 ? 'text-red-600' : 'text-green-600'}`}>
                        {m.lacuna}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={m.status} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Etapa 5: Plano Consolidado ───────────────────────────────────── */}
      {step === 5 && (
        <div className="grid md:grid-cols-2 gap-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Compras Sugeridas</CardTitle></CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-3">
                Total: {mixMarcas.reduce((s, m) => s + m.lacuna, 0)} peças a comprar
              </p>
              <PlanoColunaCompra marcas={mixMarcas.filter(m => m.lacuna > 0)} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base">Liquidação / Saneamento</CardTitle></CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-3">
                {itensLiquidacao.length} SKUs em dead stock
              </p>
              <PlanoColunaLiquidacao itens={itensLiquidacao} />
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Etapa 6: Ajuste Final ────────────────────────────────────────── */}
      {step === 6 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <CardTitle>Etapa 6 — Ajuste Final</CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  Edite a quantidade a comprar por marca. Sugerido = lacuna calculada;
                  final = o que será efetivamente registrado.
                </p>
              </div>
              {qtdMarcasAjustadas > 0 && (
                <Button variant="ghost" size="sm" onClick={resetAjustes}>
                  Resetar ajustes ({qtdMarcasAjustadas})
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4 max-w-md mb-4">
              <MetricCard label="Total Sugerido" value={totalSugerido} unit="peças" color="text-slate-700" />
              <MetricCard label="Total Final" value={totalFinal} unit="peças" color={totalFinal !== totalSugerido ? 'text-primary' : 'text-slate-700'} />
              <MetricCard label="Δ Ajuste" value={totalFinal - totalSugerido} unit="" color={totalFinal === totalSugerido ? 'text-muted-foreground' : 'text-amber-600'} />
            </div>
            <div className="overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Marca</TableHead>
                    <TableHead className="text-right">Estoque Efetivo</TableHead>
                    <TableHead className="text-right">Mix Ideal</TableHead>
                    <TableHead className="text-right">Sugerido</TableHead>
                    <TableHead className="w-32 text-right">Final</TableHead>
                    <TableHead className="w-20"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {mixMarcas.map(m => {
                    const ajuste = planoFinal.find(p => p.marca === m.marca);
                    return (
                      <TableRow key={m.marca}>
                        <TableCell className="font-medium">{m.marca}</TableCell>
                        <TableCell className="text-right text-muted-foreground">{m.estoqueEfetivo}</TableCell>
                        <TableCell className="text-right text-muted-foreground">{m.mixTotal}</TableCell>
                        <TableCell className="text-right">{m.lacuna}</TableCell>
                        <TableCell className="text-right">
                          <Input
                            type="number"
                            min={0}
                            value={ajuste?.qtdComprar ?? 0}
                            onChange={e => setAjusteMarca(m.marca, Number(e.target.value))}
                            className="w-24 text-right inline-block"
                          />
                        </TableCell>
                        <TableCell>
                          {ajuste?.ajusteUsuario && (
                            <Badge variant="outline" className="text-xs">editado</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Etapa 7: Exportar e Salvar ───────────────────────────────────── */}
      {step === 7 && (
        <Card>
          <CardHeader><CardTitle>Etapa 7 — Exportar e Salvar</CardTitle></CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-3 gap-4 max-w-md">
              <MetricCard label="Total Sugerido" value={totalSugerido} unit="" color="text-slate-700" />
              <MetricCard label="Total Final" value={totalFinal} unit="" color="text-primary" />
              <MetricCard label="SKUs Liquidar" value={itensLiquidacao.length} unit="" color="text-amber-600" />
            </div>
            {qtdMarcasAjustadas > 0 && (
              <p className="text-sm text-amber-700">
                {qtdMarcasAjustadas} marca(s) com ajuste manual. plano_final difere do plano_sugerido.
              </p>
            )}
            <div className="flex flex-col sm:flex-row gap-3">
              <Button
                variant="outline"
                onClick={exportarCSV}
                className="gap-2"
              >
                <Download className="h-4 w-4" />
                Exportar CSV
              </Button>
              <Button
                onClick={() => salvarPlano()}
                disabled={salvandoPlano}
                className="gap-2"
              >
                <Save className="h-4 w-4" />
                {salvandoPlano ? 'Salvando…' : 'Salvar no Histórico'}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              O plano salvo fica disponível no histórico para auditoria e comparação futura.
            </p>
          </CardContent>
        </Card>
      )}

      {/* ── Navegação ────────────────────────────────────────────────────── */}
      <div className="flex justify-between mt-6">
        <Button variant="outline" onClick={voltar} disabled={step === 1} className="gap-2">
          <ChevronLeft className="h-4 w-4" /> Voltar
        </Button>
        {step < TOTAL_ETAPAS ? (
          <Button onClick={avancar} disabled={!podeAvancar() || salvandoOverrides} className="gap-2">
            {salvandoOverrides ? 'Salvando…' : 'Avançar'}
            <ChevronRight className="h-4 w-4" />
          </Button>
        ) : (
          <div /> /* botão de salvar fica dentro da etapa final */
        )}
      </div>
    </div>
  );
}

// ── Componentes auxiliares locais ─────────────────────────────────────────────

function MetricCard({ label, value, unit, color }: { label: string; value: number; unit: string; color: string }) {
  return (
    <div className="border rounded-lg p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${color}`}>
        {value.toLocaleString('pt-BR')}
        {unit && <span className="text-sm font-normal ml-1">{unit}</span>}
      </p>
    </div>
  );
}

function StatusBadge({ status }: { status: MixMarcaV2['status'] }) {
  if (status === 'OK') return <Badge className="bg-green-100 text-green-800 border-green-300">OK</Badge>;
  if (status === 'ABAIXO_MINIMO_ESTRATEGICA') return <Badge className="bg-blue-100 text-blue-800 border-blue-300 text-xs">Estratégica ↑25</Badge>;
  return <Badge className="bg-red-100 text-red-800 border-red-300 text-xs">Descontinuar?</Badge>;
}
