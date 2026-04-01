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

function parseDateTime(rede: any): { displayDate: string; displayTime: string } {
  // Try separate date field (YYYYMMDD format)
  if (rede.date && typeof rede.date === "string" && rede.date.length >= 8) {
    const d = rede.date.replace(/\D/g, "");
    const displayDate = d.length === 8
      ? `${d.slice(6, 8)}/${d.slice(4, 6)}/${d.slice(0, 4)}`
      : rede.date;
    return { displayDate, displayTime: rede.time || "" };
  }
  // Fallback to ISO dateTime
  if (rede.dateTime) {
    try {
      const dt = new Date(rede.dateTime);
      return {
        displayDate: dt.toLocaleDateString("pt-BR"),
        displayTime: dt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
      };
    } catch { /* fall through */ }
  }
  return { displayDate: "—", displayTime: "" };
}

function getModalidade(rede: any): string {
  const tipo = rede.kind?.toLowerCase() === "debit" ? "DÉBITO" : "CRÉDITO";
  const parcelas = rede.installments || 1;
  if (parcelas > 1) return `${tipo} PARCELADO ${parcelas}x`;
  return `${tipo} À VISTA`;
}

export default function ReceiptSheet({ open, onOpenChange, dadosExtras, descricao, valor, fmtCurrency }: Props) {
  const rede = dadosExtras?.rede_response || {};
  const { displayDate, displayTime } = parseDateTime(rede);
  const empresaNome = dadosExtras?.empresa_nome || "";
  const empresaCnpj = dadosExtras?.empresa_cnpj || "";
  const merchantPv = dadosExtras?.merchant_pv || rede.merchantPv || "";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5" />
            Comprovante de Pagamento
          </SheetTitle>
        </SheetHeader>

        <div className="mt-6 space-y-3">
          {/* Estabelecimento */}
          <div className="text-center space-y-0.5">
            {empresaNome && (
              <p className="text-sm font-bold text-foreground uppercase tracking-wide">{empresaNome}</p>
            )}
            {empresaCnpj && (
              <p className="text-[10px] text-muted-foreground font-mono">CNPJ: {empresaCnpj}</p>
            )}
            {merchantPv && (
              <p className="text-[10px] text-muted-foreground font-mono">PV: {merchantPv}</p>
            )}
          </div>

          <Separator />

          {/* Modalidade */}
          <div className="text-center">
            <span className="text-xs font-bold text-foreground tracking-widest uppercase">
              {getModalidade(rede)}
            </span>
          </div>

          {/* Valor */}
          <div className="text-center">
            <p className="text-xs text-muted-foreground">{descricao}</p>
            <p className="text-2xl font-bold">{fmtCurrency(valor)}</p>
            {rede.installments > 1 && (
              <p className="text-sm text-muted-foreground">{rede.installments}x de {fmtCurrency(valor / rede.installments)}</p>
            )}
          </div>

          <Separator />

          {/* Cartão & Bandeira */}
          {(rede.cardBin || rede.last4 || rede.brand) && (
            <div className="text-center space-y-1">
              {(rede.cardBin || rede.last4) && (
                <p className="text-sm font-mono text-foreground">
                  {rede.cardBin || "****"} **** **** {rede.last4 || "****"}
                </p>
              )}
              {(rede.brand?.name || rede.brandName) && (
                <p className="text-xs text-muted-foreground uppercase tracking-wide">
                  {rede.brand?.name || rede.brandName}
                </p>
              )}
            </div>
          )}

          <Separator />

          {/* NSU destaque */}
          {rede.nsu && (
            <div className="bg-primary/10 rounded-lg px-4 py-3 text-center space-y-1">
              <p className="text-[10px] uppercase tracking-widest text-primary font-semibold">NSU (para baixa no sistema)</p>
              <p className="text-xl font-bold text-primary tracking-wider font-mono">{rede.nsu}</p>
            </div>
          )}

          {/* Detalhes técnicos */}
          <div className="bg-muted/50 rounded-lg p-4 space-y-2 font-mono text-xs">
            <Row label="TID" value={rede.tid} />
            <Row label="Autorização" value={rede.authorizationCode} />
            <Row label="Data" value={displayDate} />
            {displayTime && <Row label="Hora" value={displayTime} />}
            <Row label="Código Retorno" value={rede.returnCode?.toString()} />
            <Row label="Mensagem" value={rede.returnMessage} />
            <Row label="Referência" value={rede.reference} />
          </div>

          {/* Rodapé — VIA DO ESTABELECIMENTO */}
          <Separator />
          <div className="text-center space-y-1 pb-2">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.2em]">Via do Estabelecimento</p>
            <p className="text-[9px] text-muted-foreground leading-relaxed">
              Comprovante de pagamento processado pela e.Rede.<br />
              Documento para fins de conciliação.
            </p>
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
