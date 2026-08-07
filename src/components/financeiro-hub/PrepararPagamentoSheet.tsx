import { useState, useEffect } from "react";
import { format } from "date-fns";
import { ShieldCheck, Info, CreditCard, Banknote, FileText, Building2, Landmark } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  valorDoCodigoBarras,
  somenteDigitos,
  formatarLinhaDigitavel,
  diagnosticarBoleto,
} from "../../../supabase/functions/_shared/boleto";
import { tipoPorLinhaDigitavel, ehPixCopiaECola } from "../../../supabase/functions/_shared/btgPayment";

interface Lancamento {
  id: string;
  descricao: string;
  valor: number;
  data_vencimento: string;
  pessoa_nome: string | null;
  pessoa_documento?: string | null;
  btg_dda_id: string | null;
  dados_extras: Record<string, unknown> | null;
}

const PAYMENT_TYPES = [
  { value: "PIX_KEY", label: "PIX (Chave)", icon: CreditCard, hint: "Informe a chave PIX do beneficiário (CPF, CNPJ, e-mail, telefone ou aleatória)" },
  // Copia e cola é outro tipo no BTG (PIX_QR_CODE, campo `emv`). Colado no campo
  // de chave, o banco recusa com `pix-key-type-not-supported` e o lote inteiro
  // não chega — caso real da premiação Nobelpack (07/08/2026).
  { value: "PIX_QR_CODE", label: "PIX (Copia e cola)", icon: CreditCard, hint: "Cole o código do QR Code (Pix copia e cola) gerado pelo beneficiário" },
  { value: "BANKSLIP", label: "Boleto ou conta", icon: FileText, hint: "Boleto de fornecedor ou conta de concessionária (água, luz, gás, telefone) — informe a linha digitável ou o código de barras" },
  // PIX_MANUAL: mesmos dados de uma TED, mas liquida pelo Pix — sem custo, sem
  // janela de horário e cai na hora. Enquanto a conta salário do BTG não estiver
  // alinhada, é por aqui que a folha é paga.
  { value: "PIX_MANUAL", label: "PIX (Dados bancários)", icon: Landmark, hint: "Pix direto para banco, agência e conta — não exige chave cadastrada. Liquida na hora, sem tarifa" },
  { value: "TED", label: "TED", icon: Building2, hint: "Transferência tradicional por banco, agência e conta — sujeita a tarifa e a horário" },
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
  // TED exige creditParty completo: a API recusa sem taxId e name do
  // beneficiário. A tela pedia só banco/agência/conta, então todo TED falhava
  // no envio com "creditParty.taxId inválido".
  const [favNome, setFavNome] = useState("");
  const [favDoc, setFavDoc] = useState("");
  const [tipoConta, setTipoConta] = useState("CC");

  useEffect(() => {
    if (!lancamento) return;
    const d = lancamento.dados_extras || {};
    setPayType(String(d.btg_payment_type || "PIX_KEY"));
    // Guardamos só dígitos: a máscara é de exibição, o banco recebe a linha limpa.
    setBarcode(somenteDigitos(d.linha_digitavel));
    const details = (d.btg_details || {}) as Record<string, unknown>;
    setPixKey(String(details.pixKey || ""));
    setBanco(String(details.bankCode || ""));
    setAgencia(String(details.branch || ""));
    setConta(String(details.account || ""));
    setTipoConta(String(details.accountType || details.tipo_conta || "CC"));
    // Herda do cadastro do lançamento quando o pagamento ainda não foi preparado.
    setFavNome(String(details.name || lancamento.pessoa_nome || ""));
    setFavDoc(String(details.taxId || lancamento.pessoa_documento || ""));
  }, [lancamento]);

  const soDigitos = (v: string) => v.replace(/\D/g, "");

  const fmtCurrency = (v: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

  const selectedType = PAYMENT_TYPES.find(t => t.value === payType);

  // Diagnóstico da linha digitável — alimenta o retorno na tela e a liberação
  // do salvar. Antes bastava "mais de 10 caracteres", e linha corrompida só era
  // recusada quando o borderô ia ao banco.
  const diagBoleto = diagnosticarBoleto(barcode);

  const isValid = () => {
    if (payType === "PIX_KEY") return pixKey.length > 3;
    if (payType === "BANKSLIP" || payType === "DARF") return diagBoleto.status === "ok";
    // PIX_MANUAL e TED exigem o mesmo creditParty completo.
    if (payType === "TED" || payType === "PIX_MANUAL") {
      const doc = soDigitos(favDoc);
      return !!(banco && agencia && conta && favNome.trim() && (doc.length === 11 || doc.length === 14));
    }
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
      // Arrecadação (linha iniciada em 8) exige o tipo UTILITIES no BTG. Quem
      // decide é o código, não o operador — gravamos já corrigido.
      dadosExtras.btg_payment_type = tipoPorLinhaDigitavel(barcode) ?? "BANKSLIP";
      dadosExtras.btg_details = { barcode };
    } else if (payType === "TED" || payType === "PIX_MANUAL") {
      dadosExtras.btg_details = {
        bankCode: banco, branch: agencia, account: conta,
        accountType: tipoConta, name: favNome.trim(), taxId: soDigitos(favDoc),
      };
    } else if (payType === "DARF") {
      dadosExtras.btg_details = { barcode };
    }
    onSave(lancamento.id, dadosExtras);
  };

  // Comparação por string local (yyyy-MM-dd) — new Date("yyyy-MM-dd") é UTC e
  // marcava como vencido boleto que vence HOJE (off-by-one de fuso).
  const isVencido = lancamento && String(lancamento.data_vencimento) < format(new Date(), "yyyy-MM-dd");

  // O valor que o banco vai cobrar é o do título, não o que veio do ERP —
  // divergir, ainda que em centavos, dispara `amount-doesnt-match` no BTG. O
  // próprio código de barras carrega o valor, então dá para conferir aqui.
  const valorBoleto = payType === "BANKSLIP" ? valorDoCodigoBarras(barcode) : null;
  // Aviso na tela: o operador escolhe "Boleto" e a linha revela arrecadação.
  const ehArrecadacao = payType === "BANKSLIP" && tipoPorLinhaDigitavel(barcode) === "UTILITIES";
  const ajusteValor =
    lancamento && valorBoleto !== null && Math.abs(valorBoleto - lancamento.valor) >= 0.01
      ? Number((valorBoleto - lancamento.valor).toFixed(2))
      : null;

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
                <div className="text-right">
                  <p className="text-lg font-bold">{fmtCurrency(valorBoleto ?? lancamento.valor)}</p>
                  {ajusteValor !== null && (
                    <Badge
                      variant="outline"
                      className="text-[10px] mt-0.5 bg-amber-50 text-amber-700 border-amber-200 cursor-help"
                      title={
                        `Valor ajustado para o do boleto registrado.\n` +
                        `ERP: ${fmtCurrency(lancamento.valor)}\n` +
                        `Boleto: ${fmtCurrency(valorBoleto as number)}\n` +
                        `Diferença: ${ajusteValor > 0 ? "+" : ""}${fmtCurrency(ajusteValor)}\n\n` +
                        `O banco recusa o pagamento se o valor enviado não bater com o do título.`
                      }
                    >
                      ⚠ ajustado {ajusteValor > 0 ? "+" : "−"}{fmtCurrency(Math.abs(ajusteValor))}
                    </Badge>
                  )}
                </div>
              </div>
              <div className="flex gap-2 items-center">
                <p className={cn("text-xs", isVencido ? "text-destructive font-medium" : "text-muted-foreground")}>
                  {isVencido ? "⚠ Vencido em " : "Vencimento: "}
                  {format(new Date(lancamento.data_vencimento + "T12:00:00"), "dd/MM/yyyy")}
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
                  {/* Pode colar com pontos, espaços e barras: guardamos só os
                      dígitos e devolvemos a máscara do papel, para conferência. */}
                  <Input
                    value={formatarLinhaDigitavel(barcode)}
                    onChange={e => setBarcode(somenteDigitos(e.target.value))}
                    inputMode="numeric"
                    placeholder={payType === "DARF" ? "Código de barras do tributo" : "Cole a linha digitável do boleto (pontos e espaços são aceitos)"}
                    className="font-mono text-sm"
                  />
                  {/* Retorno imediato: antes, linha errada só era barrada no envio ao banco. */}
                  {diagBoleto.status === "ok" && (
                    <p className="text-xs text-green-700">✓ {diagBoleto.mensagem}</p>
                  )}
                  {diagBoleto.status === "incompleto" && (
                    <p className="text-xs text-muted-foreground">{diagBoleto.mensagem}</p>
                  )}
                  {diagBoleto.status === "invalido" && (
                    <p className="text-xs text-destructive bg-destructive/5 border border-destructive/20 rounded-md p-2">
                      Linha não confere — {diagBoleto.mensagem}
                    </p>
                  )}
                  {ehArrecadacao && (
                    <p className="text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded-md p-2">
                      Conta de concessionária (água, luz, gás ou tributo) — reconhecida pela linha
                      iniciada em 8. Será enviada ao banco como arrecadação, não como boleto comum.
                    </p>
                  )}
                  {lancamento.btg_dda_id && barcode && (
                    <p className="text-xs text-green-600">✓ Código preenchido automaticamente via DDA</p>
                  )}
                </div>
              )}

              {(payType === "TED" || payType === "PIX_MANUAL") && (
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
                  {/* creditParty: a API recusa TED e PIX_MANUAL sem nome e
                      documento do beneficiário. Faltavam na tela, e todo TED
                      falhava. */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-1 col-span-2">
                      <Label>Nome do beneficiário</Label>
                      <Input value={favNome} onChange={e => setFavNome(e.target.value)}
                        placeholder="Como consta na conta" />
                    </div>
                    <div className="space-y-1">
                      <Label>Tipo</Label>
                      <select className="w-full h-10 rounded-md border bg-background px-3 text-sm"
                        value={tipoConta} onChange={e => setTipoConta(e.target.value)}>
                        <option value="CC">Corrente</option>
                        <option value="PP">Poupança</option>
                        <option value="PG">Pagamento</option>
                      </select>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label>CNPJ / CPF do beneficiário</Label>
                    <Input value={favDoc} onChange={e => setFavDoc(e.target.value)}
                      placeholder="00.000.000/0001-00" />
                    <p className="text-xs text-muted-foreground">
                      Obrigatório: o banco valida a titularidade da conta contra este documento.
                    </p>
                  </div>
                  {payType === "PIX_MANUAL" && (
                    <p className="text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded-md p-2">
                      O beneficiário não precisa ter chave Pix cadastrada — a liquidação usa
                      banco, agência e conta. Confira o CPF: é ele que o banco compara com o
                      titular da conta antes de liberar.
                    </p>
                  )}
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
