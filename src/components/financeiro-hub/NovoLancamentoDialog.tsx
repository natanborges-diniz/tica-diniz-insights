import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Banknote, CreditCard, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BaseDialog } from "@/components/system/BaseDialog";
import {
  somenteDigitos,
  formatarLinhaDigitavel,
  diagnosticarBoleto,
} from "../../../supabase/functions/_shared/boleto";

import { tipoPorLinhaDigitavel, ehPixCopiaECola } from "../../../supabase/functions/_shared/btgPayment";

/** Mesmas opções (e mesmos rótulos) do "Preparar Pagamento". */
const PAYMENT_TYPES = [
  { value: "PIX_KEY", label: "PIX (Chave)", hint: "Chave do beneficiário: CPF, CNPJ, e-mail, telefone ou aleatória" },
  { value: "PIX_QR_CODE", label: "PIX (Copia e cola)", hint: "Código do QR Code gerado pelo beneficiário — no BTG é outro tipo de pagamento, não chave" },
  { value: "BANKSLIP", label: "Boleto ou conta", hint: "Boleto de fornecedor ou conta de concessionária — informe a linha digitável" },
  { value: "PIX_MANUAL", label: "PIX (Dados bancários)", hint: "Pix por banco, agência e conta — não exige chave cadastrada" },
  { value: "TED", label: "TED", hint: "Transferência por banco, agência e conta — sujeita a tarifa e horário" },
  { value: "DARF", label: "DARF (Tributo)", hint: "Código de barras do DARF ou guia de tributo" },
];


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
  // Formas de pagamento — as mesmas do "Preparar Pagamento", para o operador não
  // precisar criar o lançamento e voltar depois só para escolher TED ou DARF.
  const [payType, setPayType] = useState("NAO_DEFINIDO");
  const [pixKey, setPixKey] = useState("");
  const [barcode, setBarcode] = useState("");
  const [banco, setBanco] = useState("");
  const [agencia, setAgencia] = useState("");
  const [conta, setConta] = useState("");
  const [tipoConta, setTipoConta] = useState("CC");
  const [favNome, setFavNome] = useState("");
  const [favDoc, setFavDoc] = useState("");
  const payTypeHint = PAYMENT_TYPES.find(t => t.value === payType)?.hint ?? null;
  // Retorno imediato da linha digitável (tipo, valor e vencimento lidos do código).
  const diagBoleto = diagnosticarBoleto(barcode);
  // G2/G3 — lastro obrigatório para PAGAR manual: rubrica ou exceção com justificativa
  const [lastroTipo, setLastroTipo] = useState<"RUBRICA" | "EXCECAO">("RUBRICA");
  const [rubricaId, setRubricaId] = useState("");
  const [justificativa, setJustificativa] = useState("");

  const { data: rubricasAtivas = [] } = useQuery({
    queryKey: ["rubricas-ativas"],
    enabled: open,
    queryFn: async () => {
      const { data } = await supabase
        .from("rubricas_autorizadas")
        .select("id, descricao, favorecido_nome, valor_esperado, valor_teto, cod_empresa")
        .eq("status", "ATIVA")
        .order("descricao");
      return data ?? [];
    },
  });

  const reset = () => {
    setDescricao(""); setValor(""); setVencimento("");
    setPessoa(""); setDocumento(""); setContaSelecionada("");
    setNatureza(""); setCategoria(""); setFormaPgto("");
    setPayType("NAO_DEFINIDO"); setPixKey(""); setBarcode("");
    setBanco(""); setAgencia(""); setConta(""); setTipoConta("CC");
    setFavNome(""); setFavDoc("");
    setLastroTipo("RUBRICA"); setRubricaId(""); setJustificativa("");
  };

  const soDigitos = (v: string) => v.replace(/\D/g, "");

  const handleCriar = () => {
    // Mesmo formato gravado pelo "Preparar Pagamento" — quem envia ao BTG lê
    // btg_payment_type + btg_details, então divergir aqui quebraria o envio.
    const dadosExtras: Record<string, unknown> = {};
    if (tipo === "PAGAR" && payType !== "NAO_DEFINIDO") {
      dadosExtras.btg_payment_type = payType;
      if (payType === "PIX_KEY" && pixKey) {
        dadosExtras.pix_key = pixKey;
        dadosExtras.btg_details = { pixKey };
      } else if ((payType === "BANKSLIP" || payType === "DARF") && barcode) {
        dadosExtras.linha_digitavel = barcode;
        dadosExtras.btg_details = { barcode };
        if (payType === "BANKSLIP") {
          // Arrecadação (linha iniciada em 8) exige UTILITIES no BTG.
          dadosExtras.btg_payment_type = tipoPorLinhaDigitavel(barcode) ?? "BANKSLIP";
        }
      } else if (payType === "TED" || payType === "PIX_MANUAL") {
        dadosExtras.btg_details = {
          bankCode: banco, branch: agencia, account: conta,
          accountType: tipoConta, name: favNome.trim(), taxId: soDigitos(favDoc),
        };
      }
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
      // G2 — lastro: sem ele, o lançamento PAGAR não entra em borderô
      ...(tipo === "PAGAR"
        ? lastroTipo === "RUBRICA"
          ? { rubrica_id: rubricaId }
          : { lastro: "EXCECAO", justificativa: justificativa.trim() }
        : {}),
    });
    reset();
  };

  const pendencias: string[] = [];
  if (!descricao) pendencias.push("Descrição");
  if (!valor) pendencias.push("Valor");
  if (!vencimento) pendencias.push("Vencimento");
  if (!contaSelecionada) pendencias.push("Conta (Plano de Contas)");
  if (tipo === "PAGAR" && lastroTipo === "RUBRICA" && !rubricaId) pendencias.push("Rubrica autorizada (Lastro do pagamento)");
  if (tipo === "PAGAR" && lastroTipo === "EXCECAO" && justificativa.trim().length < 20)
    pendencias.push("Justificativa da exceção (mín. 20 caracteres)");

  const canSubmit = pendencias.length === 0;

  return (
    <BaseDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Novo Lançamento"
      footer={
        <div className="flex w-full items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground truncate">
            {canSubmit ? "Pronto para criar" : `Faltando: ${pendencias.join(", ")}`}
          </p>
          <div className="flex items-center gap-2 shrink-0">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button onClick={handleCriar} disabled={isPending || !canSubmit}>
              Criar Lançamento
            </Button>
          </div>
        </div>
      }
    >

      <div className="space-y-4 py-2">
        {/* G2 — lastro do pagamento manual (governança: nada sem lastro) */}
        {tipo === "PAGAR" && (
          <div className="rounded-lg border p-3 space-y-3">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">Lastro do pagamento</span>
            </div>
            <Select value={lastroTipo} onValueChange={(v) => setLastroTipo(v as "RUBRICA" | "EXCECAO")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="RUBRICA">Rubrica autorizada (recorrente pré-aprovado)</SelectItem>
                <SelectItem value="EXCECAO">Exceção emergencial (gasto único — não fica salvo para reuso)</SelectItem>
              </SelectContent>
            </Select>
            {lastroTipo === "RUBRICA" ? (
              <div className="space-y-1">
                <Select value={rubricaId} onValueChange={setRubricaId}>
                  <SelectTrigger><SelectValue placeholder="Selecionar rubrica ativa" /></SelectTrigger>
                  <SelectContent>
                    {rubricasAtivas.length === 0 && (
                      <div className="px-3 py-2 text-xs text-muted-foreground">
                        Nenhuma rubrica ativa — cadastre e aprove em Financeiro → Rubricas
                      </div>
                    )}
                    {rubricasAtivas.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.descricao}{r.cod_empresa != null ? ` (emp. ${r.cod_empresa})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Títulos de fornecedor não se criam aqui — entram sozinhos pelo ERP (e pela NF, em breve).
                </p>
              </div>
            ) : (
              <div className="space-y-1">
                <Textarea
                  value={justificativa}
                  onChange={(e) => setJustificativa(e.target.value)}
                  placeholder="Justificativa obrigatória (mínimo 20 caracteres) — ex.: conserto emergencial do ar-condicionado da loja Centro"
                />
                <p className="text-xs text-muted-foreground">
                  Exceção vale só para ESTE lançamento e não fica salva para reuso. O admin aprova
                  individualmente na Mesa; aprovada, ela volta para cá e entra em borderô normalmente.
                  Se o gasto se repete todo mês, o caminho certo é cadastrar uma rubrica.
                </p>
              </div>
            )}
          </div>
        )}

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

            {/* Mesmas formas do "Preparar Pagamento": a tela nova só tinha PIX
                (chave) e código de barras, então TED, DARF e PIX por dados
                bancários só podiam ser informados numa segunda etapa. */}
            <div className="space-y-1">
              <Label className="text-xs">Forma de pagamento no banco</Label>
              <Select value={payType} onValueChange={setPayType}>
                <SelectTrigger><SelectValue placeholder="Definir depois" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="NAO_DEFINIDO">Definir depois</SelectItem>
                  {PAYMENT_TYPES.map(t => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {payTypeHint && <p className="text-xs text-muted-foreground">{payTypeHint}</p>}
            </div>

            {payType === "PIX_KEY" && (
              <div className="space-y-1">
                <Label className="text-xs">Chave PIX</Label>
                <Input value={pixKey} onChange={e => setPixKey(e.target.value)} placeholder="CPF, CNPJ, e-mail, telefone ou aleatória" />
              </div>
            )}

            {(payType === "BANKSLIP" || payType === "DARF") && (
              <div className="space-y-1">
                <Label className="text-xs">
                  {payType === "DARF" ? "Código de barras do tributo" : "Código de barras / linha digitável"}
                </Label>
                {/* Aceita colar com pontos e espaços; guardamos só os dígitos. */}
                <Input
                  value={formatarLinhaDigitavel(barcode)}
                  onChange={e => setBarcode(somenteDigitos(e.target.value))}
                  inputMode="numeric"
                  className="font-mono text-sm"
                  placeholder="Linha digitável"
                />
                {diagBoleto.status === "ok" && (
                  <p className="text-xs text-green-700">✓ {diagBoleto.mensagem}</p>
                )}
                {diagBoleto.status === "incompleto" && (
                  <p className="text-xs text-muted-foreground">{diagBoleto.mensagem}</p>
                )}
                {diagBoleto.status === "invalido" && (
                  <p className="text-xs text-destructive">Linha não confere — {diagBoleto.mensagem}</p>
                )}
              </div>
            )}

            {(payType === "TED" || payType === "PIX_MANUAL") && (
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Banco</Label>
                    <Input value={banco} onChange={e => setBanco(e.target.value)} placeholder="001, 341, 237" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Agência</Label>
                    <Input value={agencia} onChange={e => setAgencia(e.target.value)} placeholder="0001" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Conta</Label>
                    <Input value={conta} onChange={e => setConta(e.target.value)} placeholder="12345-6" />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Tipo de conta</Label>
                    <Select value={tipoConta} onValueChange={setTipoConta}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="CC">Corrente</SelectItem>
                        <SelectItem value="CP">Poupança</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Favorecido</Label>
                    <Input value={favNome} onChange={e => setFavNome(e.target.value)} placeholder="Como consta na conta" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">CPF/CNPJ do favorecido</Label>
                    <Input value={favDoc} onChange={e => setFavDoc(e.target.value)} placeholder="Só números" inputMode="numeric" />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  O banco valida a titularidade da conta contra este documento — sem ele o pagamento é recusado no envio.
                </p>
              </div>
            )}
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
