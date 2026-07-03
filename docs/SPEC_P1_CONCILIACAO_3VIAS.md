# SPEC P1 — Conciliação em 3 Vias + Retorno Automático BTG

> Spec derivada do mapeamento em `MAPEAMENTO_FINANCEIRO.md` (2026-07-03), ancorada no código atual.
> Objetivo: todo lançamento do extrato BTG explicado por um registro do sistema, com match automático,
> fila de exceções e baixa automática por retorno do banco — eliminando planilhas de conferência.

---

## 1. Problema (estado atual do código)

| # | Problema | Onde |
|---|---|---|
| 1 | **Import do extrato duplica**: INSERT cego, sem ID de transação nem chave de dedup | `btg-extrato/index.ts:362` (`handleImportar`) |
| 2 | **Conciliação automática destrói informação**: linha sem match vira `lancamento_financeiro` BAIXADO criado na hora e marcado `conciliado=true` — após 1 execução tudo aparece conciliado | `btg-extrato/index.ts:569-608` (`conciliar_auto_lancamentos`) |
| 3 | **Sem correlação por pagamento**: no envio do borderô, a resposta de cada POST `/batch-payments/{id}/payments` é descartada — não sabemos qual pagamento BTG corresponde a qual lançamento | `financeiro-lancamentos/index.ts:553-561` |
| 4 | **Baixa manual com dados fictícios**: `confirmar_processamento` grava `data_pagamento = hoje`, `valor_pago = valor` sem consultar o BTG | `financeiro-lancamentos/index.ts:956-998` |
| 5 | **Webhook inexistente**: `btg_webhook_events` criada na migration mas nenhuma function escreve/lê nela | migration `20260225234639` |
| 6 | **Recebíveis de cartão nunca fecham com o caixa**: `btg-recebiveis-cartao.conciliar_auto` liga recebível↔lançamentos (CONCILIADO_CARTAO), mas nada marca o recebível como RECEBIDO contra o crédito real do extrato | `btg-recebiveis-cartao/index.ts:74-157` |
| 7 | **Conciliação de extrato na UI é um checkbox manual** sem sugestão de candidato | `BankingExtratoDashboard.tsx` + `handleConciliar` |

O que **já funciona e será reaproveitado**: match DDA↔ERP por CNPJ+valor+vencimento (`btg-dda`),
match recebível↔lançamentos com tolerância 1%/R$1 e geração de lançamento de taxa
(`btg-recebiveis-cartao`), infra pg_cron+pg_net (padrão `sync-os-hub-incremental`, migration
`20260205215420`), refresh de token (`btg-token-refresh`).

---

## 2. Conceito

**O extrato é o juiz.** Dinheiro que entrou/saiu da conta é fato; o resto é expectativa.
Cada linha de `btg_extrato` deve terminar em um destes estados:

```
PENDENTE ──┬─→ CONCILIADO_AUTO ────┐
           ├─→ CONCILIADO_MANUAL ──┼─→ (terminal, reversível por admin)
           └─→ IGNORADO ───────────┘
```

E cada conciliação aponta para **um alvo tipado**:

| `alvo_tipo` | O que explica | Lado |
|---|---|---|
| `LANCAMENTO` | Lançamento avulso do ledger (PAGAR ou RECEBER) | ambos |
| `PAGAMENTO_BTG` | Pagamento enviado via borderô ou avulso (`btg_pagamentos` / lançamento com `btg_payment_id`) | débito |
| `COBRANCA_BTG` | Boleto emitido por nós que foi pago (`btg_cobrancas`) | crédito |
| `RECEBIVEL_CARTAO` | Crédito líquido da agenda de cartão (`recebiveis_cartao`) | crédito |
| `TARIFA` | Tarifa/encargo bancário classificado por regra | débito |

Uma linha de extrato pode ter **N alocações** (ex.: um débito de batch que o BTG lançou agregado),
por isso o vínculo vai em tabela própria, não em coluna — mesmo padrão de `conciliacao_vendas`.

**Regra de ouro (corrige o problema #2):** o motor automático NUNCA cria lançamento para linha sem
match. Sem match = fica PENDENTE na fila de exceções, com sugestões. Criação de lançamento a partir
do extrato é sempre ação humana de 1 clique (ou regra de tarifa explicitamente cadastrada).

---

## 3. Modelo de dados (1 migration nova)

### 3.1 Hardening de `btg_extrato`

```sql
ALTER TABLE public.btg_extrato
  ADD COLUMN transaction_id TEXT,                          -- id da transação no BTG, quando a API fornecer
  ADD COLUMN dedupe_key TEXT,                              -- hash determinístico (ver 3.4)
  ADD COLUMN status_conciliacao TEXT NOT NULL DEFAULT 'PENDENTE',
  ADD COLUMN metodo_conciliacao TEXT,                      -- EXATO | TOLERANCIA | AGRUPADO | REGRA | MANUAL
  ADD COLUMN conciliado_por UUID,
  ADD COLUMN conciliado_em TIMESTAMPTZ,
  ADD COLUMN dados_extras JSONB NOT NULL DEFAULT '{}'::jsonb;  -- payload bruto do movimento BTG

CREATE UNIQUE INDEX uq_btg_extrato_dedupe ON public.btg_extrato (dedupe_key);
CREATE INDEX idx_btg_extrato_status ON public.btg_extrato (cod_empresa, status_conciliacao);
```

`conciliado` (boolean) é mantido por compatibilidade com a UI atual e passa a ser derivado:
`conciliado = status_conciliacao IN ('CONCILIADO_AUTO','CONCILIADO_MANUAL')` — atualizado pelo motor,
nunca mais direto pelo checkbox.

### 3.2 Nova tabela `conciliacao_extrato`

```sql
CREATE TABLE public.conciliacao_extrato (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cod_empresa INTEGER NOT NULL,
  extrato_id UUID NOT NULL REFERENCES public.btg_extrato(id) ON DELETE CASCADE,
  alvo_tipo TEXT NOT NULL,          -- LANCAMENTO | PAGAMENTO_BTG | COBRANCA_BTG | RECEBIVEL_CARTAO | TARIFA
  alvo_id UUID,                     -- NULL apenas para TARIFA criada por regra
  valor_alocado NUMERIC NOT NULL,
  metodo TEXT NOT NULL,             -- EXATO | TOLERANCIA | AGRUPADO | REGRA | MANUAL
  score NUMERIC,                    -- 0-100, só para matches automáticos
  observacao TEXT,
  criado_por UUID,                  -- NULL = motor automático
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_conc_extrato_extrato ON public.conciliacao_extrato (extrato_id);
CREATE INDEX idx_conc_extrato_alvo ON public.conciliacao_extrato (alvo_tipo, alvo_id);
```

RLS: mesmo trio das tabelas financeiras (service role full / admin full / tenant read por
`user_empresa_permissions`). Sem FK em `cod_empresa` (convenção do repo).

### 3.3 Nova tabela `extrato_regras_classificacao` (tarifas e recorrências)

```sql
CREATE TABLE public.extrato_regras_classificacao (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cod_empresa INTEGER,              -- NULL = regra global
  padrao_descricao TEXT NOT NULL,   -- regex case-insensitive aplicada em btg_extrato.descricao
  tipo TEXT NOT NULL,               -- CREDITO | DEBITO
  natureza TEXT NOT NULL,           -- ex: DESPESAS_FINANCEIRAS
  categoria TEXT,                   -- ex: TARIFA_BANCARIA
  auto_conciliar BOOLEAN NOT NULL DEFAULT true,
  valor_max NUMERIC,                -- guarda-corpo: regra só aplica até este valor (NULL = sem teto)
  ativo BOOLEAN NOT NULL DEFAULT true,
  criado_por UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Seeds iniciais (globais, `valor_max = 500`): `TARIFA|TAR\.|MANUTENCAO CONTA`, `IOF`, `JUROS`.
Quando uma regra casa, o motor cria o lançamento de tarifa (BAIXADO, com data/valor reais do
extrato) e a alocação `alvo_tipo='TARIFA'` — este é o **único** caminho de criação automática.

### 3.4 Chave de dedup (corrige problema #1)

O BTG v2 (`dailyMovements`) pode não expor ID único por movimento. Estratégia em duas camadas:

1. Se o movimento trouxer id (`transactionId`/`entryId`/etc. — verificar no payload real, campos
   já chegam em `dados_extras`): `dedupe_key = 'btg:' + transaction_id`.
2. Senão: `dedupe_key = sha256(cod_empresa|data_lancamento|valor|tipo|descricao|n)` onde `n` é o
   índice de ocorrência daquela combinação **no dia** (0,1,2...) — permite dois PIX idênticos no
   mesmo dia sem colisão, e mantém estabilidade entre reimportações porque a ordem dos movimentos
   do dia no payload do BTG é estável.

`handleImportar` passa a fazer **upsert** por `dedupe_key` (ignora duplicata, preserva
`status_conciliacao` existente) e a janela padrão de importação passa a ter overlap de 3 dias.

### 3.5 Correlação lançamento ↔ pagamento BTG (corrige problema #3)

Sem migration nova — usar `lancamentos_financeiros.dados_extras`:

```jsonc
"dados_extras": {
  "btg_batch_id": "...",          // já existe no borderô; replicar no lançamento
  "btg_payment_id": "...",        // id retornado pelo POST /payments — HOJE DESCARTADO
  "btg_payment_status": "..."     // último status conhecido (polling/webhook)
}
```

---

## 4. Motor de conciliação — edge function `conciliar-extrato` (nova)

Function separada (não action do `btg-extrato`) porque será chamada por cron e por webhook, além
da UI. Actions: `executar`, `sugestoes`, `confirmar`, `desfazer`, `ignorar`, `criar_lancamento`.

### 4.1 `executar` — waterfall de matching

Processa linhas `status_conciliacao='PENDENTE'` da empresa, na ordem abaixo. **Primeira fase que
casar, vence; ambiguidade nunca casa sozinha.**

**Fase 1 — Referência forte (score 100, metodo EXATO):**
- Débito ↔ `btg_pagamentos` com status ENVIADO_BTG/PAGO, mesmo valor, data ±2 dias; ou lançamento
  com `dados_extras.btg_payment_id` cujo valor bate.
- Crédito ↔ `btg_cobrancas` PAGO/REGISTERED com `valor_pago` (ou valor) igual e `data_pagamento`
  (ou vencimento) ±2 dias.
- Efeito: alocação + baixa do alvo (ver 4.3).

**Fase 2 — Recebíveis de cartão (metodo AGRUPADO, corrige problema #6):**
- Crédito ↔ `recebiveis_cartao` com `data_vencimento = data_lancamento` (±1 dia útil),
  `status IN ('PREVISTO','CONCILIADO')` e `|valor_liquido − valor| ≤ max(R$1, 1%)` — mesma
  tolerância já usada em `btg-recebiveis-cartao/index.ts:113-114`.
- Se um recebível sozinho não bater, tentar combinação dos recebíveis do dia por adquirente
  (o banco pode agregar bandeiras num crédito só): soma exata dentro da tolerância, no máx. 5 itens.
- Efeito: recebível → `RECEBIDO`; lançamentos vinculados via `recebiveis_cartao_parcelas`
  (status CONCILIADO_CARTAO) → BAIXADO com data/valor reais do extrato.

**Fase 3 — Lançamento individual (metodo EXATO ou TOLERANCIA):**
- Tipo correspondente (CREDITO↔RECEBER, DEBITO↔PAGAR), status IN (PREVISTO, AUTORIZADO,
  PROCESSANDO), sem `btg_extrato_id`.
- Match: valor exato + `data_vencimento` ±3 dias → score 90. Valor exato + ±7 dias → score 70.
- **Se houver 2+ candidatos com mesmo score: não casa** — vira sugestão (difere do comportamento
  atual em `btg-extrato/index.ts:530`, que escolhe o mais próximo às cegas).
- Auto-concilia apenas score ≥ 90; score 70-89 fica como sugestão para confirmação de 1 clique.

**Fase 4 — Regras de classificação (metodo REGRA):**
- Aplica `extrato_regras_classificacao` (ordem: empresa > global). Casou e `auto_conciliar` e
  `valor ≤ valor_max`: cria lançamento de tarifa BAIXADO + alocação TARIFA.

**O que sobrar fica PENDENTE**, com top-3 sugestões computadas e persistidas em
`btg_extrato.dados_extras.sugestoes` (`[{alvo_tipo, alvo_id, score, motivo}]`).

### 4.2 Actions de exceção (usadas pela UI)

- `sugestoes {extrato_id}` — recalcula candidatos ao vivo.
- `confirmar {extrato_id, alocacoes:[{alvo_tipo, alvo_id, valor_alocado}]}` — valida
  `Σ valor_alocado = valor` da linha, cria alocações (metodo MANUAL), aplica efeitos 4.3,
  marca CONCILIADO_MANUAL.
- `ignorar {extrato_id, observacao}` — status IGNORADO (ex.: transferência entre contas próprias).
- `criar_lancamento {extrato_id, natureza, categoria, descricao?}` — cria lançamento BAIXADO com
  data/valor do extrato + alocação; substitui o auto-create removido.
- `desfazer {extrato_id}` — admin: apaga alocações, reverte efeitos (lançamento volta ao status
  anterior guardado em `dados_extras.status_pre_baixa`), linha volta a PENDENTE.

### 4.3 Efeitos colaterais de uma conciliação (transacionais)

Ao conciliar contra:
- `LANCAMENTO`: status → BAIXADO, `valor_pago = valor_alocado`, `data_pagamento = data_baixa =
  data_lancamento do extrato` (real, não `hoje`), `btg_extrato_id = extrato.id`.
- `PAGAMENTO_BTG`: `btg_pagamentos.status → PAGO`; se ligado a lançamento, idem acima.
- `COBRANCA_BTG`: `btg_cobrancas.status → PAGO`, `valor_pago`, `data_pagamento`; se `parcela_id`
  ligar a lançamento RECEBER, baixa também.
- `RECEBIVEL_CARTAO`: recebível → RECEBIDO + baixa dos lançamentos vinculados.

Implementar os efeitos como **RPC SQL `fn_conciliar_extrato(...)` com transação** — os loops de
UPDATEs soltos do código atual (ex. `btg-extrato/index.ts:543-558`) deixam estado inconsistente se
falharem no meio.

---

## 5. Retorno automático BTG — webhook + polling

### 5.1 Edge function `btg-webhook` (nova; `verify_jwt = false` no config.toml)

```
POST /btg-webhook
  1. Validar autenticidade (ver 5.4) — falhou: 401, não grava nada
  2. INSERT btg_webhook_events { event_type, payload, processed=false }
     (idempotência: unique parcial por payload->>'id' quando existir; duplicata → 200 e sai)
  3. Responder 200 imediatamente
  4. Best-effort: processar inline (5.3); se lançar erro, evento fica processed=false para o cron
```

### 5.2 Polling de segurança — `btg-poll-status` (nova, cron */30min via pg_cron+pg_net, mesmo padrão de `sync-os-hub-incremental`)

- Borderôs `status='ENVIADO'`: consulta `GET /{cnpj}/banking/batch-payments/{btg_batch_id}` e
  reconcilia cada pagamento pelo `btg_payment_id` salvo (requer fix 5.5).
- `btg_pagamentos` em ENVIADO_BTG/AGUARDANDO_APROVACAO_BTG: consulta status individual.
- `btg_cobrancas` EMITIDO/REGISTERED vencendo/vencidas: consulta status.
- Reprocessa `btg_webhook_events` com `processed=false` há mais de 10 min.
- Dispara `conciliar-extrato.executar` + `btg-extrato.importar` (janela D-3..D) 1x/dia por empresa
  ativa — o extrato entra sozinho, sem botão.

Webhook é otimização de latência; **o polling garante consistência** (sandbox não emite webhook —
hoje o fluxo sandbox mocka tudo, ver `financeiro-lancamentos/index.ts:476-488`).

### 5.3 Processamento de eventos (compartilhado webhook/poll)

| Evento | Efeito |
|---|---|
| Pagamento PAGO | lançamento correlato (por `btg_payment_id`) → BAIXADO com data/valor do evento; se todos os lançamentos do borderô terminais → borderô PROCESSADO. **Aposenta o botão "Confirmar Processamento"** (mantido como fallback admin) |
| Pagamento REJEITADO/CANCELADO | lançamento → volta a AUTORIZADO + `requer_validacao=true` + observação com motivo; borderô → PROCESSADO_PARCIAL (novo status) |
| Cobrança PAGA | `btg_cobrancas` → PAGO; baixa lançamento RECEBER vinculado |
| DDA novo | mesmo fluxo do `btg-dda importar` (gera lançamento PREVISTO) |

A baixa via evento **não substitui** a fase 1 do motor: quando a linha correspondente do extrato
chegar, ela casa por referência forte com o pagamento já PAGO e recebe a alocação — os três lados
fecham.

### 5.4 Segurança do webhook

- Secret `BTG_WEBHOOK_SECRET` (Supabase secrets). Validação HMAC-SHA256 da assinatura conforme doc
  do BTG. **Pendência de descoberta**: confirmar no portal BTG o header/algoritmo exato e se há
  allowlist de IPs; até lá, exigir também um token estático na URL (`?t=<random>`) como defesa
  mínima em produção.
- Registrar a URL do webhook no portal BTG (passo manual de setup, documentar no
  `AdminBtgValidacaoPage`).

### 5.5 Fix obrigatório em `enviarBorderoBtg`

Capturar a resposta de cada `POST /batch-payments/{batchId}/payments` e gravar
`dados_extras.btg_payment_id` + `btg_batch_id` no lançamento. Se um POST falhar, hoje o erro é
silencioso (`financeiro-lancamentos/index.ts:553`) — passar a: marcar o lançamento com
`requer_validacao=true` + observação, e só dar PATCH PROCESS se ≥1 pagamento aceito.

---

## 6. UI — `BankingExtratoDashboard` vira fila de exceções

- Filtro padrão: `status_conciliacao = PENDENTE` (o trabalho), não a lista completa.
- Cada linha PENDENTE: badge de sugestões (`dados_extras.sugestoes`) com alvo, score e motivo →
  botões **Confirmar** / **Ver candidatos** / **Ignorar** / **Criar lançamento**.
- Remove o checkbox manual de `conciliado` (action `conciliar` legada fica só para o motor).
- KPIs: % conciliado por método (auto forte / auto tolerância / manual / regra), pendentes por
  idade (>7 dias em vermelho).
- Botão admin "Regras de tarifas" → CRUD simples de `extrato_regras_classificacao`.
- `FinanceiroOverviewPage`: card "Extrato pendente de conciliação (N)" ao lado dos alertas atuais.

---

## 7. Migração de dados existentes (backfill)

1. **Dedup do `btg_extrato` atual**: computar `dedupe_key` para todas as linhas; entre duplicatas,
   manter a mais antiga (preferindo qualquer uma com `conciliado=true`), apagar o resto **após
   relatório de contagem para conferência** (não deletar às cegas).
2. Linhas com `conciliado=true` e `referencia_id` → criar alocação retroativa
   (`alvo_tipo='LANCAMENTO'`, metodo MANUAL) e `status_conciliacao='CONCILIADO_MANUAL'`.
   `conciliado=true` sem referência → `CONCILIADO_MANUAL` com observação "legado sem referência".
3. Lançamentos com `origem='EXTRATO'` e `requer_validacao=true` (criados pelo auto-create antigo):
   listar em relatório para revisão humana — não tocar automaticamente.

---

## 8. Plano de entrega (5 etapas, cada uma útil sozinha)

| Etapa | Entrega | Depende de |
|---|---|---|
| **E1** | Migration (3.1-3.3) + dedup no `importar` + backfill (7) | — |
| **E2** | Fix `enviarBorderoBtg` (5.5) + `btg-poll-status` com cron → baixa automática por polling, borderô PROCESSADO sozinho | E1 |
| **E3** | Motor `conciliar-extrato` (fases 1-4) + RPC transacional + import diário automático | E1 |
| **E4** | UI fila de exceções + regras de tarifas + card no Overview | E3 |
| **E5** | `btg-webhook` + registro no portal BTG + validação HMAC | E2 (reusa processamento) |

E5 por último de propósito: o polling da E2 já entrega baixa automática; webhook só reduz latência
e depende de descoberta na doc BTG (5.4).

### Critérios de aceite

- Reimportar o mesmo período 3x → zero linhas novas.
- Borderô enviado em produção → lançamentos BAIXADOS com data/valor reais sem clique humano
  (polling ≤ 30 min; com E5, ≤ 1 min).
- Rejeição de pagamento → lançamento volta a AUTORIZADO com motivo visível no Hub.
- Crédito de cartão no extrato → recebível RECEBIDO + lançamentos de venda BAIXADOS + taxa lançada,
  tudo pela fase 2.
- Nenhum lançamento criado automaticamente fora de regra de tarifa cadastrada.
- Meta operacional: ≥ 80% das linhas do extrato conciliadas sem toque humano após 30 dias de regras
  ajustadas (medir no KPI por método).

### Testes

- Unit (Vitest): `dedupe_key` (estabilidade e colisão de PIX idênticos), waterfall com ambiguidade
  (2 candidatos empatados → não casa), tolerância de recebíveis, combinação de recebíveis (fase 2),
  regex de regras com `valor_max`.
- Integração (sandbox BTG): importar → executar → confirmar → desfazer; polling com batch mockado.
- O modo sandbox das functions já fornece fixtures (`btg-extrato/index.ts:316-325`) — estender com
  casos de duplicata e de crédito agregado de cartão.

---

## 9. Decisões e pendências

**Decididas nesta spec:**
- Extrato-cêntrico com tabela de alocação N:1 (`conciliacao_extrato`), não coluna.
- Motor nunca cria lançamento sem regra explícita (remove auto-create atual).
- Polling antes de webhook (consistência antes de latência).
- Efeitos de baixa via RPC transacional, não UPDATEs soltos.
- Tolerâncias: reuso do padrão existente (max(R$1, 1%)) para cartão; valor exato para lançamentos.

**Pendências de descoberta (não bloqueiam E1-E4):**
1. Formato de assinatura do webhook BTG (header, algoritmo) e disponibilidade de allowlist de IP.
2. Se o payload de statements do BTG em produção traz ID único por movimento (define camada 1 vs 2
   da dedupe_key — a camada 2 funciona de qualquer forma).
3. Como o BTG lança débitos de batch no extrato: 1 débito por pagamento ou agregado por batch
   (a fase 1 cobre o primeiro caso; se agregado, ativar matching por soma do batch — já previsto
   no modelo N:1).
