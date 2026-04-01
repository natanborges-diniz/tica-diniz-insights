import { useRef } from "react";
import { CheckCircle2, Receipt, Download, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { exportToImage } from "@/utils/exportVisual";
import { toast } from "sonner";

interface ReceiptData {
  tid: string;
  nsu: string;
  authorization: string;
  date: string;
  time: string;
  dateTime?: string;
  installments: number;
  cardBin: string;
  last4: string;
  amount: number;
  returnMessage: string;
  brand?: string;
  kind?: string;
  reference?: string;
  empresaNome?: string;
}

interface Props {
  receipt: ReceiptData;
  linkData: { valor: number; descricao: string; cliente_nome: string | null };
  fmtCurrency: (v: number) => string;
}

function parseDateTime(receipt: ReceiptData): { displayDate: string; displayTime: string } {
  // Try separate date/time first
  if (receipt.date && receipt.date.length >= 8) {
    const d = receipt.date.replace(/\D/g, "");
    const displayDate = d.length === 8
      ? `${d.slice(6, 8)}/${d.slice(4, 6)}/${d.slice(0, 4)}`
      : receipt.date;
    return { displayDate, displayTime: receipt.time || "" };
  }
  // Fallback to ISO dateTime
  if (receipt.dateTime) {
    try {
      const dt = new Date(receipt.dateTime);
      const displayDate = dt.toLocaleDateString("pt-BR");
      const displayTime = dt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
      return { displayDate, displayTime };
    } catch { /* fall through */ }
  }
  return { displayDate: "—", displayTime: "" };
}

function getModalidade(receipt: ReceiptData): string {
  const tipo = receipt.kind?.toLowerCase() === "debit" ? "DÉBITO" : "CRÉDITO";
  if (receipt.installments > 1) return `${tipo} PARCELADO`;
  return `${tipo} À VISTA`;
}

export default function CheckoutReceipt({ receipt, linkData, fmtCurrency }: Props) {
  const ticketRef = useRef<HTMLDivElement>(null);
  const { displayDate, displayTime } = parseDateTime(receipt);

  const handleSave = async () => {
    if (!ticketRef.current) return;
    try {
      await exportToImage(ticketRef.current, { filename: `comprovante-${receipt.nsu || receipt.tid}`, title: "Comprovante" });
      toast.success("Comprovante salvo com sucesso!");
    } catch {
      toast.error("Erro ao salvar comprovante");
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-slate-100 flex flex-col items-center justify-center p-4 gap-4">
      <div ref={ticketRef} className="w-full max-w-md">
        {/* Picote top */}
        <div className="flex justify-center">
          <div className="w-[calc(100%-2rem)] h-4 bg-white rounded-t-xl"
            style={{
              maskImage: "radial-gradient(circle 6px at 12px 100%, transparent 5px, white 5.5px)",
              WebkitMaskImage: "radial-gradient(circle 6px at 12px 100%, transparent 5px, white 5.5px)",
              maskSize: "24px 100%", WebkitMaskSize: "24px 100%",
              maskRepeat: "repeat-x", WebkitMaskRepeat: "repeat-x",
              maskPosition: "center bottom", WebkitMaskPosition: "center bottom",
            }}
          />
        </div>

        {/* Body */}
        <div className="bg-white mx-4 px-5 pb-6 shadow-lg border-x border-slate-200/60">
          {/* Estabelecimento */}
          <div className="text-center pt-6 pb-2 space-y-1">
            {receipt.empresaNome && (
              <p className="text-sm font-bold text-slate-700 uppercase tracking-wide">{receipt.empresaNome}</p>
            )}
          </div>

          {/* Status */}
          <div className="text-center pb-3 space-y-1">
            <CheckCircle2 className="h-14 w-14 text-emerald-500 mx-auto" />
            <p className="text-lg font-bold text-slate-800">Pagamento Confirmado!</p>
            <p className="text-xs text-slate-400">{receipt.returnMessage}</p>
          </div>

          <DashedDivider />

          {/* Modalidade */}
          <div className="text-center py-2">
            <span className="text-xs font-bold text-slate-600 tracking-widest uppercase">
              {getModalidade(receipt)}
            </span>
          </div>

          <DashedDivider />

          {/* Cliente & Valor */}
          <div className="text-center py-4 space-y-1">
            {linkData.cliente_nome && (
              <p className="text-sm font-medium text-slate-600">{linkData.cliente_nome}</p>
            )}
            <p className="text-3xl font-bold text-slate-800 tracking-tight">{fmtCurrency(linkData.valor)}</p>
            {receipt.installments > 1 && (
              <p className="text-sm text-slate-500">
                {receipt.installments}x de {fmtCurrency(linkData.valor / receipt.installments)}
              </p>
            )}
            <p className="text-xs text-slate-400 mt-1">{linkData.descricao}</p>
          </div>

          <DashedDivider />

          {/* Cartão & Bandeira */}
          {(receipt.last4 || receipt.brand) && (
            <>
              <div className="py-3 space-y-1.5 text-center">
                {receipt.last4 && (
                  <p className="text-sm font-mono text-slate-700">•••• •••• •••• {receipt.last4}</p>
                )}
                {receipt.brand && (
                  <p className="text-xs text-slate-500 uppercase tracking-wide">{receipt.brand}</p>
                )}
              </div>
              <DashedDivider />
            </>
          )}

          {/* NSU destaque */}
          {receipt.nsu && (
            <div className="my-4 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3 text-center space-y-1">
              <p className="text-[10px] uppercase tracking-widest text-emerald-600 font-semibold">NSU</p>
              <p className="text-2xl font-bold text-emerald-800 tracking-wider font-mono">{receipt.nsu}</p>
              <p className="text-[10px] text-emerald-600">Use este número para baixa no sistema</p>
            </div>
          )}

          <DashedDivider />

          {/* Detalhes */}
          <div className="py-3 space-y-2 font-mono text-xs">
            <div className="flex items-center gap-2 mb-2">
              <Receipt className="h-4 w-4 text-slate-400" />
              <span className="text-slate-600 font-sans text-sm font-semibold">Detalhes</span>
            </div>
            <Row label="Autorização" value={receipt.authorization} />
            <Row label="Data" value={displayDate} />
            {displayTime && <Row label="Hora" value={displayTime} />}
            {receipt.installments > 0 && <Row label="Parcelas" value={`${receipt.installments}x`} />}
          </div>

          {/* Rodapé — VIA DO CLIENTE */}
          <DashedDivider />
          <div className="pt-3 pb-1 text-center space-y-1">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em]">Via do Cliente</p>
            <p className="text-[9px] text-slate-400 leading-relaxed">
              Comprovante de pagamento processado pela e.Rede.<br />
              Guarde para sua referência.
            </p>
          </div>
        </div>

        {/* Picote bottom */}
        <div className="flex justify-center">
          <div className="w-[calc(100%-2rem)] h-4 bg-white rounded-b-xl"
            style={{
              maskImage: "radial-gradient(circle 6px at 12px 0, transparent 5px, white 5.5px)",
              WebkitMaskImage: "radial-gradient(circle 6px at 12px 0, transparent 5px, white 5.5px)",
              maskSize: "24px 100%", WebkitMaskSize: "24px 100%",
              maskRepeat: "repeat-x", WebkitMaskRepeat: "repeat-x",
              maskPosition: "center top", WebkitMaskPosition: "center top",
            }}
          />
        </div>
      </div>

      {/* Botões */}
      <div className="w-full max-w-md flex gap-3 px-4">
        <Button variant="outline" className="flex-1 gap-2" onClick={() => window.location.href = "/"}>
          <Home className="h-4 w-4" /> Voltar
        </Button>
        <Button className="flex-1 gap-2 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={handleSave}>
          <Download className="h-4 w-4" /> Salvar comprovante
        </Button>
      </div>
    </div>
  );
}

function DashedDivider() {
  return <div className="border-t border-dashed border-slate-300 my-1" />;
}

function Row({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div className="flex justify-between">
      <span className="text-slate-400">{label}</span>
      <span className="text-slate-700 font-medium">{value}</span>
    </div>
  );
}
