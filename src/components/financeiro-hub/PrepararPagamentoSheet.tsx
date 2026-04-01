import { useState, useEffect } from "react";
import { format } from "date-fns";
import { ShieldCheck, Info, CreditCard, Banknote, FileText, Building2 } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface Lancamento {
  id: string;
  descricao: string;
  valor: number;
  data_vencimento: string;
  pessoa_nome: string | null;
  btg_dda_id: string | null;
  dados_extras: Record<string, unknown> | null;
}

const PAYMENT_TYPES = [
  { value: "PIX_KEY", label: "PIX (Chave)", icon: CreditCard, hint: "Informe a chave PIX do beneficiário (CPF, CNPJ, e-mail, telefone ou aleatória)" },
  { value: "BANKSLIP", label: "Boleto", icon: FileText, hint: "Informe o código de barras ou linha digitável do boleto" },
  { value: "TED", label: "TED", icon: Building2, hint: "Informe os dados bancários do beneficiário para transferência" },
  { value: "DARF", label: "DARF (Tributo)", icon: Banknote, hint: "Informe o código de barras do DARF ou guia de tributo" },
];

interface Props {
  lancamento: Lancamento | null;
  onClose: () => void;
  onSave: (lancId: string, dadosExtras: Record<string, unknown>) => void;
  isPending: boolean;
}

export function PrepararPagamentoSheet({ lancamento, onClose, onSave, isPending }: Props) {
  const [payType, setPayType] = useState("PIX_KEY");
  const [pixKey, setPixKey] = useState("");
  const [barcode, setBarcode] = useState("");
  const [banco, setBanco] = useState("");
  const [agencia, setAgencia] = useState("");
  const [conta, setConta] = useState("");

  useEffect(() => {
    if (!lancamento) return;
    const d = lancamento.dados_extras || {};
    setPayType(String(d.btg_payment_type || "PIX_KEY"));
    setBarcode(String(d.linha_digitavel || ""));
    const details = (d.btg_details || {}) as Record<string, unknown>;
    setPixKey(String(details.pixKey || ""));
    setBanco(String(details.bankCode || ""));
    setAgencia(String(details.branch || ""));
    setConta(String(details.account || ""));
  }, [lancamento]);

  const fmtCurrency = (v: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

  const selectedType = PAYMENT_TYPES.find(t => t.value === payType);

  const isValid = () => {
    if (payType === "PIX_KEY") return pixKey.length > 3;
    if (payType === "BANKSLIP" || payType === "DARF") return barcode.length > 10;
    if (payType === "TED") return banco && agencia && conta;
    return false;
  };

  const handleSave = () => {
    if (!lancamento) return;
    const dadosExtras: Record<string, unknown> = {
      ...(lancamento.dados_extras || {}),
      btg_payment_type: payType,
    };
    if (payType === "PIX_KEY") {
      dadosExtras.btg_details = { pixKey };
    } else if (payType === "BANKSLIP") {
      dadosExtras.linha_digitavel = barcode;
      dadosExtras.btg_details = { barcode };
    } else if (payType === "TED") {
      dadosExtras.btg_details = { bankCode: banco, branch: agencia, account: conta };
    } else if (payType === "DARF") {
      dadosExtras.btg_details = { barcode };
    }
    onSave(lancamento.id, dadosExtras);
  };

  const isVencido = lancamento && new Date(lancamento.data_vencimento) < new Date();

  return (
    <Sheet open={!!lancamento} onOpenChange={open => { if (!open) onClose(); }}>
      <SheetContent className="sm:max-w-lg">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-primary" />
            Preparar Pagamento
          </SheetTitle>
        </SheetHeader>

        {lancamento && (
          <div className="space-y-5 mt-4">
            {/* Step indicator */}
            <div className="bg-primary/5 border border-primary/20 rounded-lg p-3">
              <div className="flex items-start gap-2">
                <Info className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-primary">Passo 2: Configurar forma de pagamento</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Defina como este título será pago no banco BTG. Os dados preenchidos aqui serão usados na montagem do borderô.
                  </p>
                </div>
              </div>
            </div>

            {/* Lancamento summary */}
            <div className="bg-muted/50 rounded-lg p-4 space-y-2">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-sm font-medium">{lancamento.descricao}</p>
                  {lancamento.pessoa_nome && (
                    <p className="text-xs text-muted-foreground">Beneficiário: {lancamento.pessoa_nome}</p>
                  )}
                </div>
                <p className="text-lg font-bold">{fmtCurrency(lancamento.valor)}</p>
              </div>
              <div className="flex gap-2 items-center">
                <p className={cn("text-xs", isVencido ? "text-destructive font-medium" : "text-muted-foreground")}>
                  {isVencido ? "⚠ Vencido em " : "Vencimento: "}
                  {format(new Date(lancamento.data_vencimento), "dd/MM/yyyy")}
                </p>
                {lancamento.btg_dda_id && (
                  <Badge variant="outline" className="text-[10px] bg-green-50 text-green-700 border-green-200">
                    ✓ DDA Confirmado
                  </Badge>
                )}
              </div>
              {lancamento.dados_extras?.dda_emissor && (
                <p className="text-xs text-muted-foreground">Emissor DDA: {String(lancamento.dados_extras.dda_emissor)}</p>
              )}
            </div>

            {/* Payment type selection */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Como deseja pagar?</Label>
              <div className="grid grid-cols-2 gap-2">
                {PAYMENT_TYPES.map(pt => {
                  const Icon = pt.icon;
                  const isSelected = payType === pt.value;
                  const isDdaBoleto = lancamento.btg_dda_id && pt.value === "BANKSLIP";
                  return (
                    <button
                      key={pt.value}
                      onClick={() => setPayType(pt.value)}
                      className={cn(
                        "relative flex items-center gap-2 p-3 rounded-lg border text-left transition-all text-sm",
                        isSelected
                          ? "border-primary bg-primary/5 ring-1 ring-primary"
                          : "border-border hover:border-primary/50 hover:bg-muted/50",
                      )}
                    >
                      <Icon className={cn("h-4 w-4 shrink-0", isSelected ? "text-primary" : "text-muted-foreground")} />
                      <span className={cn("font-medium", isSelected ? "text-primary" : "text-foreground")}>{pt.label}</span>
                      {isDdaBoleto && (
                        <Badge variant="outline" className="absolute -top-2 -right-2 text-[9px] bg-green-50 text-green-700 border-green-200">
                          Auto
                        </Badge>
                      )}
                    </button>
                  );
                })}
              </div>
              {selectedType && (
                <p className="text-xs text-muted-foreground bg-muted/30 rounded p-2">
                  💡 {selectedType.hint}
                </p>
              )}
            </div>

            {/* Type-specific fields */}
            <div className="space-y-3">
              {payType === "PIX_KEY" && (
                <div className="space-y-1">
                  <Label>Chave PIX do beneficiário</Label>
                  <Input
                    value={pixKey}
                    onChange={e => setPixKey(e.target.value)}
                    placeholder="CPF, CNPJ, e-mail, telefone ou chave aleatória"
                  />
                </div>
              )}

              {(payType === "BANKSLIP" || payType === "DARF") && (
                <div className="space-y-1">
                  <Label>{payType === "DARF" ? "Código de barras do DARF" : "Linha digitável / Código de barras"}</Label>
                  <Input
                    value={barcode}
                    onChange={e => setBarcode(e.target.value)}
                    placeholder={payType === "DARF" ? "Código de barras do tributo" : "Cole a linha digitável do boleto"}
                    className="font-mono text-sm"
                  />
                  {lancamento.btg_dda_id && barcode && (
                    <p className="text-xs text-green-600">✓ Código preenchido automaticamente via DDA</p>
                  )}
                </div>
              )}

              {payType === "TED" && (
                <>
                  <div className="space-y-1">
                    <Label>Código do banco</Label>
                    <Input value={banco} onChange={e => setBanco(e.target.value)} placeholder="Ex: 001, 341, 237" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label>Agência</Label>
                      <Input value={agencia} onChange={e => setAgencia(e.target.value)} placeholder="0001" />
                    </div>
                    <div className="space-y-1">
                      <Label>Conta c/ dígito</Label>
                      <Input value={conta} onChange={e => setConta(e.target.value)} placeholder="12345-6" />
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Next step hint */}
            <div className="bg-muted/30 rounded-lg p-3 border border-dashed">
              <p className="text-xs text-muted-foreground">
                <strong>Próximo passo:</strong> Após salvar, selecione este lançamento na tabela e clique em "Criar Borderô" para agrupar os pagamentos e enviá-los ao banco BTG.
              </p>
            </div>

            <Button
              className="w-full"
              onClick={handleSave}
              disabled={isPending || !isValid()}
            >
              <ShieldCheck className="h-4 w-4 mr-2" />
              Salvar Dados de Pagamento
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
