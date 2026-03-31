

## Plano: Destacar NSU no Comprovante (Picote)

### Alterações neste projeto (Infoco Optical Business)

**1. `src/components/checkout/CheckoutReceipt.tsx`** — NSU em destaque no picote do checkout

- Separar a linha do NSU das demais, renderizando-a com fundo colorido (bg-emerald-100), texto maior (text-base font-bold) e bordas arredondadas
- Adicionar label "NSU (para baixa no sistema)" para orientar o cliente/loja

**2. `src/components/checkout/ReceiptSheet.tsx`** — NSU em destaque no comprovante admin

- Mesmo tratamento visual: linha do NSU com fundo destacado (bg-primary/10), texto maior e bold
- Manter as demais linhas no estilo mono padrão

### Orientações para o Connect & Flow

No projeto **Connect & Flow** (2a6a2d63-e981-4d12-ac70-37d22a777184), ao receber o webhook `payment-webhook`, a mensagem WhatsApp de confirmação deve destacar o NSU. Exemplo de template sugerido:

```text
✅ *Pagamento Confirmado!*

💰 Valor: R$ {valor}
📋 {descricao}

━━━━━━━━━━━━━━━━━━
🔑 *NSU: {nsu}*
   ↳ Use este número para baixa no sistema
━━━━━━━━━━━━━━━━━━

🆔 TID: {tid}
🔐 Autorização: {authorization}
📅 Data: {date} às {time}
💳 Cartão: **** {last4}
📦 Parcelas: {installments}x
```

O NSU deve ficar entre separadores e em **negrito** (*NSU: xxx*) para fácil identificação visual no WhatsApp.

### Detalhes técnicos

| Arquivo | Alteração |
|---|---|
| `src/components/checkout/CheckoutReceipt.tsx` | NSU com bg-emerald-100, text-base font-bold, label explicativo |
| `src/components/checkout/ReceiptSheet.tsx` | NSU com bg-primary/10, text-base font-bold |

Nenhuma alteração no backend — apenas visual nos 2 componentes de comprovante.

