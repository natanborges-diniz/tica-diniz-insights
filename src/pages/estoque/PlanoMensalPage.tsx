// src/pages/estoque/PlanoMensalPage.tsx
// Wizard 7 etapas — Plano Mensal de Compras
// Sub-Entrega D₄ + D.6 (agrupamento fornecedor) + D.7 (multi-export)

import { useState, useMemo, useCallback, useEffect, useRef, Fragment } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { supabase } from '@/integrations/supabase/client';
import { useUserEmpresas } from '@/hooks/useUserEmpresas';
import { getEstoqueCompleto } from '@/services/estoqueCompletoService';
import { getAnaliseSku } from '@/services/vendasService';
import { calcularMixIdealV2, type MixMarcaV2, type MarcaConfigV2 } from '@/lib/estoque/mix-ideal-v2';
import { construirMixMarcasCompleto, calcularCortes } from '@/lib/estoque/mix-marcas-completo';
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
import { categorizarProduto, subcategorizarProduto } from '@/utils/categorizarProduto';
import {
  resolverFornecedor,
  agruparPorFornecedor,
  SEM_FORNECEDOR_LABEL,
  type FornecedorGrupo,
} from '@/lib/estoque/fornecedor-plano';
import {
  gerarCSVString,
  gerarExcel,
  prepararSecoesPDF,
  type ExportParams,
  type PDFSecao,
} from '@/lib/estoque/exportacao-plano';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { BaseDialog } from '@/components/system/BaseDialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from '@/hooks/use-toast';
import { AlertTriangle, ChevronLeft, ChevronRight, Download, Save, Package, Plus, X } from 'lucide-react';

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

interface ManualSkuInput {
  id: string;
  marca: string;
  descricao: string;
  qtd: number;
}

// ── Etapas ────────────────────────────────────────────────────────────────────

const ETAPAS = ['Empresa', 'Diagnóstico', 'Marcas', 'Mix Ideal', 'Plano', 'Ajuste Final', 'Exportar'];
const TOTAL_ETAPAS = ETAPAS.length;

// ── Sub-componentes ───────────────────────────────────────────────────────────

function EtapaProgresso({ step }: { step: number }) {
  return (
    <div className="flex items-center gap-1 mb-6 flex-wrap">
      {ETAPAS.map((label, idx) => {
        const num = idx + 1;
        const ativo = num === step;
        const feito = num < step;
        return (
          <div key={label} className="flex items-center gap-1">
            <div className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold
              ${feito ? 'bg-green-600 text-white' : ativo ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
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
  return (
    <Alert className="border-orange-400 bg-orange-50 mb-4">
      <AlertTriangle className="h-4 w-4 text-orange-600" />
      <AlertDescription className="text-orange-700">
        Mix ideal ({totalMix} peças) excede capacidade ({capacidade}) em{' '}
        <strong>{totalMix - capacidade} peças</strong>.
      </AlertDescription>
    </Alert>
  );
}

function PlanoColunaLiquidacao({ itens }: { itens: ItemLiquidacao[] }) {
  if (itens.length === 0) return <p className="text-muted-foreground text-sm">Nenhum item para liquidação.</p>;
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
            <TableHead className="text-right">Desc.</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {itens.map(i => (
            <TableRow key={i.codSku}>
              <TableCell className="font-medium">{i.marca}</TableCell>
              <TableCell className="max-w-48 truncate">{i.descricao}</TableCell>
              <TableCell className="text-right">{i.estoqueAtual}</TableCell>
              <TableCell className="text-right">{i.diasEmEstoque}</TableCell>
              <TableCell><Badge variant="outline" className="text-xs">{i.faixa}</Badge></TableCell>
              <TableCell className="text-right">{i.desconto > 0 ? `${i.desconto}%` : '—'}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function StatusBadge({ status }: { status: MixMarcaV2['status'] }) {
  if (status === 'OK') return <Badge className="bg-green-100 text-green-800 border-green-300">OK</Badge>;
  if (status === 'ABAIXO_MINIMO_ESTRATEGICA') return <Badge className="bg-blue-100 text-blue-800 border-blue-300 text-xs">Estratégica ↑25</Badge>;
  if (status === 'SEM_VENDAS_180D') return <Badge className="bg-slate-100 text-slate-600 border-slate-300 text-xs">Sem vendas 180d</Badge>;
  return <Badge className="bg-red-100 text-red-800 border-red-300 text-xs">Descontinuar?</Badge>;
}

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

// Etapa 5: card de compras por fornecedor
function GrupoFornecedorCompra({
  grupo,
  onAdicionarManual,
  onRemoverManual,
  onAtualizarManualQtd,
}: {
  grupo: FornecedorGrupo;
  onAdicionarManual: (marca: string) => void;
  onRemoverManual: (id: string) => void;
  onAtualizarManualQtd: (id: string, qtd: number) => void;
}) {
  const marcasComCompra = grupo.marcas.filter(m => m.lacuna > 0 || m.skusAlocados.some(s => s.isManual));
  if (marcasComCompra.length === 0 && grupo.marcas.every(m => m.lacuna === 0)) return null;
  const todasMarcas = grupo.marcas.filter(m => m.mixTotal > 0);
  return (
    <Card className={grupo.isSemFornecedor ? 'border-orange-300 bg-orange-50/30' : ''}>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2 flex-wrap">
          <Package className="h-4 w-4 text-muted-foreground shrink-0" />
          <CardTitle className="text-base">{grupo.fornecedor}</CardTitle>
          {grupo.isSemFornecedor && (
            <Badge variant="outline" className="border-orange-400 text-orange-600 text-xs">⚠ Sem Fornecedor</Badge>
          )}
          <span className="ml-auto text-sm text-muted-foreground">
            {todasMarcas.length} {todasMarcas.length === 1 ? 'marca' : 'marcas'} · {grupo.totalLacuna} peças
          </span>
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-4">
        {todasMarcas.map(marca => (
          <div key={marca.marca}>
            <div className="flex items-center gap-2 mb-2">
              <span className="font-medium text-sm">{marca.marca}</span>
              <span className="text-xs text-muted-foreground">— {marca.lacuna} peças a comprar</span>
              <StatusBadge status={marca.status} />
            </div>
            {marca.skusAlocados.length > 0 ? (
              <Table className="text-xs">
                <TableHeader>
                  <TableRow>
                    <TableHead>Cód. Barras</TableHead>
                    <TableHead>EAN</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead className="text-right">Giro (d)</TableHead>
                    <TableHead className="text-right">Qtd</TableHead>
                    <TableHead className="w-8" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {marca.skusAlocados.map(sku => (
                    <TableRow key={sku.id ?? sku.codSku}>
                      <TableCell className="font-mono text-xs">{sku.codigoBarra || '—'}</TableCell>
                      <TableCell className="font-mono text-xs">{sku.ean?.trim() || '—'}</TableCell>
                      <TableCell className="max-w-48 truncate">
                        {sku.descricao}
                        {sku.isManual && <Badge variant="secondary" className="ml-1 text-xs py-0">Manual</Badge>}
                      </TableCell>
                      <TableCell className="text-right">{sku.diasGiroUltimaPeca === 9999 ? '—' : sku.diasGiroUltimaPeca}</TableCell>
                      <TableCell className="text-right font-bold">
                        {sku.isManual ? (
                          <Input
                            type="number"
                            min={1}
                            value={sku.qtdSugerida}
                            onChange={e => onAtualizarManualQtd(sku.id!, Math.max(1, Number(e.target.value)))}
                            className="w-16 text-right h-7 text-xs inline-block"
                          />
                        ) : sku.qtdSugerida}
                      </TableCell>
                      <TableCell>
                        {sku.isManual && (
                          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onRemoverManual(sku.id!)}>
                            <X className="h-3 w-3" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="text-xs text-muted-foreground ml-2 italic">Sem SKUs na janela de candidatos</p>
            )}
            {((marca.lacunaRx ?? 0) > 0 || (marca.lacunaSolar ?? 0) > 0) && (
              <div className="mt-1 space-y-0.5">
                {(marca.lacunaRx ?? 0) > 0 && (
                  <p className="text-xs text-amber-600">⚠ {marca.lacunaRx} SKU{(marca.lacunaRx ?? 0) !== 1 ? 's' : ''} RX sem candidatos no plano</p>
                )}
                {(marca.lacunaSolar ?? 0) > 0 && (
                  <p className="text-xs text-amber-600">⚠ {marca.lacunaSolar} SKU{(marca.lacunaSolar ?? 0) !== 1 ? 's' : ''} Solar sem candidatos no plano</p>
                )}
              </div>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="mt-1 text-xs gap-1 text-muted-foreground hover:text-foreground"
              onClick={() => onAdicionarManual(marca.marca)}
            >
              <Plus className="h-3 w-3" /> Adicionar SKU manual
            </Button>
          </div>
        ))}
        <div className="pt-3 border-t text-sm text-right text-muted-foreground">
          Subtotal: <strong className="text-foreground">{grupo.totalLacuna} peças</strong>
        </div>
      </CardContent>
    </Card>
  );
}

// Etapa 6: seção de ajuste por fornecedor
function GrupoFornecedorAjuste({
  grupo,
  planoFinal,
  onAjuste,
}: {
  grupo: FornecedorGrupo;
  planoFinal: PlanoFinalMarca[];
  onAjuste: (marca: string, qtd: number) => void;
}) {
  const sugeridoGrupo = grupo.marcas.reduce((s, m) => s + m.lacuna, 0);
  const finalGrupo = grupo.marcas.reduce(
    (s, m) => s + (planoFinal.find(p => p.marca === m.marca)?.qtdComprar ?? m.lacuna),
    0
  );
  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <Package className="h-4 w-4 shrink-0" />
        <span className="font-semibold">{grupo.fornecedor}</span>
        {grupo.isSemFornecedor && (
          <Badge variant="outline" className="text-orange-600 border-orange-400">⚠</Badge>
        )}
        <span className="ml-auto text-sm text-muted-foreground">
          Sugerido: {sugeridoGrupo} · Final:{' '}
          <strong className={finalGrupo !== sugeridoGrupo ? 'text-primary' : ''}>{finalGrupo}</strong>
        </span>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Marca</TableHead>
            <TableHead className="text-right">Ef. Atual</TableHead>
            <TableHead className="text-right">Mix Ideal</TableHead>
            <TableHead className="text-right">Sugerido</TableHead>
            <TableHead className="w-32 text-right">Final</TableHead>
            <TableHead className="w-20" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {grupo.marcas.map(m => {
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
                    onChange={e => onAjuste(m.marca, Number(e.target.value))}
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
  );
}

// ── Geração de PDF (browser-only, não testável em Node) ───────────────────────

function renderPDFSecao(doc: jsPDF, secao: PDFSecao, nomeEmpresa: string, dataGeracao: string, startNewPage: boolean) {
  if (startNewPage) doc.addPage();
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text(nomeEmpresa, 14, 18);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100);
  doc.text(`Plano de Compras · ${dataGeracao}`, 14, 24);
  doc.setTextColor(0);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text(`Fornecedor: ${secao.fornecedor}`, 14, 32);
  doc.setFont('helvetica', 'normal');

  const rows = secao.linhas.map(l => [
    l.marca,
    l.codigoBarra || '—',
    l.ean || '—',
    l.isManual ? `[M] ${l.descricao}` : l.descricao,
    String(l.qtdSugerida),
    String(l.qtdFinal),
  ]);

  autoTable(doc, {
    head: [['Marca', 'Cód. Barras', 'EAN', 'Descrição', 'Sugerido', 'Final']],
    body: rows,
    startY: 38,
    styles: { fontSize: 8, cellPadding: 1.5 },
    headStyles: { fillColor: [55, 65, 81], textColor: 255, fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 28 },
      1: { cellWidth: 16 },
      2: { cellWidth: 16 },
      3: { cellWidth: 76 },
      4: { cellWidth: 18, halign: 'right' },
      5: { cellWidth: 18, halign: 'right' },
    },
    alternateRowStyles: { fillColor: [249, 250, 251] },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const finalY = (doc as any).lastAutoTable?.finalY ?? 200;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text(`Total a comprar (final): ${secao.totalFinal} peças`, 14, finalY + 8);
}

function gerarPDFCompleto(secoes: PDFSecao[], nomeEmpresa: string, dataGeracao: string) {
  const doc = new jsPDF({ format: 'a4', unit: 'mm' });
  secoes.forEach((secao, idx) => renderPDFSecao(doc, secao, nomeEmpresa, dataGeracao, idx > 0));
  doc.save(`plano-mensal-${dataGeracao}.pdf`);
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

  // Fornecedor modal state
  const [modalFornecedorOpen, setModalFornecedorOpen] = useState(false);
  const [modalFornecedorVisto, setModalFornecedorVisto] = useState(false);
  const [overridesFornecedor, setOverridesFornecedor] = useState<Map<string, string>>(new Map());

  // Manual SKU state
  const [manualSkus, setManualSkus] = useState<ManualSkuInput[]>([]);
  const [modalManualAberto, setModalManualAberto] = useState(false);
  const [modalManualMarca, setModalManualMarca] = useState('');
  const [novoSkuDescricao, setNovoSkuDescricao] = useState('');
  const [novoSkuQtd, setNovoSkuQtd] = useState(1);

  // Reset "visto" quando troca de empresa
  useEffect(() => { setModalFornecedorVisto(false); }, [empresaId]);

  // Janela de vendas (180 dias fixo — Princípio #6)
  const hoje = new Date();
  const dataFim = hoje.toISOString().split('T')[0];
  const dataInicio = new Date(hoje.getTime() - 180 * 86400000).toISOString().split('T')[0];

  // ── Queries ────────────────────────────────────────────────────────────────

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

  // Mapeamento global marca→fornecedor (tabela fornecedor_marca — fallback Supabase)
  const { data: fornecedorMarcaRows = [] } = useQuery({
    queryKey: ['fornecedor_marca'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fornecedor_marca')
        .select('marca, fornecedor');
      if (error) throw error;
      return data as Array<{ marca: string; fornecedor: string }>;
    },
    staleTime: 5 * 60 * 1000,
  });

  const mapeamentoFornecedor = useMemo((): Map<string, string> => {
    const m = new Map<string, string>();
    fornecedorMarcaRows.forEach(r => m.set(r.marca.toUpperCase(), r.fornecedor));
    return m;
  }, [fornecedorMarcaRows]);

  // Sync marcaConfigRows → overrides
  useEffect(() => {
    const m = new Map<string, MarcaOverride>();
    marcaConfigRows.forEach(r => {
      m.set(r.marca, { marca: r.marca, pct_solar: r.pct_solar, estrategica: r.estrategica, recem_introduzida: r.recem_introduzida });
    });
    setOverrides(m);
  }, [marcaConfigRows]);

  const { data: estoqueData = [], isLoading: loadingEstoque } = useQuery({
    queryKey: ['estoque_completo', empresaId],
    queryFn: () => getEstoqueCompleto({ empresa: empresaId! }),
    enabled: !!empresaId && step >= 2,
    staleTime: 5 * 60 * 1000,
  });

  const { data: vendasData = [], isLoading: loadingVendas } = useQuery({
    queryKey: ['analise_sku_plano', empresaId, dataInicio, dataFim],
    queryFn: () => getAnaliseSku({ empresa: empresaId!, dataInicio, dataFim }),
    enabled: !!empresaId && step >= 2,
    staleTime: 5 * 60 * 1000,
  });

  const loading = loadingEstoque || loadingVendas;

  // ── Merge estoque + vendas → itensMix (com fornecedor) ────────────────────

  const itensMix = useMemo(() => {
    // Number() garante chaves numéricas mesmo se Bridge entregar cod_sku como string
    const vendasMap = new Map(vendasData.map(v => [Number(v.codSku), v]));
    const estoqueMap = new Map(estoqueData.map(e => [Number(e.codSku), e]));
    const allSkus = new Set([...vendasMap.keys(), ...estoqueMap.keys()]);

    return Array.from(allSkus).map(codSku => {
      const e = estoqueMap.get(codSku);
      const v = vendasMap.get(codSku);
      const tipo = e?.tipo ?? v?.tipo ?? '';
      const categoria = categorizarProduto(tipo);
      const subcategoria = (e?.subcategoria ?? subcategorizarProduto(tipo)) as string;
      return {
        codSku,
        descricao: e?.descricao ?? v?.descricaoItem ?? '',
        marca: ((e?.marca ?? v?.marca ?? '')).trim() || 'SEM MARCA',
        fornecedor: e?.fornecedor ?? v?.fornecedor ?? SEM_FORNECEDOR_LABEL,
        qtdVendidos: v?.qtdProdutos ?? 0,
        totalVendido: v?.totalVendido ?? 0,
        estoqueAtual: e?.quantidadeEstoque ?? 0,
        isDeadStock: e?.isDeadStock ?? false,
        codigoBarra: e?.codigoBarra || v?.codigoBarra || '',
        ean: e?.ean ?? v?.ean ?? null,
        diasGiroUltimaPeca: e?.diasGiroUltimaPeca ?? v?.diasGiroUltimaPeca ?? null,
        diasEmEstoque: e?.diasEmEstoque ?? 0,
        precoCusto: e?.precoCusto ?? v?.precoCusto ?? 0,
        valorEstoqueCusto: e?.valorEstoqueCusto ?? 0,
        categoria: categoria as string,
        subcategoria,
      };
    });
  }, [estoqueData, vendasData]);

  // ── Debug Solar (temporário) ───────────────────────────────────────────────
  useEffect(() => {
    if (itensMix.length === 0) return;
    const armacoes = itensMix.filter(i => i.categoria === 'ARMACOES');
    const vendidos = armacoes.filter(i => i.qtdVendidos > 0);
    console.info('[debug-solar] itensMix total:', itensMix.length, '| armações:', armacoes.length);
    console.info('[debug-solar] subcategoria dist (vendidos):', vendidos.reduce((acc, v) => {
      const k = v.subcategoria || 'NULL';
      acc[k] = (acc[k] || 0) + 1;
      return acc;
    }, {} as Record<string, number>));
    const ocComDescricao = armacoes.filter(i => (i.descricao ?? '').toUpperCase().startsWith('OC'));
    console.info('[debug-solar] OC-descrição total:', ocComDescricao.length, '→ AR_SOLAR:', ocComDescricao.filter(i => i.subcategoria === 'AR_SOLAR').length, '| AR_RX:', ocComDescricao.filter(i => i.subcategoria === 'AR_RX').length, '| outros:', ocComDescricao.filter(i => i.subcategoria !== 'AR_SOLAR' && i.subcategoria !== 'AR_RX').length);
    const semEstoque = armacoes.filter(i => i.estoqueAtual === 0 && i.qtdVendidos > 0);
    console.info('[debug-solar] vendidos sem estoque (sold-out):', semEstoque.length, '→ AR_SOLAR:', semEstoque.filter(i => i.subcategoria === 'AR_SOLAR').length, '| AR_RX:', semEstoque.filter(i => i.subcategoria === 'AR_RX').length);
    const misclassified = armacoes.filter(i => (i.descricao ?? '').toUpperCase().startsWith('OC') && i.subcategoria !== 'AR_SOLAR');
    if (misclassified.length > 0) {
      console.warn('[debug-solar] OC mal-classificados (amostra 5):', misclassified.slice(0, 5).map(i => ({ codSku: i.codSku, descricao: i.descricao, subcategoria: i.subcategoria })));
    }
    // Amostra dos primeiros 5 vendasData com tipo para confirmar o que Bridge entrega
    const solarVendas = vendasData.filter(v => (v.descricaoItem ?? '').toUpperCase().startsWith('OC')).slice(0, 5);
    console.info('[debug-solar] vendasData amostra OC (tipo raw):', solarVendas.map(v => ({ codSku: v.codSku, descricaoItem: v.descricaoItem, tipo: v.tipo, subcategoria: (v as Record<string, unknown>).subcategoria })));
  }, [itensMix, vendasData]);

  // ── Diagnóstico ────────────────────────────────────────────────────────────

  const diagnostico = useMemo(() => {
    const armacoes = itensMix.filter(i => i.categoria === 'ARMACOES');
    const estoqueTotal = armacoes.reduce((s, i) => s + i.estoqueAtual, 0);
    const estoqueEfetivo = armacoes.filter(i => i.estoqueAtual > 0 && !i.isDeadStock).reduce((s, i) => s + i.estoqueAtual, 0);
    const deadStockPecas = armacoes.filter(i => i.isDeadStock).reduce((s, i) => s + i.estoqueAtual, 0);
    const vendidoTotal = armacoes.reduce((s, i) => s + i.qtdVendidos, 0);
    const vendidoRx = armacoes.filter(i => i.subcategoria === 'AR_RX').reduce((s, i) => s + i.qtdVendidos, 0);
    const vendidoSolar = armacoes.filter(i => i.subcategoria === 'AR_SOLAR').reduce((s, i) => s + i.qtdVendidos, 0);
    return {
      capacidadeTotal, estoqueTotal, estoqueEfetivo, deadStockPecas,
      lacunaTotal: Math.max(0, capacidadeTotal - estoqueEfetivo),
      vendidoTotal, vendidoRx, vendidoSolar,
    };
  }, [itensMix, capacidadeTotal]);

  // ── Mix ideal V2 ──────────────────────────────────────────────────────────

  const marcaConfigsV2 = useMemo((): Map<string, MarcaConfigV2> => {
    const m = new Map<string, MarcaConfigV2>();
    overrides.forEach((cfg, marca) => {
      m.set(marca, { pctSolar: cfg.pct_solar, estrategica: cfg.estrategica, recemIntroduzida: cfg.recem_introduzida });
    });
    return m;
  }, [overrides]);

  const mixMarcas = useMemo((): MixMarcaV2[] => {
    if (itensMix.length === 0 || capacidadeTotal === 0) return [];
    return calcularMixIdealV2({ itens: itensMix, capacidadeTotal, marcaConfigs: marcaConfigsV2, pctSolarDefault });
  }, [itensMix, capacidadeTotal, marcaConfigsV2, pctSolarDefault]);

  const mixMarcasCompleto = useMemo(
    () => construirMixMarcasCompleto(mixMarcas, itensMix, overrides, pctSolarDefault),
    [mixMarcas, itensMix, overrides, pctSolarDefault],
  );

  const totalMixIdeal = mixMarcasCompleto.reduce((s, m) => s + m.mixTotal, 0);

  const { corte1, corte2 } = calcularCortes(mixMarcasCompleto, capacidadeTotal);

  // ── Agrupamento por fornecedor ─────────────────────────────────────────────

  // Resolve fornecedor por marca (Bridge → Supabase fallback)
  const fornecedorPorMarca = useMemo((): Map<string, string> => {
    const mapa = new Map<string, string>();
    itensMix.forEach(item => {
      if (item.categoria !== 'ARMACOES' || mapa.has(item.marca)) return;
      mapa.set(item.marca, resolverFornecedor(item.marca, item.fornecedor, mapeamentoFornecedor));
    });
    return mapa;
  }, [itensMix, mapeamentoFornecedor]);

  const gruposFornecedor = useMemo(
    () => agruparPorFornecedor(mixMarcas, fornecedorPorMarca),
    [mixMarcas, fornecedorPorMarca]
  );

  // Grupos com SKUs manuais injetados
  const gruposFornecedorComManuais = useMemo(() => {
    if (manualSkus.length === 0) return gruposFornecedor;
    return gruposFornecedor.map(g => ({
      ...g,
      marcas: g.marcas.map(m => {
        const manuais = manualSkus.filter(s => s.marca === m.marca);
        if (manuais.length === 0) return m;
        const skusManuais = manuais.map(s => ({
          id: s.id,
          codSku: 0,
          descricao: s.descricao,
          diasGiroUltimaPeca: 9999 as const,
          qtdSugerida: s.qtd,
          codigoBarra: '',
          ean: null,
          isManual: true as const,
        }));
        return { ...m, skusAlocados: [...m.skusAlocados, ...skusManuais] };
      }),
    }));
  }, [gruposFornecedor, manualSkus]);

  // Marcas com compra pendente mas sem SKUs definidos.
  // Usa qtdFinal do planoFinal (não mixTotal) para que zeragem na Etapa 6 desbloqueie o export.
  const pendencias = useMemo(() => {
    const marcasPendentes: string[] = [];
    for (const g of gruposFornecedorComManuais) {
      for (const m of g.marcas) {
        const qtdFinal = planoFinal.find(p => p.marca === m.marca)?.qtdComprar ?? m.lacuna;
        if (qtdFinal > 0 && m.skusAlocados.length === 0) {
          marcasPendentes.push(m.marca);
        }
      }
    }
    return marcasPendentes;
  }, [gruposFornecedorComManuais, planoFinal]);

  // Marcas com lacuna > 0 que ainda estão sem fornecedor
  const marcasSemFornecedor = useMemo(
    () => mixMarcas
      .filter(m => (fornecedorPorMarca.get(m.marca) ?? SEM_FORNECEDOR_LABEL) === SEM_FORNECEDOR_LABEL)
      .map(m => m.marca),
    [mixMarcas, fornecedorPorMarca]
  );

  // Fornecedores já mapeados (para autocomplete no modal)
  const fornecedoresExistentes = useMemo(
    () => Array.from(new Set(gruposFornecedor.filter(g => !g.isSemFornecedor).map(g => g.fornecedor))).sort(),
    [gruposFornecedor]
  );

  // ── Modal sem fornecedor — trigger na entrada da etapa 5 ──────────────────

  const prevStepRef = useRef(step);
  useEffect(() => {
    if (step === 5 && prevStepRef.current !== 5 && !modalFornecedorVisto && marcasSemFornecedor.length > 0) {
      setOverridesFornecedor(new Map(marcasSemFornecedor.map(m => [m, ''])));
      setModalFornecedorOpen(true);
      setModalFornecedorVisto(true);
    }
    prevStepRef.current = step;
  }, [step, marcasSemFornecedor, modalFornecedorVisto]);

  // ── Plano final ────────────────────────────────────────────────────────────

  useEffect(() => {
    setPlanoFinal(prev => {
      const inicial = derivarPlanoFinalInicial(mixMarcas);
      if (prev.length === 0) return inicial;
      const mesmasMarcas = prev.length === inicial.length && prev.every((p, i) => p.marca === inicial[i].marca);
      if (!mesmasMarcas) return inicial;
      const merged = inicial.map((novo, i) => prev[i].ajusteUsuario ? prev[i] : novo);
      // Evita novo array (e novo render) quando nada mudou de fato
      const igual = merged.every((m, i) => {
        const p = prev[i];
        return m === p || (
          m.marca === p.marca &&
          m.qtdComprar === p.qtdComprar &&
          m.ajusteUsuario === p.ajusteUsuario
        );
      });
      return igual ? prev : merged;
    });
  }, [mixMarcas]);

  const itensLiquidacao = useMemo((): ItemLiquidacao[] => {
    return itensMix
      .filter(i => i.isDeadStock && i.estoqueAtual > 0 && i.categoria === 'ARMACOES')
      .map(i => {
        const faixaObj = classificarPorIdade(i.diasEmEstoque);
        return { codSku: i.codSku, descricao: i.descricao, marca: i.marca, estoqueAtual: i.estoqueAtual, diasEmEstoque: i.diasEmEstoque, faixa: faixaObj.rotulo, desconto: faixaObj.desconto, valorCusto: i.valorEstoqueCusto };
      })
      .sort((a, b) => b.diasEmEstoque - a.diasEmEstoque);
  }, [itensMix]);

  const totalSugerido = useMemo(() => totalLacunaSugerida(mixMarcas), [mixMarcas]);
  const totalFinal = useMemo(() => totalPlanoFinal(planoFinal), [planoFinal]);
  const qtdMarcasAjustadas = useMemo(() => planoFinal.filter(p => p.ajusteUsuario).length, [planoFinal]);

  const nomeEmpresa = useMemo(
    () => empresas.find(e => e.codEmpresa === empresaId)?.nome ?? (empresaId ? `Loja ${empresaId}` : ''),
    [empresas, empresaId]
  );

  const exportParams = useMemo((): ExportParams => ({
    nomeEmpresa,
    codEmpresa: empresaId ?? 0,
    dataGeracao: dataFim,
    grupos: gruposFornecedorComManuais,
    planoFinal,
  }), [nomeEmpresa, empresaId, dataFim, gruposFornecedorComManuais, planoFinal]);

  const secoesPDF = useMemo(() => prepararSecoesPDF(exportParams), [exportParams]);

  // ── Mutations ─────────────────────────────────────────────────────────────

  const { mutateAsync: salvarOverrides, isPending: salvandoOverrides } = useMutation({
    mutationFn: async () => {
      if (!empresaId) throw new Error('Empresa não selecionada');
      const rows = Array.from(overrides.values()).map(o => ({
        cod_empresa: empresaId, marca: o.marca, pct_solar: o.pct_solar, estrategica: o.estrategica, recem_introduzida: o.recem_introduzida,
      }));
      for (const row of rows) {
        const { error } = await supabase.from('marca_config').upsert(row, { onConflict: 'cod_empresa,marca' });
        if (error) throw error;
      }
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['marca_config', empresaId] }); toast({ title: 'Configurações de marca salvas.' }); },
    onError: (e: Error) => toast({ title: 'Erro ao salvar', description: e.message, variant: 'destructive' }),
  });

  const { mutateAsync: salvarPlano, isPending: salvandoPlano } = useMutation({
    mutationFn: async () => {
      if (!empresaId) throw new Error('Empresa não selecionada');
      const payload = montarPayloadInsert({ codEmpresa: empresaId, mix: mixMarcas, planoFinal, parametros: parametrosPlano });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await supabase.from('plano_compra_historico').insert(payload as any);
      if (error) throw error;
    },
    onSuccess: () => toast({ title: 'Plano salvo com sucesso.' }),
    onError: (e: Error) => toast({ title: 'Erro ao salvar plano', description: e.message, variant: 'destructive' }),
  });

  const { mutateAsync: salvarFornecedores, isPending: salvandoFornecedores } = useMutation({
    mutationFn: async () => {
      const rows = Array.from(overridesFornecedor.entries())
        .filter(([, forn]) => forn.trim())
        .map(([marca, fornecedor]) => ({ marca: marca.toUpperCase(), fornecedor: fornecedor.trim() }));
      for (const row of rows) {
        const { error } = await supabase.from('fornecedor_marca').upsert(row, { onConflict: 'marca' });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fornecedor_marca'] });
      toast({ title: 'Fornecedores salvos.' });
      setModalFornecedorOpen(false);
    },
    onError: (e: Error) => toast({ title: 'Erro ao salvar fornecedores', description: e.message, variant: 'destructive' }),
  });

  const parametrosPlano = useMemo((): ParametrosPlano => ({
    capacidadeTotal, pctSolarDefault, pesoPecas: PESO_PECAS, pesoFaturamento: PESO_FATURAMENTO,
    janelaParticipacaoDias: JANELA_PARTICIPACAO_DIAS, janelaCandidatosDias: JANELA_CANDIDATOS_DIAS,
    mixMinimoMarca: MIX_MINIMO_MARCA, dataInicio, dataFim,
  }), [capacidadeTotal, pctSolarDefault, dataInicio, dataFim]);

  // ── Exportações ───────────────────────────────────────────────────────────

  const handleExportarCSV = useCallback(() => {
    try {
      console.info('[export-csv] iniciando', { marcas: exportParams.grupos.flatMap(g => g.marcas).length });
      const csv = gerarCSVString(exportParams);
      const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `plano-mensal-loja${empresaId}-${dataFim}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast({ title: 'CSV exportado.' });
    } catch (err) {
      console.error('[export-csv]', err);
      toast({ title: 'Falha ao exportar CSV', description: err instanceof Error ? err.message : 'Tente novamente.', variant: 'destructive' });
    }
  }, [exportParams, empresaId, dataFim]);

  const handleExportarExcel = useCallback(() => {
    try {
      console.info('[export-excel] iniciando', { marcas: exportParams.grupos.flatMap(g => g.marcas).length });
      const buf = gerarExcel(exportParams);
      const blob = new Blob([buf as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `plano-mensal-loja${empresaId}-${dataFim}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast({ title: 'Excel exportado.' });
    } catch (err) {
      console.error('[export-excel]', err);
      toast({ title: 'Falha ao exportar Excel', description: err instanceof Error ? err.message : 'Tente novamente.', variant: 'destructive' });
    }
  }, [exportParams, empresaId, dataFim]);

  const handleExportarPDFCompleto = useCallback(() => {
    try {
      console.info('[export-pdf-completo] iniciando', { secoes: secoesPDF.length });
      gerarPDFCompleto(secoesPDF, nomeEmpresa, dataFim);
      toast({ title: 'PDF exportado.' });
    } catch (err) {
      console.error('[export-pdf-completo]', err);
      toast({ title: 'Falha ao exportar PDF', description: err instanceof Error ? err.message : 'Tente novamente.', variant: 'destructive' });
    }
  }, [secoesPDF, nomeEmpresa, dataFim]);

  const handleExportarPDFPorFornecedor = useCallback(async () => {
    try {
      const secoesAtivas = secoesPDF.filter(s => s.totalFinal > 0 || s.linhas.length > 0);
      console.info('[export-pdf-fornecedor] iniciando', { totalFornecedores: secoesAtivas.length });
      const JSZip = (await import('jszip')).default;
      const zip = new JSZip();
      for (const secao of secoesAtivas) {
        const doc = new jsPDF({ format: 'a4', unit: 'mm' });
        renderPDFSecao(doc, secao, nomeEmpresa, dataFim, false);
        const slug = secao.fornecedor.replace(/[^a-zA-Z0-9]/g, '-').replace(/-+/g, '-').toLowerCase();
        zip.file(`plano-${slug}-${dataFim}.pdf`, doc.output('arraybuffer'));
      }
      const buf = await zip.generateAsync({ type: 'uint8array' });
      const blob = new Blob([buf as BlobPart], { type: 'application/zip' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `plano-loja${empresaId}-${dataFim}-por-fornecedor.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast({ title: `ZIP gerado (${secoesAtivas.length} fornecedores).` });
    } catch (err) {
      console.error('[export-pdf-fornecedor]', err);
      toast({ title: 'Falha ao exportar ZIP', description: err instanceof Error ? err.message : 'Tente novamente.', variant: 'destructive' });
    }
  }, [secoesPDF, nomeEmpresa, dataFim, empresaId]);

  // ── Navegação ─────────────────────────────────────────────────────────────

  const marcasComVendas = useMemo(() => {
    const s = new Set<string>();
    itensMix.filter(i => i.categoria === 'ARMACOES' && i.qtdVendidos > 0).forEach(i => s.add(i.marca));
    return Array.from(s).sort();
  }, [itensMix]);

  const podeAvancar = () => podeAvancarStep({ step, empresaId, loadingDados: loading, qtdItens: itensMix.length, capacidadeTotal, mixVazio: mixMarcas.length === 0 });

  const avancar = async () => {
    if (step === 3) await salvarOverrides();
    if (podeAvancar()) setStep(s => Math.min(TOTAL_ETAPAS, s + 1));
  };
  const voltar = () => setStep(s => Math.max(1, s - 1));

  const setAjusteMarca = (marca: string, qtd: number) => {
    setPlanoFinal(prev => aplicarAjustePlanoFinal(prev, mixMarcas, marca, qtd));
  };
  const resetAjustes = () => setPlanoFinal(derivarPlanoFinalInicial(mixMarcas));

  const abrirModalManual = (marca: string) => {
    setModalManualMarca(marca);
    setNovoSkuDescricao('');
    setNovoSkuQtd(1);
    setModalManualAberto(true);
  };

  const confirmarManual = () => {
    if (novoSkuDescricao.trim().length < 3 || novoSkuQtd < 1) return;
    setManualSkus(prev => [...prev, {
      id: crypto.randomUUID(),
      marca: modalManualMarca,
      descricao: novoSkuDescricao.trim(),
      qtd: novoSkuQtd,
    }]);
    setModalManualAberto(false);
  };

  const removerManual = (id: string) => {
    setManualSkus(prev => prev.filter(s => s.id !== id));
  };

  const atualizarManualQtd = (id: string, qtd: number) => {
    setManualSkus(prev => prev.map(s => s.id === id ? { ...s, qtd: Math.max(1, qtd) } : s));
  };

  const setOverride = (marca: string, field: keyof Omit<MarcaOverride, 'marca'>, value: number | boolean | null) => {
    setOverrides(prev => {
      const next = new Map(prev);
      const curr = next.get(marca) ?? { marca, pct_solar: null, estrategica: false, recem_introduzida: false };
      next.set(marca, { ...curr, [field]: value });
      return next;
    });
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="container max-w-5xl py-6">
      <h1 className="text-2xl font-bold mb-2">Plano Mensal de Compras</h1>
      <p className="text-muted-foreground text-sm mb-6">Motor V2 — participação proporcional por marca (Princípio #6)</p>

      <EtapaProgresso step={step} />

      {/* ── Etapa 1: Empresa ─────────────────────────────────────────────── */}
      {step === 1 && (
        <Card>
          <CardHeader><CardTitle>Etapa 1 — Selecione a Empresa</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <Label htmlFor="empresa-select">Loja</Label>
            <Select value={empresaId !== null ? String(empresaId) : ''} onValueChange={v => setEmpresaId(Number(v))}>
              <SelectTrigger id="empresa-select" className="w-72">
                <SelectValue placeholder="Selecione uma loja" />
              </SelectTrigger>
              <SelectContent>
                {empresas.map(e => (
                  <SelectItem key={e.codEmpresa} value={String(e.codEmpresa)}>{e.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {capacidadeTotal === 0 && empresaId !== null && (
              <p className="text-sm text-amber-600">Expositor sem capacidade cadastrada. Configure em Capacidades do Expositor.</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Etapa 2: Diagnóstico ─────────────────────────────────────────── */}
      {step === 2 && (
        <Card>
          <CardHeader><CardTitle>Etapa 2 — Diagnóstico</CardTitle></CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-muted-foreground">Carregando dados de estoque e vendas…</p>
            ) : (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <MetricCard label="Capacidade do Expositor" value={diagnostico.capacidadeTotal} unit="peças" color="text-blue-700" />
                  <MetricCard label="Estoque Total Armações" value={diagnostico.estoqueTotal} unit="peças" color="text-slate-700" />
                  <MetricCard label="Estoque Efetivo" value={diagnostico.estoqueEfetivo} unit="peças" color="text-green-700" />
                  <MetricCard label="Lacuna" value={diagnostico.lacunaTotal} unit="peças" color={diagnostico.lacunaTotal > 0 ? 'text-red-700' : 'text-green-700'} />
                </div>
                {diagnostico.vendidoTotal > 0 && (
                  <div className="mt-4 p-4 rounded-lg border bg-slate-50">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Volume Vendido — 6 meses (armações)</p>
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <p className="text-2xl font-bold text-slate-800 tabular-nums">{diagnostico.vendidoTotal.toLocaleString('pt-BR')}</p>
                        <p className="text-xs text-slate-500 mt-0.5">Total</p>
                      </div>
                      <div>
                        <p className="text-2xl font-bold text-blue-700 tabular-nums">{diagnostico.vendidoRx.toLocaleString('pt-BR')}</p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          RX{diagnostico.vendidoTotal > 0 && (
                            <span className="ml-1 text-slate-400">({Math.round(diagnostico.vendidoRx / diagnostico.vendidoTotal * 100)}%)</span>
                          )}
                        </p>
                      </div>
                      <div>
                        <p className="text-2xl font-bold text-amber-600 tabular-nums">{diagnostico.vendidoSolar.toLocaleString('pt-BR')}</p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Solar{diagnostico.vendidoTotal > 0 && (
                            <span className="ml-1 text-slate-400">({Math.round(diagnostico.vendidoSolar / diagnostico.vendidoTotal * 100)}%)</span>
                          )}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
            {!loading && diagnostico.deadStockPecas > 0 && (
              <p className="text-sm text-amber-600 mt-4">
                {diagnostico.deadStockPecas} peças em dead stock (+180d sem venda) excluídas do estoque efetivo.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Etapa 3: Marcas e exceções ───────────────────────────────────── */}
      {step === 3 && (
        <Card>
          <CardHeader>
            <CardTitle>Etapa 3 — Marcas e Exceções</CardTitle>
            <p className="text-sm text-muted-foreground">Override de % Solar, status estratégico e marcas novas. Salvo ao avançar.</p>
          </CardHeader>
          <CardContent>
            <div className="overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Marca</TableHead>
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
                        <TableCell className="text-center">
                          <Checkbox checked={cfg.estrategica} onCheckedChange={v => setOverride(marca, 'estrategica', !!v)} />
                        </TableCell>
                        <TableCell className="text-center">
                          <Checkbox checked={cfg.recem_introduzida} onCheckedChange={v => setOverride(marca, 'recem_introduzida', !!v)} />
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
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-3">
              <CardTitle>Etapa 4 — Mix Ideal por Marca</CardTitle>
              <div className="flex items-center gap-4 text-sm">
                <span className="text-muted-foreground">
                  Capacidade: <span className="font-semibold text-foreground">{capacidadeTotal}</span>
                </span>
                <span className="text-muted-foreground">│</span>
                <span className="text-muted-foreground">
                  Plano:{' '}
                  <span className={`font-semibold ${totalMixIdeal > capacidadeTotal ? 'text-red-600' : 'text-foreground'}`}>
                    {totalMixIdeal} peças
                  </span>
                  {totalMixIdeal > capacidadeTotal && (
                    <span className="ml-1 text-xs text-red-500">⚠ estouro</span>
                  )}
                </span>
                <span className="text-muted-foreground text-xs">{mixMarcasCompleto.length} marcas</span>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-9 text-right text-muted-foreground">#</TableHead>
                    <TableHead>Marca</TableHead>
                    <TableHead>Fornecedor</TableHead>
                    <TableHead className="text-right text-xs">Vend.</TableHead>
                    <TableHead className="text-right text-xs text-blue-700">Vend.RX</TableHead>
                    <TableHead className="text-right text-xs text-amber-600">Vend.Sol</TableHead>
                    <TableHead className="text-right">Part. %</TableHead>
                    <TableHead className="text-right">Mix Total</TableHead>
                    <TableHead className="text-right">RX</TableHead>
                    <TableHead className="text-right">Solar</TableHead>
                    <TableHead className="text-right w-16">% Sol</TableHead>
                    <TableHead className="text-right">Ef. Atual</TableHead>
                    <TableHead className="text-right">Lacuna</TableHead>
                    <TableHead className="text-center w-20">Estrat.</TableHead>
                    <TableHead className="text-center w-20">Recém</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {mixMarcasCompleto.map((m, idx) => {
                    const cfg = overrides.get(m.marca) ?? { marca: m.marca, pct_solar: null, estrategica: false, recem_introduzida: false };
                    const belowCorte1 = idx >= corte1;
                    const belowCorte2 = idx >= corte2;
                    const rowBg = belowCorte2
                      ? 'bg-slate-50 opacity-60'
                      : belowCorte1
                      ? 'bg-amber-50/40'
                      : '';
                    return (
                      <Fragment key={m.marca}>
                        {idx === corte1 && corte1 > 0 && corte1 <= mixMarcasCompleto.length && (
                          <TableRow className="pointer-events-none hover:bg-transparent">
                            <TableCell colSpan={16} className="py-1.5 px-3 bg-amber-50 text-amber-700 text-xs font-medium border-y border-amber-200">
                              ▼ Abaixo do mínimo viável de {MIX_MINIMO_MARCA} peças — {mixMarcasCompleto.length - corte1} marcas a avaliar
                            </TableCell>
                          </TableRow>
                        )}
                        {idx === corte2 && corte2 !== corte1 && corte2 > 0 && corte2 <= mixMarcasCompleto.length && (
                          <TableRow className="pointer-events-none hover:bg-transparent">
                            <TableCell colSpan={16} className="py-1.5 px-3 bg-slate-100 text-slate-500 text-xs border-y border-slate-200">
                              ▼ Corte teórico: {corte2} marcas para capacidade {capacidadeTotal}
                            </TableCell>
                          </TableRow>
                        )}
                        <TableRow className={rowBg}>
                          <TableCell className="text-right text-xs text-muted-foreground tabular-nums">{idx + 1}</TableCell>
                          <TableCell className="font-medium">{m.marca}</TableCell>
                          <TableCell className="text-sm text-muted-foreground max-w-32 truncate">
                            {fornecedorPorMarca.get(m.marca) ?? SEM_FORNECEDOR_LABEL}
                          </TableCell>
                          <TableCell className="text-right text-xs tabular-nums">{m.vendido180dTotal > 0 ? m.vendido180dTotal : '—'}</TableCell>
                          <TableCell className="text-right text-xs tabular-nums text-blue-700">{m.vendido180dRx > 0 ? m.vendido180dRx : '—'}</TableCell>
                          <TableCell className="text-right text-xs tabular-nums text-amber-600">{m.vendido180dSolar > 0 ? m.vendido180dSolar : '—'}</TableCell>
                          <TableCell className="text-right">{m.participacao > 0 ? `${(m.participacao * 100).toFixed(1)}%` : '—'}</TableCell>
                          <TableCell className="text-right font-bold">{m.mixTotal > 0 ? m.mixTotal : '—'}</TableCell>
                          <TableCell className="text-right">{m.mixRX > 0 ? m.mixRX : '—'}</TableCell>
                          <TableCell className="text-right">{m.mixSolar > 0 ? m.mixSolar : '—'}</TableCell>
                          <TableCell className="text-right">
                            <Input
                              type="number" min={0} max={100}
                              placeholder={`${pctSolarDefault}`}
                              value={cfg.pct_solar != null ? String(cfg.pct_solar) : ''}
                              onChange={e => {
                                const v = e.target.value === '' ? null : Math.min(100, Math.max(0, Number(e.target.value)));
                                setOverride(m.marca, 'pct_solar', v);
                              }}
                              className="w-14 h-7 text-xs px-1.5 text-right"
                            />
                          </TableCell>
                          <TableCell className="text-right">{m.estoqueEfetivo}</TableCell>
                          <TableCell className={`text-right font-bold ${m.lacuna > 0 ? 'text-red-600' : m.mixTotal > 0 ? 'text-green-600' : 'text-muted-foreground'}`}>
                            {m.mixTotal > 0 ? m.lacuna : '—'}
                          </TableCell>
                          <TableCell className="text-center">
                            <Checkbox
                              checked={cfg.estrategica}
                              onCheckedChange={v => setOverride(m.marca, 'estrategica', !!v)}
                            />
                          </TableCell>
                          <TableCell className="text-center">
                            <Checkbox
                              checked={cfg.recem_introduzida}
                              onCheckedChange={v => setOverride(m.marca, 'recem_introduzida', !!v)}
                            />
                          </TableCell>
                          <TableCell><StatusBadge status={m.status} /></TableCell>
                        </TableRow>
                      </Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Etapa 5: Plano Consolidado (por fornecedor) ──────────────────── */}
      {step === 5 && (
        <div className="space-y-4">
          <AlertaEstouro totalMix={totalMixIdeal} capacidade={capacidadeTotal} />

          {/* Compras agrupadas por fornecedor */}
          {gruposFornecedorComManuais.some(g => g.totalLacuna > 0 || g.marcas.some(m => m.mixTotal > 0)) ? (
            gruposFornecedorComManuais.map(g => (
              <GrupoFornecedorCompra
                key={g.fornecedor}
                grupo={g}
                onAdicionarManual={abrirModalManual}
                onRemoverManual={removerManual}
                onAtualizarManualQtd={atualizarManualQtd}
              />
            ))
          ) : (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                Nenhuma compra necessária com o estoque atual.
              </CardContent>
            </Card>
          )}

          {/* Liquidação */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Liquidação / Saneamento</CardTitle>
              <p className="text-sm text-muted-foreground">{itensLiquidacao.length} SKUs em dead stock</p>
            </CardHeader>
            <CardContent>
              <PlanoColunaLiquidacao itens={itensLiquidacao} />
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Etapa 6: Ajuste Final (por fornecedor) ───────────────────────── */}
      {step === 6 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <CardTitle>Etapa 6 — Ajuste Final</CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  Edite a quantidade a comprar por marca. Agrupado por fornecedor.
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
            <div className="grid grid-cols-3 gap-4 max-w-md mb-6">
              <MetricCard label="Total Sugerido" value={totalSugerido} unit="peças" color="text-slate-700" />
              <MetricCard label="Total Final" value={totalFinal} unit="peças" color={totalFinal !== totalSugerido ? 'text-primary' : 'text-slate-700'} />
              <MetricCard label="Δ Ajuste" value={totalFinal - totalSugerido} unit="" color={totalFinal === totalSugerido ? 'text-muted-foreground' : 'text-amber-600'} />
            </div>
            <div className="overflow-auto">
              {gruposFornecedor.map(grupo => (
                <GrupoFornecedorAjuste
                  key={grupo.fornecedor}
                  grupo={grupo}
                  planoFinal={planoFinal}
                  onAjuste={setAjusteMarca}
                />
              ))}
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
            {pendencias.length > 0 && (
              <Alert className="border-red-400 bg-red-50">
                <AlertTriangle className="h-4 w-4 text-red-600" />
                <AlertTitle className="text-red-700">SKUs pendentes — exportação bloqueada</AlertTitle>
                <AlertDescription className="text-red-600">
                  <p className="mb-1">As seguintes marcas têm peças a comprar mas sem SKUs definidos:</p>
                  <ul className="list-disc list-inside mb-2 text-sm">
                    {pendencias.map(m => <li key={m}>{m}</li>)}
                  </ul>
                  <div className="flex gap-2 flex-wrap">
                    <Button size="sm" variant="outline" className="text-red-700 border-red-400 hover:bg-red-100" onClick={() => setStep(5)}>
                      Ir para Etapa 5 (Plano)
                    </Button>
                    <Button size="sm" variant="outline" className="text-red-700 border-red-400 hover:bg-red-100" onClick={() => setStep(6)}>
                      Ir para Etapa 6 (Ajuste)
                    </Button>
                  </div>
                </AlertDescription>
              </Alert>
            )}
            {qtdMarcasAjustadas > 0 && (
              <p className="text-sm text-amber-700">
                {qtdMarcasAjustadas} marca(s) com ajuste manual.
              </p>
            )}
            <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="gap-2" disabled={pendencias.length > 0}>
                    <Download className="h-4 w-4" />
                    Exportar ▾
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-56">
                  <DropdownMenuItem onClick={handleExportarCSV}>
                    CSV — plano completo
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleExportarExcel}>
                    Excel (.xlsx) — aba por fornecedor
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleExportarPDFCompleto}>
                    PDF — plano completo
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleExportarPDFPorFornecedor}>
                    PDF por fornecedor (1 por arquivo)
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <Button onClick={() => salvarPlano()} disabled={salvandoPlano} className="gap-2">
                <Save className="h-4 w-4" />
                {salvandoPlano ? 'Salvando…' : 'Salvar no Histórico'}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              O plano salvo fica disponível no histórico para auditoria futura.
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
          <div />
        )}
      </div>

      {/* ── Modal: marcas sem fornecedor mapeado ─────────────────────────── */}
      <BaseDialog
        open={modalFornecedorOpen}
        onOpenChange={open => {
          setModalFornecedorOpen(open);
        }}
        title={`${marcasSemFornecedor.length} ${marcasSemFornecedor.length === 1 ? 'marca precisa' : 'marcas precisam'} de fornecedor cadastrado`}
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setModalFornecedorOpen(false)}>
              Continuar mesmo assim
            </Button>
            <Button onClick={() => salvarFornecedores()} disabled={salvandoFornecedores}>
              {salvandoFornecedores ? 'Salvando…' : 'Salvar todos'}
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted-foreground mb-4">
          As marcas abaixo aparecerão em "⚠ Sem Fornecedor Mapeado" se não forem cadastradas.
        </p>
        <div className="space-y-3">
          {marcasSemFornecedor.map(marca => (
            <div key={marca} className="flex items-center gap-3">
              <span className="w-32 font-mono text-sm shrink-0 truncate">{marca}</span>
              <Input
                list="fornecedores-existentes"
                placeholder="Nome do fornecedor"
                value={overridesFornecedor.get(marca) ?? ''}
                onChange={e => setOverridesFornecedor(prev => {
                  const next = new Map(prev);
                  next.set(marca, e.target.value);
                  return next;
                })}
              />
            </div>
          ))}
        </div>
        {fornecedoresExistentes.length > 0 && (
          <datalist id="fornecedores-existentes">
            {fornecedoresExistentes.map(f => <option key={f} value={f} />)}
          </datalist>
        )}
      </BaseDialog>

      {/* ── Modal: adicionar SKU manual ───────────────────────────────────── */}
      <BaseDialog
        open={modalManualAberto}
        onOpenChange={open => {
          if (!open) setModalManualAberto(false);
        }}
        title={`Adicionar SKU Manual — ${modalManualMarca}`}
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setModalManualAberto(false)}>Cancelar</Button>
            <Button
              onClick={confirmarManual}
              disabled={novoSkuDescricao.trim().length < 3 || novoSkuQtd < 1}
            >
              Adicionar
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <Label htmlFor="manual-descricao" className="text-sm font-medium">Modelo / Descrição</Label>
            <Input
              id="manual-descricao"
              placeholder="Mínimo 3 caracteres"
              value={novoSkuDescricao}
              onChange={e => setNovoSkuDescricao(e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="manual-qtd" className="text-sm font-medium">Quantidade</Label>
            <Input
              id="manual-qtd"
              type="number"
              min={1}
              value={novoSkuQtd}
              onChange={e => setNovoSkuQtd(Math.max(1, Number(e.target.value)))}
              className="mt-1 w-24"
            />
          </div>
        </div>
      </BaseDialog>
    </div>
  );
}
