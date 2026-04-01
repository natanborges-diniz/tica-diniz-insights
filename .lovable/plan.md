

## Plano: Via do Estabelecimento + Via do Cliente — Padrão de Mercado

### Contexto

O `ReceiptSheet.tsx` (painel admin) é a **via do estabelecimento**. O `CheckoutReceipt.tsx` (checkout público) é a **via do cliente**. Ambos precisam seguir o padrão brasileiro de comprovantes de cartão, com campos e labels adequados a cada via.

### Padrão de mercado — Diferenças entre vias

```text
VIA DO ESTABELECIMENTO             VIA DO CLIENTE
─────────────────────────          ─────────────────────────
Nome do Estabelecimento            Nome do Estabelecimento
CNPJ: XX.XXX.XXX/XXXX-XX          (sem CNPJ)
PV: 123456                         (sem PV)
─────────────────────────          ─────────────────────────
CRÉDITO À VISTA / PARCELADO        CRÉDITO À VISTA / PARCELADO
Valor: R$ XXX,XX                   Valor: R$ XXX,XX
Parcelas: Xx de R$ XX,XX           Parcelas: Xx de R$ XX,XX
─────────────────────────          ─────────────────────────
Cartão: •••• •••• •••• 1234        Cartão: •••• •••• •••• 1234
Bandeira: Visa/Master              Bandeira: Visa/Master
─────────────────────────          ─────────────────────────
NSU: 123456789    ← DESTAQUE       NSU: 123456789    ← DESTAQUE
TID: XXXXXXX                       Autorização: ABC123
Autorização: ABC123                Data: DD/MM/AAAA HH:MM
Código Retorno: 00                 ─────────────────────────
Referência: PL-X-XXXX              VIA DO CLIENTE
Data: DD/MM/AAAA HH:MM
─────────────────────────
VIA DO ESTABELECIMENTO
```

A via do estabelecimento tem mais campos técnicos (PV, código retorno, referência, TID) relevantes para conciliação.

### Alterações

**1. `supabase/functions/payment-links/index.ts`** — Enriquecer resultado do `processar_pagamento`

- Adicionar ao result: `brand`, `kind`, `reference`, `dateTime` (campos que a Rede retorna)
- Buscar nome da empresa (`empresa.nome_fantasia`) para exibir no comprovante
- Retornar `empresa_nome` no resultado

**2. `src/components/checkout/CheckoutReceipt.tsx`** — Adequar como Via do Cliente

- Expandir `ReceiptData` com campos opcionais: `brand`, `kind`, `reference`, `dateTime`, `empresaNome`
- Adicionar cabeçalho com nome do estabelecimento
- Adicionar label de modalidade: "CRÉDITO À VISTA" ou "CRÉDITO PARCELADO"
- Tratar fallback `dateTime` ISO quando `date`/`time` separados não vierem
- Rodapé: "VIA DO CLIENTE" em destaque

**3. `src/components/checkout/ReceiptSheet.tsx`** — Adequar como Via do Estabelecimento

- Adicionar cabeçalho com nome da empresa (recebido via props ou dados extras)
- Adicionar label "VIA DO ESTABELECIMENTO" no rodapé
- Adicionar modalidade (CRÉDITO À VISTA / PARCELADO)
- Manter campos técnicos (Código Retorno, Referência) que já estão lá
- Tratar fallback `dateTime` ISO

**4. `src/pages/CheckoutPage.tsx`** — Expandir interface e mapear novos campos

- Expandir `ReceiptData` interface com: `brand?`, `kind?`, `reference?`, `dateTime?`, `empresaNome?`
- Mapear os novos campos vindos do resultado do pagamento

### Detalhes técnicos

| Arquivo | Alteração |
|---|---|
| `supabase/functions/payment-links/index.ts` | Adicionar `brand`, `kind`, `reference`, `dateTime`, `empresa_nome` ao result de `processar_pagamento` |
| `src/pages/CheckoutPage.tsx` | Expandir `ReceiptData` com campos opcionais |
| `src/components/checkout/CheckoutReceipt.tsx` | Cabeçalho estabelecimento, modalidade, bandeira, rodapé "VIA DO CLIENTE" |
| `src/components/checkout/ReceiptSheet.tsx` | Cabeçalho estabelecimento, modalidade, rodapé "VIA DO ESTABELECIMENTO", manter campos técnicos |

