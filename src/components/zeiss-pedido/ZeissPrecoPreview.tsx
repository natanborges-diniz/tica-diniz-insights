// src/components/zeiss-pedido/ZeissPrecoPreview.tsx
// Exibe preços estimados do produto selecionado antes do envio

import React, { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Loader2, DollarSign } from "lucide-react";
import { tabelaPrecosZeiss } from "@/services/zeissService";

interface PrecoItem {
  cod: string;
  nome: string;
  preco: string;
}

interface Props {
  codEmpresa: number;
  produtoCodOd: string | null;
  produtoCodOe: string | null;
  servicosCods: string[];
}

const ZeissPrecoPreview: React.FC<Props> = ({ codEmpresa, produtoCodOd, produtoCodOe, servicosCods }) => {
  const [precos, setPrecos] = useState<PrecoItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [tabelaRaw, setTabelaRaw] = useState<any[] | null>(null);
  const [error, setError] = useState(false);

  // Fetch price table once per empresa
  useEffect(() => {
    if (!codEmpresa) return;
    setLoading(true);
    setError(false);
    tabelaPrecosZeiss(codEmpresa)
      .then((data: any) => {
        // The Zeiss API returns sao.tabelapreco or an array
        const items = data?.sao?.tabelapreco || data?.sao?.precos || data?.precos || (Array.isArray(data) ? data : []);
        setTabelaRaw(Array.isArray(items) ? items : []);
      })
      .catch((err) => {
        console.warn("[ZeissPrecoPreview] Error loading prices:", err);
        setError(true);
        setTabelaRaw(null);
      })
      .finally(() => setLoading(false));
  }, [codEmpresa]);

  // Filter prices for selected products/services
  useEffect(() => {
    if (!tabelaRaw || tabelaRaw.length === 0) {
      setPrecos([]);
      return;
    }

    const codsToFind = new Set<string>();
    if (produtoCodOd) codsToFind.add(produtoCodOd);
    if (produtoCodOe && produtoCodOe !== produtoCodOd) codsToFind.add(produtoCodOe);
    servicosCods.forEach(c => codsToFind.add(c));

    if (codsToFind.size === 0) {
      setPrecos([]);
      return;
    }

    const matched: PrecoItem[] = [];
    for (const item of tabelaRaw) {
      const cod = item.cod || item.codigo || item.c || "";
      if (codsToFind.has(cod)) {
        matched.push({
          cod,
          nome: item.nome || item.n || item.descricao || cod,
          preco: item.preco || item.p || item.valor || "—",
        });
      }
    }
    setPrecos(matched);
  }, [tabelaRaw, produtoCodOd, produtoCodOe, servicosCods]);

  if (!produtoCodOd || loading) {
    if (loading) {
      return (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground py-1">
          <Loader2 className="h-3 w-3 animate-spin" /> Consultando preços...
        </div>
      );
    }
    return null;
  }

  if (error || !tabelaRaw) return null;

  if (precos.length === 0 && tabelaRaw.length > 0) {
    return (
      <div className="text-xs text-muted-foreground flex items-center gap-1.5 py-1">
        <DollarSign className="h-3 w-3" /> Preço não encontrado na tabela do consumidor
      </div>
    );
  }

  if (precos.length === 0) return null;

  const total = precos.reduce((sum, p) => {
    const val = parseFloat(String(p.preco).replace(",", ".").replace(/[^\d.]/g, ""));
    return sum + (isNaN(val) ? 0 : val);
  }, 0);

  return (
    <div className="rounded-lg border border-border/60 bg-muted/30 px-4 py-3 space-y-1.5">
      <p className="text-[10px] font-semibold uppercase text-muted-foreground flex items-center gap-1">
        <DollarSign className="h-3 w-3" /> Estimativa de Preço (tabela consumidor)
      </p>
      {precos.map((p, i) => (
        <div key={i} className="flex justify-between text-sm">
          <span className="text-muted-foreground truncate mr-2">
            <Badge variant="outline" className="font-mono text-[10px] mr-1.5">{p.cod}</Badge>
            {p.nome}
          </span>
          <span className="font-mono font-medium shrink-0">R$ {p.preco}</span>
        </div>
      ))}
      {precos.length > 1 && (
        <>
          <div className="border-t border-border/40 pt-1 flex justify-between text-sm font-semibold">
            <span>Total estimado</span>
            <span className="font-mono">R$ {total.toFixed(2)}</span>
          </div>
        </>
      )}
      <p className="text-[10px] text-muted-foreground">* Preço final será confirmado pela Zeiss na aprovação</p>
    </div>
  );
};

export default ZeissPrecoPreview;
