// src/pages/AcompanhamentoSemanalPage.tsx
// Fase 3 — Acompanhamento semanal interativo por PERFIL
// (docs/REVISAO_VENDAS_METAS.md §5.4 item 2, decisão §7.6):
//   * VENDEDOR (profiles.cod_vendedor): vê SÓ a própria meta/posição;
//   * GERENTE (demais usuários, escopo da sua loja): loja + vendedores;
//   * SUPERVISOR (profiles.cod_grupo_supervisor): consolidado do grupo;
//   * ADMIN (master): todas as lojas.
// Realizado = valores RECEBIDOS na semana (sem CREDITOS), do cache
// recebimentos_agregado_diario; detalhado por origem (venda do período ×
// saldo anterior).

import { useState, useEffect, useCallback, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
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
import { Target, TrendingUp, Trophy, Info } from "lucide-react";
import { toast } from "sonner";
import {
  getAcompanhamentoSemanal,
  listarSemanasDisponiveis,
  type AcompanhamentoLoja,
  type AcompanhamentoVendedor,
  type SemanaDisponivel,
  type StatusRitmo,
} from "@/services/acompanhamentoSemanalService";
import { getGruposLojas } from "@/services/metasSemanaisService";
import { getUltimoSyncRecebimentos } from "@/services/recebimentosService";
import { getMeusFechamentos, type MeuFechamento } from "@/services/fechamentoService";
import { supabase } from "@/integrations/supabase/client";

function fmtBRL(n: number): string {
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtData(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

const STATUS_CFG: Record<StatusRitmo, { label: string; cls: string }> = {
  ATINGIDA: { label: "Meta atingida", cls: "bg-emerald-600 text-white" },
  NO_RITMO: { label: "No ritmo", cls: "bg-emerald-100 text-emerald-800" },
  ATENCAO: { label: "Atenção", cls: "bg-amber-100 text-amber-800" },
  CRITICO: { label: "Crítico", cls: "bg-red-100 text-red-800" },
};

function premioLabel(p: { percentualPremio: number; tipoValor?: string; valorFixo?: number }): string {
  return p.tipoValor === "FIXO"
    ? `R$ ${(p.valorFixo ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`
    : `+${p.percentualPremio}%`;
}

function StatusBadge({ status }: { status: StatusRitmo }) {
  const cfg = STATUS_CFG[status];
  return <Badge className={cfg.cls}>{cfg.label}</Badge>;
}

function OrigemLinha({ porOrigem }: { porOrigem: { vendaPeriodo: number; saldoAnterior: number } }) {
  return (
    <span className="text-xs text-muted-foreground">
      venda do período R$ {fmtBRL(porOrigem.vendaPeriodo)} · saldo anterior R${" "}
      {fmtBRL(porOrigem.saldoAnterior)}
    </span>
  );
}

function TabelaVendedores({ vendedores }: { vendedores: AcompanhamentoVendedor[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Vendedor</TableHead>
          <TableHead className="text-right">Meta</TableHead>
          <TableHead className="text-right">Recebido</TableHead>
          <TableHead className="w-40">% da meta</TableHead>
          <TableHead className="text-right">Faltante</TableHead>
          <TableHead className="text-center">Status</TableHead>
          <TableHead className="text-center">Prêmio</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {vendedores.map((v) => (
          <TableRow key={v.codVendedor}>
            <TableCell>
              <span className="font-medium">
                {v.vendedorNome ?? (v.codVendedor === 0 ? "Sem vendedor" : `Vendedor ${v.codVendedor}`)}
              </span>
              {v.metaAjustada && <Badge variant="outline" className="ml-2">meta ajustada</Badge>}
              <div><OrigemLinha porOrigem={v.porOrigem} /></div>
            </TableCell>
            <TableCell className="text-right">R$ {fmtBRL(v.meta)}</TableCell>
            <TableCell className="text-right font-medium">R$ {fmtBRL(v.realizado)}</TableCell>
            <TableCell>
              <div className="flex items-center gap-2">
                <Progress value={Math.min(100, v.percentual)} className="h-2" />
                <span className="text-sm w-14 text-right">{v.percentual}%</span>
              </div>
            </TableCell>
            <TableCell className="text-right">R$ {fmtBRL(v.faltante)}</TableCell>
            <TableCell className="text-center"><StatusBadge status={v.status} /></TableCell>
            <TableCell className="text-center">
              {v.premioFaixa ? (
                <Badge variant="secondary" title={`Atingiu ≥ ${v.premioFaixa.percentualMetaMin}%`}>
                  <Trophy className="h-3 w-3 mr-1" />{premioLabel(v.premioFaixa)}
                </Badge>
              ) : (
                <span className="text-xs text-muted-foreground">—</span>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export default function AcompanhamentoSemanalPage() {
  const { profile, isAdmin } = useAuth();

  const [semanas, setSemanas] = useState<SemanaDisponivel[]>([]);
  const [semanaSel, setSemanaSel] = useState<string>("");
  const [dados, setDados] = useState<AcompanhamentoLoja[]>([]);
  const [loading, setLoading] = useState(true);
  const [ultimoSync, setUltimoSync] = useState<string | null>(null);
  const [meusFechamentos, setMeusFechamentos] = useState<MeuFechamento[]>([]);

  // ---------- escopo por perfil ----------
  const codVendedorUsuario = profile?.cod_vendedor ?? null;
  const codGrupoSupervisor = profile?.cod_grupo_supervisor ?? null;
  const perfil: "VENDEDOR" | "SUPERVISOR" | "ADMIN" | "GERENTE" = isAdmin
    ? "ADMIN"
    : codGrupoSupervisor != null
      ? "SUPERVISOR"
      : codVendedorUsuario != null
        ? "VENDEDOR"
        : "GERENTE";

  const [lojasEscopo, setLojasEscopo] = useState<number[] | undefined>(undefined);
  const [escopoResolvido, setEscopoResolvido] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        if (perfil === "ADMIN") {
          setLojasEscopo(undefined); // todas
        } else if (perfil === "SUPERVISOR") {
          const grupos = await getGruposLojas();
          const grupo = grupos.find((g) => g.codGrupo === codGrupoSupervisor);
          setLojasEscopo(grupo?.membros ?? []);
        } else if (perfil === "VENDEDOR") {
          // VENDEDOR: a própria loja (a RLS já restringe às linhas dele)
          setLojasEscopo(profile?.cod_empresa ? [profile.cod_empresa] : []);
        } else {
          // GERENTE: loja principal + lojas extras (user_empresa_permissions)
          const lojas = new Set<number>();
          if (profile?.cod_empresa) lojas.add(profile.cod_empresa);
          const { data } = await supabase
            .from("user_empresa_permissions")
            .select("cod_empresa")
            .eq("user_id", profile?.id ?? "");
          (data ?? []).forEach((r: { cod_empresa: number }) => lojas.add(r.cod_empresa));
          setLojasEscopo([...lojas]);
        }
      } finally {
        setEscopoResolvido(true);
      }
    })();
  }, [perfil, codGrupoSupervisor, profile?.cod_empresa]);

  // ---------- semanas e dados ----------
  useEffect(() => {
    (async () => {
      try {
        const s = await listarSemanasDisponiveis();
        setSemanas(s);
        if (s.length && !semanaSel) {
          const hoje = new Date().toISOString().split("T")[0];
          const corrente = s.find((w) => w.semanaInicio <= hoje && hoje <= w.semanaFim);
          setSemanaSel((corrente ?? s[0]).semanaInicio);
        }
        getUltimoSyncRecebimentos().then((u) => u && setUltimoSync(u.executadoEm));
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erro ao listar semanas");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const carregar = useCallback(async () => {
    if (!semanaSel || !escopoResolvido) return;
    setLoading(true);
    try {
      const r = await getAcompanhamentoSemanal(semanaSel, lojasEscopo);
      setDados(r);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao carregar acompanhamento");
      setDados([]);
    } finally {
      setLoading(false);
    }
  }, [semanaSel, lojasEscopo, escopoResolvido]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  // espelho: fechamentos congelados do próprio vendedor (documento de pagamento)
  useEffect(() => {
    if (perfil === "VENDEDOR" && codVendedorUsuario != null) {
      getMeusFechamentos(codVendedorUsuario)
        .then(setMeusFechamentos)
        .catch(() => setMeusFechamentos([]));
    }
  }, [perfil, codVendedorUsuario]);

  // ---------- consolidado ----------
  const consolidado = useMemo(() => {
    const meta = dados.reduce((s, l) => s + l.meta, 0);
    const realizado = dados.reduce((s, l) => s + l.realizado, 0);
    return {
      meta,
      realizado,
      percentual: meta > 0 ? Math.round((realizado / meta) * 10000) / 100 : 0,
      criticas: dados.filter((l) => l.status === "CRITICO").length,
      atingidas: dados.filter((l) => l.status === "ATINGIDA").length,
    };
  }, [dados]);

  // visão do vendedor: só a própria linha
  const minhaPosicao: { loja: AcompanhamentoLoja; eu: AcompanhamentoVendedor } | null =
    useMemo(() => {
      if (perfil !== "VENDEDOR" || codVendedorUsuario == null) return null;
      for (const loja of dados) {
        const eu = loja.vendedores.find((v) => v.codVendedor === codVendedorUsuario);
        if (eu) return { loja, eu };
      }
      return null;
    }, [perfil, codVendedorUsuario, dados]);

  const semanaAtual = semanas.find((s) => s.semanaInicio === semanaSel);

  return (
    <div className="container mx-auto px-4 py-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Target className="h-5 w-5" />
            Acompanhamento Semanal
          </h1>
          <p className="text-sm text-muted-foreground">
            Meta × recebido da semana comercial
            {ultimoSync &&
              ` · dados de ${new Date(ultimoSync).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}`}
          </p>
        </div>
        <Select value={semanaSel} onValueChange={setSemanaSel}>
          <SelectTrigger className="w-56">
            <SelectValue placeholder="Selecione a semana..." />
          </SelectTrigger>
          <SelectContent>
            {semanas.map((s) => (
              <SelectItem key={s.semanaInicio} value={s.semanaInicio}>
                {fmtData(s.semanaInicio)} – {fmtData(s.semanaFim)} ({String(s.mes).padStart(2, "0")}/{s.ano})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {!semanas.length && !loading && (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            Nenhuma semana com metas geradas. Configure em Configurações de Metas → Semanas.
          </AlertDescription>
        </Alert>
      )}

      {perfil === "VENDEDOR" && meusFechamentos.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Meus fechamentos de comissão</CardTitle>
            <CardDescription>
              Documentos congelados do pagamento — valores definitivos, não mudam com o banco.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Semana</TableHead>
                  <TableHead>Loja</TableHead>
                  <TableHead className="text-right">Meta</TableHead>
                  <TableHead className="text-right">Base</TableHead>
                  <TableHead className="text-right">Comissão</TableHead>
                  <TableHead className="text-right">Prêmios</TableHead>
                  <TableHead className="text-right">Recebi</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {meusFechamentos.map((f) => (
                  <TableRow key={`${f.fechamentoId}`}>
                    <TableCell>{fmtData(f.semanaInicio)} – {fmtData(f.semanaFim)}</TableCell>
                    <TableCell>{f.nomeEmpresa ?? "—"}</TableCell>
                    <TableCell className="text-right">R$ {fmtBRL(f.metaSemana)}</TableCell>
                    <TableCell className="text-right">R$ {fmtBRL(f.baseTotal)}</TableCell>
                    <TableCell className="text-right">R$ {fmtBRL(f.comissao)}</TableCell>
                    <TableCell className="text-right">{f.premioValor > 0 ? `R$ ${fmtBRL(f.premioValor)}` : "—"}</TableCell>
                    <TableCell className="text-right font-semibold">R$ {fmtBRL(f.totalPagar)}</TableCell>
                    <TableCell className="text-center">
                      <Badge variant={f.status === "FECHADO" ? "default" : "destructive"}>
                        {f.status === "FECHADO" ? "Fechado" : "Reaberto"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <Skeleton className="h-64" />
      ) : perfil === "VENDEDOR" ? (
        /* ---------- VISÃO DO VENDEDOR: só a própria posição ---------- */
        minhaPosicao ? (
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  Minha meta da semana
                  <StatusBadge status={minhaPosicao.eu.status} />
                </CardTitle>
                <CardDescription>
                  {minhaPosicao.loja.nomeReferencia} · {fmtData(minhaPosicao.loja.semanaInicio)} –{" "}
                  {fmtData(minhaPosicao.loja.semanaFim)}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="text-3xl font-bold">R$ {fmtBRL(minhaPosicao.eu.realizado)}</div>
                <Progress value={Math.min(100, minhaPosicao.eu.percentual)} />
                <p className="text-sm text-muted-foreground">
                  {minhaPosicao.eu.percentual}% de R$ {fmtBRL(minhaPosicao.eu.meta)} · faltam R${" "}
                  {fmtBRL(minhaPosicao.eu.faltante)}
                </p>
                <OrigemLinha porOrigem={minhaPosicao.eu.porOrigem} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Trophy className="h-5 w-5" />
                  Prêmio
                </CardTitle>
              </CardHeader>
              <CardContent>
                {minhaPosicao.eu.premioFaixa ? (
                  <p>
                    Faixa atingida: <strong>≥ {minhaPosicao.eu.premioFaixa.percentualMetaMin}%</strong>{" "}
                    → prêmio de <strong>{premioLabel(minhaPosicao.eu.premioFaixa)}</strong>
                  </p>
                ) : (
                  <p className="text-muted-foreground text-sm">
                    Nenhuma faixa de prêmio atingida ainda nesta semana.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        ) : (
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              Sem recebimentos registrados para você nesta semana (ou seu usuário ainda não está
              vinculado a um vendedor — fale com o administrador).
            </AlertDescription>
          </Alert>
        )
      ) : (
        /* ---------- GERENTE / SUPERVISOR / ADMIN ---------- */
        <>
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardHeader className="pb-2"><CardDescription>Meta ({dados.length} loja(s))</CardDescription></CardHeader>
              <CardContent className="text-2xl font-bold">R$ {fmtBRL(consolidado.meta)}</CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardDescription>Recebido</CardDescription></CardHeader>
              <CardContent className="text-2xl font-bold">R$ {fmtBRL(consolidado.realizado)}</CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardDescription>% da meta</CardDescription></CardHeader>
              <CardContent className="text-2xl font-bold flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />{consolidado.percentual}%
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardDescription>Semáforo</CardDescription></CardHeader>
              <CardContent className="text-sm space-y-1">
                <div>{consolidado.atingidas} atingida(s)</div>
                <div>{consolidado.criticas} crítica(s)</div>
              </CardContent>
            </Card>
          </div>

          {dados.length === 1 ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  {dados[0].nomeReferencia ?? `Loja ${dados[0].codEmpresa}`}
                  <StatusBadge status={dados[0].status} />
                </CardTitle>
                <CardDescription>
                  R$ {fmtBRL(dados[0].realizado)} de R$ {fmtBRL(dados[0].meta)} (
                  {dados[0].percentual}%) · necessário/dia R$ {fmtBRL(dados[0].necessarioPorDia)} ·{" "}
                  <OrigemLinha porOrigem={dados[0].porOrigem} />
                </CardDescription>
              </CardHeader>
              <CardContent>
                <TabelaVendedores vendedores={dados[0].vendedores} />
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="pt-4">
                <Accordion type="multiple">
                  {dados.map((loja) => (
                    <AccordionItem key={loja.codEmpresa} value={String(loja.codEmpresa)}>
                      <AccordionTrigger>
                        <span className="flex flex-1 items-center justify-between pr-4 gap-3">
                          <span className="font-medium">
                            {loja.nomeReferencia ?? `Loja ${loja.codEmpresa}`}
                          </span>
                          <span className="flex items-center gap-3">
                            <span className="text-sm text-muted-foreground">
                              R$ {fmtBRL(loja.realizado)} / R$ {fmtBRL(loja.meta)}
                            </span>
                            <span className="w-28"><Progress value={Math.min(100, loja.percentual)} className="h-2" /></span>
                            <span className="text-sm w-12 text-right">{loja.percentual}%</span>
                            <StatusBadge status={loja.status} />
                          </span>
                        </span>
                      </AccordionTrigger>
                      <AccordionContent>
                        <p className="text-sm text-muted-foreground mb-2">
                          Necessário/dia: R$ {fmtBRL(loja.necessarioPorDia)} ·{" "}
                          <OrigemLinha porOrigem={loja.porOrigem} />
                        </p>
                        <TabelaVendedores vendedores={loja.vendedores} />
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
