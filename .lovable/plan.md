## Objetivo

Remover o botão "Testar autenticação na Haytek" e a action `ping-auth`, já que o `GET /orders/{id}` do Swagger exige um `orderId` real e não serve como teste limpo de autenticação. A validação do token vai acontecer naturalmente no envio de um pedido real via fluxo de OS.

## Mudanças

### 1. `src/pages/AdminFornecedoresPage.tsx`
- Remover o sub-componente `HaytekTestAuthButton` inteiro.
- Remover a renderização do botão na seção da Haytek.
- Manter o indicador de prefixo do token (`eyJhbGciOi…` + length) — continua útil para confirmar visualmente qual chave está salva.
- Limpar imports não usados (`CheckCircle2` se não for usado em outro lugar).

### 2. `supabase/functions/haytek-proxy/index.ts`
- Remover o bloco `if (action === 'ping-auth') { ... }` por completo.
- Manter o logging melhorado (`tokenPrefix`, `tokenLen`) — é útil para debug do `criar-pedido`.
- Manter a mensagem amigável de erro 401 no `criar-pedido` (`"Token Haytek de produção não reconhecido pela API. Atualize a chave em Admin > Fornecedores > Haytek."`).
- Redeploy do edge function.

### 3. `mem://integrations/haytek/master-specification`
- Remover a menção ao `ping-auth`.
- Adicionar nota: "Validação do token de produção é feita via envio real de pedido pelo fluxo de OS. Não há endpoint de health-check dedicado na API Haytek."

## Resultado

- Tela de Admin > Fornecedores > Haytek mostra só: campo de API Key, indicador de prefixo, e o select de ambiente.
- Para validar um token novo, o usuário envia um pedido real pelo Hub de OS e observa a resposta (logging detalhado do proxy mostra prefixo do token usado + erro 401 amigável se inválido).
