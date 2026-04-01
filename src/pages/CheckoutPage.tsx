import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { CheckCircle2, XCircle, Clock, AlertTriangle, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import CheckoutReceipt from "@/components/checkout/CheckoutReceipt";
import CheckoutForm from "@/components/checkout/CheckoutForm";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

interface LinkData {
  id: string;
  valor: number;
  descricao: string;
  parcelas_max: number;
  status: string;
  expira_em: string | null;
  cliente_nome: string | null;
}

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
  returnCode?: string;
  brand?: string;
  kind?: string;
  reference?: string;
  empresaNome?: string;
  merchantPv?: string;
}

const fmtCurrency = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

export default function CheckoutPage() {
  const { linkId } = useParams<{ linkId: string }>();
  const [linkData, setLinkData] = useState<LinkData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [receiptData, setReceiptData] = useState<ReceiptData | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!linkId) return;
    const fetchLink = async () => {
      try {
        const res = await fetch(`${SUPABASE_URL}/functions/v1/payment-links`, {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: SUPABASE_KEY },
          body: JSON.stringify({ action: "detalhe_publico", link_id: linkId }),
        });
        const data = await res.json();
        if (data.error) { setError(data.error); return; }
        setLinkData(data);
      } catch {
        setError("Erro ao carregar dados do pagamento");
      } finally {
        setLoading(false);
      }
    };
    fetchLink();
  }, [linkId]);

  const handlePaymentSuccess = (data: ReceiptData) => {
    setReceiptData(data);
    setSuccess(true);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 flex items-center justify-center p-4">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    );
  }

  if (error || !linkData) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-8 pb-6 text-center space-y-3">
            <XCircle className="h-12 w-12 text-red-400 mx-auto" />
            <p className="text-lg font-medium text-slate-700">Link não encontrado</p>
            <p className="text-sm text-slate-500">{error || "Este link de pagamento não existe ou foi removido."}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (linkData.status !== "ATIVO") {
    const stateConfig: Record<string, { icon: React.ElementType; title: string; desc: string; color: string }> = {
      PAGO: { icon: CheckCircle2, title: "Pagamento Confirmado", desc: "Este pagamento já foi realizado com sucesso.", color: "text-emerald-500" },
      EXPIRADO: { icon: Clock, title: "Link Expirado", desc: "Este link de pagamento expirou.", color: "text-amber-500" },
      CANCELADO: { icon: XCircle, title: "Link Cancelado", desc: "Este link de pagamento foi cancelado.", color: "text-red-400" },
    };
    const state = stateConfig[linkData.status] || { icon: AlertTriangle, title: linkData.status, desc: "", color: "text-slate-400" };
    const Icon = state.icon;

    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-8 pb-6 text-center space-y-3">
            <Icon className={`h-14 w-14 mx-auto ${state.color}`} />
            <p className="text-lg font-semibold text-slate-700">{state.title}</p>
            <p className="text-sm text-slate-500">{state.desc}</p>
            <div className="pt-2 border-t mt-4">
              <p className="text-xs text-slate-400">{linkData.descricao}</p>
              <p className="text-lg font-bold text-slate-700">{fmtCurrency(linkData.valor)}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (success && receiptData) {
    return <CheckoutReceipt receipt={receiptData} linkData={linkData} fmtCurrency={fmtCurrency} />;
  }

  return <CheckoutForm linkData={linkData} linkId={linkId!} fmtCurrency={fmtCurrency} onSuccess={handlePaymentSuccess} />;
}
