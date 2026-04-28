## Permitir pedidos monoculares (apenas um olho) em todos os fornecedores de lentes

### Diagnóstico

Hoje o sistema trata pedidos de lentes como sempre **binoculares** (OD + OE). Quando o cliente precisa apenas de uma lente, o sistema falha:

- **Hoya**: bloqueia no validador exigindo "Esférico ou Cilíndrico obrigatório" para o olho vazio; e mesmo passando, o builder envia `esferico=0, cilindrico=0` para o olho não pedido — fazendo a Hoya **cobrar e produzir uma lente plana indesejada**.
- **Zeiss**: exige sempre `produtoOd` mesmo quando o pedido é só OE.
- **Haytek**: sempre injeta `right` e `left` no payload, sem opção de omitir um lado.
- **OptView**: ainda não tem UI de pedido construída (só service e edge function); mas o tipo `OptviewPedidoPayload.receita` já marca `codigoProdutoOd` e `codigoProdutoOe` como obrigatórios — herdaria o mesmo bug. Vamos corrigir o tipo agora para deixar a base preparada.

### Solução

Introduzir um **seletor de Olhos do Pedido** padronizado em cada formulário:

```
[ ✓ Olho Direito (OD) ]   [ ✓ Olho Esquerdo (OE) ]
```

- Default: ambos marcados (preserva o comportamento atual).
- Pelo menos 1 olho deve estar marcado (validação local).
- Olho desmarcado: a seção de prescrição desse olho fica colapsada/desabilitada visualmente, validações são puladas, e o lado correspondente é **omitido do payload** enviado ao laboratório.

### Mudanças por fornecedor

#### 1. Hoya — `PedidoFornecedorPage.tsx` + `hoyaValidationService.ts` + `hoyaService.ts`

- Adicionar estado `olhosPedido: { od: boolean; oe: boolean }` (default `{od:true, oe:true}`).
- UI: chips/toggles acima das seções de prescrição. Seção OD/OE colapsa quando desmarcada.
- Tornar `prescricao.direito` e `prescricao.esquerdo` opcionais em `HoyaPedidoPayload` (`HoyaPrescricaoOlho | null`).
- Builder do payload: omitir o lado desmarcado (não incluir a chave, em vez de enviar zeros).
- `hoyaValidationService.validateHoyaPayload`: pular `validatePrescricaoOlho` para o olho omitido. Validar que ao menos um olho está presente.
- Mensagem informativa: "Pedido monocular — somente OD/OE".

#### 2. Zeiss — `PedidoZeissPage.tsx` + `zeissValidation.ts`

- Mesmo seletor de olhos.
- Em `validateZeissPayload`: trocar `if (!produtoOdCod)` por `if (olhosPedido.od && !produtoOdCod)` e adicionar simétrico para OE quando `olhosPedido.oe && !produtoOeCod`.
- Builder: já tem `if (produtoOd || prescOd.esferico)` e `if (oeProduct || prescOe.esferico)` — apenas garantir que o lado desmarcado nunca seja injetado mesmo se houver dado residual.
- Toggle "Mesmo produto para OD e OE" só aparece quando ambos olhos marcados.

#### 3. Haytek — `PedidoHaytekPage.tsx`

- Mesmo seletor de olhos.
- `buildPayload`: em `products`, incluir `right` somente se `olhosPedido.od`, e `left` somente se `olhosPedido.oe`.
- `validateDioptriaForProduct`: filtrar o array `eyes` pelos olhos selecionados.
- Logs de debug devem refletir omissões.

#### 4. OptView — `optviewService.ts` (preparação para UI futura)

- Tornar `codigoProdutoOd` e `codigoProdutoOe` opcionais (`string?`) em `OptviewPedidoPayload.receita`, alinhando com o resto dos campos OD/OE que já são opcionais.
- Quando a UI de pedido OptView for construída no futuro, ela já deve nascer com o `<EyeSelector>` e omitir o lado não pedido.
- Não há UI de pedido OptView hoje, então nenhuma mudança visual nesta etapa.

### Componente reutilizável

- Criar `<EyeSelector value={olhosPedido} onChange={...} />` em `src/components/lente/EyeSelector.tsx`:
  - 2 chips toggláveis no padrão tech do design system.
  - Garante que ao menos 1 fica ativo (impede desmarcar o último).
  - Reutilizado por Hoya, Zeiss e Haytek (e OptView quando ganhar UI).

### Auditoria pós-pedido

- Tabela `pedidos_fornecedor` já registra o payload — nenhum ajuste necessário, a omissão do lado fica visível no payload salvo.

### Memória — atualizar

- `mem://integrations/hoya/master-specification`
- `mem://integrations/zeiss/master-specification`
- `mem://integrations/haytek/master-specification`
- `mem://integrations/supplier-order-validation-standard`

Adicionando regra: **"Pedidos podem ser monoculares — UI deve permitir desmarcar OD ou OE; o lado omitido NÃO deve ir no payload (enviar `0` faria o lab cobrar lente plana indesejada). Pelo menos 1 olho obrigatório. Padrão default = binocular."**

### Detalhes técnicos

- Sem migração de banco; mudança puramente client + tipos TypeScript + lógica de validação.
- Backend dos proxies (`hoya-proxy`, `zeiss-proxy`, `haytek-proxy`, `optview-proxy`): apenas repassam o payload, não há lógica que assume binocular. Nenhum ajuste necessário.
- Resolver de prescrição (`prescricaoResolver.ts`): continua extraindo os dois olhos da OS quando disponível; o usuário decide quais enviar.

### O que NÃO muda

- Resgate de prescrição da OS no Firebird permanece igual.
- Layout/visual geral dos formulários permanece; apenas adiciona o seletor no topo da seção de prescrição.
- Comportamento default = binocular (ninguém precisa reaprender).
