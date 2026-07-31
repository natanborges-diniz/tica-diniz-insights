import { useState, useEffect, useRef } from "react";
import { useParams } from "react-router-dom";
import { CheckCircle2, XCircle, Clock, Copy, Loader2, QrCode } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

interface PixData {
  id: string;
  valor: number;
  descricao: string;
  status: string;
  expira_em: string | null;
  pago_em: string | null;
  cliente_nome: string | null;
  pix_copia_cola: string | null;
  qr_code_base64: string | null;
}

const fmtCurrency = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

const POLL_MS = 5000;

export default function PixPage() {
  const { chargeId } = useParams<{ chargeId: string }>();
  const [pixData, setPixData] = useState<PixData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!chargeId) return;
    let alive = true;

    const fetchPix = async () => {
      try {
        const res = await fetch(`${SUPABASE_URL}/functions/v1/pix-charges-v5`, {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: SUPABASE_KEY },
          body: JSON.stringify({ action: "detalhe_publico", link_id: chargeId }),
        });
        const data = await res.json();
        if (!alive) return;
        if (data.error) {
          setError(data.error);
          return;
        }
        setPixData(data);
        // Continua o polling enquanto estiver aguardando pagamento
        if (data.status === "ATIVO") {
          timerRef.current = window.setTimeout(fetchPix, POLL_MS);
        }
      } catch {
        if (alive) {
          // Erro transiente de rede: tenta de novo no próximo ciclo
          timerRef.current = window.setTimeout(fetchPix, POLL_MS * 2);
        }
      } finally {
        if (alive) setLoading(false);
      }
    };

    fetchPix();
    return () => {
      alive = false;
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [chargeId]);

  const copiar = () => {
    if (!pixData?.pix_copia_cola) return;
    navigator.clipboard.writeText(pixData.pix_copia_cola).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/30">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !pixData) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <XCircle className="h-12 w-12 text-destructive" />
            <h1 className="text-lg font-semibold">Cobrança não encontrada</h1>
            <p className="text-sm text-muted-foreground">{error || "Verifique o link recebido."}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (pixData.status === "PAGO") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <CheckCircle2 className="h-14 w-14 text-emerald-500" />
            <h1 className="text-xl font-semibold">Pagamento confirmado!</h1>
            <p className="text-3xl font-bold">{fmtCurrency(Number(pixData.valor))}</p>
            <p className="text-sm text-muted-foreground">{pixData.descricao}</p>
            {pixData.pago_em && (
              <p className="text-xs text-muted-foreground">
                {new Date(pixData.pago_em).toLocaleString("pt-BR")}
              </p>
            )}
            <p className="mt-2 rounded-md bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-300">
              A loja já recebeu a confirmação automaticamente. Obrigado!
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (pixData.status === "EXPIRADO" || pixData.status === "CANCELADO") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <Clock className="h-12 w-12 text-amber-500" />
            <h1 className="text-lg font-semibold">
              {pixData.status === "EXPIRADO" ? "Cobrança expirada" : "Cobrança cancelada"}
            </h1>
            <p className="text-sm text-muted-foreground">
              Peça um novo QR Code Pix à loja para concluir o pagamento.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md">
        <CardContent className="flex flex-col items-center gap-4 py-8">
          <div className="flex items-center gap-2 text-primary">
            <QrCode className="h-5 w-5" />
            <h1 className="text-lg font-semibold">Pagamento via Pix</h1>
          </div>

          <div className="text-center">
            <p className="text-3xl font-bold">{fmtCurrency(Number(pixData.valor))}</p>
            <p className="mt-1 text-sm text-muted-foreground">{pixData.descricao}</p>
            {pixData.cliente_nome && (
              <p className="text-xs text-muted-foreground">Para: {pixData.cliente_nome}</p>
            )}
          </div>

          {pixData.qr_code_base64 && (
            <img
              src={pixData.qr_code_base64}
              alt="QR Code Pix"
              className="h-56 w-56 rounded-lg border bg-white p-3"
            />
          )}

          <p className="text-center text-xs text-muted-foreground">
            Abra o app do seu banco, escolha <strong>Pix</strong> e escaneie o código —
            ou use o copia-e-cola abaixo.
          </p>

          {pixData.pix_copia_cola && (
            <>
              <p className="w-full break-all rounded-md bg-muted/50 p-2 font-mono text-[10px] leading-snug">
                {pixData.pix_copia_cola}
              </p>
              <Button onClick={copiar} className="w-full" variant={copied ? "secondary" : "default"}>
                <Copy className="mr-2 h-4 w-4" />
                {copied ? "Copiado!" : "Copiar código Pix"}
              </Button>
            </>
          )}

          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Aguardando pagamento — a confirmação aparece aqui automaticamente.
          </div>

          {pixData.expira_em && (
            <p className="text-[11px] text-muted-foreground">
              Válido até {new Date(pixData.expira_em).toLocaleString("pt-BR")}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
