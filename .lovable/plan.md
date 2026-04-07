

## Plano Atualizado: Ações em Lote + Dashboard de Contas Classificadas + DRE por Competência

### Resumo

Além das ações em lote (classificar, cancelar) e da correção do DRE por competência, adicionar uma **visão/dashboard das contas classificadas** — a "Agenda Oficial de Contas a Pagar".

---

### Parte A — Ações em Lote (barra flutuante)

1. **Edge function `financeiro-lancamentos`**: adicionar actions `classificar_lote` e `cancelar_lote`
   - `classificar_lote`: recebe `ids[]`, `natureza`, `categoria`, `subcategoria` → atualiza campos + muda status para `CLASSIFICADO`
   - `cancelar_lote`: recebe `ids[]` → muda status para `CANCELADO`

2. **Barra flutuante no Hub** (`FinanceiroHubPage.tsx`):
   - Aparece `fixed bottom-4` quando `selectedIds.size > 0`
   - 3 botões: **Classificar** (abre dialog com seletor do plano de contas), **Criar Borderô** (existente), **Cancelar** (confirma e descarta)
   - Mostra contagem e valor total selecionado

3. **Dialog de classificação em lote**: mesmo seletor de conta já usado na classificação individual (plano de contas), aplica a todos os selecionados

---

### Parte B — Dashboard "Agenda Oficial" (contas classificadas)

Nova aba **"Agenda"** no Hub (entre "Contas a Pagar" e "Borderôs"), exibindo apenas lançamentos com status `CLASSIFICADO` ou superior (exceto CANCELADO). Isso representa a visão validada e editada pelo gestor.

**Conteúdo da aba Agenda:**

| Elemento | Descrição |
|---|---|
| **KPIs no topo** | Total classificado (validado), Total em borderô, Total autorizado, Total geral da agenda |
| **Agrupamento por mês** | Contas agrupadas por mês de vencimento (ex: "Abril 2026", "Maio 2026") com subtotal por grupo |
| **Tabela por grupo** | Conta (subcategoria), Fornecedor, Vencimento, Valor, Status — com visual limpo e profissional |
| **Filtros** | Mês, categoria/natureza, faixa de valor |
| **Totalizadores** | Subtotal por mês + total geral no rodapé |

Essa visão NÃO mostra PREVISTOS (rascunhos). Somente contas que passaram pela triagem.

**Diferença entre abas:**
- **Contas a Pagar** = visão operacional de triagem (todos os status, foco em classificar e preparar)
- **Agenda** = visão gerencial da previsão oficial (só classificados+, agrupados por mês)
- **Borderôs** = visão de lotes para aprovação e envio ao banco

---

### Parte C — DRE por Competência

1. **Edge function `financeiro-relatorios`** (action `dre`): trocar filtro de `data_pagamento` → `data_emissao` e derivar competência de `data_emissao.substring(0,7)`
2. Manter `valor_pago ?? valor` para o montante

---

### Parte D — KPIs do Hub separando rascunho vs validado

Ajustar os KPIs existentes:
- "Total a Pagar" passa a considerar apenas CLASSIFICADO+ (excluindo PREVISTO e CANCELADO)
- Adicionar KPI "Rascunhos Pendentes" com a contagem de PREVISTOS

---

### Arquivos a alterar

| Arquivo | Mudança |
|---|---|
| `supabase/functions/financeiro-lancamentos/index.ts` | Adicionar `classificar_lote` e `cancelar_lote` |
| `supabase/functions/financeiro-relatorios/index.ts` | DRE: `data_pagamento` → `data_emissao` |
| `src/pages/FinanceiroHubPage.tsx` | Nova aba "Agenda", barra flutuante de ações em lote, dialog classificação em lote, KPIs ajustados |
| `src/components/financeiro-hub/ContasPagarTable.tsx` | Nenhuma mudança significativa |

### O que NÃO muda
- Fluxo de borderô (aprovar → enviar → confirmar)
- Classificação individual (continua funcionando)
- Fluxo de caixa (continua usando data_pagamento)
- Componentes `PrepararPagamentoSheet`, `BorderoGuidedActions`

