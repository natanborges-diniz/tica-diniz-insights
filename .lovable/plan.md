

## Plano: Adicionar Ações na Aba Agenda

### Problema

A aba "Agenda" é apenas leitura — mostra as contas classificadas mas não oferece nenhuma ação. O usuário fica preso: classificou as contas, vê elas na Agenda, mas não consegue avançar para o próximo passo (preparar pagamento, criar borderô).

### Solução

Adicionar **checkboxes + barra flutuante** na Agenda, permitindo selecionar contas classificadas e executar ações:

1. **Checkboxes nas linhas da Agenda** — somente para itens com status `CLASSIFICADO` (itens já em borderô/autorizado não devem ser re-selecionados)
2. **Barra flutuante compartilhada** — a mesma barra já existente no Hub funciona para seleções feitas na Agenda
3. **Ação principal: "Criar Borderô"** — seleciona contas classificadas na Agenda e monta o lote de pagamento
4. **Ação "Preparar Pgto"** — ao clicar numa linha individual, abre o sheet de preparar pagamento (preencher dados bancários/linha digitável) antes de montar o borderô

### Mudanças por arquivo

| Arquivo | Mudança |
|---|---|
| `src/components/financeiro-hub/AgendaOficialTab.tsx` | Adicionar checkboxes nas linhas CLASSIFICADO, prop `selectedIds`/`onToggleSelect`/`onToggleSelectAll`, botão "Preparar Pgto" por linha, e ação contextual "Reclassificar" |
| `src/pages/FinanceiroHubPage.tsx` | Passar props de seleção para AgendaOficialTab (reutiliza o mesmo `selectedIds` state), garantir que a barra flutuante funcione em ambas as abas |

### Comportamento

- Selecionar itens na Agenda → barra flutuante aparece com "Criar Borderô" e "Classificar" (para reclassificar)
- Clicar em "Preparar Pgto" numa linha → abre PrepararPagamentoSheet para preencher dados de pagamento
- Itens já em BORDERO/AUTORIZADO aparecem na Agenda mas sem checkbox (apenas visualização do status)
- Ao trocar de aba, a seleção é limpa para evitar confusão

### O que NÃO muda
- Lógica de backend / edge functions
- Barra flutuante (já existe, apenas passa a funcionar em ambas as abas)
- Fluxo de borderô existente

