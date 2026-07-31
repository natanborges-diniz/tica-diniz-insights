# Prompt para o Lovable — BTG multi-loja

> Cole o bloco abaixo no chat do Lovable.

---

O commit `491d009` já está na branch `main` do GitHub. Sincronize o projeto com o
GitHub antes de qualquer coisa e **não reescreva** a lógica descrita abaixo — ela
já está implementada e testada (typecheck e lint limpos).

## O que já foi alterado (não refazer)

**`supabase/functions/btg-auth/index.ts`**

1. Validação de identidade no `handleCallback`, antes de gravar o token:
   - Camada 1: decodifica `access_token` e `id_token` e procura o CNPJ nas claims.
     Um número de 14 dígitos só é aceito como CNPJ se a chave sugerir documento
     (`cnpj`, `documentNumber`, `taxId`, etc.) **ou** se passar na validação dos
     dígitos verificadores (mod 11). Isso evita falso "mismatch" com IDs numéricos.
   - Camada 2 (só se a camada 1 não decidir e não for sandbox): chama
     `GET {apiBase}/{cnpj}/banking/accounts` com o token novo. HTTP 401/403 = o
     login não tem acesso àquela empresa.
   - Resultado `mismatch` → responde HTTP 403 com página de erro e **não grava
     token**. Resultado `inconclusive` → grava o token e sinaliza o aviso.
2. Após gravar o token, persiste `company_id` e `cnpj` em `btg_contas_bancarias`.
   O `company_id` é o identificador usado no path das rotas Banking do BTG, que é
   o CNPJ sem pontuação — usa um `companyId` explícito se o token/API expuser um.
3. `handleAuthorize` agora bloqueia empresa sem linha em `btg_contas_bancarias`
   (antes, gerava token órfão que não aparecia na tela de status).
4. O redirect de sucesso leva `&verificacao=match|inconclusive`.

**`supabase/functions/btg-extrato/index.ts`**

- A action `contas` passou a persistir `cnpj` e `company_id` junto com
  `account_id`, `agencia` e `conta`.

**`src/pages/AdminBtgValidacaoPage.tsx`**

- Botão **Adicionar conta** no header do card "Contas Bancárias & Autorização",
  com formulário: select das empresas ativas que ainda **não** têm conta BTG,
  CNPJ pré-preenchido a partir do cadastro da empresa e validação de 14 dígitos.
  Insere em `btg_contas_bancarias` com `ativa = true`.
- Toast de aviso quando o callback retorna `verificacao=inconclusive`.
- O texto de estado vazio deixou de mandar o usuário fazer INSERT manual.

## O que eu preciso que você faça

1. Sincronizar com o GitHub e confirmar que os três arquivos acima estão na
   versão do commit `491d009`.
2. **Fazer o deploy das edge functions `btg-auth` e `btg-extrato`.** Esse é o
   ponto principal: o front sobe sozinho, as functions não.
3. Confirmar que a tela `/admin/btg-validacao` mostra o botão "Adicionar conta".

## Contexto do objetivo (para você não quebrar nada)

O app BTG é do tipo *Third Party / Confidential*, já aprovado. Um único
`client_id`/`client_secret` atende todas as lojas — não existe app novo por loja.
Cada loja apenas autoriza o app via OAuth, e o token fica gravado por
`cod_empresa` em `btg_tokens`. O cron `btg-token-refresh` já renova todos os
tokens automaticamente, sem configuração por loja.

Fluxo de onboarding de cada loja nova na tela admin:
**Adicionar conta** → preencher agência e conta → **Autorizar** (login BTG do
CNPJ daquela loja).

## Não fazer

- Não remover a validação de identidade nem transformar `mismatch` em aviso.
- Não trocar o formato do `account_id`, que é `{cnpj}-208-{agencia}-{conta}`.
- Não mexer nas policies RLS de `btg_contas_bancarias` e `btg_tokens`.
