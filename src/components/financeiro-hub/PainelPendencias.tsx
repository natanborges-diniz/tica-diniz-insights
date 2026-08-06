// O que está parado, de todas as lojas, na entrada do Financeiro.
//
// Um fornecedor cobrou porque não tinha recebido. O sistema sabia — borderô
// enviado, item nunca voltou processado — mas a informação estava dentro do
// borderô, na loja daquele borderô. Com dez lojas, ninguém abre uma por uma
// todo dia, e a primeira notícia veio pelo telefone.
//
// Este painel existe para que a primeira notícia venha daqui.
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle, Clock, Send, XCircle, CheckCircle2, ChevronRight,
  Landmark, Monitor, User, ShieldCheck, RefreshCw, Archive, CalendarClock,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type {
  Pendencia,
  ResumoPainel,
  TipoPendencia,
  Severidade,
  Responsavel,
  AcaoSistema,
} from "../../../supabase/functions/_shared/pendenciasFinanceiro";

interface Props {
  /** Chamada às actions do financeiro-lancamentos, com o JWT do usuário. */
  invokeAction: (action: string, params?: Record<string, unknown>) => Promise<unknown>;
  empresas: Array<{ codEmpresa: number; nome?: string | null }>;
  /** Abre o detalhe do borderô — o painel aponta, o detalhe resolve. */
  onAbrirBordero: (borderoId: string) => void;
  /**
   * Executa a ação de encaminhamento. O painel decide qual, a página sabe como.
   * Sem isto, o painel só apontava o problema e o operador tinha de procurar
   * onde resolvê-lo.
   */
  onResolver: (acao: AcaoSistema, borderoId: string) => void;
  /** Ação em andamento — evita clique duplo em operação que mexe com dinheiro. */
  resolvendo?: boolean;
}

/** Quem tem de agir. "Master" é o do BTG, não um papel deste sistema. */
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

/**
 * Rótulos sem a palavra "aprovado" solta.
 *
 * "Aprovado, não enviado" confundia com a autorização do master no BTG — duas
 * aprovações diferentes, em lugares diferentes, com donos diferentes. Aqui o
 * vocabulário separa: liberação é interna, autorização é do banco.
 */
const TITULO: Record<TipoPendencia, string> = {
  AGUARDANDO_BANCO: "No BTG, sem autorização do master",
  AGUARDANDO_ENVIO: "Liberado internamente, falta enviar",
  MESA_PENDENTE: "Exceção aguardando decisão na Mesa",
  MONTAGEM_PARADA: "Borderô começado e não finalizado",
  RECUSADO: "Recusado pelo banco",
  PAGO_FORA: "Já pago fora do borderô",
};

const COR: Record<Severidade, string> = {
  ALTA: "border-destructive/40 bg-destructive/5",
  MEDIA: "border-amber-300 bg-amber-50",
  BAIXA: "border-border bg-muted/30",
};

const BADGE: Record<Severidade, "destructive" | "outline" | "secondary"> = {
  ALTA: "destructive",
  MEDIA: "outline",
  BAIXA: "secondary",
};

const fmt = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

export function PainelPendencias({ invokeAction, empresas, onAbrirBordero, onResolver, resolvendo }: Props) {
  const { data, isLoading } = useQuery<{ pendencias: Pendencia[]; resumo: ResumoPainel }>({
    queryKey: ["painel-pendencias"],
    queryFn: () => invokeAction("painel_pendencias") as Promise<{
      pendencias: Pendencia[]; resumo: ResumoPainel;
    }>,
    // Pagamento parado é informação que envelhece: revalida ao voltar para a aba.
    refetchOnWindowFocus: true,
    staleTime: 60_000,
  });

  const nomeLoja = (cod: number) =>
    empresas.find((e) => e.codEmpresa === cod)?.nome || `Loja ${cod}`;

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-6 text-center text-sm text-muted-foreground">
          Verificando pagamentos em todas as lojas...
        </CardContent>
      </Card>
    );
  }

  const pendencias = data?.pendencias ?? [];
  const resumo = data?.resumo;

  // Silêncio quando não há nada é melhor que um painel vazio ocupando a tela —
  // mas dizer "nada parado" tem valor: confirma que a varredura rodou.
  if (pendencias.length === 0) {
    return (
      <Card className="border-green-200 bg-green-50/50">
        <CardContent className="py-3 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-green-700 shrink-0" />
          <p className="text-sm text-green-800">
            Nenhum pagamento parado em nenhuma loja.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn(resumo && resumo.alta > 0 && "border-destructive/40")}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-base flex items-center gap-2">
            <AlertTriangle className={cn("h-4 w-4", resumo && resumo.alta > 0 ? "text-destructive" : "text-amber-600")} />
            Pagamentos que exigem atenção
          </CardTitle>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>{pendencias.length} pendência(s)</span>
            <span>·</span>
            <span>{resumo?.lojas.length} loja(s)</span>
            <span>·</span>
            <span className="font-medium text-foreground">{fmt(resumo?.valor_total ?? 0)}</span>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-2">
        {pendencias.map((p) => {
          const Icone = ICONE[p.tipo] ?? Clock;
          const resp = RESPONSAVEL[p.responsavel];
          const IconeResp = resp?.icone ?? User;
          const noBanco = p.local === "BANCO";
          return (
            <div
              key={p.bordero_id}
              className={cn("border rounded-lg p-3", COR[p.severidade])}
            >
              <div className="flex items-start gap-3">
                <Icone className={cn(
                  "h-4 w-4 mt-0.5 shrink-0",
                  p.severidade === "ALTA" ? "text-destructive" : "text-muted-foreground",
                )} />

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant={BADGE[p.severidade]} className="text-[10px]">
                      {TITULO[p.tipo] ?? p.tipo}
                    </Badge>
                    {/* A loja vem primeiro no texto: é o que responde "onde vou olhar". */}
                    <span className="text-sm font-medium">{nomeLoja(p.cod_empresa)}</span>
                    <span className="text-xs text-muted-foreground truncate">{p.descricao}</span>
                  </div>

                  <p className="text-xs text-muted-foreground mt-1">{p.mensagem}</p>

                  {/* Quem faz e onde. Sem isto a pendência circula entre as
                      pessoas: o operador espera o admin, o admin acha que é no
                      banco, e ninguém resolve. */}
                  <div className="flex items-center gap-3 flex-wrap mt-1.5 text-xs">
                    <span className="inline-flex items-center gap-1 text-muted-foreground">
                      <IconeResp className="h-3 w-3" />
                      {resp?.rotulo ?? p.responsavel}
                    </span>
                    <span className={cn(
                      "inline-flex items-center gap-1",
                      noBanco ? "text-amber-700 font-medium" : "text-muted-foreground",
                    )}>
                      {noBanco ? <Landmark className="h-3 w-3" /> : <Monitor className="h-3 w-3" />}
                      {noBanco ? "No aplicativo do BTG" : "Aqui no sistema"}
                    </span>
                  </div>

                  <p className="text-xs mt-1">
                    <span className="text-muted-foreground">O que fazer: </span>
                    {p.acao}
                  </p>
                </div>

                <div className="text-right shrink-0">
                  {p.valor_pendente > 0 && (
                    <p className="text-sm font-medium">{fmt(p.valor_pendente)}</p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {p.dias_parado === 0 ? "hoje" : `${p.dias_parado} dia(s)`}
                  </p>
                </div>
              </div>

              {/* Encaminhamento: resolver daqui quando dá, abrir o borderô sempre. */}
              <div className="flex items-center gap-2 mt-2 pt-2 border-t border-border/50">
                {p.acao_sistema && (
                  <Button
                    size="sm"
                    variant={noBanco || p.tipo === "PAGO_FORA" ? "outline" : "default"}
                    className="h-7 text-xs"
                    disabled={resolvendo}
                    onClick={() => onResolver(p.acao_sistema!, p.bordero_id)}
                  >
                    {p.acao_sistema === "ATUALIZAR_RETORNO" && (
                      <RefreshCw className={cn("h-3 w-3 mr-1", resolvendo && "animate-spin")} />
                    )}
                    {p.acao_sistema === "ENCERRAR_BORDERO" && <Archive className="h-3 w-3 mr-1" />}
                    {p.acao_sistema === "AJUSTAR_DATA" && <CalendarClock className="h-3 w-3 mr-1" />}
                    {p.acao_rotulo}
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs"
                  onClick={() => onAbrirBordero(p.bordero_id)}
                >
                  Abrir borderô <ChevronRight className="h-3 w-3 ml-1" />
                </Button>
              </div>
            </div>
          );
        })}

        {pendencias.some((p) => p.tipo === "AGUARDANDO_BANCO") && (
          <p className="text-xs text-muted-foreground pt-1">
            Borderô enviado e sem retorno costuma estar parado no aplicativo do BTG esperando a
            autorização do master. Confirme lá antes de cobrar — pode já ter sido autorizado e o
            sistema ainda não ter buscado o retorno.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
