// Quando o envio do borderô é barrado pela governança, o operador precisa de
// três coisas na mesma tela: QUAL item travou, POR QUÊ e O QUE fazer.
// O antigo toast de uma linha não dava nada disso — e o botão "Mesa" abria a
// Mesa inteira, onde o item se perdia entre dezenas de linhas.
import { AlertTriangle, ShieldCheck, ArrowRight } from "lucide-react";
import { format } from "date-fns";
import { BaseDialog } from "@/components/system/BaseDialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export interface BorderoBloqueio {
  id: string;
  descricao: string | null;
  valor: number;
  data_vencimento: string | null;
  selo: string;
  motivo: string;
  acao: string;
}

export interface BorderoBloqueioPayload {
  bordero_id: string;
  cod_empresa?: number | null;
  bloqueios: BorderoBloqueio[];
  qtd_total?: number;
  qtd_bloqueados?: number;
  valor_bloqueado?: number;
}

const SELO_CFG: Record<string, { label: string; cls: string }> = {
  SEM_LASTRO: { label: "SEM LASTRO", cls: "bg-muted text-muted-foreground" },
  AMARELO: { label: "FORA DA FAIXA", cls: "bg-warning/10 text-warning border-warning/30" },
  VERMELHO: { label: "EXCEÇÃO", cls: "bg-danger/10 text-danger border-danger/30" },
};

const fmtCurrency = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

interface Props {
  payload: BorderoBloqueioPayload | null;
  onOpenChange: (open: boolean) => void;
}

export function BorderoBloqueioDialog({ payload, onOpenChange }: Props) {
  const abrirMesa = () => {
    if (!payload) return;
    const params = new URLSearchParams({ bordero: payload.bordero_id });
    if (payload.cod_empresa != null) params.set("empresa", String(payload.cod_empresa));
    window.location.href = `/financeiro/mesa?${params.toString()}`;
  };

  const bloqueios = payload?.bloqueios ?? [];
  const liberados = Math.max((payload?.qtd_total ?? 0) - bloqueios.length, 0);

  return (
    <BaseDialog
      open={!!payload}
      onOpenChange={onOpenChange}
      title="Borderô não enviado — decisão pendente na Mesa"
      description={
        payload
          ? `${bloqueios.length} de ${payload.qtd_total ?? bloqueios.length} itens travaram o envio` +
            (payload.valor_bloqueado ? ` · ${fmtCurrency(payload.valor_bloqueado)} bloqueados` : "") +
            (liberados > 0 ? ` · ${liberados} item(ns) já com lastro aguardando` : "")
          : undefined
      }
      size="lg"
      footer={
        <div className="flex w-full items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            Nada foi enviado ao banco. Resolva os itens abaixo e reenvie o borderô.
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
            <Button onClick={abrirMesa}>
              <ShieldCheck className="h-4 w-4 mr-1" />
              Resolver na Mesa <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-2">
        {bloqueios.map((b) => {
          const cfg = SELO_CFG[b.selo] ?? SELO_CFG.SEM_LASTRO;
          return (
            <div key={b.id} className="rounded-lg border p-3 space-y-1.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate uppercase">
                    {b.descricao || `LANÇAMENTO ${b.id.slice(0, 8).toUpperCase()}`}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {fmtCurrency(Number(b.valor))}
                    {b.data_vencimento && <> · vence {format(new Date(b.data_vencimento + "T12:00:00"), "dd/MM/yy")}</>}
                  </p>
                </div>
                <Badge variant="outline" className={`shrink-0 text-[10px] ${cfg.cls}`}>{cfg.label}</Badge>
              </div>
              <p className="text-xs text-muted-foreground flex items-start gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-warning" />
                {b.motivo}
              </p>
              <p className="text-xs font-medium text-primary">→ {b.acao}</p>
            </div>
          );
        })}
      </div>
    </BaseDialog>
  );
}
