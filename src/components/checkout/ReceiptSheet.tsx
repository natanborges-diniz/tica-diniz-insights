import { Receipt } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  dadosExtras: any;
  descricao: string;
  valor: number;
  fmtCurrency: (v: number) => string;
}

function formatRedeDate(d: string) {
  if (!d || d.length !== 8) return d || "—";
  return `${d.slice(6, 8)}/${d.slice(4, 6)}/${d.slice(0, 4)}`;
}

export default function ReceiptSheet({ open, onOpenChange, dadosExtras, descricao, valor, fmtCurrency }: Props) {
  const rede = dadosExtras?.rede_response || {};

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5" />
            Comprovante de Pagamento
          </SheetTitle>
        </SheetHeader>

        <div className="mt-6 space-y-4">
          <div className="text-center">
            <p className="text-xs text-muted-foreground">{descricao}</p>
            <p className="text-2xl font-bold">{fmtCurrency(valor)}</p>
            {rede.installments > 1 && (
              <p className="text-sm text-muted-foreground">{rede.installments}x de {fmtCurrency(valor / rede.installments)}</p>
            )}
          </div>

          <Separator />

          <div className="bg-muted/50 rounded-lg p-4 space-y-2 font-mono text-xs">
            <Row label="TID" value={rede.tid} />
            <Row label="NSU" value={rede.nsu} />
            <Row label="Autorização" value={rede.authorizationCode} />
            <Row label="Data" value={formatRedeDate(rede.date)} />
            <Row label="Hora" value={rede.time} />
            <Row label="Código Retorno" value={rede.returnCode} />
            <Row label="Mensagem" value={rede.returnMessage} />
            <Row label="Referência" value={rede.reference} />
            {(rede.cardBin || rede.last4) && (
              <Row label="Cartão" value={`${rede.cardBin || "****"} **** **** ${rede.last4 || "****"}`} />
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
