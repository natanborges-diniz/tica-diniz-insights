// src/components/metas/MapaMetasMatriz.tsx
// Mapa visual (matriz lojas × meses) do status das metas do ano:
//   verde  = semanas geradas · amarelo = meta mensal salva sem semanas ·
//   cinza  = nada configurado. Clique numa célula → seleciona loja+mês na aba
//   Semanas, sem precisar caçar em listas.

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { LayoutGrid } from "lucide-react";
import type { Empresa } from "@/services/empresaService";

const MESES_ABREV = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

type StatusCelula = "SEMANAS" | "META" | "VAZIO";

interface MapaMetasMatrizProps {
  empresas: Empresa[];
  ano: number;
  /** célula clicada → seleciona loja + mês na aba Semanas */
  onSelecionar: (codEmpresa: number, mes: number) => void;
  /** para recarregar quando metas mudam */
  refreshKey?: number;
}

export function MapaMetasMatriz({ empresas, ano, onSelecionar, refreshKey }: MapaMetasMatrizProps) {
  const [status, setStatus] = useState<Map<string, StatusCelula>>(new Map());
  const [loading, setLoading] = useState(true);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const [metasRes, semanasRes] = await Promise.all([
        supabase
          .from("metas_vendas")
          .select("cod_referencia, mes, meta_faturamento")
          .eq("tipo", "LOJA")
          .eq("ano", ano),
        (supabase as any)
          .from("metas_semanais")
          .select("cod_empresa, mes")
          .eq("tipo", "LOJA")
          .eq("ano", ano),
      ]);
      const mapa = new Map<string, StatusCelula>();
      ((metasRes.data ?? []) as any[]).forEach((m) => {
        if (Number(m.meta_faturamento) > 0) mapa.set(`${m.cod_referencia}-${m.mes}`, "META");
      });
      ((semanasRes.data ?? []) as any[]).forEach((s) => {
        mapa.set(`${s.cod_empresa}-${s.mes}`, "SEMANAS");
      });
      setStatus(mapa);
    } finally {
      setLoading(false);
    }
  }, [ano]);

  useEffect(() => {
    carregar();
  }, [carregar, refreshKey]);

  const celula = (cod: number, mes: number): StatusCelula => status.get(`${cod}-${mes}`) ?? "VAZIO";

  const CLS: Record<StatusCelula, string> = {
    SEMANAS: "bg-emerald-500/80 hover:bg-emerald-500 text-white",
    META: "bg-amber-400/80 hover:bg-amber-400 text-amber-950",
    VAZIO: "bg-muted hover:bg-muted-foreground/20 text-muted-foreground",
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <LayoutGrid className="h-4 w-4" />
          Mapa de Metas {ano}
        </CardTitle>
        <CardDescription className="flex flex-wrap items-center gap-3">
          Clique numa célula para configurar a loja/mês.
          <Badge className="bg-emerald-500/80 text-white">semanas geradas</Badge>
          <Badge className="bg-amber-400/80 text-amber-950">só meta mensal</Badge>
          <Badge variant="outline">vazio</Badge>
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-40" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-separate border-spacing-1">
              <thead>
                <tr>
                  <th className="text-left text-xs font-medium text-muted-foreground pr-2">Loja</th>
                  {MESES_ABREV.map((m, i) => (
                    <th key={i} className="text-xs font-medium text-muted-foreground w-14">{m}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {empresas.map((emp) => (
                  <tr key={emp.codEmpresa}>
                    <td className="text-sm font-medium pr-2 whitespace-nowrap">{emp.nome}</td>
                    {MESES_ABREV.map((_, i) => {
                      const mes = i + 1;
                      const st = celula(emp.codEmpresa, mes);
                      return (
                        <td key={mes}>
                          <button
                            type="button"
                            title={`${emp.nome} · ${MESES_ABREV[i]}/${ano} — ${
                              st === "SEMANAS" ? "semanas geradas" : st === "META" ? "meta salva, gerar semanas" : "sem meta"
                            }`}
                            className={`w-full h-7 rounded text-[11px] transition-colors ${CLS[st]}`}
                            onClick={() => onSelecionar(emp.codEmpresa, mes)}
                          >
                            {st === "SEMANAS" ? "✓" : st === "META" ? "!" : "·"}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
