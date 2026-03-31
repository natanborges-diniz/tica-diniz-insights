

## Problema: Link gerado para loja com PV "PENDENTE"

O fluxo de **criação** do link (action `criar` em `payment-links/index.ts`) não valida as credenciais Rede — ele apenas salva o registro no banco. A validação do PV só acontece no `rede-proxy` no momento do **pagamento** (`processar_pagamento`), onde `getRedeCredentials` verifica se o PV existe mas **não verifica se é `'PENDENTE'`**.

Resultado: o link é gerado com sucesso, mas quando o cliente tentar pagar, a Rede rejeitará a transação com erro de autenticação (PV inválido).

### Correções necessárias

**1. `supabase/functions/payment-links/index.ts`** — Validar PV na criação do link

No action `criar`, antes de inserir o registro, consultar `adquirentes_config` para verificar se o `merchant_id_production` da loja é `'PENDENTE'`. Se for, bloquear com erro claro: *"A loja X ainda não possui PV de filiação configurado. Atualize em Adquirentes."*

**2. `supabase/functions/rede-proxy/index.ts`** — Rejeitar PV placeholder no processamento

Na função `getRedeCredentials`, adicionar check: se o PV resolvido for `'PENDENTE'`, lançar erro específico ao invés de tentar autenticar na Rede com valor inválido.

**3. `src/pages/PaymentLinksPage.tsx`** — Filtrar lojas com PV pendente no seletor

No Select de empresa do dialog de criação, desabilitar ou ocultar lojas cujo PV ainda esteja como `'PENDENTE'`, com tooltip explicativo.

### Detalhes técnicos

| Arquivo | Alteração |
|---|---|
| `supabase/functions/payment-links/index.ts` | Query `adquirentes_config` no action `criar` para validar PV |
| `supabase/functions/rede-proxy/index.ts` | Check `pv === 'PENDENTE'` em `getRedeCredentials` |
| `src/pages/PaymentLinksPage.tsx` | Filtrar/desabilitar lojas sem PV no seletor de criação |

