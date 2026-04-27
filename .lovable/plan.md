
## Objetivo

Transformar a Edge Function `rede-gestao-acessos` (hoje só registra status interno) em uma integração real com a **API Gestão de Acessos da REDE**, para que solicitar Opt-in pelo nosso admin efetivamente registre o pedido no portal da REDE — eliminando o gap atual em que o PV 104171570 não apareceu no portal.

## Contexto

- A REDE confirmou por e-mail que liberou para nós **duas APIs** no CNPJ matriz `12.107.885/0001-01`:
  - **Gestão de Acessos** (registrar solicitação de compartilhamento de PVs)
  - **Gestão de Vendas** (consumir as vendas após aceite)
- Chargeback **não** está no escopo — manter excluído da UI.
- O fluxo correto é:
  1. Nosso sistema (parceiro técnico) chama Gestão de Acessos → REDE registra a solicitação.
  2. Loja dona do PV abre portal REDE → Minha Rede → seleciona PV → Conciliação → Compartilhar → aceita.
  3. Após aceite, Gestão de Vendas devolve as vendas daquele PV no consolidado por `parentCompanyNumber`.
- Hoje temos 9 PVs de produção mapeados em `adquirentes_config` sob o `pv_matriz_production = 13381369`.

## Pré-requisitos (preciso do conteúdo do e-mail)

Para implementar a chamada real ao endpoint, vou precisar extrair do e-mail completo da REDE:

1. **URL base da API Gestão de Acessos** (sandbox e produção).
2. **Client ID / Client Secret** específicos de Gestão de Acessos (provavelmente diferentes dos de Gestão de Vendas — preciso confirmar se foram enviados separadamente).
3. **Escopos OAuth** exigidos (ex.: `gestao-acessos.solicitacoes.write`).
4. **Especificação do endpoint de solicitação** — geralmente algo como `POST /v1/access-management/share-requests` com payload contendo `parentCompanyNumber` + lista de `companyNumber` (PVs filiais).
5. **Endpoint de consulta de status** da solicitação (se a REDE expõe).
6. **Links da documentação técnica** mencionados no e-mail.

> **Ação na hora de executar o plano**: peço para você colar o e-mail completo (ou anexar a documentação) para eu extrair esses pontos antes de tocar no código. Sem isso eu chuto URL e payload e a integração quebra.

## Mudanças

### 1. Banco — granularidade por PV
Atualmente `adquirentes_config` guarda 1 linha por loja. O Opt-in da REDE é **por PV**, não por loja, mas como temos 1 PV por loja na produção, a granularidade atual serve. Vou apenas:

- Adicionar coluna `gv_optin_request_payload` (jsonb) para guardar o payload enviado.
- Adicionar coluna `gv_optin_response` (jsonb) para guardar o retorno da REDE (protocolo, status retornado).
- Adicionar coluna `gv_optin_external_id` (text) para o ID da solicitação na REDE (caso a API devolva).

### 2. Edge Function — `rede-gestao-acessos` (reescrita)
- Adicionar action `solicitar_compartilhamento_lote` que recebe lista de `cod_empresa` ou roda para todos os PVs de produção da REDE.
- Implementar OAuth 2.0 com as credenciais de Gestão de Acessos (novas secrets: `REDE_GA_CLIENT_ID`, `REDE_GA_CLIENT_SECRET` — vou pedir via `add_secret` quando você confirmar).
- Para cada PV:
  - Montar payload `{ parentCompanyNumber: "13381369", subsidiaries: [{ companyNumber: "<PV>" }] }` (formato exato a confirmar pela doc).
  - Chamar `POST` no endpoint de solicitação.
  - Persistir status (`AGUARDANDO_ACEITE`), payload, response e external_id.
  - Tratar erros: 401 (credencial inválida), 409 (solicitação já existe), 422 (PV inválido).
- Manter actions existentes (`solicitar_optin` legado, `registrar_aceite`, `status`, `reset`).
- Adicionar action `consultar_status_externo` se a REDE expor endpoint de leitura.

### 3. Edge Function — `rede-gestao-vendas`
- Sem mudança estrutural; apenas confirmar que o `classifyApiError` já mapeia `403` para `GV_OPTIN_PENDING` (já implementado na entrega anterior).

### 4. UI — `AdminAdquirentesPage`
No bloco "Ativação Gestão de Vendas":
- Trocar o botão único "Solicitar Opt-in" por um fluxo em 2 níveis:
  - **Ação em massa**: "Solicitar compartilhamento para todos os PVs de produção" (chama o endpoint para os 9 PVs de uma vez).
  - **Ação individual**: por linha de loja, botão "Solicitar" que dispara só aquele PV.
- Mostrar por loja o status real:
  - protocolo da REDE (`gv_optin_external_id`)
  - data da solicitação
  - resposta crua da REDE (em popover técnico para troubleshooting)
- Mensagem operacional explícita: "Após solicitar, a loja dona do PV precisa entrar no portal REDE com perfil master e aprovar em Conciliação → Compartilhar".

### 5. Reset / Reenvio
- Permitir "Reenviar solicitação" para PVs que retornaram erro ou cuja solicitação anterior foi recusada no portal.

## Arquivos afetados

- `supabase/functions/rede-gestao-acessos/index.ts` (reescrita principal)
- `src/pages/AdminAdquirentesPage.tsx` (novo bloco de ações em massa + status por PV)
- migração: 3 colunas novas em `adquirentes_config`
- 2 novas secrets: `REDE_GA_CLIENT_ID`, `REDE_GA_CLIENT_SECRET` (se forem distintas das de GV)

## Fora de escopo

- Chargeback (REDE não liberou; UI mantém como "não habilitado").
- Mudanças em `sync-vendas-cartao` (já está pronto para o modelo consolidado).
- Mudanças em `rede-gestao-vendas` (já tem classificação de erros adequada).

## Detalhes técnicos

- A integração depende de **credenciais OAuth separadas para Gestão de Acessos**. Se o e-mail confirmar que são as mesmas de Gestão de Vendas (mesmo `client_id`/`client_secret` com escopo expandido), pulamos a criação de novas secrets.
- A REDE costuma exigir header `x-api-version` e Content-Type `application/json` nas chamadas REST.
- Vou tratar idempotência: se já existe solicitação com status `AGUARDANDO_ACEITE` para um PV, o botão individual exibirá "Reenviar" em vez de "Solicitar".

## Próximo passo após aprovação

Quando você aprovar, minha primeira ação será pedir o conteúdo completo do e-mail da REDE (URLs, credenciais de Gestão de Acessos, exemplo de payload). Sem essas informações concretas, a integração vira chute. Depois disso eu sigo direto para a migração + reescrita da Edge Function + UI, tudo em uma só rodada.
