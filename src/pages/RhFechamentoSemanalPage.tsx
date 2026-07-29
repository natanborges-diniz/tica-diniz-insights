// src/pages/RhFechamentoSemanalPage.tsx
// Fase 4 — Fechamento semanal de comissões p/ RH
// (docs/REVISAO_VENDAS_METAS.md §5.4 item 3): seleciona semana + lojas + modo
// (RECEBIDO padrão / EMITIDO) → prévia por vendedor em DUAS camadas (resumo
// por categoria×origem e detalhe por OS/venda) → "Fechar semana" congela o
// snapshot → export XLSX → API externa via edge rh-fechamentos.

import { useState, useEffect, useCallback } from "react";
import * as XLSX from "xlsx";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  FileSpreadsheet, Lock, Unlock, Calculator, AlertTriangle, ChevronDown,
} from "lucide-react";
import { toast } from "sonner";
import { useEmpresas } from "@/hooks/useEmpresas";
import {
  gerarPrevia,
  fecharSemana,
  listarFechamentos,
  getFechamentoItens,
  reabrirFechamento,
  semanasDoMes,
  type PreviaFechamento,
  type FechamentoResumo,
  type ModoFechamento,
} from "@/services/fechamentoService";
import type { ResultadoVendedor } from "@/lib/comissoes/motorComissao";

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

// ---------- export XLSX (resumo + detalhe) ----------
function exportarXlsx(titulo: string, vendedores: ResultadoVendedor[]) {
  const wb = XLSX.utils.book_new();
  const resumo = vendedores.map((v) => ({
    "Cód. Vendedor": v.codVendedor,
    Vendedor: v.vendedorNome ?? "",
    "Meta Semana": v.metaSemana,
    "% Meta": v.percentualMeta,
    "Base (Venda Período)": v.basePorOrigem.vendaPeriodo,
    "Base (Saldo Anterior)": v.basePorOrigem.saldoAnterior,
    "Base Total": v.baseTotal,
    Restituições: v.restituicoes,
    Comissão: v.comissao,
    Prêmio: v.premioValor,
    "Total a Pagar": v.totalPagar,
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resumo), "Resumo");
  const detalhe = vendedores.flatMap((v) =>
    v.detalhe.map((d) => ({
      "Cód. Vendedor": v.codVendedor,
      Vendedor: v.vendedorNome ?? "",
      "OS/Venda": d.codTransacao,
      Emissão: d.dataEmissao,
      Pagamento: d.dataPagamento,
      Forma: d.formaCategoria,
      Origem: d.origem,
      Valor: d.valor,
      "Taxa %": d.taxa,
      Comissão: d.comissao,
    }))
  );
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detalhe), "Detalhe por OS");
  XLSX.writeFile(wb, `${titulo}.xlsx`);
}

// ---------- tabela de vendedores (resumo + detalhe expandível) ----------
function TabelaFechamento({ vendedores }: { vendedores: ResultadoVendedor[] }) {
  const [aberto, setAberto] = useState<number | null>(null);
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Vendedor</TableHead>
          <TableHead className="text-right">Meta</TableHead>
          <TableHead className="text-right">% Meta</TableHead>
          <TableHead className="text-right">Base</TableHead>
          <TableHead className="text-right">Restit.</TableHead>
          <TableHead className="text-right">Comissão</TableHead>
          <TableHead className="text-right">Prêmio</TableHead>
          <TableHead className="text-right">A pagar</TableHead>
          <TableHead />
        </TableRow>
      </TableHeader>
      <TableBody>
        {vendedores.map((v) => (
          <>
            <TableRow key={v.codVendedor}>
              <TableCell>
                <span className="font-medium">
                  {v.vendedorNome ?? (v.codVendedor === 0 ? "Sem vendedor" : `Vendedor ${v.codVendedor}`)}
                </span>
                <div className="text-xs text-muted-foreground">
                  período R$ {fmtBRL(v.basePorOrigem.vendaPeriodo)} · saldo ant. R${" "}
                  {fmtBRL(v.basePorOrigem.saldoAnterior)}
                  {Object.entries(v.basePorCategoria).map(([c, val]) => (
                    <span key={c}> · {c} R$ {fmtBRL(val as number)}</span>
                  ))}
                </div>
              </TableCell>
              <TableCell className="text-right">R$ {fmtBRL(v.metaSemana)}</TableCell>
              <TableCell className="text-right">{v.percentualMeta}%</TableCell>
              <TableCell className="text-right">R$ {fmtBRL(v.baseTotal)}</TableCell>
              <TableCell className="text-right">
                {v.restituicoes > 0 ? `- R$ ${fmtBRL(v.restituicoes)}` : "—"}
              </TableCell>
              <TableCell className="text-right">R$ {fmtBRL(v.comissao)}</TableCell>
              <TableCell className="text-right">
                {v.premioValor > 0 ? (
                  <span title={
                    (v.premioFaixa ? `faixa ≥${v.premioFaixa.percentualMetaMin}% ` : "") +
                    (v.premioSequencia ? `· sequência ${v.premioSequencia.semanasConsecutivas} sem.` : "")
                  }>
                    R$ {fmtBRL(v.premioValor)}
                  </span>
                ) : "—"}
              </TableCell>
              <TableCell className="text-right font-semibold">R$ {fmtBRL(v.totalPagar)}</TableCell>
              <TableCell>
                <Button
                  variant="ghost" size="icon" title="Detalhe por OS/venda"
                  onClick={() => setAberto(aberto === v.codVendedor ? null : v.codVendedor)}
                >
                  <ChevronDown className={`h-4 w-4 transition-transform ${aberto === v.codVendedor ? "rotate-180" : ""}`} />
                </Button>
              </TableCell>
            </TableRow>
            {aberto === v.codVendedor && (
              <TableRow key={`${v.codVendedor}-det`}>
                <TableCell colSpan={9} className="bg-muted/40">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>OS/Venda</TableHead>
                        <TableHead>Emissão</TableHead>
                        <TableHead>Pagamento</TableHead>
                        <TableHead>Forma</TableHead>
                        <TableHead>Origem</TableHead>
                        <TableHead className="text-right">Valor</TableHead>
                        <TableHead className="text-right">Taxa</TableHead>
                        <TableHead className="text-right">Comissão</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {v.detalhe.map((d, i) => (
                        <TableRow key={i}>
                          <TableCell>{d.codTransacao}</TableCell>
                          <TableCell>{fmtData(d.dataEmissao)}</TableCell>
                          <TableCell>{fmtData(d.dataPagamento)}</TableCell>
                          <TableCell>{d.formaCategoria}</TableCell>
                          <TableCell className="text-xs">{d.origem}</TableCell>
                          <TableCell className="text-right">R$ {fmtBRL(d.valor)}</TableCell>
                          <TableCell className="text-right">{d.taxa}%</TableCell>
                          <TableCell className="text-right">R$ {fmtBRL(d.comissao)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableCell>
              </TableRow>
            )}
          </>
        ))}
      </TableBody>
    </Table>
  );
}

export default function RhFechamentoSemanalPage() {
  const { isAdmin } = useAuth();
  const { empresas } = useEmpresas();

  const hoje = new Date();
  const [ano] = useState(hoje.getFullYear());
  const [mes, setMes] = useState(hoje.getMonth() + 1);
  const [semanas, setSemanas] = useState<{ semanaInicio: string; semanaFim: string }[]>([]);
  const [semanaSel, setSemanaSel] = useState("");
  const [lojasSel, setLojasSel] = useState<Set<number>>(new Set());
  const [modo, setModo] = useState<ModoFechamento>("RECEBIDO");

  const [previas, setPrevias] = useState<PreviaFechamento[]>([]);
  const [gerando, setGerando] = useState(false);
  const [fechando, setFechando] = useState(false);

  const [fechados, setFechados] = useState<FechamentoResumo[]>([]);
  const [itensFechado, setItensFechado] = useState<Record<string, ResultadoVendedor[]>>({});

  // semanas do mês
  useEffect(() => {
    (async () => {
      try {
        const s = await semanasDoMes(ano, mes);
        setSemanas(s);
        setSemanaSel(s.length ? s[0].semanaInicio : "");
      } catch {
        setSemanas([]);
      }
    })();
  }, [ano, mes]);

  const carregarFechados = useCallback(async () => {
    try {
      setFechados(await listarFechamentos({ ano, mes }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao listar fechamentos");
    }
  }, [ano, mes]);

  useEffect(() => {
    carregarFechados();
  }, [carregarFechados]);

  const semana = semanas.find((s) => s.semanaInicio === semanaSel);

  const handleGerarPrevia = async () => {
    if (!semana || !lojasSel.size) {
      toast.error("Selecione a semana e ao menos uma loja");
      return;
    }
    setGerando(true);
    setPrevias([]);
    try {
      const resultado: PreviaFechamento[] = [];
      for (const cod of [...lojasSel].sort((a, b) => a - b)) {
        const nome = empresas.find((e) => e.codEmpresa === cod)?.nome ?? null;
        resultado.push(
          await gerarPrevia(cod, nome, ano, mes, semana.semanaInicio, semana.semanaFim, modo)
        );
      }
      setPrevias(resultado);
      toast.success(`Prévia gerada para ${resultado.length} loja(s)`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao gerar prévia");
    } finally {
      setGerando(false);
    }
  };

  const handleFechar = async (previa: PreviaFechamento) => {
    if (!window.confirm(
      `Fechar a semana ${fmtData(previa.semanaInicio)}–${fmtData(previa.semanaFim)} de ${previa.nomeEmpresa}? O fechamento é imutável (reabertura só admin).`
    )) return;
    setFechando(true);
    try {
      await fecharSemana(previa);
      toast.success(`Semana fechada — ${previa.nomeEmpresa}`);
      setPrevias((ps) => ps.filter((p) => p.codEmpresa !== previa.codEmpresa));
      await carregarFechados();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao fechar");
    } finally {
      setFechando(false);
    }
  };

  const handleVerFechado = async (f: FechamentoResumo) => {
    if (itensFechado[f.id]) return;
    try {
      const itens = await getFechamentoItens(f.id);
      setItensFechado((m) => ({ ...m, [f.id]: itens }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao carregar fechamento");
    }
  };

  const handleReabrir = async (f: FechamentoResumo) => {
    if (!window.confirm(`Reabrir o fechamento de ${f.nomeEmpresa} (${fmtData(f.semanaInicio)})? A reabertura fica registrada.`)) return;
    try {
      await reabrirFechamento(f.id);
      toast.success("Fechamento reaberto — gere nova prévia e feche novamente");
      await carregarFechados();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao reabrir");
    }
  };

  return (
    <div className="container mx-auto px-4 py-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Calculator className="h-5 w-5" />
          Fechamento Semanal — Comissões (RH)
        </h1>
        <p className="text-sm text-muted-foreground">
          Base = valores recebidos na semana (padrão) · fechado é imutável e vai para o RH/integração
        </p>
      </div>

      {/* Seleção */}
      <Card>
        <CardContent className="pt-4 space-y-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-2">
              <Label>Mês</Label>
              <Select value={String(mes)} onValueChange={(v) => setMes(Number(v))}>
                <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MESES.map((n, i) => (
                    <SelectItem key={i + 1} value={String(i + 1)}>{n} {ano}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Semana</Label>
              <Select value={semanaSel} onValueChange={setSemanaSel}>
                <SelectTrigger className="w-48"><SelectValue placeholder="Semana..." /></SelectTrigger>
                <SelectContent>
                  {semanas.map((s) => (
                    <SelectItem key={s.semanaInicio} value={s.semanaInicio}>
                      {fmtData(s.semanaInicio)} – {fmtData(s.semanaFim)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Modo</Label>
              <Select value={modo} onValueChange={(v) => setModo(v as ModoFechamento)}>
                <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="RECEBIDO">Recebido (padrão)</SelectItem>
                  <SelectItem value="EMITIDO">Emitido em OS</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleGerarPrevia} disabled={gerando}>
              <Calculator className="h-4 w-4 mr-2" />
              {gerando ? "Calculando..." : "Gerar prévia"}
            </Button>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Lojas</Label>
            <div className="flex flex-wrap gap-2">
              {empresas.map((emp) => (
                <label
                  key={emp.codEmpresa}
                  className={[
                    "flex items-center gap-1.5 text-sm border rounded-full px-3 py-1 cursor-pointer select-none",
                    lojasSel.has(emp.codEmpresa) ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted",
                  ].join(" ")}
                >
                  <Checkbox
                    className="hidden"
                    checked={lojasSel.has(emp.codEmpresa)}
                    onCheckedChange={() => {
                      const novo = new Set(lojasSel);
                      if (novo.has(emp.codEmpresa)) novo.delete(emp.codEmpresa);
                      else novo.add(emp.codEmpresa);
                      setLojasSel(novo);
                    }}
                  />
                  {emp.nome}
                </label>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Prévias */}
      {gerando && <Skeleton className="h-48" />}
      {previas.map((p) => (
        <Card key={p.codEmpresa}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="flex items-center gap-2">
                {p.nomeEmpresa ?? `Loja ${p.codEmpresa}`}
                <Badge variant="outline">{p.modo}</Badge>
                <Badge variant="secondary">prévia</Badge>
              </CardTitle>
              <CardDescription>
                {fmtData(p.semanaInicio)} – {fmtData(p.semanaFim)} · base R$ {fmtBRL(p.totais.base)} ·
                comissão R$ {fmtBRL(p.totais.comissao)} · prêmios R$ {fmtBRL(p.totais.premio)} ·{" "}
                <strong>a pagar R$ {fmtBRL(p.totais.pagar)}</strong>
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() =>
                  exportarXlsx(
                    `fechamento_${p.codEmpresa}_${p.semanaInicio}_previa`,
                    p.vendedores
                  )
                }
              >
                <FileSpreadsheet className="h-4 w-4 mr-2" />
                XLSX
              </Button>
              <Button onClick={() => handleFechar(p)} disabled={fechando}>
                <Lock className="h-4 w-4 mr-2" />
                Fechar semana
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {p.avisos.map((a, i) => (
              <Alert key={i}>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>{a}</AlertDescription>
              </Alert>
            ))}
            <TabelaFechamento vendedores={p.vendedores} />
          </CardContent>
        </Card>
      ))}

      {/* Fechamentos do mês */}
      <Card>
        <CardHeader>
          <CardTitle>Fechamentos de {MESES[mes - 1]} {ano}</CardTitle>
          <CardDescription>
            Snapshots imutáveis — é o que a API de integração entrega ao RH/sistema externo.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {fechados.length === 0 ? (
            <p className="text-muted-foreground text-center py-6">Nenhum fechamento neste mês.</p>
          ) : (
            <Accordion type="multiple">
              {fechados.map((f) => (
                <AccordionItem key={f.id} value={f.id}>
                  <AccordionTrigger onClick={() => handleVerFechado(f)}>
                    <span className="flex flex-1 items-center justify-between pr-4 gap-3">
                      <span className="font-medium">
                        {f.nomeEmpresa ?? `Loja ${f.codEmpresa}`} · {fmtData(f.semanaInicio)}–{fmtData(f.semanaFim)}
                      </span>
                      <span className="flex items-center gap-3">
                        <Badge variant="outline">{f.modo}</Badge>
                        <Badge variant={f.status === "FECHADO" ? "default" : "destructive"}>
                          {f.status}
                        </Badge>
                        <span className="text-sm font-semibold">R$ {fmtBRL(f.totalPagar)}</span>
                      </span>
                    </span>
                  </AccordionTrigger>
                  <AccordionContent className="space-y-3">
                    <div className="flex gap-2">
                      <Button
                        variant="outline" size="sm"
                        onClick={() =>
                          itensFechado[f.id] &&
                          exportarXlsx(`fechamento_${f.codEmpresa}_${f.semanaInicio}`, itensFechado[f.id])
                        }
                        disabled={!itensFechado[f.id]}
                      >
                        <FileSpreadsheet className="h-4 w-4 mr-2" />
                        Exportar XLSX
                      </Button>
                      {isAdmin && f.status === "FECHADO" && (
                        <Button variant="outline" size="sm" onClick={() => handleReabrir(f)}>
                          <Unlock className="h-4 w-4 mr-2" />
                          Reabrir (admin)
                        </Button>
                      )}
                    </div>
                    {itensFechado[f.id] ? (
                      <TabelaFechamento vendedores={itensFechado[f.id]} />
                    ) : (
                      <Skeleton className="h-24" />
                    )}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
