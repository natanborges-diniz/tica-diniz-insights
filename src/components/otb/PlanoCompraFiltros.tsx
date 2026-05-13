// src/components/otb/PlanoCompraFiltros.tsx
// Barra de filtros do Plano de Compra: subcategoria (RX/Solar), marca, fornecedor, curva, decisão

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Filter, X } from "lucide-react";
import type { EstoqueFilters } from "@/stores/useEstoqueStore";

interface Props {
  filters: EstoqueFilters;
  setFilters: (updater: EstoqueFilters | ((p: EstoqueFilters) => EstoqueFilters)) => void;
  listaMarcas: string[];
  listaFornecedores: string[];
  contagens: { rx: number; solar: number; lentes: number; lentesGrau: number; lentesContato: number; acessorios: number; outros: number };
}

const subOpcoes = [
  { key: 'TODAS' as const, label: 'Todas' },
  { key: 'AR_RX' as const, label: 'Armações RX', destaque: true },
  { key: 'AR_SOLAR' as const, label: 'Solar / OC', destaque: true },
  { key: 'LENTES' as const, label: 'Lentes' },
  { key: 'ACESSORIOS' as const, label: 'Acessórios' },
  { key: 'OUTROS' as const, label: 'Outros' },
];

const curvaOpcoes: Array<{ key: 'A' | 'B' | 'C' | null; label: string }> = [
  { key: null, label: 'Todas' },
  { key: 'A', label: 'A' },
  { key: 'B', label: 'B' },
  { key: 'C', label: 'C' },
];

const decisaoOpcoes = [
  { key: 'TODAS' as const, label: 'Todas' },
  { key: 'REPOR_REFERENCIA' as const, label: 'Repor' },
  { key: 'RENOVAR_COLECAO' as const, label: 'Renovar' },
  { key: 'AVALIAR_DESCONTINUACAO' as const, label: 'Descontinuar' },
];

export function PlanoCompraFiltros({ filters, setFilters, listaMarcas, listaFornecedores, contagens }: Props) {
  const limpar = () => setFilters(prev => ({
    ...prev,
    subcategoria: 'TODAS',
    marca: 'TODAS',
    fornecedor: 'TODOS',
    curvaABC: null,
    decisaoMarca: 'TODAS',
  }));

  const algumFiltro =
    filters.subcategoria !== 'TODAS' ||
    filters.marca !== 'TODAS' ||
    filters.fornecedor !== 'TODOS' ||
    filters.curvaABC !== null ||
    filters.decisaoMarca !== 'TODAS';

  const contMap: Record<string, number> = {
    AR_RX: contagens.rx,
    AR_SOLAR: contagens.solar,
    LENTES: contagens.lentes,
    ACESSORIOS: contagens.acessorios,
    OUTROS: contagens.outros,
  };

  return (
    <div className="space-y-3 rounded-lg border bg-card p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Filter className="h-4 w-4 text-primary" />
          Filtros do Plano de Compra
        </div>
        {algumFiltro && (
          <Button variant="ghost" size="sm" onClick={limpar} className="h-7 text-xs">
            <X className="h-3 w-3 mr-1" /> Limpar
          </Button>
        )}
      </div>

      {/* Subcategoria */}
      <div className="space-y-1.5">
        <span className="text-xs text-muted-foreground">Categoria</span>
        <div className="flex flex-wrap gap-1.5">
          {subOpcoes.map(opt => {
            const ativo = filters.subcategoria === opt.key;
            const cont = opt.key === 'TODAS' ? undefined : contMap[opt.key];
            return (
              <Button
                key={opt.key}
                variant={ativo ? 'default' : 'outline'}
                size="sm"
                className={`h-8 text-xs ${opt.destaque && !ativo ? 'border-primary/40' : ''}`}
                onClick={() => setFilters(prev => ({ ...prev, subcategoria: opt.key }))}
              >
                {opt.label}
                {cont !== undefined && <span className="ml-1 opacity-70">({cont})</span>}
              </Button>
            );
          })}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        {/* Marca */}
        <div className="space-y-1">
          <span className="text-xs text-muted-foreground">Marca</span>
          <Select
            value={filters.marca}
            onValueChange={(v) => setFilters(prev => ({ ...prev, marca: v }))}
          >
            <SelectTrigger className="h-9 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="max-h-[300px]">
              {listaMarcas.map(m => (
                <SelectItem key={m} value={m} className="text-xs">{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Fornecedor */}
        <div className="space-y-1">
          <span className="text-xs text-muted-foreground">Fornecedor</span>
          <Select
            value={filters.fornecedor}
            onValueChange={(v) => setFilters(prev => ({ ...prev, fornecedor: v }))}
          >
            <SelectTrigger className="h-9 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="max-h-[300px]">
              {listaFornecedores.map(f => (
                <SelectItem key={f} value={f} className="text-xs">{f}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Curva ABC */}
        <div className="space-y-1">
          <span className="text-xs text-muted-foreground">Curva ABC</span>
          <div className="flex gap-1">
            {curvaOpcoes.map(opt => {
              const ativo = filters.curvaABC === opt.key;
              return (
                <Button
                  key={String(opt.key)}
                  variant={ativo ? 'default' : 'outline'}
                  size="sm"
                  className="h-9 flex-1 text-xs"
                  onClick={() => setFilters(prev => ({ ...prev, curvaABC: opt.key }))}
                >
                  {opt.label}
                </Button>
              );
            })}
          </div>
        </div>

        {/* Decisão */}
        <div className="space-y-1">
          <span className="text-xs text-muted-foreground">Decisão da marca</span>
          <Select
            value={filters.decisaoMarca}
            onValueChange={(v: EstoqueFilters['decisaoMarca']) =>
              setFilters(prev => ({ ...prev, decisaoMarca: v }))
            }
          >
            <SelectTrigger className="h-9 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {decisaoOpcoes.map(d => (
                <SelectItem key={d.key} value={d.key} className="text-xs">{d.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {algumFiltro && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {filters.subcategoria !== 'TODAS' && (
            <Badge variant="secondary" className="text-xs gap-1">
              {subOpcoes.find(s => s.key === filters.subcategoria)?.label}
              <X className="h-3 w-3 cursor-pointer" onClick={() => setFilters(p => ({ ...p, subcategoria: 'TODAS' }))} />
            </Badge>
          )}
          {filters.marca !== 'TODAS' && (
            <Badge variant="secondary" className="text-xs gap-1">
              Marca: {filters.marca}
              <X className="h-3 w-3 cursor-pointer" onClick={() => setFilters(p => ({ ...p, marca: 'TODAS' }))} />
            </Badge>
          )}
          {filters.fornecedor !== 'TODOS' && (
            <Badge variant="secondary" className="text-xs gap-1">
              {filters.fornecedor}
              <X className="h-3 w-3 cursor-pointer" onClick={() => setFilters(p => ({ ...p, fornecedor: 'TODOS' }))} />
            </Badge>
          )}
          {filters.curvaABC && (
            <Badge variant="secondary" className="text-xs gap-1">
              Curva {filters.curvaABC}
              <X className="h-3 w-3 cursor-pointer" onClick={() => setFilters(p => ({ ...p, curvaABC: null }))} />
            </Badge>
          )}
          {filters.decisaoMarca !== 'TODAS' && (
            <Badge variant="secondary" className="text-xs gap-1">
              {decisaoOpcoes.find(d => d.key === filters.decisaoMarca)?.label}
              <X className="h-3 w-3 cursor-pointer" onClick={() => setFilters(p => ({ ...p, decisaoMarca: 'TODAS' }))} />
            </Badge>
          )}
        </div>
      )}
    </div>
  );
}
