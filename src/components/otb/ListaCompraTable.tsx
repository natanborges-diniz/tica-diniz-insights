// src/components/otb/ListaCompraTable.tsx
// Lista executável "O que comprar agora" — uma linha por SKU, ordenada por prioridade

import { useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { DataTableToolbar } from "@/components/ui/data-table-toolbar";
import { formatters, ExportColumn } from "@/utils/exportData";
import { ShoppingCart, Download, ChevronDown, ChevronRight, ArrowUpRight } from "lucide-react";
import type { SkuARepor } from "@/hooks/useEstoqueUnificado";

interface Props {
  itens: SkuARepor[];
}

const prioConfig: Record<SkuARepor['prioridade'], { label: string; className: string }> = {
  URGENTE: { label: 'URGENTE', className: 'bg-destructive text-destructive-foreground' },
  ALTA: { label: 'ALTA', className: 'bg-orange-500 text-white' },
  MEDIA: { label: 'MÉDIA', className: 'bg-amber-400 text-amber-950' },
  BAIXA: { label: 'BAIXA', className: 'bg-muted text-muted-foreground' },
};

const subLabel: Record<string, string> = {
  AR_RX: 'RX',
  AR_SOLAR: 'Solar',
  LENTES: 'Lente',
  ACESSORIOS: 'Acess.',
  OUTROS: '—',
};

function moedaCompacta(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
}

export function ListaCompraTable({ itens }: Props) {
  const [agruparFornecedor, setAgruparFornecedor] = useState(false);
  const [selecionados, setSelecionados] = useState<Set<number>>(new Set());
  const [aberto, setAberto] = useState<Set<string>>(new Set());

  const totais = useMemo(() => {
    const pecas = itens.reduce((a, i) => a + i.qtdAComprar, 0);
    const valor = itens.reduce((a, i) => a + i.valorCompra, 0);
    const urgentes = itens.filter(i => i.prioridade === 'URGENTE').length;
    return { pecas, valor, urgentes };
  }, [itens]);

  const porFornecedor = useMemo(() => {
    const map = new Map<string, SkuARepor[]>();
    itens.forEach(i => {
      const k = i.fornecedor || 'SEM FORNECEDOR';
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(i);
    });
    return Array.from(map.entries())
      .map(([fornecedor, skus]) => ({
        fornecedor,
        skus,
        pecas: skus.reduce((a, s) => a + s.qtdAComprar, 0),
        valor: skus.reduce((a, s) => a + s.valorCompra, 0),
      }))
      .sort((a, b) => b.valor - a.valor);
  }, [itens]);

  const exportColumns: ExportColumn[] = [
    { key: 'codigoBarra', header: 'Cód. Barras' },
    { key: 'descricao', header: 'Descrição' },
    { key: 'marca', header: 'Marca' },
    { key: 'fornecedor', header: 'Fornecedor' },
    { key: 'subcategoria', header: 'Subcategoria' },
    { key: 'curvaABC', header: 'Curva' },
    { key: 'qtdVendidos', header: 'Vendas 6m', format: formatters.number },
    { key: 'estoqueAtual', header: 'Estoque', format: formatters.number },
    { key: 'vendaDiaria', header: 'Vel. (pç/dia)', format: (v) => Number(v).toFixed(2) },
    { key: 'coberturaDias', header: 'Cobertura (d)', format: formatters.number },
    { key: 'qtdAComprar', header: 'Comprar', format: formatters.number },
    { key: 'valorCompra', header: 'Valor estimado', format: formatters.currency },
    { key: 'prioridade', header: 'Prioridade' },
  ];

  const toggleSel = (codSku: number) => {
    setSelecionados(prev => {
      const next = new Set(prev);
      if (next.has(codSku)) next.delete(codSku); else next.add(codSku);
      return next;
    });
  };

  const dadosExport = selecionados.size > 0
    ? itens.filter(i => selecionados.has(i.codSku))
    : itens;

  const toggleGrupo = (k: string) => {
    setAberto(prev => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k); else next.add(k);
      return next;
    });
  };

  if (itens.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-muted-foreground">
          <ShoppingCart className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Nenhum SKU para comprar com os filtros atuais.</p>
          <p className="text-xs mt-1">Ajuste os filtros ou verifique se há marcas marcadas como "Repor".</p>
        </CardContent>
      </Card>
    );
  }

  const renderLinha = (s: SkuARepor) => {
    const cfg = prioConfig[s.prioridade];
    const selecionado = selecionados.has(s.codSku);
    return (
      <tr key={s.codSku} className={`border-t hover:bg-muted/30 ${selecionado ? 'bg-primary/5' : ''}`}>
        <td className="p-2">
          <Checkbox checked={selecionado} onCheckedChange={() => toggleSel(s.codSku)} />
        </td>
        <td className="p-2 font-mono text-xs">{s.codigoBarra || s.codSku}</td>
        <td className="p-2 max-w-[260px] truncate" title={s.descricao}>{s.descricao}</td>
        {!agruparFornecedor && <td className="p-2 text-xs">{s.fornecedor}</td>}
        <td className="p-2 text-xs">{s.marca}</td>
        <td className="p-2"><Badge variant="outline" className="text-[10px]">{subLabel[s.subcategoria] ?? '—'}</Badge></td>
        <td className="p-2 text-right text-xs">{s.qtdVendidos}</td>
        <td className="p-2 text-right text-xs">{s.estoqueAtual}</td>
        <td className="p-2 text-right text-xs">{s.vendaDiaria.toFixed(2)}</td>
        <td className="p-2 text-right text-xs">{s.coberturaDias >= 999 ? '—' : `${s.coberturaDias}d`}</td>
        <td className="p-2 text-right font-bold text-emerald-700 dark:text-emerald-400">{s.qtdAComprar}</td>
        <td className="p-2 text-right text-xs text-muted-foreground">{moedaCompacta(s.valorCompra)}</td>
        <td className="p-2">
          <Badge className={`text-[10px] ${cfg.className}`}>{cfg.label}</Badge>
        </td>
        <td className="p-2">
          <Badge variant={s.curvaABC === 'A' ? 'default' : 'secondary'} className="text-[10px]">{s.curvaABC}</Badge>
        </td>
      </tr>
    );
  };

  const colCount = agruparFornecedor ? 13 : 14;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <ShoppingCart className="h-5 w-5 text-primary" />
              O que comprar agora
            </CardTitle>
            <CardDescription>
              {itens.length} SKUs • {totais.pecas.toLocaleString('pt-BR')} peças • {moedaCompacta(totais.valor)} estimado
              {totais.urgentes > 0 && <span className="text-destructive font-medium"> • {totais.urgentes} urgente{totais.urgentes > 1 ? 's' : ''}</span>}
              {selecionados.size > 0 && <span className="text-primary font-medium"> • {selecionados.size} selecionado{selecionados.size > 1 ? 's' : ''}</span>}
            </CardDescription>
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
              <Switch checked={agruparFornecedor} onCheckedChange={setAgruparFornecedor} />
              Agrupar por fornecedor
            </label>
            <DataTableToolbar
              exportOptions={{
                filename: `lista_compra_${new Date().toISOString().split('T')[0]}`,
                title: selecionados.size > 0 ? 'Pedido — itens selecionados' : 'Lista de Compra',
                columns: exportColumns,
                data: dadosExport,
              }}
            >
              <Button variant="default" size="sm" className="gap-1">
                <Download className="h-4 w-4" />
                {selecionados.size > 0 ? 'Exportar pedido' : 'Exportar lista'}
              </Button>
            </DataTableToolbar>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs">
              <tr>
                <th className="p-2 w-8"></th>
                <th className="text-left p-2">Cód.</th>
                <th className="text-left p-2">Descrição</th>
                {!agruparFornecedor && <th className="text-left p-2">Fornecedor</th>}
                <th className="text-left p-2">Marca</th>
                <th className="text-left p-2">Cat.</th>
                <th className="text-right p-2">Vendas 6m</th>
                <th className="text-right p-2">Estoque</th>
                <th className="text-right p-2">Vel./dia</th>
                <th className="text-right p-2">Cobert.</th>
                <th className="text-right p-2 font-bold">Comprar</th>
                <th className="text-right p-2">Valor</th>
                <th className="text-left p-2">Prio.</th>
                <th className="text-left p-2">Curva</th>
              </tr>
            </thead>
            <tbody>
              {agruparFornecedor
                ? porFornecedor.map(g => {
                    const open = aberto.has(g.fornecedor);
                    return (
                      <>
                        <tr key={`g-${g.fornecedor}`} className="bg-muted/30 border-t cursor-pointer hover:bg-muted/50" onClick={() => toggleGrupo(g.fornecedor)}>
                          <td className="p-2">
                            {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          </td>
                          <td colSpan={colCount - 4} className="p-2 font-medium text-sm">
                            {g.fornecedor} <span className="text-xs text-muted-foreground">• {g.skus.length} SKUs</span>
                          </td>
                          <td className="p-2 text-right font-bold text-emerald-700 dark:text-emerald-400">{g.pecas}</td>
                          <td className="p-2 text-right text-xs text-muted-foreground">{moedaCompacta(g.valor)}</td>
                          <td colSpan={2}></td>
                        </tr>
                        {open && g.skus.map(renderLinha)}
                      </>
                    );
                  })
                : itens.map(renderLinha)}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
