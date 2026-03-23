

## Problema

O botao "Autorizar" so aparece quando `!isAuth` (linha 427). Como o token atual esta ativo (`autenticado: true`, `token_expirado: false`), o botao fica oculto. O usuario precisa re-autorizar para obter os novos escopos de recebiveis, mas nao consegue.

## Plano

### 1. Adicionar botao "Re-autorizar" quando ja autenticado

No bloco de acoes da tabela (linhas 420-475), adicionar um botao "Re-autorizar" visivel mesmo quando `isAuth` e true. Ficara ao lado do badge "Setup completo" ou dos inputs de agencia/conta.

**Arquivo**: `src/pages/AdminBtgValidacaoPage.tsx`

- Ao lado do badge "Setup completo" (linha 421-426) e do botao "Renovar", adicionar um botao "Re-autorizar" que chama `handleAuthorize(conta.cod_empresa)`
- Usar variante `outline` e icone `KeyRound` para diferenciar do "Renovar"
- Manter o botao "Autorizar" original para contas nao autenticadas

### 2. Verificacao de escopos faltantes

Na tabela, comparar os escopos do token atual (`status.scopes`) com os escopos requeridos. Se faltarem escopos, exibir um badge de alerta "Escopos incompletos" para indicar visualmente que a re-autorizacao e necessaria.

Escopos requeridos:
- `brn:btg:empresas:receivables:credit-card.readonly`
- `brn:btg:empresas:receivables:credit-card`

Se estes nao estiverem no array `status.scopes`, mostrar alerta e destacar o botao "Re-autorizar".

