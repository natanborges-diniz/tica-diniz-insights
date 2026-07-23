# Comparação — financeiro local (E1/E2/E3) vs. trabalho do Lovable no origin/main

**Data:** 2026-07-23
**Contexto:** o merge de origin/main na feature branch preservou os 4 commits locais de financeiro. Antes de decidir descarte, comparação objetiva do escopo de cada lado.

## Origem

**Local (main local, nunca pushado — memória diz "Push travado por rede local" em 2026-07-03):**
- `c967189` docs(financeiro): mapeamento completo + spec P1
- `255be9a` E1 — dedup do extrato + fundação
- `69bee15` E2 — retorno automático BTG via polling
- `35a0778` E3 — motor conciliar-extrato (waterfall 4 fases)

**Lovable no origin/main** (subset relevante):
- `341a38f` Criou view conciliação e páginas
- `d3f695e` Sync and enhance reconciliations
- Vários `Sprint 4 implemented`, `Preceding changes`, `Add batch actions to lancamentos`
- `a74ca12` Revise BTG banking APIs and UI
- `f6d3027` Atualizou BTG Extrato / `d6a86dd` Fix sandbox BTG mocks
- `7a95d97` Integrate Extrato BTG phase5
- `bc5cd66` BTG dda reconciled

## O que cada lado entrega

| Camada / responsabilidade | Local (E1/E2/E3) | Lovable |
|---|---|---|
| Baixar extrato BTG (parsing, auto-fetch) | modificou `btg-extrato/index.ts` (extraiu helpers pra `_shared/btgExtrato.ts`) | modificou `btg-extrato/index.ts` (parsing melhorado, auto-fetch, Sprint 4 phase5) |
| Polling automático para novos extratos | **novo** `btg-poll-status/index.ts` (453 linhas) + migration `20260703121000` (cron) | (não vi equivalente) |
| Deduplicação de linhas do extrato | migration `20260703120000` (dedup + fundação) | ? |
| Motor de conciliação bancária (extrato ↔ ledger ↔ recebíveis cartão) | **novo** `conciliar-extrato/index.ts` (461 linhas) + `_shared/conciliacaoMotor.ts` (309 linhas, puro, 24 testes) + migration `20260703122000` (RPCs `fn_conciliar_extrato` / `fn_desconciliar_extrato` + cron do motor) | (não vi equivalente) |
| Motor de conciliação de vendas de cartão (POS ↔ ERP) | (não fez) | **novo** `conciliar-vendas/index.ts` (244 linhas) — score multi-critério: valor(40) + data(25) + bandeira(15) + parcelas(10) + forma(10) |
| Batch actions / agenda no `financeiro-lancamentos` | E2 tocou o arquivo (retorno automático BTG via polling) | tocou o arquivo (batch actions, filter by due date, oficial agenda) |
| DRE / plano de contas | — | `dre_plano_contas` table + views |
| BTG DDA reconciled | — | commits `bc5cd66`, `a3fa4fe` |
| Docs de mapeamento e spec | `docs/MAPEAMENTO_FINANCEIRO.md` (155 linhas) + `docs/SPEC_P1_CONCILIACAO_3VIAS.md` (356 linhas) | (não vi doc equivalente) |
| Views de UI para conciliação | (não fez) | `341a38f` Criou view conciliação e páginas |

## Leitura funcional

**Não são substitutos.** São **camadas complementares** da cadeia contábil:

```
POS/PDV → conciliar-vendas (Lovable) → parcelas no ERP
                                              ↓
                                    conciliar-extrato (local) → linha do extrato bancário
                                              ↓
                                       ledger financeiro
```

- **Conciliar-vendas (Lovable):** cliente paga no cartão → o adquirente processa → precisa bater a venda do POS com o registro que o ERP gerou. Trabalho de conciliação de **entrada de vendas**.
- **Conciliar-extrato (local):** o banco (BTG) recebe crédito da adquirente → linha aparece no extrato → precisa bater essa linha do extrato com os recebíveis já existentes no ERP + com o ledger financeiro. Trabalho de conciliação **bancária**.

**Ambos precisam existir** para fechar o ciclo. Um sem o outro deixa o ledger com pontas soltas.

## Overlap na área comum

Três arquivos foram tocados por ambos os lados:

1. **`btg-extrato/index.ts`** — merge auto-resolveu:
   - Local (E1) extraiu `flattenStatements` / `normalizeMovement` / `assignDedupeKeys` para `_shared/btgExtrato.ts` (import externo)
   - Lovable melhorou parsing e adicionou auto-fetch
   - Git escolheu preservar minha versão modularizada + as melhorias do Lovable em partes disjuntas do arquivo. **Testes passam, mas não há suíte de integração cobrindo o edge function em tempo de execução — merge pode ter juntado semânticas conflitantes silenciosamente.** Vale um smoke test antes de deploy.

2. **`financeiro-lancamentos/index.ts`** — E2 (retorno automático BTG) + Lovable (batch actions + filtros). Provavelmente adições em áreas diferentes. Merge OK sem conflito.

3. **`btg-poll-status/index.ts`** — só existe no local; Lovable não fez polling.

## Migrations locais que agora entram junto se o merge for pra main

3 migrations do E1/E2/E3 (`20260703120000/121000/122000`) que **NUNCA foram aplicadas** no Supabase remoto (memória diz "Pendente aplicar no Supabase remoto"). Se o merge for pra main:
- Migrations SQL passam a existir no repo
- Deploy via Lovable pode tentar aplicar essas migrations
- **Risco:** essas migrations criam tabelas/RPCs (`fn_conciliar_extrato`, `fn_desconciliar_extrato`, tabelas de conciliação, crons). Se o Lovable já criou tabelas similares mas com outra estrutura, aplicação simultânea pode dar erro.
- **Ação preventiva:** revisar as 3 migrations manualmente contra o schema atual do Supabase remoto antes de qualquer merge/deploy.

## Recomendação para decisão do stakeholder

Três opções, do mais conservador ao mais agressivo:

**A. Preservar tudo local + integrar com Lovable (recomendado).** Local não é redundante. O trabalho de conciliação bancária + polling + dedup é útil e original. Mas antes de merge na main:
- Smoke test do `btg-extrato/index.ts` merge
- Revisar as 3 migrations E1/E2/E3 contra o schema atual do Supabase
- Testar `btg-poll-status` e `conciliar-extrato` fim-a-fim se possível

**B. Preservar só o motor puro + docs, refazer edge functions.** Se as edge functions do local tiverem sido superadas por qualquer coisa que o Lovable fez em phases posteriores (não me aprofundei em todas), preservar:
- `_shared/conciliacaoMotor.ts` (motor testável — 24 testes)
- `_shared/btgExtrato.ts` (helpers)
- Docs de mapeamento e spec
- Testes de `conciliacaoMotor`

Descartar edge functions locais e reimplementá-las quando/se for necessário.

**C. Descartar tudo local.** Só faz sentido se o stakeholder decidir que a conciliação bancária extrato-cêntrica não é mais prioridade, ou se algum trabalho futuro do Lovable já cobriu isso. Requer verificação.

Sem confirmação do stakeholder, **não descarto nada**. Merge da feature na main permanece pendente até essa decisão + auditoria sync-estoque-* concluída.
