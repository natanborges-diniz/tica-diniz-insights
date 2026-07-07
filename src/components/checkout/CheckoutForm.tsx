import { useState } from "react";
import { CreditCard, Lock, AlertTriangle, Loader2, RefreshCw, XCircle, Info, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

type ErrorCategory = "ISSUER" | "CARD_DATA" | "RETRY" | "BLOCKED" | "MERCHANT" | "UNKNOWN";

interface PaymentError {
  message: string;
  category: ErrorCategory;
  retryable: boolean;
  suggestion: string;
  returnCode?: string;
}

interface LinkData {
  id: string;
  valor: number;
  descricao: string;
  parcelas_max: number;
  parcelas_fixas?: number | null;
  cliente_nome: string | null;
}

interface Props {
  linkData: LinkData;
  linkId: string;
  fmtCurrency: (v: number) => string;
  onSuccess: (data: any) => void;
}

function maskCard(value: string) {
  return value.replace(/\D/g, "").replace(/(\d{4})(?=\d)/g, "$1 ").trim().slice(0, 19);
}
function maskExpiry(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 4);
  if (digits.length >= 3) return digits.slice(0, 2) + "/" + digits.slice(2);
  return digits;
}

export default function CheckoutForm({ linkData, linkId, fmtCurrency, onSuccess }: Props) {
  const [processing, setProcessing] = useState(false);
  const [paymentError, setPaymentError] = useState<PaymentError | null>(null);
  const [form, setForm] = useState({
    cardNumber: "",
    cardholderName: "",
    expiry: "",
    securityCode: "",
    installments: linkData.parcelas_fixas ? String(linkData.parcelas_fixas) : "1",
  });

  const setLocalError = (message: string, opts?: Partial<PaymentError>) =>
    setPaymentError({ message, category: "CARD_DATA", retryable: true, suggestion: "", ...opts });

  const handleTryAnotherCard = () => {
    setPaymentError(null);
    setForm({ cardNumber: "", cardholderName: "", expiry: "", securityCode: "", installments: form.installments });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPaymentError(null);
    setProcessing(true);

    const cardDigits = form.cardNumber.replace(/\s/g, "");
    const [expMonth, expYear] = form.expiry.split("/");

    if (cardDigits.length < 13 || cardDigits.length > 19) {
      setLocalError("Número do cartão inválido", { suggestion: "Confira o número impresso no cartão." });
      setProcessing(false);
      return;
    }
    if (!expMonth || !expYear || parseInt(expMonth) < 1 || parseInt(expMonth) > 12) {
      setLocalError("Data de validade inválida", { suggestion: "Use o formato MM/AA conforme o cartão." });
      setProcessing(false);
      return;
    }
    if (form.securityCode.length < 3) {
      setLocalError("CVV inválido", { suggestion: "O CVV tem 3 dígitos (4 no Amex)." });
      setProcessing(false);
      return;
    }

    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/payment-links`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: SUPABASE_KEY },
        body: JSON.stringify({
          action: "processar_pagamento",
          link_id: linkId,
          cardNumber: cardDigits,
          cardholderName: form.cardholderName.toUpperCase(),
          expirationMonth: parseInt(expMonth),
          expirationYear: parseInt(`20${expYear}`),
          securityCode: form.securityCode,
          installments: parseInt(form.installments),
        }),
      });
      const data = await res.json();
      if (data.error) {
        setPaymentError({
          message: data.error,
          category: (data.errorCategory as ErrorCategory) || "UNKNOWN",
          retryable: data.retryable !== false,
          suggestion: data.suggestion || "",
          returnCode: data.returnCode,
        });
      } else {
        onSuccess(data);
      }
    } catch {
      setPaymentError({
        message: "Não foi possível conectar à operadora.",
        category: "RETRY",
        retryable: true,
        suggestion: "Verifique sua conexão e tente novamente.",
      });
    } finally {
      setProcessing(false);
    }
  };

  const errorVisual = (() => {
    if (!paymentError) return null;
    const map: Record<ErrorCategory, { icon: typeof AlertTriangle; tone: string; title: string }> = {
      ISSUER:    { icon: ShieldAlert,   tone: "amber",  title: "Cartão recusado pelo banco" },
      CARD_DATA: { icon: Info,          tone: "blue",   title: "Verifique os dados do cartão" },
      RETRY:     { icon: RefreshCw,     tone: "blue",   title: "Tente novamente" },
      BLOCKED:   { icon: XCircle,       tone: "red",    title: "Cartão indisponível" },
      MERCHANT:  { icon: AlertTriangle, tone: "amber",  title: "Pagamento não permitido" },
      UNKNOWN:   { icon: AlertTriangle, tone: "amber",  title: "Pagamento não aprovado" },
    };
    return map[paymentError.category];
  })();

  const toneClasses: Record<string, string> = {
    amber: "bg-amber-50 border-amber-200 text-amber-900",
    blue:  "bg-blue-50 border-blue-200 text-blue-900",
    red:   "bg-red-50 border-red-200 text-red-900",
  };



  const isFixed = linkData.parcelas_fixas != null && linkData.parcelas_fixas > 0;
  const maxParcelas = isFixed ? linkData.parcelas_fixas! : (linkData.parcelas_max || 1);
  const parcelaOptions = isFixed
    ? [linkData.parcelas_fixas!]
    : Array.from({ length: maxParcelas }, (_, i) => i + 1);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 flex items-center justify-center p-4">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="text-center pb-2">
          <div className="flex items-center justify-center gap-2 text-slate-400 mb-2">
            <Lock className="h-4 w-4" />
            <span className="text-xs font-medium uppercase tracking-wider">Pagamento Seguro</span>
          </div>
          <CardTitle className="text-base text-slate-600">{linkData.descricao}</CardTitle>
          <p className="text-3xl font-bold text-slate-800 mt-1">{fmtCurrency(linkData.valor)}</p>
          {linkData.cliente_nome && (
            <p className="text-sm text-slate-500 mt-1">{linkData.cliente_nome}</p>
          )}
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-600">Número do Cartão</Label>
              <div className="relative">
                <Input
                  value={form.cardNumber}
                  onChange={e => setForm(f => ({ ...f, cardNumber: maskCard(e.target.value) }))}
                  placeholder="0000 0000 0000 0000"
                  className="font-mono text-base pl-10"
                  maxLength={19}
                  inputMode="numeric"
                  autoComplete="cc-number"
                  required
                />
                <CreditCard className="h-4 w-4 text-slate-400 absolute left-3 top-3" />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-slate-600">Nome no Cartão</Label>
              <Input
                value={form.cardholderName}
                onChange={e => setForm(f => ({ ...f, cardholderName: e.target.value }))}
                placeholder="NOME COMPLETO"
                className="uppercase text-base"
                autoComplete="cc-name"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-600">Validade</Label>
                <Input
                  value={form.expiry}
                  onChange={e => setForm(f => ({ ...f, expiry: maskExpiry(e.target.value) }))}
                  placeholder="MM/AA"
                  className="font-mono text-base"
                  maxLength={5}
                  inputMode="numeric"
                  autoComplete="cc-exp"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-600">CVV</Label>
                <Input
                  type="password"
                  value={form.securityCode}
                  onChange={e => setForm(f => ({ ...f, securityCode: e.target.value.replace(/\D/g, "").slice(0, 4) }))}
                  placeholder="•••"
                  className="font-mono text-base"
                  maxLength={4}
                  inputMode="numeric"
                  autoComplete="cc-csc"
                  required
                />
              </div>
            </div>

            {isFixed ? (
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-600">Parcelas</Label>
                <div className="border rounded-md px-3 py-2.5 bg-slate-50 text-slate-700 text-sm flex items-center justify-between">
                  <span className="font-medium">
                    {linkData.parcelas_fixas}x de {fmtCurrency(linkData.valor / linkData.parcelas_fixas!)}
                    {linkData.parcelas_fixas === 1 ? " (à vista)" : ""}
                  </span>
                  <span className="text-xs text-slate-500">Total: {fmtCurrency(linkData.valor)}</span>
                </div>
                <p className="text-[10px] text-slate-400">Parcelamento definido pela loja e não pode ser alterado.</p>
              </div>
            ) : maxParcelas > 1 && (
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-600">Parcelas</Label>
                <Select value={form.installments} onValueChange={v => setForm(f => ({ ...f, installments: v }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {parcelaOptions.map(n => (
                      <SelectItem key={n} value={String(n)}>
                        {n}x de {fmtCurrency(linkData.valor / n)}{n === 1 ? " (à vista)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {paymentError && errorVisual && (
              <div className={`text-sm p-3 rounded-md border ${toneClasses[errorVisual.tone]}`}>
                <div className="flex items-start gap-2">
                  <errorVisual.icon className="h-4 w-4 mt-0.5 shrink-0" />
                  <div className="flex-1 space-y-1">
                    <p className="font-semibold leading-tight">{errorVisual.title}</p>
                    <p className="text-[13px] leading-snug">{paymentError.message}</p>
                    {paymentError.suggestion && (
                      <p className="text-[12px] opacity-80 leading-snug">{paymentError.suggestion}</p>
                    )}
                  </div>
                </div>
                {(paymentError.category === "ISSUER" || paymentError.category === "BLOCKED" || paymentError.category === "CARD_DATA") && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleTryAnotherCard}
                    className="mt-3 w-full bg-white"
                  >
                    <CreditCard className="h-3.5 w-3.5 mr-1.5" />
                    Tentar com outro cartão
                  </Button>
                )}
              </div>
            )}

            <Button type="submit" className="w-full h-12 text-base" disabled={processing}>
              {processing ? (
                <Loader2 className="h-5 w-5 animate-spin mr-2" />
              ) : (
                <Lock className="h-4 w-4 mr-2" />
              )}
              {processing ? "Processando..." : `Pagar ${fmtCurrency(linkData.valor)}`}
            </Button>

            <p className="text-[10px] text-slate-400 text-center">
              Seus dados são transmitidos diretamente para a adquirente de forma segura. Nenhum dado de cartão é armazenado.
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
