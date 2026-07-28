// src/components/metas/DivisaoSemanalPanel.tsx
// Fase 2b — edição EM MASSA dos parâmetros de divisão semanal
// (docs/REVISAO_VENDAS_METAS.md §5.4 item 1): % da meta da loja distribuída
// aos vendedores e nº de vendedores por semana (entradas/saídas de equipe).
// meta_vendedor = meta_loja(semana) × %divisão ÷ nº vendedores.

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Users, Percent } from "lucide-react";
import { toast } from "sonner";
import type { Empresa } from "@/services/empresaService";
import {
  getMetasSemanais,
  upsertDivisaoEmMassa,
} from "@/services/metasSemanaisService";

function fmtData(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
  });
}

interface DivisaoSemanalPanelProps {
  empresas: Empresa[];
  ano: number;
  mes: number;
  onChanged?: () => void;
}

export function DivisaoSemanalPanel({ empresas, ano, mes, onChanged }: DivisaoSemanalPanelProps) {
  const [semanas, setSemanas] = useState<{ inicio: string; fim: string }[]>([]);
  const [lojasSel, setLojasSel] = useState<Set<number>>(new Set());
  const [semanasSel, setSemanasSel] = useState<Set<string>>(new Set());
  const [percentual, setPercentual] = useState("");
  const [numVendedores, setNumVendedores] = useState("");
  const [aplicando, setAplicando] = useState(false);

  const carregarSemanas = useCallback(async () => {
    try {
      // semanas do período = distinct semana_inicio das metas LOJA já geradas
      const metas = await getMetasSemanais({ tipo: "LOJA", ano, mes });
      const vistas = new Map<string, string>();
      metas.forEach((m) => vistas.set(m.semanaInicio, m.semanaFim));
      setSemanas(
        Array.from(vistas.entries())
          .map(([inicio, fim]) => ({ inicio, fim }))
          .sort((a, b) => a.inicio.localeCompare(b.inicio))
      );
    } catch {
      setSemanas([]);
    }
  }, [ano, mes]);

  useEffect(() => {
    setSemanasSel(new Set());
    carregarSemanas();
  }, [carregarSemanas]);

  const toggle = <T,>(set: Set<T>, value: T, setter: (s: Set<T>) => void) => {
    const novo = new Set(set);
    if (novo.has(value)) novo.delete(value);
    else novo.add(value);
    setter(novo);
  };

  const handleAplicar = async () => {
    if (!lojasSel.size || !semanasSel.size) {
      toast.error("Selecione ao menos uma loja e uma semana");
      return;
    }
    const pct = percentual === "" ? undefined : Number(percentual);
    const num = numVendedores === "" ? undefined : Number(numVendedores);
    if (pct === undefined && num === undefined) {
      toast.error("Informe % de divisão e/ou nº de vendedores");
      return;
    }
    if (pct !== undefined && (pct <= 0 || pct > 100)) {
      toast.error("% de divisão deve estar entre 0 e 100");
      return;
    }
    if (num !== undefined && num < 1) {
      toast.error("Nº de vendedores deve ser ao menos 1");
      return;
    }
    setAplicando(true);
    try {
      const linhas = await upsertDivisaoEmMassa(
        [...lojasSel],
        [...semanasSel],
        { percentualDivisao: pct, numVendedores: num }
      );
      toast.success(`Divisão aplicada a ${linhas} combinação(ões) loja × semana`);
      onChanged?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro na edição em massa");
    } finally {
      setAplicando(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          Divisão Semanal (edição em massa)
        </CardTitle>
        <CardDescription>
          Ajuste % da meta distribuída e nº de vendedores por semana para várias lojas de uma
          vez — útil em entradas/saídas de vendedores. Campo vazio mantém o valor vigente.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {semanas.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Nenhuma semana gerada para {String(mes).padStart(2, "0")}/{ano}. Gere as semanas de
            ao menos uma loja acima para habilitar a edição em massa.
          </p>
        ) : (
          <>
            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Lojas ({lojasSel.size} selecionada(s))</Label>
                <div className="max-h-48 overflow-y-auto border rounded-md p-2 space-y-1">
                  {empresas.map((emp) => (
                    <label
                      key={emp.codEmpresa}
                      className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted rounded px-1 py-0.5"
                    >
                      <Checkbox
                        checked={lojasSel.has(emp.codEmpresa)}
                        onCheckedChange={() => toggle(lojasSel, emp.codEmpresa, setLojasSel)}
                      />
                      {emp.nome}
                    </label>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setLojasSel(new Set(empresas.map((e) => e.codEmpresa)))}
                  >
                    Todas
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setLojasSel(new Set())}>
                    Nenhuma
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Semanas ({semanasSel.size} selecionada(s))</Label>
                <div className="flex flex-wrap gap-2">
                  {semanas.map((s) => (
                    <Badge
                      key={s.inicio}
                      variant={semanasSel.has(s.inicio) ? "default" : "outline"}
                      className="cursor-pointer select-none"
                      onClick={() => toggle(semanasSel, s.inicio, setSemanasSel)}
                    >
                      {fmtData(s.inicio)} – {fmtData(s.fim)}
                    </Badge>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSemanasSel(new Set(semanas.map((s) => s.inicio)))}
                  >
                    Todas
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setSemanasSel(new Set())}>
                    Nenhuma
                  </Button>
                </div>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3 items-end">
              <div className="space-y-2">
                <Label className="flex items-center gap-1">
                  <Percent className="h-3 w-3" /> % da meta distribuída
                </Label>
                <Input
                  type="number"
                  min="1"
                  max="100"
                  step="0.5"
                  placeholder="manter vigente"
                  value={percentual}
                  onChange={(e) => setPercentual(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-1">
                  <Users className="h-3 w-3" /> Nº de vendedores
                </Label>
                <Input
                  type="number"
                  min="1"
                  step="1"
                  placeholder="manter vigente"
                  value={numVendedores}
                  onChange={(e) => setNumVendedores(e.target.value)}
                />
              </div>
              <Button onClick={handleAplicar} disabled={aplicando}>
                {aplicando ? "Aplicando..." : "Aplicar em massa"}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
