

# Plano: Plataforma de Adquirentes — Prioridade Rede (e.Rede)

## Contexto

Abandonamos a integracao BTG Recebiveis (retorno zero). Vamos integrar diretamente com a adquirente **Rede** (e.Rede API) para: capturar transacoes, gerar links de pagamento e conciliar vendas. A funcao de link de pagamento sera exposta como API para o projeto [Lovable Connect & Flow](/projects/2a6a2d63-e981-4d12-ac70-37d22a777184).

## Arquitetura

```text
  CONNECT & FLOW                           LENS (este projeto)
 ┌──────────────┐                        ┌─────────────────────┐
 │ Bot WhatsApp │                        │  Admin Config       │
 │ ai-triage    │                        │  Dashboard Vendas   │
 │      │       │                        │  Conciliacao        │
 │ proxy-func ──┼──── HTTP ─────────────>│  payment-links      │
 └──────────────┘                        │       │             │
                                         │  ┌────┴───────┐     │
  REDE (e.Rede API)                      │  │ lancamentos │    │
 ┌──────────────┐                        │  │ financeiros │    │
 │ Transacoes   │<── sync ──────────────>│  └────┬───────┘    │
 │ Pay Links    │<── criar ─────────────>│       │             │
 └──────────────┘                        │  conciliacao com    │
                                         │  extrato BTG        │
  BTG (Banking)                          │       │             │
 ┌──────────────┐                        │  btg-extrato        │
 │ Extrato      │<── sync ─────────────>│                     │
 └──────────────┘                        └─────────────────────┘
```

## API Rede — Referencia Tecnica

- **Base URL**: Sandbox `https://sandbox-erede.useredecloud.com.br` / Producao `https://api.userede.com.br/erede`
- **Auth**: Basic Auth (`PV:integration_key`) — PV = numero de filiacao
- **Transacoes**: `GET /v1/transactions?...` com filtros por data
- **Criar link/transacao**: `POST /v1/transactions` com `capture=true`
- **Consulta**: `GET /v1/transactions/{tid}`

---

## Fase 1 — Modelo de Dados (1 Migration)

### Tabela `adquirentes_config`
Credenciais por adquirente/empresa. Campos: `id`, `cod_empresa`, `adquirente` (enum: REDE, CIELO, STONE, PAGSEGURO, GETNET), `ambiente` (sandbox/production), `merchant_id` (PV da Rede), `integration_key_encrypted`, `ativo`, `created_at`, `updated_at`.

### Tabela `vendas_cartao`
Cada transacao na maquininha. Campos: `id`, `cod_empresa`, `adquirente`, `nsu`, `autorizacao`, `tid` (Rede transaction id), `bandeira`, `tipo` (CREDITO/DEBITO/PIX), `parcelas`, `valor_bruto`, `valor_liquido`, `taxa_percentual`, `taxa_valor`, `data_venda`, `data_prevista_credito`, `status` (APROVADA/CANCELADA/ESTORNADA), `origem_venda_id`, `lancamento_id`, `dados_extras jsonb`, timestamps.

### Tabela `payment_links`
Links de pagamento gerados. Campos: `id`, `cod_empresa`, `adquirente`, `valor`, `descricao`, `parcelas_max`, `expira_em`, `url_pagamento`, `qr_code_pix`, `status` (ATIVO/PAGO/EXPIRADO/CANCELADO), `tid`, `cliente_nome`, `cliente_documento`, `cliente_telefone`, `lancamento_id`, `origem` (MANUAL/CHATBOT/API), `origem_ref`, `dados_extras jsonb`, `webhook_payload jsonb`, `pago_em`, timestamps.

### Tabela `conciliacao_vendas`
Cruzamento ERP x Adquirente. Campos: `id`, `cod_empresa`, `venda_erp_id`, `venda_cartao_id`, `status` (CONCILIADO/DIVERGENTE/PENDENTE_ERP/PENDENTE_ADQ), `diferenca_valor`, `observacao`, `conciliado_por`, `conciliado_em`, timestamps.

### Alteracao em `recebiveis_cartao`
Adicionar coluna `adquirente_source` (TEXT, default 'REDE') para diferenciar origem. A tabela passa a ser alimentada pela Rede em vez do BTG.

### RLS
- Admin: full access em todas
- Tenant: SELECT via `user_empresa_permissions`
- Service role: full access
- `payment_links`: tenant INSERT/UPDATE para permitir criacao manual

---

## Fase 2 — Edge Functions

### 2.1 `rede-proxy` (nova)
Funcao central para chamadas a API e.Rede. Actions:
- `consultar_transacoes` — busca transacoes por periodo
- `consultar_transacao` — detalhe por TID
- `criar_transacao` — cria pagamento/link

Busca credenciais de `adquirentes_config`, monta Basic Auth, proxy para e.Rede.

### 2.2 `payment-links` (nova)
Actions: `criar`, `listar`, `detalhe`, `cancelar`, `webhook_callback`.
- **Autenticacao dupla**: JWT do usuario OU header `X-Service-Key` (para Connect & Flow)
- `criar`: Chama `rede-proxy` para gerar transacao, salva em `payment_links`, cria lancamento RECEBER no ledger
- `webhook_callback`: endpoint publico para Rede notificar pagamento, atualiza status e baixa lancamento
- Retorno padrao: `{ url_pagamento, tid, status, expira_em }`

### 2.3 `sync-vendas-cartao` (nova)
Importa transacoes da Rede via `rede-proxy`, popula `vendas_cartao` e atualiza `recebiveis_cartao` com previsao de credito.

### 2.4 `conciliar-vendas` (nova)
Cruza `venda` (ERP) com `vendas_cartao` (Rede) por NSU, valor e data. Gera registros em `conciliacao_vendas`.

### 2.5 Simplificar `btg-recebiveis-cartao`
Remover logica de importacao BTG. Manter apenas actions de `listar`, `conciliar_auto`, `conciliar_manual`, `detalhe` que operam sobre `recebiveis_cartao` agora alimentada pela Rede.

---

## Fase 3 — Integracao com Connect & Flow

### No Lens (este projeto)
- `payment-links` aceita chamadas com header `X-Service-Key` (secret compartilhado: `INTERNAL_SERVICE_SECRET`)
- O bot envia: `{ cod_empresa, valor, descricao, cliente_nome, cliente_telefone, parcelas_max, origem: "CHATBOT", origem_ref: "atendimento_xxx" }`
- Retorna: `{ url_pagamento, tid, status, expira_em }`

### No Connect & Flow
- Criar Edge Function `payment-link-proxy` que faz HTTP POST para `payment-links` do Lens
- Adicionar tool `gerar_link_pagamento` no `ai-triage` para o bot coletar dados (valor, descricao, parcelas) e gerar link automaticamente
- Secret necessario: `LENS_SUPABASE_URL` + `INTERNAL_SERVICE_SECRET`

---

## Fase 4 — UI no Lens

1. **Config de Adquirentes** (`/admin/adquirentes`) — Cadastro de PV e chave de integracao por empresa, toggle sandbox/producao. Reusar padrao do `AdminFornecedoresPage`.
2. **Dashboard Conciliacao** — Substituir `ConciliacaoCartoesPage` para mostrar cruzamento ERP x Rede com acoes de conciliacao manual/auto.
3. **Links de Pagamento** (`/financeiro/links-pagamento`) — Listagem, criacao manual, status em tempo real.
4. **Carteira de Recebiveis** — Visao consolidada dos valores a receber por bandeira/data, alimentada pela Rede.

---

## Secrets Necessarios

| Secret | Onde | Descricao |
|--------|------|-----------|
| `INTERNAL_SERVICE_SECRET` | Lens + Connect & Flow | Chave compartilhada service-to-service |

As credenciais da Rede (PV + integration_key) ficam na tabela `adquirentes_config`, nao em secrets — permitindo multiplas empresas.

---

## Ordem de Implementacao

| Sprint | Entrega |
|--------|---------|
| 1 | Migration (4 tabelas + alter) + Admin Config Adquirentes |
| 2 | `rede-proxy` + `payment-links` + UI Links de Pagamento |
| 3 | Integracao Connect & Flow (proxy + tool no ai-triage) |
| 4 | `sync-vendas-cartao` + Dashboard Conciliacao |
| 5 | Carteira de recebiveis + conciliacao bancaria BTG |

