

## Plano: Corrigir WorkflowStepper — Lógica de Passo Ativo + Navegação por Clique

### Problemas

1. **Passo ativo calculado errado**: `getActiveStep()` usa lógica de "marco mais alto" — se existe **qualquer** borderô em MONTAGEM, pula direto para passo 3. Mas o usuário pode ter lançamentos em todos os estágios simultaneamente. O stepper deveria refletir **onde há mais trabalho pendente**, não o marco mais avançado.

2. **Steps não são clicáveis**: O stepper é puramente visual. Clicar em "Classificar" deveria filtrar a tabela para mostrar apenas os itens pendentes de classificação. Clicar em "Preparar Pgto" deveria filtrar os classificados sem dados de pagamento, etc.

### Solução

**A. Corrigir lógica do passo ativo**
- Trocar de "marco mais alto" para "onde há itens pendentes com prioridade":
  - Se há PREVISTOS sem conta → passo 2 (Classificar) é ativo
  - Se há classificados sem pagamento → passo 3 é ativo
  - Se não há pendências → passo mais avançado com contagem > 0
- Marcar como "completed" apenas os passos onde a contagem é 0 (nada pendente)

**B. Tornar steps clicáveis**
- Adicionar prop `onStepClick(stepNumber)` ao `WorkflowStepper`
- Cada step vira um `<button>` com cursor pointer e hover
- No Hub, ao clicar num step:
  - Steps 1-3 → mudam aba para "Contas a Pagar" + aplicam filtro de status na tabela
  - Steps 4-6 → mudam aba para "Borderôs" + filtram por status do borderô

**C. Filtro de status na tabela**
- Adicionar estado `statusFilter` no Hub
- `ContasPagarTable` recebe e aplica o filtro
- Badges nos steps indicam quantos itens precisam de ação

### Arquivos

| Arquivo | Alteração |
|---|---|
| `src/components/financeiro-hub/WorkflowStepper.tsx` | Adicionar `onStepClick` prop, steps como buttons clicáveis |
| `src/pages/FinanceiroHubPage.tsx` | Corrigir `getActiveStep()`, adicionar `statusFilter`, conectar clique do stepper à navegação de abas + filtro |
| `src/components/financeiro-hub/ContasPagarTable.tsx` | Receber e aplicar `statusFilter` opcional |

### O que NÃO muda
- Componentes `PrepararPagamentoSheet`, `BorderoGuidedActions`, `NovoLancamentoDialog`
- Backend / edge functions
- Estrutura de abas (Contas a Pagar / Borderôs / Contas a Receber)

