## Causa do HTTP 422

A REDE devolveu:
```json
{ "status": "UNPROCESSABLE_ENTITY",
  "message": "O campo permissions aceita apenas R(ead), W(rite) ou D(elete)." }
```

Nosso payload atual envia apenas:
```json
{ "requestType": "I", "requestCompanyNumber": 104171855 }
```

Falta o campo obrigatório **`permissions`**, que controla o nível de acesso solicitado ao extrato do PV. Para sincronização de vendas, precisamos de leitura — valor `"R"` (Read).

A documentação oficial também esclarece a semântica de `requestType`:
- **`T` (Total)**: solicita acesso à matriz, herdando todas as filiais.
- **`P` (Parcial)**: matriz + lista explícita de filiais (`companyNumbers`).
- **`I` (Individual)**: um PV específico isolado.

Como o objetivo da Diniz é receber vendas consolidadas via PV matriz `13381369` (já é PV de teste aprovado conforme tabela do sandbox), o tipo correto é **`T` (Total)** sobre a matriz, não `I` por PV filho. Isso elimina a necessidade de fazer uma chamada por loja — uma única solicitação cobre o grupo.

## Mudanças propostas

### `supabase/functions/rede-gestao-acessos/index.ts`

1. **Atualizar interface `AccessRequestPayload`** para incluir `permissions: ("R"|"W"|"D")[]`.
2. **Mudar a lógica do `processSingle`** para enviar:
   ```json
   {
     "requestType": "T",
     "requestCompanyNumber": <pv_matriz numérico>,
     "permissions": ["R"]
   }
   ```
   Usar `pv_matriz_production` (13381369) em vez do `merchant_id` da filial. Como o PV matriz é o mesmo para todas as 10 filiais, basta uma única solicitação para o grupo.
3. **Detectar duplicidade**: se já existe uma solicitação `AGUARDANDO_ACEITE` para o mesmo `pv_matriz`, replicar o status nas demais filiais sem chamar a API novamente (evita 10 POSTs idênticos e possível rate limit).
4. **Persistir** o payload completo (incluindo `permissions`) em `gv_optin_request_payload` para auditoria.

### Sem mudanças no frontend

A tela `/admin/adquirentes` continua chamando `solicitar_compartilhamento` por loja; o backend é que agora consolida internamente para o PV matriz.

## Resultado esperado

Após o redeploy, clicar em "Solicitar compartilhamento" deve retornar HTTP 201 com `requestId` e status `PENDENTE`, gravar `gv_optin_status = AGUARDANDO_ACEITE` e exibir o ID retornado pela REDE. A loja então aprova manualmente no portal Minha Rede e o healthcheck confirma o acesso.
