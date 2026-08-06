// Pagamentos parados — página própria.
//
// Isto começou como um bloco no topo do Contas a Pagar e não funcionou: alerta e
// operação disputando a mesma tela, com os cartões empurrando a tabela para
// baixo. Quem entrava para lançar uma conta atravessava avisos que não eram da
// sua tarefa.
//
// Aqui o assunto tem espaço próprio: resumo em cima, filtro por tipo, e uma
// linha por pendência. Denso de propósito — a pergunta é "o que exige ação
// agora?", e ela se responde varrendo a lista, não lendo cartões.
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle, Clock, Send, XCircle, CheckCircle2, ChevronRight,
  Landmark, Monitor, User, ShieldCheck, RefreshCw, Archive, CalendarClock, Store,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useEmpresas } from "@/hooks/useEmpresas";
import { usePendenciasFinanceiro, CHAVE_PENDENCIAS } from "@/hooks/usePendenciasFinanceiro";
import { ModuleHeader } from "@/components/system/ModuleHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type {
  Pendencia,
  TipoPendencia,
  Severidade,
  Responsavel,
  AcaoSistema,
} from "../../supabase/functions/_shared/pendenciasFinanceiro";

const RESPONSAVEL: Record<Responsavel, { rotulo: string; icone: typeof User }> = {
  OPERADOR: { rotulo: "Operador", icone: User },
  ADMIN: { rotulo: "Admin", icone: ShieldCheck },
  MASTER_BTG: { rotulo: "Master no BTG", icone: Landmark },
};

const ICONE: Record<TipoPendencia, typeof Clock> = {
  AGUARDANDO_BANCO: Clock,
  AGUARDANDO_ENVIO: Send,
  MESA_PENDENTE: ShieldCheck,
  MONTAGEM_PARADA: AlertTriangle,
  RECUSADO: XCircle,
  PAGO_FORA: Archive,
};

const TITULO: Record<TipoPendencia, string> = {
  AGUARDANDO_BANCO: "Sem autorização no BTG",
  AGUARDANDO_ENVIO: "Falta enviar ao banco",
  MESA_PENDENTE: "Exceção na Mesa",
  MONTAGEM_PARADA: "Montagem parada",
  RECUSADO: "Recusado pelo banco",
  PAGO_FORA: "Pago fora do borderô",
};

/** Barra lateral colorida: a gravidade se lê antes do texto. */
const BARRA: Record<Severidade, string> = {
  ALTA: "bg-destructive",
  MEDIA: "bg-amber-500",
  BAIXA: "bg-muted-foreground/30",
};

const fmt = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

const fmtCompacto = (v: number) =>
  new Intl.NumberFormat("pt-BR", { notation: "compact", style: "currency", currency: "BRL" }).format(v);

export default function PendenciasFinanceirasPage() {
  const { empresas } = useEmpresas();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [filtroTipo, setFiltroTipo] = useState<string>("todos");

  const invokeAction = async (action: string, extra: Record<string, unknown> = {}) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error("Sessão expirada");
    const { data, error } = await supabase.functions.invoke("financeiro-lancamentos", {
      body: { action, ...extra },
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (error) throw error;
    return data;
  };

  const { data, isLoading, isFetching, refetch } = usePendenciasFinanceiro(invokeAction);
  const recarregar = () => queryClient.invalidateQueries({ queryKey: CHAVE_PENDENCIAS });

  const acaoMutation = useMutation({
    mutationFn: async ({ acao, borderoId }: { acao: AcaoSistema; borderoId: string }) => {
      if (acao === "ENVIAR_BORDERO") return invokeAction("enviar_bordero_btg", { bordero_id: borderoId });
      if (acao === "DEVOLVER_PREPARO") return invokeAction("devolver_para_preparo", { bordero_id: borderoId });
      if (acao === "ENCERRAR_BORDERO") return invokeAction("encerrar_bordero", { bordero_id: borderoId });
      if (acao === "ATUALIZAR_RETORNO") {
        // Consulta o BTG agora, sem esperar o cron de 30 minutos. Se o master já
        // autorizou, a baixa entra e a pendência some sozinha.
        const { data, error } = await supabase.functions.invoke("btg-poll-status", {
          body: { action: "executar" },
        });
        if (error) throw error;
        return (data ?? { mensagem: "Consulta ao banco concluída" }) as { mensagem?: string };
      }
      return null;
    },
    onSuccess: (r: { ok?: boolean; error?: string; mensagem?: string } | null) => {
      if (r?.ok === false) { toast.error(r.error || "Não foi possível concluir"); return; }
      toast.success(r?.mensagem || "Feito");
      recarregar();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  /**
   * Ações que precisam de confirmação ou de campos ficam no detalhe do borderô.
   *
   * Refazer exige afirmar que o lote morreu no banco, e ajustar data exige
   * escolher a data — nada disso cabe num clique de lista.
   */
  const irParaBordero = (borderoId: string) =>
    navigate(`/financeiro/hub?bordero=${borderoId}`);

  const resolver = (acao: AcaoSistema, borderoId: string) => {
    if (["REFAZER_BORDERO", "AJUSTAR_DATA", "APROVAR_BORDERO", "ABRIR_BORDERO"].includes(acao)) {
      irParaBordero(borderoId);
      return;
    }
    acaoMutation.mutate({ acao, borderoId });
  };

  const nomeLoja = (cod: number) =>
    empresas.find((e) => e.codEmpresa === cod)?.nome || `Loja ${cod}`;

  const todas = data?.pendencias ?? [];
  const resumo = data?.resumo;
  const pendencias = filtroTipo === "todos" ? todas : todas.filter((p) => p.tipo === filtroTipo);

  // Chips só dos tipos presentes: filtro para categoria vazia é ruído.
  const tiposPresentes = Object.entries(
    todas.reduce<Record<string, number>>((acc, p) => {
      acc[p.tipo] = (acc[p.tipo] ?? 0) + 1;
      return acc;
    }, {}),
  ).sort((a, b) => b[1] - a[1]);

  return (
    <div className="space-y-4">
      <ModuleHeader
        title="Pagamentos parados"
        subtitle="De todas as lojas — o que não foi processado, recusado ou está esperando alguém"
        icon={<AlertTriangle className="h-5 w-5" />}
        actions={
          <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={cn("h-4 w-4 mr-1", isFetching && "animate-spin")} />
            Atualizar
          </Button>
        }
      />

      {isLoading ? (
        <p className="py-16 text-center text-sm text-muted-foreground">
          Verificando pagamentos em todas as lojas...
        </p>
      ) : todas.length === 0 ? (
        <div className="py-20 text-center space-y-3">
          <CheckCircle2 className="h-10 w-10 text-green-600 mx-auto" />
          <p className="text-base font-medium">Nada parado em nenhuma loja</p>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Borderô enviado sem retorno, recusado pelo banco, esquecido na montagem ou esperando
            decisão na Mesa apareceria aqui.
          </p>
        </div>
      ) : (
        <>
          {/* Resumo: quatro números que respondem "quão ruim está". */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Tile rotulo="Pendências" valor={String(todas.length)} />
            <Tile
              rotulo="Atenção imediata"
              valor={String(resumo?.alta ?? 0)}
              destaque={(resumo?.alta ?? 0) > 0}
            />
            <Tile rotulo="Valor parado" valor={fmtCompacto(resumo?.valor_total ?? 0)} />
            <Tile rotulo="Lojas afetadas" valor={String(resumo?.lojas.length ?? 0)} icone={Store} />
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Chip ativo={filtroTipo === "todos"} onClick={() => setFiltroTipo("todos")}>
              Todas ({todas.length})
            </Chip>
            {tiposPresentes.map(([tipo, qtd]) => (
              <Chip key={tipo} ativo={filtroTipo === tipo} onClick={() => setFiltroTipo(tipo)}>
                {TITULO[tipo as TipoPendencia] ?? tipo} ({qtd})
              </Chip>
            ))}
          </div>

          <div className="space-y-1.5">
            {pendencias.map((p) => (
              <LinhaPendencia
                key={p.bordero_id}
                p={p}
                loja={nomeLoja(p.cod_empresa)}
                ocupado={acaoMutation.isPending}
                onResolver={resolver}
                onAbrir={irParaBordero}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function Tile({
  rotulo, valor, destaque, icone: Icone,
}: { rotulo: string; valor: string; destaque?: boolean; icone?: typeof Store }) {
  return (
    <div className={cn(
      "rounded-lg border p-3",
      destaque ? "border-destructive/40 bg-destructive/5" : "bg-card",
    )}>
      <p className="text-xs text-muted-foreground flex items-center gap-1">
        {Icone && <Icone className="h-3 w-3" />}
        {rotulo}
      </p>
      <p className={cn("text-xl font-semibold mt-0.5", destaque && "text-destructive")}>{valor}</p>
    </div>
  );
}

function Chip({ ativo, onClick, children }: { ativo: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "text-xs px-2.5 py-1 rounded-full border transition-colors",
        ativo ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted",
      )}
    >
      {children}
    </button>
  );
}

function LinhaPendencia({
  p, loja, ocupado, onResolver, onAbrir,
}: {
  p: Pendencia;
  loja: string;
  ocupado: boolean;
  onResolver: (acao: AcaoSistema, id: string) => void;
  onAbrir: (id: string) => void;
}) {
  const Icone = ICONE[p.tipo] ?? Clock;
  const resp = RESPONSAVEL[p.responsavel];
  const IconeResp = resp?.icone ?? User;
  const noBanco = p.local === "BANCO";

  return (
    <div className="flex items-stretch gap-0 rounded-lg border bg-card overflow-hidden hover:border-primary/40 transition-colors">
      {/* A gravidade se lê antes do texto. */}
      <div className={cn("w-1 shrink-0", BARRA[p.severidade])} />

      <div className="flex-1 min-w-0 p-3 space-y-1.5">
        <div className="flex items-center gap-2 flex-wrap">
          <Icone className={cn(
            "h-3.5 w-3.5 shrink-0",
            p.severidade === "ALTA" ? "text-destructive" : "text-muted-foreground",
          )} />
          <span className="text-sm font-medium">{loja}</span>
          <Badge variant="outline" className="text-[10px] font-normal">
            {TITULO[p.tipo] ?? p.tipo}
          </Badge>
          <span className="text-xs text-muted-foreground truncate">{p.descricao}</span>
        </div>

        <p className="text-xs text-muted-foreground">{p.mensagem}</p>

        {/* Motivo do banco, quando ele explicou. */}
        {p.motivos && p.motivos.length > 0 && (
          <p className="text-xs text-destructive">{p.motivos.join(" · ")}</p>
        )}

        <div className="flex items-center gap-3 flex-wrap text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <IconeResp className="h-3 w-3" />
            {resp?.rotulo ?? p.responsavel}
          </span>
          <span className={cn("inline-flex items-center gap-1", noBanco && "text-amber-700 font-medium")}>
            {noBanco ? <Landmark className="h-3 w-3" /> : <Monitor className="h-3 w-3" />}
            {noBanco ? "No app do BTG" : "Aqui no sistema"}
          </span>
          <span>{p.acao}</span>
        </div>
      </div>

      <div className="shrink-0 flex flex-col items-end justify-between p-3 gap-2 border-l bg-muted/20">
        <div className="text-right">
          {p.valor_pendente > 0 && (
            <p className="text-sm font-semibold whitespace-nowrap">{fmt(p.valor_pendente)}</p>
          )}
          <p className="text-[11px] text-muted-foreground">
            {p.dias_parado === 0 ? "hoje" : `há ${p.dias_parado} dia(s)`}
          </p>
        </div>

        <div className="flex items-center gap-1">
          {p.acao_sistema && (
            <Button
              size="sm"
              variant={noBanco || p.tipo === "PAGO_FORA" ? "outline" : "default"}
              className="h-7 text-xs"
              disabled={ocupado}
              onClick={() => onResolver(p.acao_sistema!, p.bordero_id)}
            >
              {p.acao_sistema === "ATUALIZAR_RETORNO" && <RefreshCw className="h-3 w-3 mr-1" />}
              {p.acao_sistema === "ENCERRAR_BORDERO" && <Archive className="h-3 w-3 mr-1" />}
              {p.acao_sistema === "AJUSTAR_DATA" && <CalendarClock className="h-3 w-3 mr-1" />}
              {p.acao_rotulo}
            </Button>
          )}
          {p.acao_secundaria && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              disabled={ocupado}
              onClick={() => onResolver(p.acao_secundaria!, p.bordero_id)}
            >
              {p.acao_secundaria_rotulo}
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2"
            onClick={() => onAbrir(p.bordero_id)}
            title="Abrir o borderô"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
