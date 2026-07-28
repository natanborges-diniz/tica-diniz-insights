// src/components/metas/GradeSemanasLoja.tsx
// Grade de semanas de UMA loja: meta da semana (ajustável), dias úteis,
// divisão (% e nº de vendedores da SEMANA, editáveis inline) e meta derivada
// por vendedor. Usada pela MetasSemanaisTab para 1..N lojas.

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Check, Pencil, RotateCcw, X } from "lucide-react";
import { toast } from "sonner";
import {
  ajustarMetaSemanal,
  reverterAjuste,
  upsertDivisaoEmMassa,
  type MetaSemanal,
  type DivisaoSemanal,
} from "@/services/metasSemanaisService";
import { derivarMetaVendedor } from "@/lib/metas/metasSemanais";

export interface LinhaGradeSemana extends MetaSemanal {
  divisao: DivisaoSemanal;
}

function fmtBRL(n: number): string {
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtData(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

interface GradeSemanasLojaProps {
  codEmpresa: number;
  nomeLoja: string;
  ano: number;
  mes: number;
  linhas: LinhaGradeSemana[];
  onChanged: () => void;
}

export function GradeSemanasLoja({
  codEmpresa, nomeLoja, ano, mes, linhas, onChanged,
}: GradeSemanasLojaProps) {
  const [editandoMeta, setEditandoMeta] = useState<string | null>(null);
  const [valorMeta, setValorMeta] = useState("");
  const [editandoDivisao, setEditandoDivisao] = useState<string | null>(null);
  const [valorPct, setValorPct] = useState("");
  const [valorNum, setValorNum] = useState("");

  const salvarMeta = async (linha: LinhaGradeSemana) => {
    const valor = Number(valorMeta);
    if (!valor || valor <= 0) {
      toast.error("Valor inválido");
      return;
    }
    try {
      await ajustarMetaSemanal("LOJA", codEmpresa, linha.semanaInicio, valor, {
        codEmpresa,
        nomeReferencia: nomeLoja,
        ano,
        mes,
        semanaFim: linha.semanaFim,
        diasUteis: linha.diasUteis,
      });
      toast.success(`Meta da semana ${fmtData(linha.semanaInicio)} ajustada`);
      setEditandoMeta(null);
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao ajustar");
    }
  };

  const reverter = async (linha: LinhaGradeSemana) => {
    try {
      await reverterAjuste("LOJA", codEmpresa, linha.semanaInicio);
      toast.success("Semana voltou para AUTO — gere as semanas para recalcular");
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao reverter");
    }
  };

  const salvarDivisao = async (linha: LinhaGradeSemana) => {
    const pct = valorPct === "" ? undefined : Number(valorPct);
    const num = valorNum === "" ? undefined : Number(valorNum);
    if (pct !== undefined && (pct <= 0 || pct > 100)) {
      toast.error("% entre 0 e 100");
      return;
    }
    if (num !== undefined && num < 1) {
      toast.error("Nº de vendedores mínimo 1");
      return;
    }
    try {
      await upsertDivisaoEmMassa([codEmpresa], [linha.semanaInicio], {
        percentualDivisao: pct,
        numVendedores: num,
      });
      toast.success(`Divisão da semana ${fmtData(linha.semanaInicio)} atualizada`);
      setEditandoDivisao(null);
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar divisão");
    }
  };

  const totalMeta = linhas.reduce((s, l) => s + l.metaValor, 0);
  const totalDias = linhas.reduce((s, l) => s + l.diasUteis, 0);

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Semana</TableHead>
          <TableHead className="text-center">Dias úteis</TableHead>
          <TableHead className="text-right">Meta da semana</TableHead>
          <TableHead className="text-center">Divisão (% · vend.)</TableHead>
          <TableHead className="text-right">Meta / vendedor</TableHead>
          <TableHead className="text-center">Origem</TableHead>
          <TableHead className="text-right">Ações</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {linhas.map((linha) => {
          const metaVendedor = derivarMetaVendedor(
            linha.metaValor,
            linha.divisao.percentualDivisao,
            linha.divisao.numVendedores
          );
          const emEdMeta = editandoMeta === linha.semanaInicio;
          const emEdDiv = editandoDivisao === linha.semanaInicio;
          return (
            <TableRow key={linha.semanaInicio}>
              <TableCell className="font-medium">
                {fmtData(linha.semanaInicio)} – {fmtData(linha.semanaFim)}
              </TableCell>
              <TableCell className="text-center">
                <Badge variant="secondary">{linha.diasUteis}</Badge>
              </TableCell>
              <TableCell className="text-right">
                {emEdMeta ? (
                  <Input
                    type="number" step="0.01" min="0" autoFocus
                    className="w-32 ml-auto text-right"
                    value={valorMeta}
                    onChange={(e) => setValorMeta(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && salvarMeta(linha)}
                  />
                ) : (
                  <>R$ {fmtBRL(linha.metaValor)}</>
                )}
              </TableCell>
              <TableCell className="text-center">
                {emEdDiv ? (
                  <span className="inline-flex items-center gap-1">
                    <Input
                      type="number" min="1" max="100" step="0.5"
                      className="w-16 text-right"
                      value={valorPct}
                      onChange={(e) => setValorPct(e.target.value)}
                      placeholder="%"
                    />
                    <Input
                      type="number" min="1" step="1"
                      className="w-14 text-right"
                      value={valorNum}
                      onChange={(e) => setValorNum(e.target.value)}
                      placeholder="nº"
                      onKeyDown={(e) => e.key === "Enter" && salvarDivisao(linha)}
                    />
                    <Button variant="ghost" size="icon" onClick={() => salvarDivisao(linha)}>
                      <Check className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => setEditandoDivisao(null)}>
                      <X className="h-4 w-4" />
                    </Button>
                  </span>
                ) : (
                  <button
                    type="button"
                    className="text-sm hover:underline"
                    title="Editar divisão desta semana"
                    onClick={() => {
                      setEditandoDivisao(linha.semanaInicio);
                      setValorPct(String(linha.divisao.percentualDivisao));
                      setValorNum(String(linha.divisao.numVendedores));
                    }}
                  >
                    {linha.divisao.percentualDivisao}% · {linha.divisao.numVendedores} vend.
                  </button>
                )}
              </TableCell>
              <TableCell className="text-right">R$ {fmtBRL(metaVendedor)}</TableCell>
              <TableCell className="text-center">
                <Badge variant={linha.origem === "AJUSTADA" ? "default" : "outline"}>
                  {linha.origem}
                </Badge>
              </TableCell>
              <TableCell className="text-right">
                {emEdMeta ? (
                  <span className="inline-flex gap-1">
                    <Button variant="ghost" size="icon" onClick={() => salvarMeta(linha)}>
                      <Check className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => setEditandoMeta(null)}>
                      <X className="h-4 w-4" />
                    </Button>
                  </span>
                ) : (
                  <span className="inline-flex gap-1">
                    <Button
                      variant="ghost" size="icon" title="Ajustar meta da semana"
                      onClick={() => {
                        setEditandoMeta(linha.semanaInicio);
                        setValorMeta(String(linha.metaValor));
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    {linha.origem === "AJUSTADA" && (
                      <Button
                        variant="ghost" size="icon" title="Reverter para AUTO"
                        onClick={() => reverter(linha)}
                      >
                        <RotateCcw className="h-4 w-4" />
                      </Button>
                    )}
                  </span>
                )}
              </TableCell>
            </TableRow>
          );
        })}
        <TableRow>
          <TableCell className="font-semibold">Total</TableCell>
          <TableCell className="text-center font-semibold">{totalDias}</TableCell>
          <TableCell className="text-right font-semibold">R$ {fmtBRL(totalMeta)}</TableCell>
          <TableCell colSpan={4} />
        </TableRow>
      </TableBody>
    </Table>
  );
}
