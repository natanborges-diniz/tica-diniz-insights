## Contexto

Lojas que compartilham o mesmo **PV Matriz Comercial** (ex.: AGU e STO ANTONIO ambos no PV `90059441`) recebem **um único aceite consolidado** da REDE — a resposta do Opt-in já lista todos os `companyNumbers` filhos cobertos. Portanto, **basta um request por PV Matriz**, não um por loja.

Hoje a UI trata cada loja como independente, fazendo parecer que o STO ANTONIO precisa de outro Opt-in quando, na verdade, ele já está coberto pelo request da AGU.

## Solução

Espelhar (compartilhar) o estado de Opt-in entre todas as lojas que possuem o mesmo PV Matriz Comercial em comum.

### 1. Edge Function `rede-gestao-vendas` — action `solicitar_optin`

Após persistir a resposta da REDE na linha de origem (ex.: AGU/cod 9):

- Identificar todas as outras `adquirentes_config` cujo array `pvs_matriz_production` contenha o mesmo `requestCompanyNumber` (`90059441`).
- Copiar para essas linhas: `gv_optin_external_id`, `gv_optin_status`, `gv_optin_requested_at`, `gv_optin_response`, `gv_optin_request_payload`.
- Marcar essas linhas como "espelhadas" (campo novo `gv_optin_mirrored_from cod_empresa`) para deixar claro de onde veio.

### 2. Edge Function — action `consultar_optin_status` / "Validar Ativação"

Quando consultar o status de uma loja:
- Se a linha tem `gv_optin_external_id` próprio → consulta normal.
- Após receber o novo status (PENDENTE/ATIVA/REJEITADA), propagar para todas as outras lojas que compartilham o mesmo PV Matriz, atualizando `gv_optin_status` e `gv_approved_at`.

### 3. UI `AdminAdquirentesPage.tsx`

- Antes de chamar `solicitar_optin`, verificar se já existe outra loja com o mesmo PV Matriz já com Opt-in solicitado. Se sim:
  - Bloquear botão "Solicitar Opt-in" e mostrar badge: **"Coberto pelo Opt-in de DINIZ ANTONIO AGU (request `049d2a00…`)"**.
  - Permitir apenas "Validar Ativação" e "Reaproveitar status".
- Quando o status virar `ATIVA`, mostrar nas duas lojas simultaneamente.

### 4. Migração pontual (one-shot, para o caso atual)

Copiar os campos de Opt-in da linha `cod_empresa=9` (AGU) para `cod_empresa=17` (STO ANTONIO) — assim o STO ANTONIO já fica refletindo o `AGUARDANDO_ACEITE` correto e quando o portal REDE liberar o `90059441`, o "Validar Ativação" do STO ANTONIO retornará `ATIVA` automaticamente.

> Nota: a 3ª filial coberta (`companyNumber 97734748`) também deve ser espelhada se houver `adquirentes_config` para ela.

## Detalhes técnicos

- Tabela: `adquirentes_config`
- Coluna chave de agrupamento: `pvs_matriz_production` (text[])
- Campos a sincronizar: `gv_optin_external_id`, `gv_optin_status`, `gv_optin_requested_at`, `gv_optin_response`, `gv_optin_request_payload`, `gv_approved_at`
- Adicionar coluna nova: `gv_optin_mirrored_from int` (referência ao `cod_empresa` de origem, para auditoria e UI)

## O que NÃO muda

- Credenciais (`integration_key_production`) e `merchant_id_production` continuam **por loja** — o Opt-in libera o acesso, mas cada CNPJ filho ainda tem suas próprias chaves para consulta de vendas.

## Memória

Atualizar `mem://integrations/rede/gestao-vendas-activation-flow` com a regra: **"1 PV Matriz = 1 Opt-in que cobre todas as lojas filhas; status deve ser espelhado entre lojas com o mesmo PV"**.
