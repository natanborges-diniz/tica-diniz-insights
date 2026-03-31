import { CheckCircle2, Receipt } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

interface ReceiptData {
  tid: string;
  nsu: string;
  authorization: string;
  date: string;
  time: string;
  installments: number;
  cardBin: string;
  last4: string;
  amount: number;
  returnMessage: string;
}

interface Props {
  receipt: ReceiptData;
  linkData: { valor: number; descricao: string; cliente_nome: string | null };
  fmtCurrency: (v: number) => string;
}

function formatRedeDate(d: string) {
  if (!d || d.length !== 8) return d;
  return `${d.slice(6, 8)}/${d.slice(4, 6)}/${d.slice(0, 4)}`;
}

export default function CheckoutReceipt({ receipt, linkData, fmtCurrency }: Props) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-slate-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md shadow-lg">
        <CardContent className="pt-6 pb-6 space-y-4">
          <div className="text-center space-y-2">
            <CheckCircle2 className="h-14 w-14 text-emerald-500 mx-auto" />
            <p className="text-xl font-semibold text-slate-800">Pagamento Aprovado!</p>
            <p className="text-sm text-slate-500">{receipt.returnMessage}</p>
          </div>

          <Separator />

          <div className="space-y-1 text-center">
            <p className="text-xs text-slate-400 uppercase tracking-wider">Valor</p>
            <p className="text-2xl font-bold text-slate-800">{fmtCurrency(linkData.valor)}</p>
            {receipt.installments > 1 && (
              <p className="text-sm text-slate-500">
                {receipt.installments}x de {fmtCurrency(linkData.valor / receipt.installments)}
              </p>
            )}
          </div>

          <Separator />

          <div className="bg-slate-50 rounded-lg p-4 space-y-2 font-mono text-xs">
            <div className="flex items-center gap-2 mb-2">
              <Receipt className="h-4 w-4 text-slate-400" />
              <span className="text-slate-600 font-sans text-sm font-medium">Comprovante</span>
            </div>
            <Row label="TID" value={receipt.tid} />
            <Row label="NSU" value={receipt.nsu} />
            <Row label="Autorização" value={receipt.authorization} />
            <Row label="Data" value={formatRedeDate(receipt.date)} />
            <Row label="Hora" value={receipt.time} />
            {(receipt.cardBin || receipt.last4) && (
              <Row label="Cartão" value={`${receipt.cardBin ? receipt.cardBin.slice(0, 4) + " **** " : ""}**** ${receipt.last4 || "****"}`} />
            )}
          </div>

          <div className="text-center space-y-1">
            <p className="text-xs text-slate-500">{linkData.descricao}</p>
            {linkData.cliente_nome && (
              <p className="text-xs text-slate-400">{linkData.cliente_nome}</p>
            )}
          </div>

          <p className="text-[10px] text-slate-400 text-center">
            Comprovante de pagamento processado pela e.Rede. Guarde para sua referência.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div className="flex justify-between">
      <span className="text-slate-400">{label}</span>
      <span className="text-slate-700">{value}</span>
    </div>
  );
}
