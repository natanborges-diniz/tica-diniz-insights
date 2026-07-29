// src/components/metas/MetasSemanaisTab.tsx
// Fase 2 (revisada) — fluxo ÚNICO de metas semanais para 1..N lojas:
//   1. selecione as lojas e o mês;
//   2. tabela do período: meta mensal (com sugestão ano anterior +10%),
//      nº de vendedores da loja, DIAS ÚTEIS (calendário clicável) e a
//      META DIÁRIA (= meta mensal ÷ dias úteis) — a taxa-base de tudo;
//   3. salvar + gerar semanas para todas as lojas selecionadas;
//   4. grades por loja com divisão semanal editável inline + aplicação em
//      massa no mesmo lugar (sem áreas separadas).

import { useState, useEffect, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  CalendarRange, CalendarDays, Sparkles, Save, AlertTriangle, Users, Percent,
} from "lucide-react";
import { toast } from "sonner";
import type { Empresa } from "@/services/empresaService";
import { getMetasPorPeriodo, upsertMeta } from "@/services/metasService";
import {
  getMetaPeriodo,
  getFeriados,
  getLojasConfiguracao,
  getLojasExcecoes,
  upsertLojaConfiguracao,
} from "@/services/calendarioService";
import {
  getDatasDoPeriodo,
  type Feriado,
  type LojaConfiguracao,
} from "@/lib/metas/calendario";
import { gerarSemanasDoPeriodo, gerarSemanasDeCortes } from "@/lib/metas/metasSemanais";
import {
  gerarSemanasLoja,
  getMetasSemanais,
  getDivisaoSemanal,
  getSemanaCortes,
  sugerirMetaMensalLoja,
  upsertDivisaoEmMassa,
} from "@/services/metasSemanaisService";
import { GradeSemanasLoja, type LinhaGradeSemana } from "./GradeSemanasLoja";
import { CalendarioLojaDialog } from "./CalendarioLojaDialog";
import { CortesSemanaDialog } from "./CortesSemanaDialog";
import { MapaMetasMatriz } from "./MapaMetasMatriz";

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

function fmtBRL(n: number): string {
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtData(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function toISO(d: Date): string {
  return d.toISOString().split("T")[0];
}

interface LinhaLoja {
  codEmpresa: number;
  nome: string;
  metaMensal: string; // input
  metaSalva: number | null;
  numVendedores: string; // input (lojas_configuracao)
  diasUteis: number;
  sugestao?: { valor: number; fonte: string };
}

interface MetasSemanaisTabProps {
  empresas: Empresa[];
  ano: number;
}

export function MetasSemanaisTab({ empresas, ano }: MetasSemanaisTabProps) {
  const mesAtual = new Date().getMonth() + 1;
  const [mes, setMes] = useState<number>(mesAtual);
  const [lojasSel, setLojasSel] = useState<Set<number>>(new Set());

  const [periodo, setPeriodo] = useState<{ ini: string; fim: string } | null>(null);
  const [feriados, setFeriados] = useState<Feriado[]>([]);
  const [configs, setConfigs] = useState<Map<number, LojaConfiguracao>>(new Map());
  const [linhas, setLinhas] = useState<LinhaLoja[]>([]);
  const [loading, setLoading] = useState(false);
  const [processando, setProcessando] = useState(false);
  const [avisos, setAvisos] = useState<string[]>([]);

  // grades por loja
  const [grades, setGrades] = useState<Map<number, LinhaGradeSemana[]>>(new Map());

  // divisão em massa (integrada)
  const [semanasSelMassa, setSemanasSelMassa] = useState<Set<string>>(new Set());
  const [pctMassa, setPctMassa] = useState("");
  const [numMassa, setNumMassa] = useState("");

  // calendário
  const [calendarioLoja, setCalendarioLoja] = useState<LinhaLoja | null>(null);

  // refresh do mapa de metas após salvar/gerar
  const [mapaRefresh, setMapaRefresh] = useState(0);

  // cortes semanais manuais
  const [cortesOpen, setCortesOpen] = useState(false);
  const [cortesManuais, setCortesManuais] = useState(false);

  const nomeLoja = useCallback(
    (cod: number) => empresas.find((e) => e.codEmpresa === cod)?.nome ?? `Loja ${cod}`,
    [empresas]
  );

  const toggleLoja = (cod: number) => {
    const novo = new Set(lojasSel);
    if (novo.has(cod)) novo.delete(cod);
    else novo.add(cod);
    setLojasSel(novo);
  };

  // ---------- carregamento ----------
  const carregar = useCallback(async () => {
    if (!lojasSel.size) {
      setLinhas([]);
      setGrades(new Map());
      return;
    }
    setLoading(true);
    try {
      const periodoCfg = await getMetaPeriodo(ano, mes);
      const { dataInicio, dataFim } = getDatasDoPeriodo(ano, mes, periodoCfg);
      const ini = toISO(dataInicio);
      const fim = toISO(dataFim);
      setPeriodo({ ini, fim });

      const [fer, cfgs, metasMensais, metasSemanaisTodas, cortes] = await Promise.all([
        getFeriados(ano),
        getLojasConfiguracao(),
        getMetasPorPeriodo("LOJA", ano, mes),
        getMetasSemanais({ tipo: "LOJA", ano, mes }),
        getSemanaCortes(ano, mes),
      ]);
      setFeriados(fer);
      setCortesManuais(cortes.length > 0);
      const cfgMap = new Map(cfgs.map((c) => [c.codEmpresa, c]));
      setConfigs(cfgMap);

      const lojas = [...lojasSel].sort((a, b) => a - b);

      // dias úteis por loja (cálculo puro, com exceções do período)
      const novasLinhas: LinhaLoja[] = await Promise.all(
        lojas.map(async (cod) => {
          const excecoes = await getLojasExcecoes(cod, ini, fim);
          const cfg = cfgMap.get(cod) ?? null;
          const semanas = cortes.length
            ? gerarSemanasDeCortes(cortes, cfg, fer, excecoes)
            : gerarSemanasDoPeriodo(dataInicio, dataFim, cfg, fer, excecoes);
          const diasUteis = semanas.reduce((s, w) => s + w.diasUteis, 0);
          const metaSalva =
            metasMensais.find((m) => m.codReferencia === cod)?.metaFaturamento ?? null;
          return {
            codEmpresa: cod,
            nome: nomeLoja(cod),
            metaMensal: metaSalva != null ? String(metaSalva) : "",
            metaSalva,
            numVendedores: String(cfg?.numVendedores ?? 1),
            diasUteis,
          };
        })
      );
      setLinhas(novasLinhas);

      // grades já geradas
      const novasGrades = new Map<number, LinhaGradeSemana[]>();
      for (const cod of lojas) {
        const metas = metasSemanaisTodas.filter((m) => m.codReferencia === cod);
        if (!metas.length) continue;
        const divisoes = await Promise.all(
          metas.map((m) => getDivisaoSemanal(cod, m.semanaInicio))
        );
        novasGrades.set(
          cod,
          metas.map((m, i) => ({ ...m, divisao: divisoes[i] }))
        );
      }
      setGrades(novasGrades);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao carregar");
    } finally {
      setLoading(false);
    }
  }, [lojasSel, ano, mes, nomeLoja]);

  useEffect(() => {
    setAvisos([]);
    setSemanasSelMassa(new Set());
    carregar();
  }, [carregar]);

  // ---------- ações ----------
  const handleSugerirTodas = async () => {
    setProcessando(true);
    try {
      const atualizadas = await Promise.all(
        linhas.map(async (l) => {
          const r = await sugerirMetaMensalLoja(l.codEmpresa, ano, mes);
          return r.fonte === "SEM_HISTORICO"
            ? l
            : { ...l, metaMensal: String(r.sugestao), sugestao: { valor: r.sugestao, fonte: r.fonte } };
        })
      );
      setLinhas(atualizadas);
      const sem = atualizadas.filter((l) => !l.sugestao).length;
      toast.success(
        `Sugestões aplicadas (ano anterior +10%)${sem ? ` — ${sem} loja(s) sem histórico` : ""}`
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao sugerir");
    } finally {
      setProcessando(false);
    }
  };

  const handleSalvarEGerar = async () => {
    const invalidas = linhas.filter((l) => !Number(l.metaMensal) || Number(l.metaMensal) <= 0);
    if (invalidas.length) {
      toast.error(`Informe a meta mensal de: ${invalidas.map((l) => l.nome).join(", ")}`);
      return;
    }
    setProcessando(true);
    const todosAvisos: string[] = [];
    try {
      for (const l of linhas) {
        // 1) nº de vendedores da loja (configuração padrão)
        const cfg = configs.get(l.codEmpresa);
        const numV = Math.max(1, Number(l.numVendedores) || 1);
        if (numV !== (cfg?.numVendedores ?? 1)) {
          await upsertLojaConfiguracao({
            codEmpresa: l.codEmpresa,
            tipoLoja: cfg?.tipoLoja ?? "RUA",
            abreDomingo: cfg?.abreDomingo ?? false,
            abreFeriado: cfg?.abreFeriado ?? false,
            numVendedores: numV,
            percentualAceitavel: cfg?.percentualAceitavel ?? 100,
          });
        }
        // 2) meta mensal
        const ok = await upsertMeta({
          tipo: "LOJA",
          codReferencia: l.codEmpresa,
          nomeReferencia: l.nome,
          ano,
          mes,
          metaFaturamento: Number(l.metaMensal),
          metaTicketMedio: 0,
          metaDescontoMax: 0,
          metaQtdVendas: 0,
          numVendedores: numV,
          percentualAceitavel: 100,
        });
        if (!ok) throw new Error(`Erro ao salvar meta de ${l.nome}`);
        // 3) gerar semanas
        const { avisos: av } = await gerarSemanasLoja(l.codEmpresa, ano, mes);
        av.forEach((a) => todosAvisos.push(`${l.nome}: ${a}`));
      }
      setAvisos(todosAvisos);
      toast.success(`Metas salvas e semanas geradas para ${linhas.length} loja(s)`);
      await carregar();
      setMapaRefresh((k) => k + 1);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar/gerar");
    } finally {
      setProcessando(false);
    }
  };

  const handleAplicarMassa = async () => {
    if (!semanasSelMassa.size) {
      toast.error("Marque as semanas que receberão a divisão");
      return;
    }
    const pct = pctMassa === "" ? undefined : Number(pctMassa);
    const num = numMassa === "" ? undefined : Number(numMassa);
    if (pct === undefined && num === undefined) {
      toast.error("Informe % de divisão e/ou nº de vendedores");
      return;
    }
    setProcessando(true);
    try {
      const n = await upsertDivisaoEmMassa([...lojasSel], [...semanasSelMassa], {
        percentualDivisao: pct,
        numVendedores: num,
      });
      toast.success(`Divisão aplicada a ${n} combinação(ões) loja × semana`);
      await carregar();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro na aplicação em massa");
    } finally {
      setProcessando(false);
    }
  };

  const atualizarLinha = (cod: number, patch: Partial<LinhaLoja>) => {
    setLinhas((ls) => ls.map((l) => (l.codEmpresa === cod ? { ...l, ...patch } : l)));
  };

  // semanas distintas (para a aplicação em massa)
  const semanasDistintas = useMemo(() => {
    const set = new Map<string, string>();
    grades.forEach((g) => g.forEach((l) => set.set(l.semanaInicio, l.semanaFim)));
    return Array.from(set.entries())
      .map(([ini, fim]) => ({ ini, fim }))
      .sort((a, b) => a.ini.localeCompare(b.ini));
  }, [grades]);

  const temGrade = grades.size > 0;

  return (
    <div className="space-y-6">
      {/* 0. Mapa geral lojas × meses */}
      <MapaMetasMatriz
        empresas={empresas}
        ano={ano}
        refreshKey={mapaRefresh}
        onSelecionar={(cod, m) => {
          setMes(m);
          setLojasSel(new Set([cod]));
        }}
      />

      {/* 1. Seleção */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarRange className="h-5 w-5" />
            Metas Semanais
          </CardTitle>
          <CardDescription>
            Selecione uma ou várias lojas e o mês. A meta diária (meta mensal ÷ dias úteis) é a
            taxa-base: meta da semana = meta diária × dias úteis da semana; meta do vendedor =
            meta da semana × % divisão ÷ nº de vendedores.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-2">
              <Label>Mês / Ano</Label>
              <div className="flex gap-2">
                <Select value={String(mes)} onValueChange={(v) => setMes(Number(v))}>
                  <SelectTrigger className="w-36">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MESES.map((nome, i) => (
                      <SelectItem key={i + 1} value={String(i + 1)}>{nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input value={ano} disabled className="w-20" />
              </div>
            </div>
            {periodo && (
              <div className="flex items-center gap-2 mb-1">
                <Badge variant="outline">
                  Período comercial: {fmtData(periodo.ini)} a {fmtData(periodo.fim)}
                </Badge>
                <Button variant="outline" size="sm" onClick={() => setCortesOpen(true)}>
                  <CalendarRange className="h-3.5 w-3.5 mr-1.5" />
                  Cortes das semanas
                  {cortesManuais && <Badge className="ml-2" variant="secondary">manual</Badge>}
                </Button>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Lojas ({lojasSel.size} selecionada(s))</Label>
              <span className="flex gap-2">
                <Button
                  variant="ghost" size="sm"
                  onClick={() => setLojasSel(new Set(empresas.map((e) => e.codEmpresa)))}
                >
                  Todas
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setLojasSel(new Set())}>
                  Nenhuma
                </Button>
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {empresas.map((emp) => (
                <label
                  key={emp.codEmpresa}
                  className={[
                    "flex items-center gap-1.5 text-sm border rounded-full px-3 py-1 cursor-pointer select-none transition-colors",
                    lojasSel.has(emp.codEmpresa)
                      ? "bg-primary text-primary-foreground border-primary"
                      : "hover:bg-muted",
                  ].join(" ")}
                >
                  <Checkbox
                    className="hidden"
                    checked={lojasSel.has(emp.codEmpresa)}
                    onCheckedChange={() => toggleLoja(emp.codEmpresa)}
                  />
                  {emp.nome}
                </label>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 2. Tabela do período (metas mensais, vendedores, dias úteis, meta diária) */}
      {lojasSel.size > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle>Metas do período — {MESES[mes - 1]} {ano}</CardTitle>
              <CardDescription>
                Clique nos dias úteis para abrir o calendário da loja e ajustar dias
                abertos/fechados.
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleSugerirTodas} disabled={processando || loading}>
                <Sparkles className="h-4 w-4 mr-2" />
                Sugerir metas (+10%)
              </Button>
              <Button onClick={handleSalvarEGerar} disabled={processando || loading}>
                <Save className="h-4 w-4 mr-2" />
                {processando ? "Processando..." : "Salvar e gerar semanas"}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-40" />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Loja</TableHead>
                    <TableHead className="text-right">Meta mensal (R$)</TableHead>
                    <TableHead className="text-center">Nº vendedores</TableHead>
                    <TableHead className="text-center">Dias úteis</TableHead>
                    <TableHead className="text-right">Meta diária</TableHead>
                    <TableHead className="text-right">Meta diária / vendedor</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {linhas.map((l) => {
                    const meta = Number(l.metaMensal) || 0;
                    const numV = Math.max(1, Number(l.numVendedores) || 1);
                    const metaDiaria = l.diasUteis > 0 ? meta / l.diasUteis : 0;
                    return (
                      <TableRow key={l.codEmpresa}>
                        <TableCell className="font-medium">
                          {l.nome}
                          {l.sugestao && (
                            <span className="block text-xs text-muted-foreground">
                              sugerido ({l.sugestao.fonte === "RECEBIMENTOS" ? "recebimentos" : "vendas"} +10%)
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Input
                            type="number" step="0.01" min="0"
                            className="w-36 ml-auto text-right"
                            value={l.metaMensal}
                            onChange={(e) => atualizarLinha(l.codEmpresa, { metaMensal: e.target.value })}
                            placeholder={l.metaSalva != null ? String(l.metaSalva) : "0,00"}
                          />
                        </TableCell>
                        <TableCell className="text-center">
                          <Input
                            type="number" min="1" step="1"
                            className="w-20 mx-auto text-center"
                            value={l.numVendedores}
                            onChange={(e) => atualizarLinha(l.codEmpresa, { numVendedores: e.target.value })}
                          />
                        </TableCell>
                        <TableCell className="text-center">
                          <Button
                            variant="outline" size="sm"
                            title="Abrir calendário da loja"
                            onClick={() => setCalendarioLoja(l)}
                          >
                            <CalendarDays className="h-3.5 w-3.5 mr-1.5" />
                            {l.diasUteis}
                          </Button>
                        </TableCell>
                        <TableCell className="text-right">
                          {meta > 0 ? `R$ ${fmtBRL(metaDiaria)}` : "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          {meta > 0 ? `R$ ${fmtBRL(metaDiaria / numV)}` : "—"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
            {avisos.map((a, i) => (
              <Alert key={i} className="mt-3">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>{a}</AlertDescription>
              </Alert>
            ))}
          </CardContent>
        </Card>
      )}

      {/* 3. Grades por loja + divisão em massa integrada */}
      {temGrade && (
        <Card>
          <CardHeader>
            <CardTitle>Grade de Semanas</CardTitle>
            <CardDescription>
              Clique na divisão de uma semana para editá-la, ou marque semanas abaixo e aplique
              % / nº de vendedores a todas as lojas selecionadas de uma vez.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* aplicação em massa — mesmo lugar, sem área separada */}
            {lojasSel.size >= 1 && semanasDistintas.length > 0 && (
              <div className="rounded-lg border p-3 space-y-2 bg-muted/40">
                <div className="flex flex-wrap gap-2 items-center">
                  <span className="text-sm font-medium mr-1">Aplicar em massa:</span>
                  {semanasDistintas.map((s) => (
                    <Badge
                      key={s.ini}
                      variant={semanasSelMassa.has(s.ini) ? "default" : "outline"}
                      className="cursor-pointer select-none"
                      onClick={() => {
                        const novo = new Set(semanasSelMassa);
                        if (novo.has(s.ini)) novo.delete(s.ini);
                        else novo.add(s.ini);
                        setSemanasSelMassa(novo);
                      }}
                    >
                      {fmtData(s.ini)}–{fmtData(s.fim)}
                    </Badge>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1 text-sm">
                    <Percent className="h-3.5 w-3.5" />
                    <Input
                      type="number" min="1" max="100" step="0.5"
                      className="w-24" placeholder="% divisão"
                      value={pctMassa}
                      onChange={(e) => setPctMassa(e.target.value)}
                    />
                  </span>
                  <span className="inline-flex items-center gap-1 text-sm">
                    <Users className="h-3.5 w-3.5" />
                    <Input
                      type="number" min="1" step="1"
                      className="w-24" placeholder="nº vend."
                      value={numMassa}
                      onChange={(e) => setNumMassa(e.target.value)}
                    />
                  </span>
                  <Button size="sm" onClick={handleAplicarMassa} disabled={processando}>
                    Aplicar às {lojasSel.size} loja(s)
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    Campo vazio mantém o valor vigente de cada loja/semana.
                  </span>
                </div>
              </div>
            )}

            {grades.size === 1 ? (
              (() => {
                const [cod, g] = [...grades.entries()][0];
                return (
                  <GradeSemanasLoja
                    codEmpresa={cod}
                    nomeLoja={nomeLoja(cod)}
                    ano={ano}
                    mes={mes}
                    linhas={g}
                    onChanged={carregar}
                  />
                );
              })()
            ) : (
              <Accordion type="multiple" defaultValue={[...grades.keys()].map(String)}>
                {[...grades.entries()].map(([cod, g]) => (
                  <AccordionItem key={cod} value={String(cod)}>
                    <AccordionTrigger>
                      <span className="flex items-center gap-3">
                        {nomeLoja(cod)}
                        <Badge variant="secondary">
                          R$ {fmtBRL(g.reduce((s, l) => s + l.metaValor, 0))}
                        </Badge>
                      </span>
                    </AccordionTrigger>
                    <AccordionContent>
                      <GradeSemanasLoja
                        codEmpresa={cod}
                        nomeLoja={nomeLoja(cod)}
                        ano={ano}
                        mes={mes}
                        linhas={g}
                        onChanged={carregar}
                      />
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            )}
          </CardContent>
        </Card>
      )}

      {/* cortes das semanas (globais do mês) */}
      {periodo && (
        <CortesSemanaDialog
          open={cortesOpen}
          onOpenChange={setCortesOpen}
          ano={ano}
          mes={mes}
          mesLabel={MESES[mes - 1]}
          periodoIni={periodo.ini}
          periodoFim={periodo.fim}
          onChanged={carregar}
        />
      )}

      {/* calendário da loja */}
      {calendarioLoja && periodo && (
        <CalendarioLojaDialog
          open={!!calendarioLoja}
          onOpenChange={(o) => !o && setCalendarioLoja(null)}
          codEmpresa={calendarioLoja.codEmpresa}
          nomeLoja={calendarioLoja.nome}
          dataInicio={periodo.ini}
          dataFim={periodo.fim}
          onChanged={() => {
            toast.info("Dias úteis alterados — salve e gere as semanas para recalcular as metas");
            carregar();
          }}
        />
      )}
    </div>
  );
}
