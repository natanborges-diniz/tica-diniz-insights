# Plano de Implementação — BTG Pactual Banking

## Visão Geral

Integrar o módulo financeiro do Infoco com as APIs Banking do BTG Pactual Empresas para:
1. **Contas a Pagar** — programar pagamentos com aprovação do master
2. **Conciliação Bancária (DDA)** — confrontar títulos do ERP com DDA do BTG
3. **Cobranças / Boletos** — emitir boletos, baixa automática e alertas de inadimplência
4. **Batimento de Caixa** — lançamentos por natureza e relatórios financeiros
5. **Extrato e Saldo** — consulta de saldo e extrato bancário em tempo real

---

## 1. Arquitetura da Integração

```
┌─────────────────────┐
│   Frontend (React)  │
│  Módulo Financeiro  │
└────────┬────────────┘
         │ supabase.functions.invoke()
         ▼
┌─────────────────────┐
│  Edge Functions     │
│  (btg-banking-*)    │
│  - Auth (OAuth2)    │
│  - Pagamentos       │
│  - Cobranças        │
│  - Extrato/Saldo    │
│  - DDA              │
│  - Webhooks handler │
└────────┬────────────┘
         │ HTTPS (Bearer token)
         ▼
┌─────────────────────┐
│  BTG Pactual APIs   │
│  api.empresas.      │
│  btgpactual.com     │
└─────────────────────┘
```

### Ambientes BTG

| Ambiente  | API Base URL                                    | BTG Id (Auth)                        |
|-----------|-------------------------------------------------|--------------------------------------|
| Sandbox   | https://api.sandbox.empresas.btgpactual.com     | https://id.sandbox.btgpactual.com    |
| Produção  | https://api.empresas.btgpactual.com             | https://id.btgpactual.com            |

> **Sandbox**: Respostas mockadas/estáticas. Usado para validar contratos e fluxo de autenticação.

---

## 2. Autenticação — BTG Id (OAuth 2.0)

### Fluxo Authorization Code (obrigatório para APIs Banking)

```
App → Browser → BTG Id (login) → Authorization Code → App
App → BTG Id (code + client_id + secret) → access_token + refresh_token
```

- **Access Token**: duração 24h
- **Refresh Token**: duração 10 dias (renovável)
- **Client Credentials**: NÃO serve para Banking, apenas para Webhooks

### Escopos Necessários (estimados pela estrutura da API)

| API              | Escopo (estimado)                                |
|------------------|--------------------------------------------------|
| Pagamentos       | `brn:btg:empresas:payments`                      |
| Cobranças        | `brn:btg:empresas:receivables`                   |
| Saldo/Extrato    | `brn:btg:empresas:cash-management.readonly`      |
| DDA              | `brn:btg:empresas:dda.readonly`                  |
| Webhooks         | `brn:btg:empresas:apps:webhooks`                 |

> ⚠️ **Os escopos exatos precisam ser confirmados na API Reference (requer login no portal BTG)**

### Secrets Necessários

| Secret                 | Descrição                          |
|------------------------|------------------------------------|
| `BTG_CLIENT_ID`        | Client ID do app BTG               |
| `BTG_CLIENT_SECRET`    | Client Secret do app BTG           |
| `BTG_REDIRECT_URI`     | URI de callback para OAuth         |
| `BTG_ENVIRONMENT`      | `sandbox` ou `production`          |
| `BTG_WEBHOOK_SECRET`   | Secret para validação de webhooks  |

---

## 3. Tabelas do Banco de Dados

### 3.1 `btg_contas_bancarias`
Configuração das contas BTG vinculadas às empresas.

| Coluna           | Tipo     | Descrição                         |
|------------------|----------|-----------------------------------|
| id               | uuid PK  | ID único                          |
| cod_empresa      | int      | Empresa do sistema                |
| account_id       | text     | Account ID no BTG                 |
| company_id       | text     | Company ID no BTG                 |
| agencia          | text     | Agência                           |
| conta            | text     | Número da conta                   |
| ativa            | boolean  | Se está ativa                     |
| created_at       | timestamptz | Data de criação                |

### 3.2 `btg_tokens`
Armazenamento seguro dos tokens OAuth (criptografado).

| Coluna           | Tipo     | Descrição                         |
|------------------|----------|-----------------------------------|
| id               | uuid PK  | ID único                          |
| cod_empresa      | int      | Empresa associada                 |
| access_token     | text     | Token (criptografado)             |
| refresh_token    | text     | Refresh token (criptografado)     |
| expires_at       | timestamptz | Validade do access_token       |
| scopes           | text[]   | Escopos autorizados               |
| updated_at       | timestamptz | Última atualização             |

### 3.3 `btg_pagamentos`
Iniciações de pagamento criadas via API.

| Coluna              | Tipo     | Descrição                          |
|---------------------|----------|------------------------------------|
| id                  | uuid PK  | ID interno                         |
| cod_empresa         | int      | Empresa                            |
| btg_payment_id      | text     | ID do pagamento no BTG             |
| tipo                | text     | PIX_KEY, BANKSLIP, TED, DARF, etc  |
| valor               | numeric  | Valor do pagamento                 |
| beneficiario        | text     | Nome/razão do beneficiário         |
| dados_pagamento     | jsonb    | Detalhes (chave pix, boleto, etc)  |
| status              | text     | PENDING, APPROVED, REJECTED, etc   |
| parcela_id          | uuid     | FK para parcela financeira (ERP)   |
| solicitado_por      | uuid     | Usuário que criou                  |
| aprovado_por        | uuid     | Usuário master que aprovou         |
| aprovado_em         | timestamptz | Data/hora da aprovação           |
| created_at          | timestamptz | Criação                          |
| updated_at          | timestamptz | Última atualização               |

### 3.4 `btg_cobrancas`
Boletos emitidos via API de Cobranças.

| Coluna              | Tipo     | Descrição                          |
|---------------------|----------|------------------------------------|
| id                  | uuid PK  | ID interno                         |
| cod_empresa         | int      | Empresa                            |
| btg_receivable_id   | text     | ID da cobrança no BTG              |
| valor               | numeric  | Valor do boleto                    |
| data_vencimento     | date     | Vencimento                         |
| sacado_nome         | text     | Nome do pagador                    |
| sacado_documento    | text     | CPF/CNPJ do pagador                |
| linha_digitavel     | text     | Linha digitável do boleto          |
| url_boleto          | text     | URL para visualização              |
| status              | text     | EMITIDO, PAGO, VENCIDO, CANCELADO  |
| data_pagamento      | date     | Data de pagamento (se pago)        |
| valor_pago          | numeric  | Valor efetivamente pago            |
| parcela_id          | uuid     | FK para parcela financeira (ERP)   |
| created_at          | timestamptz | Criação                          |
| updated_at          | timestamptz | Última atualização               |

### 3.5 `btg_dda_titulos`
Títulos recebidos via DDA (Débito Direto Autorizado).

| Coluna              | Tipo     | Descrição                          |
|---------------------|----------|------------------------------------|
| id                  | uuid PK  | ID interno                         |
| cod_empresa         | int      | Empresa                            |
| btg_dda_id          | text     | ID do DDA no BTG                   |
| emissor             | text     | Emissor do título                  |
| documento_emissor   | text     | CNPJ emissor                       |
| valor               | numeric  | Valor do título                    |
| data_vencimento     | date     | Vencimento                         |
| linha_digitavel     | text     | Código de barras                   |
| status              | text     | PENDENTE, PAGO, IGNORADO           |
| conciliado          | boolean  | Se foi conciliado com parcela ERP  |
| parcela_id          | uuid     | FK parcela conciliada (se houver)  |
| created_at          | timestamptz | Data de recebimento              |

### 3.6 `btg_extrato`
Lançamentos do extrato bancário para batimento de caixa.

| Coluna              | Tipo     | Descrição                          |
|---------------------|----------|------------------------------------|
| id                  | uuid PK  | ID interno                         |
| cod_empresa         | int      | Empresa                            |
| data_lancamento     | date     | Data do lançamento                 |
| descricao           | text     | Descrição do movimento             |
| valor               | numeric  | Valor (positivo=crédito, neg=déb)  |
| tipo                | text     | CREDITO, DEBITO                    |
| natureza            | text     | Natureza/classificação contábil    |
| conciliado          | boolean  | Se foi conciliado                  |
| referencia_id       | uuid     | Ref. para pagamento/cobrança       |
| saldo_apos          | numeric  | Saldo após movimento               |
| created_at          | timestamptz | Data de importação               |

### 3.7 `btg_webhook_events`
Log de eventos recebidos via webhooks.

| Coluna              | Tipo     | Descrição                          |
|---------------------|----------|------------------------------------|
| id                  | uuid PK  | ID interno                         |
| event_type          | text     | Tipo do evento                     |
| payload             | jsonb    | Payload completo                   |
| processed           | boolean  | Se já foi processado               |
| processed_at        | timestamptz | Quando processado                |
| created_at          | timestamptz | Recebimento                      |

---

## 4. Edge Functions

### 4.1 `btg-auth`
- Gerenciar fluxo OAuth2 Authorization Code
- Trocar code por access_token + refresh_token
- Refresh automático de tokens expirados
- Armazenar tokens na tabela `btg_tokens`

### 4.2 `btg-pagamentos`
- Criar iniciação de pagamento (unitário e lote)
- Listar pagamentos
- Cancelar pagamento pendente
- Tipos: PIX_KEY, PIX_QR_CODE, PIX_MANUAL, TED, BANKSLIP, UTILITIES, DARF, PIX_REVERSAL

> ⚠️ **Pagamentos NÃO são executados instantaneamente** — criam "iniciações" que precisam ser aprovadas via app/internet banking do BTG pelo(s) responsável(is) conforme firmas e poderes.

### 4.3 `btg-cobrancas`
- Emitir boleto/cobrança
- Consultar status
- Cancelar cobrança
- Gerar segunda via

### 4.4 `btg-extrato`
- Consultar saldo
- Consultar extrato por período
- Importar lançamentos para `btg_extrato`

### 4.5 `btg-dda`
- Consultar títulos DDA
- Importar para `btg_dda_titulos`
- Conciliação automática com parcelas do ERP

### 4.6 `btg-webhook-handler`
- Receber eventos do BTG (pagamento aprovado, boleto pago, etc.)
- Validar assinatura (webhook secret)
- Atualizar status nas tabelas correspondentes
- `verify_jwt = false` (webhook externo) + validação manual de signature

---

## 5. Fases de Implementação

### Fase 1 — Fundação (2-3 semanas)
- [ ] Criar conta BTG Empresas e app na Área do Desenvolvedor
- [ ] Configurar secrets (BTG_CLIENT_ID, BTG_CLIENT_SECRET, etc.)
- [ ] Implementar `btg-auth` (OAuth2 Authorization Code + refresh)
- [ ] Criar tabelas base: `btg_contas_bancarias`, `btg_tokens`
- [ ] Tela admin: Configurar contas bancárias BTG por empresa
- [ ] Testar fluxo completo de autenticação no Sandbox

### Fase 2 — Contas a Pagar + Pagamentos (2-3 semanas)
- [ ] Criar tabela `btg_pagamentos` + RLS
- [ ] Implementar `btg-pagamentos` Edge Function
- [ ] Tela: Programação de pagamentos (a partir de parcelas "a pagar")
- [ ] Workflow de aprovação: usuário cria → master revisa → envia ao BTG
- [ ] Status tracking: PENDENTE → AGUARDANDO_APROVACAO → APROVADO → PAGO
- [ ] Webhook: atualização automática de status de pagamento

### Fase 3 — Cobranças / Boletos (2-3 semanas)
- [ ] Criar tabela `btg_cobrancas` + RLS
- [ ] Implementar `btg-cobrancas` Edge Function
- [ ] Tela: Emissão de boletos (a partir de parcelas "a receber")
- [ ] Visualização do boleto (PDF/URL)
- [ ] Baixa automática via webhook (boleto pago)
- [ ] Alertas de inadimplência (vencidos há X dias sem pagamento)

### Fase 4 — DDA + Conciliação (2-3 semanas)
- [ ] Criar tabela `btg_dda_titulos` + RLS
- [ ] Implementar `btg-dda` Edge Function
- [ ] Tela: Listagem de títulos DDA recebidos
- [ ] Conciliação automática: match DDA ↔ parcelas do ERP por valor/CNPJ/vencimento
- [ ] Conciliação manual: interface para parear títulos não conciliados
- [ ] Indicadores: % conciliado, títulos órfãos, divergências

### Fase 5 — Extrato + Batimento de Caixa (2-3 semanas)
- [ ] Criar tabela `btg_extrato` + RLS
- [ ] Implementar `btg-extrato` Edge Function
- [ ] Importação periódica de extrato (diário)
- [ ] Classificação por natureza contábil (automática e manual)
- [ ] Batimento: extrato bancário ↔ lançamentos internos
- [ ] Relatório de fechamento financeiro por período

### Fase 6 — Dashboards + IA (1-2 semanas)
- [ ] KPIs Banking: saldo atual, a pagar hoje, a receber vencido, etc.
- [ ] Gráfico fluxo de caixa real (baseado no extrato BTG)
- [ ] Insights IA: previsão de fluxo, alertas de concentração de pagamentos
- [ ] Integração com Central IA

---

## 6. Telas do Frontend

### 6.1 `/financeiro/banking` — Dashboard Banking
- Saldo bancário em tempo real
- Resumo: pagamentos pendentes, boletos emitidos, DDA pendente
- Gráfico de fluxo de caixa real vs projetado

### 6.2 `/financeiro/banking/pagamentos` — Programação de Pagamentos
- Lista de pagamentos programados (filtro por status)
- Criar pagamento a partir de parcelas a pagar
- Painel de aprovação (apenas master/admin)
- Detalhes do pagamento com histórico de status

### 6.3 `/financeiro/banking/cobrancas` — Gestão de Cobranças
- Emitir boleto para parcelas a receber
- Status dos boletos (emitido, pago, vencido, cancelado)
- Alertas de inadimplência
- Segunda via

### 6.4 `/financeiro/banking/conciliacao` — Conciliação Bancária
- DDA: títulos recebidos do banco
- Match automático com parcelas do ERP
- Interface de conciliação manual
- Indicadores de conciliação

### 6.5 `/financeiro/banking/extrato` — Extrato e Batimento
- Extrato bancário importado
- Classificação por natureza
- Batimento de caixa
- Relatório de fechamento

### 6.6 `/admin/fornecedores` — Config BTG (tab adicional)
- Configurar client_id/secret
- Vincular contas bancárias a empresas
- Alternar Sandbox/Produção

---

## 7. Workflow de Pagamento (Fluxo Crítico)

```
1. Operador seleciona parcelas a pagar
2. Cria "lote de pagamento" no sistema
3. Sistema grava em btg_pagamentos (status: RASCUNHO)
4. Master revisa e aprova no sistema (status: APROVADO_INTERNO)
5. Sistema envia ao BTG via API (status: ENVIADO_BTG)
6. BTG cria "iniciação de pagamento" (status: AGUARDANDO_APROVACAO_BTG)
7. Responsáveis aprovam no app/internet banking do BTG
8. BTG executa pagamento
9. Webhook notifica nosso sistema (status: PAGO)
10. Sistema atualiza parcela do ERP como paga
```

---

## 8. Pré-requisitos para Iniciar

1. **Conta BTG Pactual Empresas** criada e ativa
2. **Usuário Desenvolvedor** registrado no portal
3. **Aplicativo** criado na Área do Desenvolvedor
4. **Client ID + Client Secret** gerados
5. **Webhook endpoint** configurado (nossa Edge Function URL)
6. **Escopos** habilitados para Banking (pagamentos, cobranças, extrato, DDA)

---

## 9. Observações Importantes

- **API Reference detalhada** (endpoints, schemas, responses) requer login no portal BTG. Os contratos exatos de request/response devem ser consultados lá.
- **Sandbox é mockado** — responses são estáticas. Ideal para validar contratos mas NÃO simula fluxos reais.
- **Pagamentos exigem aprovação humana** no app BTG — o sistema cria "iniciações", não executa pagamentos diretamente.
- **Refresh Token** deve ser renovado a cada 10 dias — implementar job automático.
- O **Client Credentials** NÃO funciona para APIs Banking — obrigatório usar **Authorization Code**.
