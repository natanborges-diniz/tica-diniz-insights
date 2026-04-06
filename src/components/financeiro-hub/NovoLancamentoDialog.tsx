import { useState } from "react";
import { Banknote, CreditCard, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BaseDialog } from "@/components/system/BaseDialog";

interface PlanoContaRow {
  id: string;
  conta_numero: string;
  conta_descricao: string;
  grupo_dre: string;
  categoria: string;
}

interface NovoLancamentoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  planoContas: PlanoContaRow[];
  onCriar: (data: {
    tipo: string;
    descricao: string;
    valor: number;
    data_vencimento: string;
    pessoa_nome?: string;
    pessoa_documento?: string;
    natureza?: string;
    categoria?: string;
    subcategoria?: string;
    forma_pagamento?: string;
    dados_extras?: Record<string, unknown>;
  }) => void;
  isPending: boolean;
}

export function NovoLancamentoDialog({ open, onOpenChange, planoContas, onCriar, isPending }: NovoLancamentoDialogProps) {
  const [tipo, setTipo] = useState("PAGAR");
  const [descricao, setDescricao] = useState("");
  const [valor, setValor] = useState("");
  const [vencimento, setVencimento] = useState("");
  const [pessoa, setPessoa] = useState("");
  const [documento, setDocumento] = useState("");
  const [contaSelecionada, setContaSelecionada] = useState("");
  const [natureza, setNatureza] = useState("");
  const [categoria, setCategoria] = useState("");
  const [formaPgto, setFormaPgto] = useState("");
  const [pixKey, setPixKey] = useState("");
  const [barcode, setBarcode] = useState("");

  const reset = () => {
    setDescricao(""); setValor(""); setVencimento("");
    setPessoa(""); setDocumento(""); setContaSelecionada("");
    setNatureza(""); setCategoria(""); setFormaPgto("");
    setPixKey(""); setBarcode("");
  };

  const handleCriar = () => {
    const dadosExtras: Record<string, unknown> = {};
    if (tipo === "PAGAR") {
      if (pixKey) { dadosExtras.pix_key = pixKey; dadosExtras.btg_payment_type = "PIX_KEY"; }
      if (barcode) { dadosExtras.linha_digitavel = barcode; dadosExtras.btg_payment_type = "BANKSLIP"; }
    }
    onCriar({
      tipo,
      descricao,
      valor: Number(valor),
      data_vencimento: vencimento,
      pessoa_nome: pessoa || undefined,
      pessoa_documento: documento || undefined,
      natureza: natureza || undefined,
      categoria: categoria || undefined,
      subcategoria: contaSelecionada || undefined,
      forma_pagamento: formaPgto || undefined,
      dados_extras: Object.keys(dadosExtras).length > 0 ? dadosExtras : undefined,
    });
    reset();
  };

  const canSubmit = descricao && valor && vencimento && contaSelecionada;

  return (
    <BaseDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Novo Lançamento"
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleCriar} disabled={isPending || !canSubmit}>
            Criar Lançamento
          </Button>
        </>
      }
    >
      <div className="space-y-4 py-2">
        <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 flex items-start gap-2">
          <ShieldCheck className="h-4 w-4 text-primary mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-medium text-primary">Cadastre a conta a pagar ou receber</p>
            <p className="text-xs text-muted-foreground">
              Campos com * são obrigatórios. A conta define a classificação automática no DRE.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>Tipo *</Label>
            <Select value={tipo} onValueChange={setTipo}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="PAGAR">A Pagar</SelectItem>
                <SelectItem value="RECEBER">A Receber</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Forma Pagamento</Label>
            <Select value={formaPgto} onValueChange={setFormaPgto}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="BOLETO">Boleto</SelectItem>
                <SelectItem value="PIX">PIX</SelectItem>
                <SelectItem value="TED">TED</SelectItem>
                <SelectItem value="CARTAO_CREDITO">Cartão Crédito</SelectItem>
                <SelectItem value="CARTAO_DEBITO">Cartão Débito</SelectItem>
                <SelectItem value="DINHEIRO">Dinheiro</SelectItem>
                <SelectItem value="CHEQUE">Cheque</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-1">
          <Label>Descrição *</Label>
          <Input value={descricao} onChange={e => setDescricao(e.target.value)} placeholder="Ex: Aluguel loja centro" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>Valor (R$) *</Label>
            <Input type="number" step="0.01" value={valor} onChange={e => setValor(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Vencimento *</Label>
            <Input type="date" value={vencimento} onChange={e => setVencimento(e.target.value)} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>Beneficiário / Pagador</Label>
            <Input value={pessoa} onChange={e => setPessoa(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>CPF/CNPJ</Label>
            <Input value={documento} onChange={e => setDocumento(e.target.value)} />
          </div>
        </div>

        {/* Conta via plano de contas */}
        <div className="space-y-1">
          <Label>Conta (Plano de Contas) *</Label>
          <Select
            value={contaSelecionada}
            onValueChange={(val) => {
              setContaSelecionada(val);
              const conta = planoContas.find(c => c.conta_descricao === val);
              if (conta) {
                setNatureza(conta.grupo_dre);
                setCategoria(conta.categoria);
              }
            }}
          >
            <SelectTrigger><SelectValue placeholder="Selecione a conta" /></SelectTrigger>
            <SelectContent>
              {planoContas.map(c => (
                <SelectItem key={c.id} value={c.conta_descricao}>
                  {c.conta_descricao.toUpperCase()} ({c.conta_numero})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {natureza && (
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Natureza (DRE)</Label>
              <div className="text-sm px-3 py-2 border rounded-md bg-muted/30 text-muted-foreground">
                {natureza.replace(/_/g, " ")}
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Categoria</Label>
              <div className="text-sm px-3 py-2 border rounded-md bg-muted/30 text-muted-foreground">
                {categoria.replace(/_/g, " ")}
              </div>
            </div>
          </div>
        )}

        {tipo === "PAGAR" && (
          <div className="border rounded-lg p-3 space-y-3 bg-muted/30">
            <p className="text-sm font-medium flex items-center gap-2">
              <Banknote className="h-4 w-4" /> Dados para pagamento (opcional)
            </p>
            <p className="text-xs text-muted-foreground">
              Pode configurar depois no passo "Preparar Pagamento".
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Chave PIX</Label>
                <Input value={pixKey} onChange={e => setPixKey(e.target.value)} placeholder="CPF, email, tel..." />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Código de barras</Label>
                <Input value={barcode} onChange={e => setBarcode(e.target.value)} placeholder="Linha digitável" />
              </div>
            </div>
          </div>
        )}

        <div className="bg-muted/30 rounded-lg p-2.5 border border-dashed">
          <p className="text-xs text-muted-foreground">
            <strong>Após criar:</strong> Configure a forma de pagamento clicando em <CreditCard className="h-3 w-3 inline" /> "Preparar Pgto", depois agrupe em um borderô para enviar ao banco.
          </p>
        </div>
      </div>
    </BaseDialog>
  );
}
