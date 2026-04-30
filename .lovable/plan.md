# Portal de Conciliação de Cartões — Plano

## Contexto atual

Hoje temos:
- **9 lojas** configuradas com PVs REDE em produção (1 aprovada, 8 aguardando opt-in).
- **86 vendas** importadas em 5 lojas (1, 2, 4, 9, 15) — `vendas_cartao` com payload completo da REDE em `dados_extras` (NSU, TID, autorização, MDR, data prevista de crédito, parcelas, bandeira, captureType).
- **0 conciliações** feitas até agora; lado ERP tem `lancamentos_financeiros` com `forma_pagamento='CARTÃO'` (243 títulos só na loja 1).
- A página atual (`ConciliacaoCartoesPage`) é uma tabela linear, sem visão por loja nem por PV, e a conciliação automática só compara valor bruto.

## Objetivo

Transformar `/financeiro/conciliacao-cartoes` em um **hub de conciliação** com 3 níveis de navegação (Lojas → PVs → Transações), conciliação automática multi-critério e ações conectadas ao Hub Financeiro.

## Estrutura da nova página

```text
┌─────────────────────────────────────────────────────────────────┐
│ KPIs globais: Bruto · Líquido · Taxas · Conciliado% · Pendentes │
├─────────────────────────────────────────────────────────────────┤
│ Filtros: Período | Status | Bandeira | Adquirente               │
├─────────────────────────────────────────────────────────────────┤
│ TAB 1: Visão por Loja  │ TAB 2: Por PV  │ TAB 3: Transações     │
└─────────────────────────────────────────────────────────────────┘
```

### Tab 1 — Visão por Loja (default)
Tabela agregada com uma linha por `cod_empresa`:
- Nome da loja · # PVs ativos · # PVs com vendas no período · # PVs sem movimento
- Última sincronização · Status opt-in (badge: APROVADO / AGUARDANDO / ERRO)
- Vendas (qtd) · Bruto · Líquido · Taxas · Ticket médio
- % Conciliado (barra de progresso)
- Botões inline: **Sincronizar** (7d) · **Conciliar Auto** · **Detalhar**

### Tab 2 — Visão por PV (drill-down ao clicar numa loja)
Para a loja selecionada, lista cada PV (`pvs_matriz_production`):
- PV · Tem vendas? (✓/✗) · Última venda · Qtd · Bruto · Líquido
- Status opt-in individual + healthcheck
- Separação visual: **PVs com movimento** vs **PVs sem movimento** (collapse)
- Ação: re-testar PV individual

### Tab 3 — Transações (lista detalhada)
Versão melhorada da tabela atual:
- Linhas expansíveis mostrando payload REDE (NSU, TID, autorização, captureType, device, parcelas, MDR%)
- Coluna **Match ERP**: badge mostrando lançamento ERP correlacionado (ou "Sem match")
- Ação inline: **Conciliar manualmente** (abre sheet com candidatos do ERP)

## Conciliação automática (motor v2)

Edge function `conciliar-vendas` reescrita para casar `vendas_cartao` × `lancamentos_financeiros` por **score multi-critério**:

| Critério | Peso | Tolerância |
|---|---|---|
| Valor bruto | 40 | ±R$ 0,01 |
| Data (venda × emissão) | 25 | ±2 dias |
| Bandeira | 15 | exata |
| Parcelas | 10 | exata |
| Forma de pagamento contém "CARTÃO" | 10 | substring |

Score ≥ 80 → `CONCILIADO` automático
Score 50–79 → `DIVERGENTE` (revisão humana)
Score < 50 ou sem candidato → `PENDENTE_ERP`

Em caso de match único e exato, gera automaticamente:
- Lançamento de **taxa** (PAGAR, categoria `TAXA_ADQUIRENTE`) com `data_vencimento = data_prevista_credito`
- Lançamento de **recebível líquido** (RECEBER, categoria `RECEBIVEL_CARTAO`) ligado ao `venda_cartao_id`

## Integrações com o sistema

1. **Hub Financeiro** (`/financeiro/hub`): novo filtro "origem=ADQUIRENTE" mostra taxas e recebíveis gerados pela conciliação.
2. **Carteira de Recebíveis**: vendas conciliadas alimentam o cronograma de crédito previsto (D+30 padrão).
3. **Extrato BTG** (futuro): comparar `data_prevista_credito` com créditos reais no `btg_extrato`.
4. **Dashboard de Vendas**: badge "Cartão conciliado %" por loja.

## Detalhes técnicos

**Frontend (`ConciliacaoCartoesPage.tsx`)**
- 3 tabs com `Tabs` do shadcn; estado de loja selecionada compartilhado entre Tab 1 e Tab 2.
- Hook novo `useConciliacaoCartoes(periodo)` agregando vendas_cartao + adquirentes_config + conciliacao_vendas em uma só query (RPC ou múltiplas queries paralelas).
- Visão por PV usa `dados_extras->merchant->companyNumber` para identificar qual PV originou cada venda.
- Botões "Sincronizar todas" e "Conciliar todas" no header (mass action).

**Backend**
- `conciliar-vendas` (edge): novo motor de score (descrito acima).
- `sync-vendas-cartao` (edge existente): adicionar parâmetro `per_pv: true` para retornar breakdown por PV no resultado, persistir em `dados_extras.merchant.companyNumber`.
- View SQL `v_conciliacao_loja_resumo` agregando KPIs por loja para evitar N+1.
- Não precisa de migration de schema (`vendas_cartao.dados_extras` já tem o `merchant.companyNumber`).

**Tabelas envolvidas (sem alterações de schema)**
- `vendas_cartao` (source)
- `lancamentos_financeiros` (alvo do match)
- `conciliacao_vendas` (resultado)
- `adquirentes_config` (PVs por loja)
- `empresa` (nomes)

## Entregáveis

1. `src/pages/ConciliacaoCartoesPage.tsx` reescrita com 3 tabs e drill-down.
2. `src/hooks/useConciliacaoCartoes.ts` novo hook agregador.
3. `src/components/conciliacao-cartoes/` novos componentes: `LojasResumoTable`, `PvsBreakdownTable`, `TransacaoExpandedRow`, `ConciliarManualSheet`.
4. `supabase/functions/conciliar-vendas/index.ts` motor de score multi-critério + geração automática de lançamentos.
5. View SQL `v_conciliacao_loja_resumo` (migration).
6. Ajuste em `sync-vendas-cartao` para retornar resumo por PV.

## Fora deste plano (próximos passos)

- Conciliação contra extrato BTG (créditos reais).
- Antecipação de recebíveis e cálculo de custo financeiro.
- Alertas automáticos de divergência de MDR.
