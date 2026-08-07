// Aprovações (mobile) — versão reduzida da Mesa para o admin no celular.
// Um único trabalho: aprovar exceções emergenciais, de qualquer loja, com
// botão grande e justificativa à vista. O resto da Mesa (borderôs, pipeline,
// avisos) fica no desktop — aqui só aparece um contador com atalho.
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { ShieldCheck, CheckCircle2, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useEmpresas } from "@/hooks/useEmpresas";
import { useDefaultEmpresa } from "@/hooks/useDefaultEmpresa";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

interface LancMesa {
  id: string;
  cod_empresa: number;
  descricao: string | null;
  pessoa_nome: string | null;
  valor: number;
  data_vencimento: string | null;
  status: string;
  selo: string;
  justificativa: string | null;
  pode_bordero?: boolean;
}

interface MesaData {
  lancamentos: LancMesa[];
  borderos: { id: string; status: string; qtd_lancamentos: number; selos: Record<string, number> }[];
}

const fmt = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

export default function AprovacoesMobilePage() {
  const { empresas } = useEmpresas();
  const { isAdmin } = useDefaultEmpresa();
  const queryClient = useQueryClient();

  const invokeAction = async (action: string, extra: Record<string, unknown> = {}) => {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) throw new Error("Sessão expirada — faça login novamente");
    const { data, error } = await supabase.functions.invoke("financeiro-lancamentos", {
      body: { action, ...extra },
      headers: { Authorization: `Bearer ${token}` },
    });
    if (error) throw error;
    if (data?.error) throw new Error(String(data.error));
    return data;
  };

  // Sem cod_empresa = todas as lojas: no celular o admin quer a caixa de
  // entrada inteira, não uma loja por vez.
  const { data: mesa, isLoading } = useQuery<MesaData>({
    queryKey: ["aprovacoes-mobile"],
    queryFn: () => invokeAction("mesa_aprovacao", {}),
    refetchInterval: 45000,
  });

  const aprovarMutation = useMutation({
    mutationFn: (id: string) => invokeAction("aprovar_excecao", { id }),
    onSuccess: () => {
      toast.success("Exceção aprovada — o operador já pode incluí-la no borderô");
      queryClient.invalidateQueries({ queryKey: ["aprovacoes-mobile"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const excecoes = (mesa?.lancamentos ?? []).filter(
    (l) => l.selo === "VERMELHO" && !l.pode_bordero && l.status !== "AUTORIZADO",
  );
  const outrasPendencias = (mesa?.lancamentos ?? []).filter(
    (l) => ["SEM_LASTRO", "AMARELO"].includes(l.selo),
  ).length;
  const nomeLoja = (cod: number) =>
    (empresas || []).find((e) => e.codEmpresa === cod)?.nome || `Empresa ${cod}`;

  return (
    <div className="mx-auto max-w-md space-y-4 px-1 pb-8">
      <div className="flex items-center gap-2 pt-2">
        <ShieldCheck className="h-5 w-5 text-primary" />
        <div>
          <h1 className="text-lg font-semibold leading-tight">Aprovações</h1>
          <p className="text-xs text-muted-foreground">Exceções emergenciais de todas as lojas</p>
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground py-8 text-center">Carregando…</p>
      ) : excecoes.length === 0 ? (
        <div className="rounded-xl border p-6 text-center space-y-2">
          <CheckCircle2 className="h-8 w-8 text-success mx-auto" />
          <p className="text-sm font-medium">Nenhuma exceção esperando você</p>
          <p className="text-xs text-muted-foreground">
            Pagamentos com lastro (nota/rubrica) seguem sozinhos — sua confirmação final é no app BTG.
          </p>
        </div>
      ) : (
        excecoes.map((l) => (
          <div key={l.id} className="rounded-xl border border-danger/40 p-4 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-medium leading-snug">{l.pessoa_nome || l.descricao}</p>
                <p className="text-xs text-muted-foreground">
                  {nomeLoja(l.cod_empresa)}
                  {l.data_vencimento && <> · vence {format(new Date(l.data_vencimento + "T12:00:00"), "dd/MM")}</>}
                </p>
              </div>
              <p className="text-lg font-bold shrink-0">{fmt(Number(l.valor))}</p>
            </div>
            {l.justificativa && (
              <p className="text-sm text-muted-foreground italic border-l-2 border-danger/40 pl-3">
                “{l.justificativa}”
              </p>
            )}
            {isAdmin ? (
              <Button
                className="w-full h-12 text-base"
                variant="destructive"
                disabled={aprovarMutation.isPending}
                onClick={() => aprovarMutation.mutate(l.id)}
              >
                <CheckCircle2 className="h-5 w-5 mr-2" /> Aprovar exceção
              </Button>
            ) : (
              <Badge variant="outline" className="w-full justify-center py-2">Aguardando um admin</Badge>
            )}
          </div>
        ))
      )}

      {outrasPendencias > 0 && (
        <Link
          to="/financeiro/mesa"
          className="flex items-center justify-between rounded-lg border px-4 py-3 text-sm text-muted-foreground"
        >
          <span>{outrasPendencias} outra(s) pendência(s) (fora da faixa / sem lastro)</span>
          <span className="flex items-center gap-1 text-primary">Mesa completa <ExternalLink className="h-3.5 w-3.5" /></span>
        </Link>
      )}

      <p className="text-[11px] text-muted-foreground text-center pt-2">
        Aprovar aqui não move dinheiro — o pagamento ainda passa pelo borderô e pela sua confirmação no app BTG.
      </p>
    </div>
  );
}
