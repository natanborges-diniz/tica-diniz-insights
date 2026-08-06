// O que está parado, de todas as lojas, na entrada do Financeiro.
//
// Um fornecedor cobrou porque não tinha recebido. O sistema sabia — borderô
// enviado, item nunca voltou processado — mas a informação estava dentro do
// borderô, na loja daquele borderô. Com dez lojas, ninguém abre uma por uma
// todo dia, e a primeira notícia veio pelo telefone.
//
// Este painel existe para que a primeira notícia venha daqui.
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Clock, Send, XCircle, CheckCircle2, ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type {
  Pendencia,
  ResumoPainel,
  TipoPendencia,
  Severidade,
} from "../../../supabase/functions/_shared/pendenciasFinanceiro";

interface Props {
  /** Chamada às actions do financeiro-lancamentos, com o JWT do usuário. */
  invokeAction: (action: string, params?: Record<string, unknown>) => Promise<unknown>;
  empresas: Array<{ codEmpresa: number; nome?: string | null }>;
  /** Abre o detalhe do borderô — o painel aponta, o detalhe resolve. */
  onAbrirBordero: (borderoId: string) => void;
}

const ICONE: Record<TipoPendencia, typeof Clock> = {
  AGUARDANDO_BANCO: Clock,
  AGUARDANDO_ENVIO: Send,
  MONTAGEM_ATRASADA: AlertTriangle,
  RECUSADO: XCircle,
};

const TITULO: Record<TipoPendencia, string> = {
  AGUARDANDO_BANCO: "Sem retorno do banco",
  AGUARDANDO_ENVIO: "Aprovado, não enviado",
  MONTAGEM_ATRASADA: "Em montagem, atrasado",
  RECUSADO: "Recusado pelo banco",
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

export function PainelPendencias({ invokeAction, empresas, onAbrirBordero }: Props) {
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
          return (
            <button
              key={p.bordero_id}
              onClick={() => onAbrirBordero(p.bordero_id)}
              className={cn(
                "w-full text-left border rounded-lg p-3 transition-colors hover:bg-muted/50",
                COR[p.severidade],
              )}
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
                  <p className="text-xs mt-0.5">
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

                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
              </div>
            </button>
          );
        })}

        {pendencias.some((p) => p.tipo === "AGUARDANDO_BANCO") && (
          <p className="text-xs text-muted-foreground pt-1">
            Borderô enviado e sem retorno costuma estar aguardando a autorização do master no
            aplicativo do BTG — essa etapa acontece fora deste sistema.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
