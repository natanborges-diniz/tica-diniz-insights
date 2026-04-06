## Plano: Reformular Classificação → Contas a Pagar — Planejado

### Problema atual
- A página usa listas **hardcoded** (NATUREZAS/CATEGORIAS) em vez da tabela `dre_plano_contas`
- Não oferece visão de previsibilidade — só mostra pendentes de validação
- Redundante com a funcionalidade de edição já presente no Hub

### O que muda

**1. Novo propósito da página** — Painel "Contas a Pagar — Planejado"
- KPIs no topo: Total PREVISTO, Total CLASSIFICADO, Pendentes de Validação, Total Planejado (soma)
- Tabela com todos lançamentos tipo PAGAR em status PREVISTO ou CLASSIFICADO
- Agrupamento visual por conta (subcategoria) com totais
- Filtros: mês/ano, status (PREVISTO/CLASSIFICADO/todos)

**2. Classificação inline usa `dre_plano_contas`**
- Eliminar listas hardcoded NATUREZAS/CATEGORIAS
- Select de conta carrega da tabela `dre_plano_contas` (mesmo padrão do Hub)
- Ao selecionar conta → auto-preenche natureza + categoria (read-only)
- Botão "Classificar" altera status de PREVISTO → CLASSIFICADO

**3. Ação em lote**
- Checkbox de seleção múltipla para classificar vários de uma vez (mesma conta)

### Arquivos alterados

| Arquivo | Alteração |
|---|---|
| `src/pages/FinanceiroClassificacaoPage.tsx` | Rewrite completo → painel planejado com KPIs + tabela + classificação via `dre_plano_contas` |

### O que NÃO muda
- Tabela `lancamentos_financeiros` (sem migração)
- Edge function `financeiro-lancamentos`
- Hub e demais páginas financeiras
