// src/components/otb/OtbTable.tsx
// Tabela de OTB agrupada por fornecedor/marca

import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  ChevronDown, 
  ChevronRight, 
  ShoppingCart,
  AlertTriangle,
  Package,
  TrendingDown
} from "lucide-react";
import type { OtbAgrupado, OtbItem } from "@/hooks/useOtb";

interface OtbTableProps {
  itensAgrupados: OtbAgrupado[];
  itensOtb: OtbItem[];
  agrupamento: 'fornecedor' | 'marca';
}

export function OtbTable({ itensAgrupados, itensOtb, agrupamento }: OtbTableProps) {
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set());

  const toggleExpand = (chave: string) => {
    setExpandidos(prev => {
      const next = new Set(prev);
      if (next.has(chave)) {
        next.delete(chave);
      } else {
        next.add(chave);
      }
      return next;
    });
  };

  const getItensDoGrupo = (grupo: OtbAgrupado): OtbItem[] => {
    if (agrupamento === 'fornecedor') {
      return itensOtb.filter(i => i.fornecedor === grupo.fornecedor);
    }
    return itensOtb.filter(i => i.fornecedor === grupo.fornecedor && i.marca === grupo.marca);
  };

  const getClassificacaoBadge = (classificacao: OtbItem['classificacao']) => {
    switch (classificacao) {
      case 'COMPRAR_URGENTE':
        return <Badge variant="destructive" className="gap-1"><AlertTriangle className="h-3 w-3" /> Urgente</Badge>;
      case 'COMPRAR':
        return <Badge className="gap-1 bg-orange-500 hover:bg-orange-600"><ShoppingCart className="h-3 w-3" /> Comprar</Badge>;
      case 'ESTOQUE_OK':
        return <Badge variant="secondary" className="gap-1"><Package className="h-3 w-3" /> OK</Badge>;
      case 'EXCESSO':
        return <Badge variant="outline" className="gap-1 text-muted-foreground"><TrendingDown className="h-3 w-3" /> Excesso</Badge>;
    }
  };

  if (itensAgrupados.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <ShoppingCart className="h-12 w-12 mx-auto mb-4 opacity-30" />
        <p>Nenhum dado disponível</p>
        <p className="text-sm">Clique em "Calcular OTB" para carregar os dados</p>
      </div>
    );
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[40px]"></TableHead>
            <TableHead>Fornecedor {agrupamento === 'marca' && '/ Marca'}</TableHead>
            <TableHead className="text-right">SKUs</TableHead>
            <TableHead className="text-right">Estoque</TableHead>
            <TableHead className="text-right">Vendidos</TableHead>
            <TableHead className="text-right">OTB (un)</TableHead>
            <TableHead className="text-right">OTB (R$)</TableHead>
            <TableHead className="text-center">Urgente</TableHead>
            <TableHead className="text-center">Comprar</TableHead>
            <TableHead className="text-right">Margem</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {itensAgrupados.map((grupo) => {
            const expandido = expandidos.has(grupo.chave);
            const itensGrupo = getItensDoGrupo(grupo);
            
            return (
              <>
                {/* Linha do grupo */}
                <TableRow 
                  key={grupo.chave} 
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => toggleExpand(grupo.chave)}
                >
                  <TableCell>
                    <Button variant="ghost" size="icon" className="h-6 w-6">
                      {expandido ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </Button>
                  </TableCell>
                  <TableCell className="font-medium">
                    {grupo.fornecedor}
                    {agrupamento === 'marca' && grupo.marca && (
                      <span className="text-muted-foreground ml-2">/ {grupo.marca}</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">{grupo.qtdSkus}</TableCell>
                  <TableCell className="text-right">{grupo.estoqueTotal.toLocaleString('pt-BR')}</TableCell>
                  <TableCell className="text-right">{grupo.qtdVendidos.toLocaleString('pt-BR')}</TableCell>
                  <TableCell className="text-right font-medium text-primary">
                    {grupo.otbTotal.toLocaleString('pt-BR')}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    R$ {grupo.otbValorTotal.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
                  </TableCell>
                  <TableCell className="text-center">
                    {grupo.skusComprarUrgente > 0 && (
                      <Badge variant="destructive">{grupo.skusComprarUrgente}</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    {grupo.skusComprar > 0 && (
                      <Badge className="bg-orange-500">{grupo.skusComprar}</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {grupo.margemMedia.toFixed(0)}%
                  </TableCell>
                </TableRow>

                {/* Linhas detalhadas (expandidas) */}
                {expandido && itensGrupo
                  .sort((a, b) => b.otb - a.otb)
                  .slice(0, 20) // Limitar a 20 itens por grupo
                  .map((item) => (
                    <TableRow 
                      key={`${grupo.chave}-${item.codSku}`}
                      className="bg-muted/30"
                    >
                      <TableCell></TableCell>
                      <TableCell className="pl-8 text-sm">
                        <span className="text-muted-foreground mr-2">{item.codSku}</span>
                        {item.descricaoItem}
                        {agrupamento === 'fornecedor' && (
                          <span className="text-muted-foreground ml-2 text-xs">({item.marca})</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right text-sm">-</TableCell>
                      <TableCell className="text-right text-sm">{item.estoqueAtual}</TableCell>
                      <TableCell className="text-right text-sm">{item.qtdVendidos}</TableCell>
                      <TableCell className="text-right text-sm font-medium text-primary">
                        {item.otb > 0 ? item.otb : '-'}
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        {item.otbValor > 0 ? `R$ ${item.otbValor.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}` : '-'}
                      </TableCell>
                      <TableCell className="text-center" colSpan={2}>
                        {getClassificacaoBadge(item.classificacao)}
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        {item.margemBruta.toFixed(0)}%
                      </TableCell>
                    </TableRow>
                  ))}
                {expandido && itensGrupo.length > 20 && (
                  <TableRow className="bg-muted/30">
                    <TableCell colSpan={10} className="text-center text-sm text-muted-foreground py-2">
                      ... e mais {itensGrupo.length - 20} itens
                    </TableCell>
                  </TableRow>
                )}
              </>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
