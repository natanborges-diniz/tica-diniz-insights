# Plano Revisado: Sistema Financeiro Centralizado com Bordero e Conciliacao de Cartoes

## Status de Implementacao

### ✅ Sprint 1 (Concluído)
- [x] Tabela `lancamentos_financeiros` criada com RLS (admin + tenant + service_role)
- [x] Tabela `borderos` criada com RLS
- [x] Tabela `recebiveis_cartao` criada com RLS
- [x] Tabela `recebiveis_cartao_parcelas` criada com RLS
- [x] Edge function `financeiro-lancamentos` (listar, criar, editar, excluir, autorizar, baixar, cancelar)
- [x] Página `FinanceiroHubPage` com KPIs, filtros, tabela e CRUD
- [x] Rota `/financeiro/hub` adicionada ao App.tsx
- [x] Sidebar reorganizado com "Hub Financeiro" como seção principal

### 🔲 Sprint 2 — Borderô + Aprovação Master + BTG Batch API
- [ ] Actions de borderô na edge function btg-pagamentos (criar, aprovar, enviar, cancelar)
- [ ] UI de borderô no Hub (selecionar lançamentos, criar lote, aprovar)
- [ ] Integração BTG Batch Payments API

### 🔲 Sprint 3 — Conciliação de Cartões
- [ ] Edge function `btg-recebiveis-cartao` (importar agenda BTG, conciliar)
- [ ] Página `ConciliacaoCartoesPage` (`/financeiro/cartoes`)
- [ ] Cálculo automático de taxas de adquirente
- [ ] Geração de lançamentos TAXA_ADQUIRENTE

### 🔲 Sprint 4 — DDA + Cobrança + Conciliação Extrato
- [ ] DDA → criar/vincular lançamento ao importar
- [ ] Cobrança → vincular lançamento ao emitir boleto
- [ ] Conciliação automática extrato x lançamentos
- [ ] Sugestão de classificação por similaridade

### 🔲 Sprint 5 — DRE/Fluxo derivados + Refinamentos
- [ ] DRE baseado em lançamentos BAIXADOS
- [ ] Fluxo de Caixa real vs projetado via lançamentos
- [ ] Import automático do ERP
- [ ] Lançamentos recorrentes (pg_cron)


# Plano Revisado: Sistema Financeiro Centralizado com Bordero e Conciliacao de Cartoes

## Ajustes Solicitados

Tres mudancas fundamentais no plano anterior:

1. **Bordero de pagamento**: O ciclo de pagamento precisa de uma etapa formal de preparacao de lote (bordero) antes da autorizacao. Nao basta "prever" — o usuario monta o lote, revisa, e o master aprova para processamento.

2. **Conciliacao de cartoes antes dos lancamentos**: Recebiveis de adquirentes agregam parcelas de varios clientes. E necessario primeiro conciliar as parcelas do ERP com a agenda de recebiveis das maquininhas, calcular taxas, e so entao gerar lancamentos "justos" (valor real recebido + lancamento automatico da taxa).

3. **BTG Batch Payments API**: Usar a API de Gestao de Lote do BTG (`batch-payments`) para oficializar o envio de pagamentos em lote, em vez de enviar um a um.

---

## Novo Ciclo de Vida dos Lancamentos

### Contas a Pagar

```text
PREVISTO (importado ERP ou criado manual)
  ↓ usuario seleciona e adiciona ao bordero
BORDERO (lote em montagem — editavel, removivel)
  ↓ master revisa e aprova o bordero
AUTORIZADO (bordero aprovado — registra quem aprovou)
  ↓ sistema envia ao BTG via batch-payments API
PROCESSANDO (enviado ao banco)
  ↓ confirmacao do banco (webhook/polling)
BAIXADO (pago — data_pagamento + valor_pago preenchidos)
```

### Contas a Receber (Cartoes)

```text
PARCELAS ERP (varias parcelas de varios clientes)
  ↓ agrupadas por adquirente + bandeira + data prevista
AGENDA RECEBIVEIS (previsto pelas adquirentes via BTG API)
  ↓ confronto: parcelas ERP agrupadas vs agenda BTG
CONCILIADO_CARTAO (match confirmado — calcula taxa)
  ↓ gera lancamento RECEBER com valor liquido
  ↓ gera lancamento automatico TAXA_ADQUIRENTE (diferenca)
LANCAMENTO RECEBER (valor justo pos-taxa)
  ↓ credito entra na conta (extrato BTG)
BAIXADO (confirmado)
```

### Contas a Receber (Boletos/PIX/Outros)

```text
PREVISTO → COBRANCA EMITIDA → BAIXADO (via webhook boleto pago)
```

---

## Modulo 1 — Bordero de Pagamentos

### Conceito

O bordero e um lote de pagamentos em preparacao. O usuario seleciona lancamentos PAGAR previstos, agrupa num bordero, revisa valores/beneficiarios, e submete para aprovacao do master.

### Nova tabela `borderos`

```
id, cod_empresa, status (MONTAGEM|APROVADO|ENVIADO|PROCESSADO|CANCELADO),
descricao, total_valor, qtd_lancamentos,
criado_por, aprovado_por, aprovado_em,
btg_batch_id (ref ao lote BTG),
created_at, updated_at
```

### Alteracao em `lancamentos_financeiros`

Adicionar coluna `bordero_id` (uuid nullable) — vincula o lancamento ao bordero.

### Fluxo na UI

1. No Hub Financeiro, usuario filtra lancamentos PAGAR com status PREVISTO
2. Seleciona multiplos lancamentos via checkbox
3. Clica "Criar Bordero" → abre dialog para dar nome/descricao ao lote
4. Bordero fica em status MONTAGEM — usuario pode adicionar/remover lancamentos, editar valores
5. Ao finalizar, clica "Solicitar Aprovacao"
6. Master (admin) ve borderos pendentes, revisa, clica "Aprovar Bordero" (registra usuario + timestamp)
7. Bordero aprovado → sistema chama BTG Batch Payments API:
   - `POST /{companyId}/banking/batch-payments` → Abrir Lote
   - Adiciona cada pagamento ao lote
   - `PATCH /{companyId}/banking/batch-payments/{batchId}` → Processar Lote
8. Lancamentos passam para PROCESSANDO
9. Confirmacao do banco → BAIXADO

### Edge function `btg-pagamentos` — novas actions

- `criar_bordero` — cria registro + vincula lancamentos selecionados
- `aprovar_bordero` — requer admin, atualiza status, registra aprovador
- `enviar_bordero_btg` — usa BTG Batch Payments API
- `cancelar_bordero` — desfaz vinculo dos lancamentos

---

## Modulo 2 — Conciliacao de Cartoes (Recebiveis Adquirentes)

### Conceito (Melhores Praticas do Mercado)

A conciliacao de cartoes segue o padrao usado por Concil, Equals, Rede/Cielo:

1. **Parcelas do ERP**: O ERP registra cada parcela de cartao de cada venda (ex: venda R$ 300 em 3x de R$ 100 no credito Visa, Cielo)
2. **Agenda de recebiveis**: A adquirente/banco agrupa essas parcelas por data de vencimento + bandeira + credenciadora, gerando uma "unidade de recebivel" (UR)
3. **Conciliacao**: Cruzar as parcelas ERP agrupadas com as URs da agenda BTG
4. **Taxa**: A diferenca entre o valor bruto (soma parcelas ERP) e o valor liquido (UR) e a taxa da adquirente — gera lancamento automatico
5. **Baixa**: Quando o credito entra na conta, baixa o lancamento de recebivel e confirma a taxa

### Nova tabela `recebiveis_cartao`

```
id, cod_empresa,
adquirente (CIELO|STONE|GETNET|REDE|etc),
bandeira (VISA|MASTERCARD|ELO|etc),
data_vencimento, valor_bruto, valor_liquido,
taxa_percentual, taxa_valor,
status (PREVISTO|CONCILIADO|RECEBIDO|DIVERGENTE),
btg_receivable_id (ref BTG),
btg_extrato_id (vinculo com extrato quando recebido),
created_at, updated_at
```

### Nova tabela `recebiveis_cartao_parcelas` (vinculo N:N)

```
id, recebivel_id (FK recebiveis_cartao),
lancamento_id (FK lancamentos_financeiros),
valor_parcela, numero_parcela
```

### Fluxo

1. **Importar agenda BTG**: Edge function `btg-recebiveis-cartao` chama:
   - `GET /credit-card-receivables` — lista recebiveis disponiveis
   - Persiste em `recebiveis_cartao` com adquirente, bandeira, data, valores

2. **Agrupar parcelas ERP**: Busca lancamentos RECEBER com origem ERP que sao de cartao (identificados por forma de pagamento no ERP). Agrupa por data prevista + adquirente + bandeira.

3. **Conciliar automaticamente**: Match por valor bruto agrupado vs valor do recebivel BTG na mesma data/adquirente/bandeira. Vincula parcelas ao recebivel.

4. **Calcular taxas**: `taxa_valor = valor_bruto - valor_liquido`. Gera lancamento automatico tipo PAGAR, categoria `TAXA_ADQUIRENTE`, valor da taxa, vinculado ao recebivel.

5. **Ajustar lancamentos**: As parcelas originais do ERP sao ajustadas para refletir o valor liquido real. Diferenca gera lancamento de taxa.

6. **Baixa**: Ao credito aparecer no extrato BTG, sistema concilia com o recebivel e marca como RECEBIDO. Baixa os lancamentos vinculados.

### Tela `/financeiro/cartoes`

- Visao por periodo: agenda de recebiveis com status
- KPIs: previsto vs recebido, total taxas, divergencias
- Drill-down: expandir recebivel para ver parcelas ERP vinculadas
- Acoes: conciliar manual (quando auto falha), marcar divergencia

---

## Modulo 3 — Lancamentos Financeiros (Hub Central)

Mantido do plano anterior com os ajustes:

### Status revisado

```
PREVISTO → BORDERO (apenas PAGAR) → AUTORIZADO → PROCESSANDO → BAIXADO
PREVISTO → AUTORIZADO → BAIXADO (para RECEBER simples)
PREVISTO → CONCILIADO_CARTAO → BAIXADO (para RECEBER cartao)
CANCELADO (qualquer momento antes de BAIXADO)
```

### Campos adicionais na tabela

- `bordero_id` uuid nullable
- `recebivel_cartao_id` uuid nullable
- `forma_pagamento` text (DINHEIRO, CARTAO_CREDITO, CARTAO_DEBITO, BOLETO, PIX, TED, CHEQUE)
- `adquirente` text nullable
- `bandeira` text nullable
- `numero_parcela` integer nullable
- `total_parcelas` integer nullable

### Import do ERP

Ao importar parcelas do ERP, o sistema identifica a forma de pagamento:
- **Cartao**: cria lancamento com forma_pagamento, adquirente, bandeira, parcela — sera conciliado com recebiveis
- **Boleto**: cria lancamento que podera gerar cobranca BTG
- **Outros**: lancamento simples

### Edicao e exclusao

- Lancamentos PREVISTO podem ser editados em qualquer campo
- Lancamentos importados do ERP podem ser excluidos (o usuario pode considerar que o ERP esta errado)
- Lancamentos criados manualmente podem ser inseridos a qualquer momento
- Toda edicao registra `updated_at` e pode registrar `editado_por`

---

## Modulo 4 — Conciliacao Extrato (mantido + ajuste)

Mantido do plano anterior. Transacoes do extrato sem match geram lancamento PREVISTO com classificacao sugerida por similaridade. Usuario valida.

---

## Modulo 5 — DDA para Pagamento (mantido + ajuste)

DDA importado → busca lancamento existente ou cria novo → vincula ao lancamento → usuario adiciona ao bordero → master aprova → pago.

---

## Modulo 6 — Cobranca ERP → Boleto (mantido)

Selecionar lancamentos RECEBER → gerar boleto BTG → acompanhar → baixa automatica.

---

## Modulo 7 — DRE e Fluxo derivados de lancamentos BAIXADOS (mantido)

Fonte unica de verdade = `lancamentos_financeiros` com status BAIXADO.

---

## Modulo 8 — Contas Planejadas (mantido + ajuste)

ERP pre-carrega contas de consumo/aluguel como lancamentos PREVISTO. Usuario pode editar, excluir ou criar novos. Nao ha tabela separada — tudo vive em `lancamentos_financeiros` com `origem = MANUAL` ou `origem = ERP`.

---

## Resumo Tecnico de Alteracoes

### Novas tabelas (migrations)

1. `lancamentos_financeiros` — hub central (schema detalhado no Modulo 3)
2. `borderos` — lotes de pagamento
3. `recebiveis_cartao` — agenda de recebiveis das adquirentes
4. `recebiveis_cartao_parcelas` — vinculo parcelas ERP ↔ recebivel

### Novas edge functions

1. `financeiro-lancamentos` — CRUD + import ERP + autorizar + baixar + sugerir classificacao
2. `btg-recebiveis-cartao` — importar agenda, listar, conciliar

### Edge functions aprimoradas

- `btg-pagamentos` → actions de bordero (criar, aprovar, enviar via batch API, cancelar)
- `btg-extrato` → conciliacao automatica com lancamentos
- `btg-dda` → criar/vincular lancamento ao importar
- `btg-cobrancas` → vincular lancamento ao emitir

### Novas paginas

- `FinanceiroHubPage.tsx` → `/financeiro/hub` (lancamentos + borderos)
- `ConciliacaoCartoesPage.tsx` → `/financeiro/cartoes`

### Paginas aprimoradas

- Sidebar reorganizado com "Hub Financeiro" como entrada principal
- DDA, Pagamentos, Cobrancas com vinculo a lancamento

---

## Ordem de Implementacao

```text
Sprint 1: Tabela lancamentos + import ERP + CRUD + Hub UI
Sprint 2: Bordero de pagamentos + aprovacao master + BTG Batch API
Sprint 3: Conciliacao de cartoes + recebiveis BTG + taxas automaticas
Sprint 4: DDA→lancamento + Cobranca→lancamento + conciliacao extrato
Sprint 5: DRE/Fluxo derivados de lancamentos + refinamentos
```

