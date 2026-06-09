// src/pages/estoque/PlanoHistoricoPage.tsx
// Listagem paginada de planos de compra salvos (plano_compra_historico).
// Permite visualizar detalhes e exportar nos mesmos formatos do Wizard.

import { useState, useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { supabase } from '@/integrations/supabase/client';
import { useUserEmpresas } from '@/hooks/useUserEmpresas';
import {
  gerarCSVString,
  gerarExcel,
  prepararSecoesPDF,
  type ExportParams,
  type PDFSecao,
  type PDFLinhaItem,
} from '@/lib/estoque/exportacao-plano';
import type { FornecedorGrupo } from '@/lib/estoque/fornecedor-plano';
import type { PlanoFinalMarca, PlanoSugeridoMarca } from '@/lib/estoque/plano-compra-payload';
import type { MixMarcaV2 } from '@/lib/estoque/mix-ideal-v2';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { BaseDialog } from '@/components/system/BaseDialog';
import { useToast } from '@/hooks/use-toast';
import { ChevronLeft, ChevronRight, Download, Eye } from 'lucide-react';

// ── Tipos locais ──────────────────────────────────────────────────────────────

interface PlanoHistoricoRow {
  id: string;
  cod_empresa: number;
  created_at: string;
  total_sugerido: number | null;
  total_final: number | null;
  plano_sugerido: PlanoSugeridoMarca[] | null;
  plano_final: PlanoFinalMarca[] | null;
}

const PAGE_SIZE = 20;

// ── Helper: reconstrói ExportParams a partir do payload salvo ─────────────────

function exportParamsFromHistorico(
  row: PlanoHistoricoRow,
  nomeEmpresa: string
): ExportParams {
  const sugerido: PlanoSugeridoMarca[] = row.plano_sugerido ?? [];
  const final: PlanoFinalMarca[] = row.plano_final ?? [];

  const marcas: MixMarcaV2[] = sugerido.map(m => ({
    marca: m.marca,
    participacao: m.participacao,
    pctPecas: 0,
    pctFaturamento: 0,
    pecasVendidas: 0,
    faturamento: 0,
    mixTotal: m.mixTotal,
    mixRX: m.mixRX,
    mixSolar: m.mixSolar,
    pctSolar: m.pctSolar,
    estoqueEfetivo: m.estoqueEfetivo,
    lacuna: m.lacuna,
    status: m.status,
    estrategica: m.estrategica,
    skusAlocados: m.skusAlocados,
  }));

  const grupos: FornecedorGrupo[] = [{
    fornecedor: 'Todos os Fornecedores',
    isSemFornecedor: false,
    marcas,
    totalMixIdeal: marcas.reduce((s, m) => s + m.mixTotal, 0),
    totalLacuna: marcas.reduce((s, m) => s + m.lacuna, 0),
  }];

  return {
    nomeEmpresa,
    codEmpresa: row.cod_empresa,
    dataGeracao: row.created_at.split('T')[0],
    grupos,
    planoFinal: final,
  };
}

// ── Funções de geração de PDF (browser-only) ──────────────────────────────────

function renderPDFSecaoHistorico(
  doc: jsPDF,
  secao: PDFSecao,
  nomeEmpresa: string,
  dataGeracao: string,
  startNewPage: boolean
) {
  if (startNewPage) doc.addPage();
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text(nomeEmpresa, 14, 18);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100);
  doc.text(`Histórico · ${dataGeracao}`, 14, 24);
  doc.setTextColor(0);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text(`Fornecedor: ${secao.fornecedor}`, 14, 32);
  doc.setFont('helvetica', 'normal');

  const rows = secao.linhas.map((l: PDFLinhaItem) => [
    l.marca,
    l.codigoBarra?.trim() || (l.codSku ? `${l.codSku} (sem EAN)` : '—'),
    l.descricao,
    String(l.qtdSugerida),
    String(l.qtdFinal),
  ]);

  autoTable(doc, {
    head: [['Marca', 'Cód. Barras', 'Descrição', 'Sugerido', 'Final']],
    body: rows,
    startY: 38,
    styles: { fontSize: 8, cellPadding: 1.5 },
    headStyles: { fillColor: [55, 65, 81], textColor: 255, fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 32 },
      1: { cellWidth: 22 },
      2: { cellWidth: 82 },
      3: { cellWidth: 18, halign: 'right' },
      4: { cellWidth: 18, halign: 'right' },
    },
    alternateRowStyles: { fillColor: [249, 250, 251] },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const finalY = (doc as any).lastAutoTable?.finalY ?? 200;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text(`Total a comprar (final): ${secao.totalFinal} peças`, 14, finalY + 8);
}

// ── Componente ────────────────────────────────────────────────────────────────

export default function PlanoHistoricoPage() {
  const { empresas } = useUserEmpresas();
  const { toast } = useToast();

  const [empresaId, setEmpresaId] = useState<number | null>(null);
  const [page, setPage] = useState(0);
  const [verOpen, setVerOpen] = useState(false);
  const [selectedRow, setSelectedRow] = useState<PlanoHistoricoRow | null>(null);

  const nomeEmpresaSelecionada = useMemo(
    () => empresas.find(e => e.codEmpresa === empresaId)?.nome ?? (empresaId ? `Loja ${empresaId}` : ''),
    [empresas, empresaId]
  );

  // ── Query paginada ──────────────────────────────────────────────────────────

  const { data: rows = [], isLoading, isFetching } = useQuery({
    queryKey: ['plano_compra_historico', empresaId, page],
    queryFn: async () => {
      if (!empresaId) return [];
      const offset = page * PAGE_SIZE;
      const { data, error } = await supabase
        .from('plano_compra_historico')
        .select('id, cod_empresa, created_at, total_sugerido, total_final, plano_sugerido, plano_final')
        .eq('cod_empresa', empresaId)
        .order('created_at', { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1);
      if (error) throw error;
      return (data ?? []) as unknown as PlanoHistoricoRow[];
    },
    enabled: !!empresaId,
    staleTime: 2 * 60 * 1000,
  });

  // ── Exportação a partir do histórico ───────────────────────────────────────

  const handleExportarCSV = useCallback((row: PlanoHistoricoRow) => {
    try {
      const params = exportParamsFromHistorico(row, nomeEmpresaSelecionada);
      const csv = gerarCSVString(params);
      const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `plano-hist-loja${row.cod_empresa}-${params.dataGeracao}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast({ title: 'CSV exportado.' });
    } catch (err) {
      toast({ title: 'Erro ao exportar CSV', description: err instanceof Error ? err.message : '', variant: 'destructive' });
    }
  }, [nomeEmpresaSelecionada, toast]);

  const handleExportarExcel = useCallback((row: PlanoHistoricoRow) => {
    try {
      const params = exportParamsFromHistorico(row, nomeEmpresaSelecionada);
      const buf = gerarExcel(params);
      const blob = new Blob([buf as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `plano-hist-loja${row.cod_empresa}-${params.dataGeracao}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast({ title: 'Excel exportado.' });
    } catch (err) {
      toast({ title: 'Erro ao exportar Excel', description: err instanceof Error ? err.message : '', variant: 'destructive' });
    }
  }, [nomeEmpresaSelecionada, toast]);

  const handleExportarPDF = useCallback((row: PlanoHistoricoRow) => {
    try {
      const params = exportParamsFromHistorico(row, nomeEmpresaSelecionada);
      const secoes = prepararSecoesPDF(params);
      const doc = new jsPDF({ format: 'a4', unit: 'mm' });
      secoes.forEach((secao, idx) => renderPDFSecaoHistorico(doc, secao, nomeEmpresaSelecionada, params.dataGeracao, idx > 0));
      doc.save(`plano-hist-loja${row.cod_empresa}-${params.dataGeracao}.pdf`);
      toast({ title: 'PDF exportado.' });
    } catch (err) {
      toast({ title: 'Erro ao exportar PDF', description: err instanceof Error ? err.message : '', variant: 'destructive' });
    }
  }, [nomeEmpresaSelecionada, toast]);

  const handleExportarPDFZip = useCallback(async (row: PlanoHistoricoRow) => {
    try {
      const params = exportParamsFromHistorico(row, nomeEmpresaSelecionada);
      const secoes = prepararSecoesPDF(params);
      const JSZip = (await import('jszip')).default;
      const zip = new JSZip();
      for (const secao of secoes) {
        const doc = new jsPDF({ format: 'a4', unit: 'mm' });
        renderPDFSecaoHistorico(doc, secao, nomeEmpresaSelecionada, params.dataGeracao, false);
        const slug = secao.fornecedor.replace(/[^a-zA-Z0-9]/g, '-').replace(/-+/g, '-').toLowerCase();
        zip.file(`plano-${slug}-${params.dataGeracao}.pdf`, doc.output('arraybuffer'));
      }
      const buf = await zip.generateAsync({ type: 'uint8array' });
      const blob = new Blob([buf as BlobPart], { type: 'application/zip' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `plano-hist-loja${row.cod_empresa}-${params.dataGeracao}-por-fornecedor.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast({ title: 'ZIP exportado.' });
    } catch (err) {
      toast({ title: 'Erro ao exportar ZIP', description: err instanceof Error ? err.message : '', variant: 'destructive' });
    }
  }, [nomeEmpresaSelecionada, toast]);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <TooltipProvider>
      <div className="container max-w-6xl py-6">
        <h1 className="text-2xl font-bold mb-2">Histórico de Planos de Compra</h1>
        <p className="text-muted-foreground text-sm mb-6">Planos gerados pelo Wizard — visualização e re-exportação.</p>

        {/* Filtro de empresa */}
        <div className="flex items-center gap-3 mb-6">
          <label className="text-sm font-medium">Loja</label>
          <Select
            value={empresaId ? String(empresaId) : ''}
            onValueChange={v => { setEmpresaId(Number(v)); setPage(0); }}
          >
            <SelectTrigger className="w-60">
              <SelectValue placeholder="Selecionar loja..." />
            </SelectTrigger>
            <SelectContent>
              {empresas.map(e => (
                <SelectItem key={e.codEmpresa} value={String(e.codEmpresa)}>
                  {e.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Tabela */}
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Loja</TableHead>
                  <TableHead className="text-right">Sugerido</TableHead>
                  <TableHead className="text-right">Final</TableHead>
                  <TableHead className="text-right">Δ Ajuste</TableHead>
                  <TableHead className="text-right">Marcas</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!empresaId && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-12">
                      Selecione uma loja para ver o histórico.
                    </TableCell>
                  </TableRow>
                )}
                {empresaId && isLoading && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-12">
                      Carregando...
                    </TableCell>
                  </TableRow>
                )}
                {empresaId && !isLoading && rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-12">
                      Nenhum plano salvo para esta loja.
                    </TableCell>
                  </TableRow>
                )}
                {rows.map(row => {
                  const delta = (row.total_final ?? 0) - (row.total_sugerido ?? 0);
                  const qtdMarcas = row.plano_final?.length ?? 0;
                  const dataFormatada = new Date(row.created_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
                  const nomeEmpresa = empresas.find(e => e.codEmpresa === row.cod_empresa)?.nome ?? `Loja ${row.cod_empresa}`;

                  return (
                    <TableRow key={row.id}>
                      <TableCell className="tabular-nums text-sm">{dataFormatada}</TableCell>
                      <TableCell className="text-sm">{nomeEmpresa}</TableCell>
                      <TableCell className="text-right">
                        <Badge variant="outline" className="bg-gray-50">{row.total_sugerido ?? '—'}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge className="bg-blue-100 text-blue-800 border-blue-300">{row.total_final ?? '—'}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className={delta > 0 ? 'text-green-600 font-medium' : delta < 0 ? 'text-red-600 font-medium' : 'text-muted-foreground'}>
                          {delta > 0 ? `+${delta}` : delta === 0 ? '—' : String(delta)}
                        </span>
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground text-sm">{qtdMarcas}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="gap-1"
                            onClick={() => { setSelectedRow(row); setVerOpen(true); }}
                          >
                            <Eye className="h-4 w-4" />
                            Ver
                          </Button>

                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm" className="gap-1">
                                <Download className="h-4 w-4" />
                                Exportar
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => handleExportarCSV(row)}>CSV — plano completo</DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleExportarExcel(row)}>Excel (.xlsx)</DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => handleExportarPDF(row)}>PDF — plano completo</DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleExportarPDFZip(row)}>PDF por fornecedor (ZIP)</DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>

                          {/* TODO: navegar para /estoque/plano-mensal?duplicar=<id> */}
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span>
                                <Button variant="ghost" size="sm" disabled>Duplicar</Button>
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>Em breve</TooltipContent>
                          </Tooltip>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Paginação */}
        {empresaId && !isLoading && (
          <div className="flex items-center justify-between mt-4 text-sm text-muted-foreground">
            <span>Página {page + 1}</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0 || isFetching}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="sm" onClick={() => setPage(p => p + 1)} disabled={rows.length < PAGE_SIZE || isFetching}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Dialog "Ver" */}
        {selectedRow && (
          <BaseDialog
            open={verOpen}
            onOpenChange={setVerOpen}
            title={`Plano — ${new Date(selectedRow.created_at).toLocaleDateString('pt-BR')}`}
            size="md"
            footer={<Button variant="outline" onClick={() => setVerOpen(false)}>Fechar</Button>}
          >
            <div className="max-h-[60vh] overflow-y-auto">
              <p className="text-sm text-muted-foreground mb-3">
                Loja {selectedRow.cod_empresa} · Sugerido: {selectedRow.total_sugerido} · Final: {selectedRow.total_final}
              </p>
              <Table className="text-sm">
                <TableHeader>
                  <TableRow>
                    <TableHead>Marca</TableHead>
                    <TableHead className="text-right">Qtd Final</TableHead>
                    <TableHead className="text-right">Qtd Sugerida</TableHead>
                    <TableHead className="text-right">Δ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(selectedRow.plano_final ?? []).map(pf => {
                    const ps = selectedRow.plano_sugerido?.find(s => s.marca === pf.marca);
                    const delta = pf.qtdComprar - (ps?.lacuna ?? pf.qtdComprar);
                    return (
                      <TableRow key={pf.marca}>
                        <TableCell className="font-medium">{pf.marca}</TableCell>
                        <TableCell className="text-right">{pf.qtdComprar}</TableCell>
                        <TableCell className="text-right text-muted-foreground">{ps?.lacuna ?? '—'}</TableCell>
                        <TableCell className="text-right">
                          <span className={delta > 0 ? 'text-green-600' : delta < 0 ? 'text-red-600' : 'text-muted-foreground'}>
                            {delta === 0 ? '—' : delta > 0 ? `+${delta}` : String(delta)}
                          </span>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </BaseDialog>
        )}
      </div>
    </TooltipProvider>
  );
}
