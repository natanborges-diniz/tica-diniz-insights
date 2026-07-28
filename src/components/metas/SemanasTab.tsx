// src/components/metas/SemanasTab.tsx
// Fase 2b — aba principal de configuração de metas semanais
// (docs/REVISAO_VENDAS_METAS.md §5.4 item 1).
//
// Fluxo: loja + mês/ano → sugerir meta mensal (ano anterior +10%) → salvar
// meta mensal (metas_vendas) → gerar semanas (metas_semanais tipo LOJA) →
// grade com ajuste fino por semana (origem AJUSTADA) e meta derivada por
// vendedor (divisao_semanal). O painel de divisão semanal em massa fica logo
// abaixo da grade.

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CalendarRange, Check, Pencil, RotateCcw, Sparkles, Save, X, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import type { Empresa } from "@/services/empresaService";
import { getMetasPorPeriodo, upsertMeta } from "@/services/metasService";
import {
  gerarSemanasLoja,
  ajustarMetaSemanal,
  reverterAjuste,
  getMetasSemanais,
  getDivisaoSemanal,
  sugerirMetaMensalLoja,
  type MetaSemanal,
  type DivisaoSemanal,
} from "@/services/metasSemanaisService";
import { derivarMetaVendedor } from "@/lib/metas/metasSemanais";
import { DivisaoSemanalPanel } from "./DivisaoSemanalPanel";

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const FONTE_LABEL: Record<string, string> = {
  RECEBIMENTOS: "recebimentos do ano anterior",
  VENDAS: "vendas do ano anterior (fallback)",
  SEM_HISTORICO: "sem histórico",
};

function fmtBRL(n: number): string {
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtData(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

interface LinhaGrade extends MetaSemanal {
  divisao: DivisaoSemanal;
  metaVendedor: number;
}

interface SemanasTabProps {
  empresas: Empresa[];
  ano: number;
}

export function SemanasTab({ empresas, ano }: SemanasTabProps) {
  const mesAtual = new Date().getMonth() + 1;

  const [codEmpresa, setCodEmpresa] = useState<number | null>(null);
  const [mes, setMes] = useState<number>(mesAtual);

  // meta mensal (metas_vendas)
  const [metaMensal, setMetaMensal] = useState("");
  const [metaMensalSalva, setMetaMensalSalva] = useState<number | null>(null);
  const [sugestao, setSugestao] = useState<{
    sugestao: number;
    realizadoAnoAnterior: number;
    fonte: "RECEBIMENTOS" | "VENDAS" | "SEM_HISTORICO";
  } | null>(null);
  const [loadingSugestao, setLoadingSugestao] = useState(false);
  const [salvandoMeta, setSalvandoMeta] = useState(false);

  // grade de semanas
  const [grade, setGrade] = useState<LinhaGrade[]>([]);
  const [avisos, setAvisos] = useState<string[]>([]);
  const [loadingGrade, setLoadingGrade] = useState(false);
  const [gerando, setGerando] = useState(false);

  // ajuste inline
  const [editandoSemana, setEditandoSemana] = useState<string | null>(null);
  const [valorAjuste, setValorAjuste] = useState("");

  const empresaSelecionada = empresas.find((e) => e.codEmpresa === codEmpresa) || null;

  // ---------- carregamento ----------
  const carregarGrade = useCallback(async () => {
    if (!codEmpresa) {
      setGrade([]);
      return;
    }
    setLoadingGrade(true);
    try {
      const metas = await getMetasSemanais({ tipo: "LOJA", codEmpresa, ano, mes });
      const divisoes = await Promise.all(
        metas.map((m) => getDivisaoSemanal(codEmpresa, m.semanaInicio))
      );
      setGrade(
        metas.map((m, i) => ({
          ...m,
          divisao: divisoes[i],
          metaVendedor: derivarMetaVendedor(
            m.metaValor,
            divisoes[i].percentualDivisao,
            divisoes[i].numVendedores
          ),
        }))
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao carregar semanas");
      setGrade([]);
    } finally {
      setLoadingGrade(false);
    }
  }, [codEmpresa, ano, mes]);

  const carregarMetaMensal = useCallback(async () => {
    if (!codEmpresa) {
      setMetaMensal("");
      setMetaMensalSalva(null);
      return;
    }
    const metas = await getMetasPorPeriodo("LOJA", ano, mes);
    const meta = metas.find((m) => m.codReferencia === codEmpresa);
    setMetaMensalSalva(meta?.metaFaturamento ?? null);
    setMetaMensal(meta ? String(meta.metaFaturamento) : "");
  }, [codEmpresa, ano, mes]);

  useEffect(() => {
    setSugestao(null);
    setAvisos([]);
    setEditandoSemana(null);
    carregarMetaMensal();
    carregarGrade();
  }, [carregarMetaMensal, carregarGrade]);

  // ---------- ações ----------
  const handleSugerir = async () => {
    if (!codEmpresa) {
      toast.error("Selecione uma loja");
      return;
    }
    setLoadingSugestao(true);
    try {
      const result = await sugerirMetaMensalLoja(codEmpresa, ano, mes);
      setSugestao(result);
      if (result.fonte === "SEM_HISTORICO") {
        toast.warning("Sem histórico no ano anterior para sugerir meta");
      } else {
        setMetaMensal(String(result.sugestao));
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao sugerir meta");
    } finally {
      setLoadingSugestao(false);
    }
  };

  const handleSalvarMetaMensal = async () => {
    if (!codEmpresa || !empresaSelecionada) {
      toast.error("Selecione uma loja");
      return;
    }
    const valor = Number(metaMensal);
    if (!valor || valor <= 0) {
      toast.error("Informe uma meta mensal válida");
      return;
    }
    setSalvandoMeta(true);
    try {
      // preserva os demais campos se a meta mensal já existir
      const existentes = await getMetasPorPeriodo("LOJA", ano, mes);
      const atual = existentes.find((m) => m.codReferencia === codEmpresa);
      const ok = await upsertMeta({
        tipo: "LOJA",
        codReferencia: codEmpresa,
        nomeReferencia: empresaSelecionada.nome,
        ano,
        mes,
        metaFaturamento: valor,
        metaTicketMedio: atual?.metaTicketMedio ?? 0,
        metaDescontoMax: atual?.metaDescontoMax ?? 0,
        metaQtdVendas: atual?.metaQtdVendas ?? 0,
        numVendedores: atual?.numVendedores ?? 1,
        percentualAceitavel: atual?.percentualAceitavel ?? 100,
      });
      if (!ok) throw new Error("Erro ao salvar meta mensal");
      setMetaMensalSalva(valor);
      toast.success(`Meta mensal de ${empresaSelecionada.nome} salva: R$ ${fmtBRL(valor)}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar meta mensal");
    } finally {
      setSalvandoMeta(false);
    }
  };

  const handleGerarSemanas = async () => {
    if (!codEmpresa) {
      toast.error("Selecione uma loja");
      return;
    }
    setGerando(true);
    try {
      const { semanas, avisos: novosAvisos } = await gerarSemanasLoja(codEmpresa, ano, mes);
      setAvisos(novosAvisos);
      toast.success(`${semanas.length} semana(s) gerada(s)`);
      await carregarGrade();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao gerar semanas");
    } finally {
      setGerando(false);
    }
  };

  const iniciarAjuste = (linha: LinhaGrade) => {
    setEditandoSemana(linha.semanaInicio);
    setValorAjuste(String(linha.metaValor));
  };

  const handleSalvarAjuste = async (linha: LinhaGrade) => {
    if (!codEmpresa) return;
    const valor = Number(valorAjuste);
    if (!valor || valor <= 0) {
      toast.error("Informe um valor válido para o ajuste");
      return;
    }
    try {
      await ajustarMetaSemanal("LOJA", codEmpresa, linha.semanaInicio, valor, {
        codEmpresa,
        nomeReferencia: empresaSelecionada?.nome,
        ano,
        mes,
        semanaFim: linha.semanaFim,
        diasUteis: linha.diasUteis,
      });
      toast.success(`Meta da semana ${fmtData(linha.semanaInicio)} ajustada`);
      setEditandoSemana(null);
      await carregarGrade();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao ajustar meta");
    }
  };

  const handleReverterAjuste = async (linha: LinhaGrade) => {
    if (!codEmpresa) return;
    try {
      await reverterAjuste("LOJA", codEmpresa, linha.semanaInicio);
      // regenerar recalcula o valor AUTO desta semana
      try {
        const { avisos: novosAvisos } = await gerarSemanasLoja(codEmpresa, ano, mes);
        setAvisos(novosAvisos);
      } catch {
        // sem meta mensal não regenera — a linha volta a AUTO com o valor atual
      }
      toast.success("Ajuste revertido — semana voltou para AUTO");
      await carregarGrade();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao reverter ajuste");
    }
  };

  const totalSemanas = grade.reduce((s, l) => s + l.metaValor, 0);

  return (
    <div className="space-y-6">
      {/* Seleção + meta mensal */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarRange className="h-5 w-5" />
            Metas Semanais da Loja
          </CardTitle>
          <CardDescription>
            Configure a meta mensal da loja e gere a grade de semanas do período comercial.
            As metas de vendedor são derivadas automaticamente da meta da loja.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-4">
            <div className="space-y-2 md:col-span-2">
              <Label>Loja</Label>
              <Select
                value={codEmpresa ? String(codEmpresa) : ""}
                onValueChange={(v) => setCodEmpresa(Number(v))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a loja..." />
                </SelectTrigger>
                <SelectContent>
                  {empresas.map((emp) => (
                    <SelectItem key={emp.codEmpresa} value={String(emp.codEmpresa)}>
                      {emp.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Mês</Label>
              <Select value={String(mes)} onValueChange={(v) => setMes(Number(v))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MESES.map((nome, i) => (
                    <SelectItem key={i + 1} value={String(i + 1)}>{nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Ano</Label>
              <Input value={ano} disabled />
              <p className="text-xs text-muted-foreground">Definido no topo da página</p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3 items-end">
            <div className="space-y-2">
              <Label>Meta mensal da loja (R$)</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={metaMensal}
                onChange={(e) => setMetaMensal(e.target.value)}
                placeholder="0,00"
                disabled={!codEmpresa}
              />
              {metaMensalSalva != null && (
                <p className="text-xs text-muted-foreground">
                  Meta salva: R$ {fmtBRL(metaMensalSalva)}
                </p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={handleSugerir}
                disabled={!codEmpresa || loadingSugestao}
              >
                <Sparkles className="h-4 w-4 mr-2" />
                {loadingSugestao ? "Calculando..." : "Sugerir meta (ano ant. +10%)"}
              </Button>
              <Button
                onClick={handleSalvarMetaMensal}
                disabled={!codEmpresa || salvandoMeta || !metaMensal}
              >
                <Save className="h-4 w-4 mr-2" />
                {salvandoMeta ? "Salvando..." : "Salvar meta mensal"}
              </Button>
              <Button
                variant="secondary"
                onClick={handleGerarSemanas}
                disabled={!codEmpresa || gerando}
              >
                <CalendarRange className="h-4 w-4 mr-2" />
                {gerando ? "Gerando..." : "Gerar semanas"}
              </Button>
            </div>
          </div>

          {sugestao && (
            <Alert>
              <Sparkles className="h-4 w-4" />
              <AlertDescription>
                {sugestao.fonte === "SEM_HISTORICO" ? (
                  <>Sem histórico no mesmo período do ano anterior — informe a meta manualmente.</>
                ) : (
                  <>
                    Sugestão: <strong>R$ {fmtBRL(sugestao.sugestao)}</strong> (realizado ano
                    anterior R$ {fmtBRL(sugestao.realizadoAnoAnterior)} +10%, fonte:{" "}
                    {FONTE_LABEL[sugestao.fonte]}). Edite antes de salvar, se quiser.
                  </>
                )}
              </AlertDescription>
            </Alert>
          )}

          {avisos.map((aviso, i) => (
            <Alert key={i}>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{aviso}</AlertDescription>
            </Alert>
          ))}
        </CardContent>
      </Card>

      {/* Grade de semanas */}
      <Card>
        <CardHeader>
          <CardTitle>
            Grade de Semanas
            {empresaSelecionada && ` — ${empresaSelecionada.nome} — ${MESES[mes - 1]} ${ano}`}
          </CardTitle>
          <CardDescription>
            Meta por vendedor = meta da semana × % divisão ÷ nº de vendedores.
            Ajustes manuais marcam a semana como AJUSTADA e sobrevivem à regeração.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loadingGrade ? (
            <Skeleton className="h-40" />
          ) : !codEmpresa ? (
            <p className="text-muted-foreground text-center py-8">Selecione uma loja acima.</p>
          ) : grade.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              Nenhuma semana gerada para este período. Salve a meta mensal e clique em
              "Gerar semanas".
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Semana</TableHead>
                  <TableHead className="text-center">Dias úteis</TableHead>
                  <TableHead className="text-right">Meta da semana</TableHead>
                  <TableHead className="text-right">Meta por vendedor</TableHead>
                  <TableHead className="text-center">Divisão</TableHead>
                  <TableHead className="text-center">Origem</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {grade.map((linha) => {
                  const emEdicao = editandoSemana === linha.semanaInicio;
                  return (
                    <TableRow key={linha.semanaInicio}>
                      <TableCell className="font-medium">
                        {fmtData(linha.semanaInicio)} – {fmtData(linha.semanaFim)}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="secondary">{linha.diasUteis}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {emEdicao ? (
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            className="w-32 ml-auto text-right"
                            value={valorAjuste}
                            onChange={(e) => setValorAjuste(e.target.value)}
                            autoFocus
                          />
                        ) : (
                          <>R$ {fmtBRL(linha.metaValor)}</>
                        )}
                      </TableCell>
                      <TableCell className="text-right">R$ {fmtBRL(linha.metaVendedor)}</TableCell>
                      <TableCell className="text-center text-xs text-muted-foreground">
                        {linha.divisao.percentualDivisao}% ÷ {linha.divisao.numVendedores} vend.
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant={linha.origem === "AJUSTADA" ? "default" : "outline"}>
                          {linha.origem}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {emEdicao ? (
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Confirmar ajuste"
                              onClick={() => handleSalvarAjuste(linha)}
                            >
                              <Check className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Cancelar"
                              onClick={() => setEditandoSemana(null)}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        ) : (
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Ajustar meta da semana"
                              onClick={() => iniciarAjuste(linha)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            {linha.origem === "AJUSTADA" && (
                              <Button
                                variant="ghost"
                                size="icon"
                                title="Reverter para AUTO"
                                onClick={() => handleReverterAjuste(linha)}
                              >
                                <RotateCcw className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
                <TableRow>
                  <TableCell className="font-semibold">Total</TableCell>
                  <TableCell className="text-center font-semibold">
                    {grade.reduce((s, l) => s + l.diasUteis, 0)}
                  </TableCell>
                  <TableCell className="text-right font-semibold">
                    R$ {fmtBRL(totalSemanas)}
                  </TableCell>
                  <TableCell colSpan={4} />
                </TableRow>
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Divisão semanal em massa */}
      <DivisaoSemanalPanel empresas={empresas} ano={ano} mes={mes} onChanged={carregarGrade} />
    </div>
  );
}
