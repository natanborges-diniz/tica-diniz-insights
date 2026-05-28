# Pedido Haytek / Zeiss — padronização, tracking e nome da loja

Quatro ajustes solicitados:

## 1. Tela de sucesso (Haytek e Zeiss) igual à Hoya

Hoje, ao confirmar um pedido na Haytek e na Zeiss, o operador continua na mesma tela e só vê uma barra verde de confirmação. Na Hoya existe uma tela cheia de sucesso (`PackageCheck` + "Pedido Enviado!" + nº do pedido + voucher + botão "Voltar à Receita").

**O que será feito:**

- `src/pages/PedidoHaytekPage.tsx`: após `setResultado(resp)` com `orderId`, mostrar uma tela dedicada de sucesso, no mesmo padrão visual da Hoya: ícone redondo, título "Pedido Enviado!", "Nº Pedido Haytek: <orderId>", status e botão "Voltar à Receita". A barra verde inline atual é removida.
- `src/pages/PedidoZeissPage.tsx`: mesmo padrão após confirmação Zeiss bem-sucedida (usando `numeroPedido` + `voucherGerado` quando houver, já que Zeiss também emite voucher).

## 2. Bloqueio de novo pedido quando já existe um confirmado

Na Hoya, ao reabrir a tela de uma OS que já tem pedido confirmado, é exibida a tela "Pedido já enviado" e o formulário fica indisponível. Hoje:

- **Haytek**: não checa `pedidos_fornecedor` ao montar a tela → operador consegue enviar outro pedido para a mesma OS.
- **Zeiss**: checa, mas apenas mostra um banner de aviso; o formulário continua visível.

**O que será feito (mesmo padrão da Hoya, com tratamento de status negativos):**

- `PedidoHaytekPage.tsx`:
  - Adicionar `useEffect` que consulta `pedidos_fornecedor` por `cod_os` + `fornecedor='HAYTEK'`, ordenado por `created_at desc`.
  - Estado `pedidoExistente` + helper `isNegativeStatus` (cancel / rejeit / falha / recusa).
  - Se existir pedido confirmado e não-negativo → renderizar tela "Pedido já enviado" idêntica à da Hoya, trocando o rótulo do fornecedor.
  - Se negativo → banner amarelo "Pedido anterior #X foi cancelado/rejeitado — você pode enviar um novo pedido" e libera o formulário.
- `PedidoZeissPage.tsx`:
  - Promover o `pedidoExistente` atual a tela de bloqueio full-page (mesmo padrão), mantendo "CANCELAMENTO_SOLICITADO" / negativos como banner que libera o reenvio.

## 3. Tracking Haytek — substituir JSON por dados estruturados

`HaytekTrackingDetail` já parseia status, produto, prescrição, armação, deliveries e payment, mas o usuário relata que **frete (transportadora, código, previsão) e valor (total, NF)** estão chegando como JSON bruto. Provável causa: a resposta da Haytek usa chaves que ainda não estão mapeadas.

**O que será feito:**

- Ampliar `src/components/haytek/HaytekTrackingDetail.tsx` cobrindo nomes comuns em snake_case e camelCase:
  - **Frete / Envio**: `shipping`, `freight`, `shippingMethod`, `shippingValue`/`freightValue`, `carrier`, `trackingCode`/`trackingNumber`/`trackingUrl`, `estimatedDate`/`estimatedDelivery`.
  - **Faturamento**: `invoice`/`invoiceNumber`/`invoiceUrl`/`invoiceDate`, `total`/`subtotal`/`discount`.
- Renderizar dois novos cards: **"Frete / Envio"** (transportadora, rastreio com link clicável, previsão, valor do frete) e **"Faturamento"** (NF, valor total, descontos).
- Manter "Ver JSON bruto" como debug colapsável.

> Como não tenho um exemplo real do JSON com frete/valor, vou cobrir os nomes mais comuns + fallback. **Se possível, anexe o JSON real no próximo passo** para mapear exatamente o que a Haytek devolve.

## 4. Nome (alias) da loja no header do Pedido Haytek

Hoje o header usa `haytek_empresa_config.alias` (`"— Empresa 18"` aparece quando o alias está vazio). O usuário quer ver o alias padrão da loja (ex.: "Diniz Primitiva II"), como acontece no `HaytekTrackingPage`.

**O que será feito em `PedidoHaytekPage.tsx`:**

- Usar `useUserEmpresas()` (mesmo hook já usado no tracking) para resolver o nome oficial da loja a partir de `codEmpresa`.
- Ordem de fallback no header: `nome de useUserEmpresas` → `haytek_empresa_config.alias` → `"Empresa {codEmpresa}"`.

## Arquivos afetados

- `src/pages/PedidoHaytekPage.tsx`
- `src/pages/PedidoZeissPage.tsx`
- `src/components/haytek/HaytekTrackingDetail.tsx`

Sem mudanças de backend, edge function ou schema.
