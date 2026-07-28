# SPEC P2 — Ledger Único (fonte de verdade de títulos)

> Derivada do `MAPEAMENTO_FINANCEIRO.md` (P2) e ancorada no código em 2026-07-28.
> Objetivo: `lancamentos_financeiros` vira a fonte única de títulos. Sync ERP→ledger
> automático com chave dura, telas lendo só do ledger, e o motor de conciliação 3 vias
> (P1) passa a ter o "outro lado" para casar linhas do extrato.

---

## 1. Estado atual (verificado no código — difere do mapeamento de 03/jul)

O que **já migrou** para o ledger desde o mapeamento:

| Consumidor | Fonte hoje | Arquivo |
|---|---|---|
| DRE | ✅ ledger (`financeiro-relatorios.gerar_dre`) | `financeiro-relatorios/index.ts:55` |
| Fluxo de Caixa | ✅ ledger (`financeiro-relatorios.fluxo_caixa`) | `src/services/fluxoCaixaService.ts` |
| Overview | ✅ ledger (`resumo_financeiro`) | `FinanceiroOverviewPage` |
| Dashboard de Parcelas | ⚠️ `parcelas_cache` (espelho ERP) | `src/services/financeiroService.ts:91` |
| Hub / borderôs / conciliação P1 | ✅ ledger | — |

O que **está quebrado ou frouxo**:

1. **Ledger vazio na prática.** O import ERP→ledger existe (`importar_erp_auto` em
   `financeiro-lancamentos/index.ts:~850`) mas é manual (botão), e ninguém o roda.
   Consequência direta observada em produção: o motor P1 não sugere nada, porque não
   há títulos para casar com o extrato.
2. **Chave frouxa no import**: `origem_id = 'ERP-{emp}-{documento}'` — colide quando o
   mesmo documento tem N parcelas (só a primeira entra; as demais viram `skipped`).
3. **`parcelas_cache` joga fora a chave dura.** A bridge (`queries/financeiro/
   financeiro_parcelas.sql`) já retorna `cod_lancamento` e `parcela_id`
   (`fp.cod_lancamentoparcela`, PK da parcela no Firebird), além de `pessoa_cod_pessoa`,
   `parcela_valor_original` e `parcela_data_recebimento` — e o `sync-parcelas` não grava
   nenhum deles. A unique atual `(cod_empresa, tipo_lancamento, documento,
   data_vencimento, valor)` duplica a parcela quando o ERP renegocia valor/vencimento.
4. **DRE realizado ignora pagamentos feitos fora do BTG** (caixa da loja, débito
   automático): esses títulos só existem no ERP como `PAGA`, nunca entram no ledger
   como BAIXADO.

## 2. Conceito

**O ERP continua sendo o registro de entrada** (Firebird é read-only via bridge — não
há write-back). **O ledger é a fonte de verdade de gestão**: tudo que o ERP sabe entra
nele automaticamente, com identidade estável, e é enriquecido pelo que só o ledger
sabe (classificação DRE, borderô, BTG, conciliação bancária do P1).

```
Firebird (ERP) ──sync-parcelas──▶ parcelas_cache ──sync-ledger──▶ lancamentos_financeiros
   registro de entrada              espelho fiel                     fonte de gestão
                                    (+ chave dura)                   (DRE, fluxo, Hub, motor P1)
```

**Chave dura**: `origem='ERP'`, `origem_id = 'ERP:{cod_empresa}:{parcela_id}'`
(parcela_id = `cod_lancamentoparcela`, imutável no Firebird). Um título ERP = um
lançamento, para sempre, mesmo com renegociação de valor/vencimento.

**Regra de precedência de estado** (evita o sync brigar com o P1/BTG):

| Estado no ledger | ERP diz PAGA | ERP diz EM ABERTO |
|---|---|---|
| PREVISTO | → BAIXADO (data/valor do ERP, `baixa_automatica='sync-ledger'`) | atualiza valor/vencimento |
| CLASSIFICADO/BORDERO/AUTORIZADO/PROCESSANDO | → BAIXADO **com `requer_validacao=true`** (pago por fora no meio do workflow — humano confere) | não toca |
| BAIXADO (por BTG/extrato/humano) | não toca (já fechado) | **não reabre** — diverge? loga em `dados_extras.divergencia_erp` |
| CANCELADO | não toca | não toca |

Classificação no sync: `autoClassify` já existente (plano de contas por `conta_numero`
com fallback de prefixo — `financeiro-lancamentos/index.ts:800`) — mover para
`_shared/` e reusar. Fornecedor de produto cai em `CUSTO_MERCADORIA` via contas 3.8.x.

---

## 3. Modelo de dados (1 migration)

### 3.1 `parcelas_cache` — guardar a chave dura

```sql
ALTER TABLE public.parcelas_cache
  ADD COLUMN IF NOT EXISTS cod_lancamento BIGINT,
  ADD COLUMN IF NOT EXISTS parcela_id BIGINT,          -- fp.cod_lancamentoparcela
  ADD COLUMN IF NOT EXISTS cod_pessoa BIGINT,
  ADD COLUMN IF NOT EXISTS valor_original NUMERIC,
  ADD COLUMN IF NOT EXISTS data_recebimento DATE;

-- Nova identidade (parcial: legado sem parcela_id continua coberto pela antiga)
CREATE UNIQUE INDEX IF NOT EXISTS uq_parcelas_cache_parcela
  ON public.parcelas_cache (cod_empresa, parcela_id) WHERE parcela_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_parcelas_cache_lancamento
  ON public.parcelas_cache (cod_empresa, cod_lancamento);
```

A unique antiga fica até o primeiro sync completo popular `parcela_id`; depois uma
migration de limpeza remove duplicatas legadas (mesma parcela_id, linhas antigas sem
ela) e pode aposentar a constraint velha.

### 3.2 `lancamentos_financeiros` — vínculo com a parcela

```sql
ALTER TABLE public.lancamentos_financeiros
  ADD COLUMN IF NOT EXISTS erp_parcela_id BIGINT,
  ADD COLUMN IF NOT EXISTS erp_cod_lancamento BIGINT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_lanc_erp_parcela
  ON public.lancamentos_financeiros (cod_empresa, erp_parcela_id)
  WHERE erp_parcela_id IS NOT NULL;
```

`origem_id` novo: `ERP:{cod_empresa}:{parcela_id}`. O formato legado
(`ERP-{emp}-{documento}`) é migrado no backfill (§6).

---

## 4. `sync-ledger` — nova edge function (cron)

Function separada do `sync-parcelas` (responsabilidade única: cache→ledger; roda mesmo
que o sync do cache falhe, e vice-versa). Cron via pg_cron+pg_net a cada 30 min,
padrão `sync-os-hub-incremental`, logo após o horário típico do `sync-parcelas`.

Algoritmo (por empresa ativa):

1. Lê `parcelas_cache` com `parcela_id IS NOT NULL` e `cache_loaded_at` recente
   (janela incremental; `mode=full` para backfill).
2. Para cada parcela, upsert no ledger por `(cod_empresa, erp_parcela_id)`:
   - **Não existe** → INSERT: tipo (PAGAR/RECEBER), valor, vencimento, emissão,
     pessoa_nome, forma_pagamento, `natureza/categoria/subcategoria` via `autoClassify`
     (conta do ERP), `origem='ERP'`, `origem_id='ERP:{emp}:{parcela_id}'`,
     `dados_extras.conta_numero/conta_descricao`, status PREVISTO — ou BAIXADO direto
     se o ERP já diz PAGA (com data_pagamento/valor_pago do ERP).
   - **Existe** → aplica a tabela de precedência (§2). Atualizações de valor/vencimento
     só em estados pré-borderô.
3. Cross-match DDA (reusa a lógica do `importar_erp_auto`) só para inserts PAGAR.
4. Resultado logado: `{inseridos, baixados_erp, atualizados, divergencias, skipped}`.

O botão "Importar ERP" do Hub passa a chamar `sync-ledger` (mode=full na janela da
tela) — `importar_erp_auto` é aposentado após o backfill.

---

## 5. Telas (depois do sync no ar)

- **Dashboard de Parcelas** (`/financeiro/parcelas`): passa a ler do ledger
  (`financeiro-lancamentos.listar`) com os mesmos filtros; `parcelas_cache` vira
  detalhe de implementação do sync. Alternativa mais agressiva (absorver no Hub) fica
  para o P5 — aqui só trocamos a fonte.
- **Hub**: aba RECEBER habilitada em leitura (títulos RECEBER agora existem no ledger);
  gestão ativa de recebimento continua P4.
- **Overview/DRE/Fluxo**: já leem do ledger — nenhuma mudança além de conferir
  volumetria pós-backfill.
- **Motor P1**: zero mudança de código — a fase 3 passa a ter candidatos; pagamentos
  de fornecedor no extrato começam a sugerir o título do ERP em vez de exigir
  "Criar lançamento".

---

## 6. Backfill e migração do legado

1. `sync-parcelas mode=backfill` (janela 24m emissão) para popular a chave dura no cache.
2. Migrar lançamentos com `origem_id` legado `ERP-{emp}-{documento}`: casar com o cache
   por (empresa, documento, vencimento, valor) → preencher `erp_parcela_id` + novo
   `origem_id`. Ambíguos (documento com N parcelas de mesmo valor/venc): relatório para
   revisão, não tocar às cegas.
3. Rodar `sync-ledger mode=full`. Volumetria esperada: nº de títulos em aberto do ERP
   ≈ nº de lançamentos PREVISTO com origem ERP.
4. Só então: trocar a fonte do Dashboard de Parcelas (§5).

---

## 7. Plano de entrega

| Etapa | Entrega | Depende de |
|---|---|---|
| **E1** | Migration (§3) + `sync-parcelas` gravando chave dura + backfill do cache | — |
| **E2** | `sync-ledger` (função + cron + precedência §2) + `autoClassify` em `_shared/` + testes | E1 |
| **E3** | Backfill do ledger + migração origem_id legado (§6) + aposentar `importar_erp_auto` | E2 |
| **E4** | Dashboard de Parcelas lendo do ledger + aba RECEBER (leitura) no Hub | E3 |

### Critérios de aceite

- Rodar `sync-ledger` 3x seguidas → zero inserts novos (idempotência).
- Documento com 4 parcelas no ERP → 4 lançamentos no ledger (mata o bug da chave frouxa).
- Renegociação no ERP (valor/vencimento) → mesmo lançamento atualizado, não duplicado.
- Parcela paga no caixa da loja → BAIXADO no ledger em ≤ 1 ciclo de cron; DRE realizado
  reflete sem toque humano.
- Título BAIXADO via conciliação P1 não é reaberto nem duplicado pelo sync.
- Linha de débito de fornecedor no extrato → motor P1 sugere o título ERP (score ≥ 70).

### Testes

- Unit (Vitest, módulo puro `_shared/ledgerSync.ts`): precedência de estados (tabela
  §2 completa), montagem de origem_id, atualização vs. não-toque, classificação via
  autoClassify com fallback de prefixo.
- Integração: fixture de parcelas_cache com documento multi-parcela, renegociação e
  parcela PAGA; rodar sync 2x e conferir idempotência.

---

## 8. Decisões e pendências

**Decididas nesta spec:**
- ERP = registro de entrada; ledger = fonte de verdade de gestão (sem write-back ao
  Firebird — baixas do ledger não voltam ao ERP; divergências ficam visíveis, não
  silenciosas).
- Chave dura = `cod_lancamentoparcela` do Firebird, escopada por empresa.
- Sync nunca reabre nem re-baixa o que o P1/BTG já fechou.
- Dashboard de Parcelas troca de fonte, não morre (absorção no Hub é P5).

**Pendências de descoberta:**
1. `cod_lancamentoparcela` é globalmente único no Firebird ou por empresa? (a chave
   escopada por empresa funciona nos dois casos — só afeta simplificação futura)
2. Volumetria do backfill 24m (se >50k títulos, paginar o `sync-ledger mode=full`).
3. Situações do ERP além de PAGA/EM ABERTO/EM ATRASO (ex.: cancelamento/estorno no
   Firebird — hoje o SQL da bridge não expõe; se existir, mapear para CANCELADO).
