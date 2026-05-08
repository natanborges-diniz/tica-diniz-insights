## Diagnóstico revisado

A URL de produção está correta:

```text
POST https://dev.haytek.com.br/orders/lab
Authorization: Bearer <api_key_production>
```

O Swagger declara apenas `BearerAuth` (header `Authorization`). Não existe endpoint público de login. Logo a Haytek aceita exclusivamente o token configurado em `fornecedor_configuracao.api_key_production`. O retorno `AuthenticationRequired` significa que o token enviado não é reconhecido pela Haytek em produção.

Como você confirmou que o token é o mesmo para todas as lojas, **não vamos** criar token por loja. O ajuste é só garantir que o token correto esteja salvo e que o proxy envie de forma rastreável.

## Plano

1. Tela `Admin > Fornecedores > Haytek`
   - Manter um único campo `API Key — Produção` (já existe).
   - Adicionar um pequeno indicador `Prefixo do token salvo: eyJhbGciOi… (127 chars)` para confirmar visualmente o que está no banco sem expor o token.
   - Adicionar botão `Testar autenticação` que chama o `haytek-proxy` com a ação `ping-auth` e mostra o status retornado pela Haytek (200/401/403).

2. `haytek-proxy`
   - Nenhuma mudança de roteamento (continua usando `fornecedor_configuracao.api_key_production` quando ambiente = production).
   - Logar com mais clareza a origem do token e seu prefixo:

   ```text
   Action: criar-pedido | Env: production | TokenSource: fornecedor_configuracao.api_key_production | TokenPrefix: eyJhbGciOi… | Len: 127
   ```

   - Adicionar nova ação `ping-auth` que faz `GET /orders/<id-fake>` só para forçar a Haytek a validar o token e devolver 401/403/200/404. Útil para validar credenciais sem criar pedido.
   - Em caso de 401, devolver mensagem amigável: `Token Haytek de produção não reconhecido pela API. Atualize a chave em Admin > Fornecedores > Haytek.`

3. Validação manual
   - Você cola o token de produção fornecido pela HiTech em `Admin > Fornecedores > Haytek > API Key — Produção` e salva.
   - Clica em `Testar autenticação`.
   - Se voltar 200/404 → token aceito. Se voltar 401 → token incorreto ou ainda não provisionado pela HiTech para o ambiente `dev.haytek.com.br`.

## Observações

- Não vou alterar o schema do banco — `haytek_empresa_config.api_key_production` permanece existindo mas continua sem uso, conforme regra atual de token único.
- Vou ajustar a memória `Haytek Master Spec` para refletir que produção usa token único em `fornecedor_configuracao`, removendo a parte de "token por loja".