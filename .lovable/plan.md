
## Plano: Reorganizar Hub Financeiro — UX Limpa e Intuitiva

### Problemas identificados

1. **Ações confusas na tabela**: Cada linha PREVISTO mostra "Autorizar", "Configurar Pagamento", "Classificar", "Cancelar", "Baixa Manual" — tudo junto, sem hierarquia visual. O usuário não sabe o que fazer primeiro.
2. **"Autorizar" individual não faz sentido**: O fluxo definido é via Borderô (lote), mas existe um botão "Autorizar" avulso que pula o fluxo.
3. **Listas hardcoded obsoletas**: `NATUREZAS` e `CATEGORIAS` (linhas 90-102) ainda existem no Hub — lixo que deveria usar `dre_plano_contas`.
4. **Classificação duplicada**: A página `/financeiro/classificacao` e o dialog de edição no Hub fazem a mesma coisa com UIs diferentes.
5. **Sidebar fragmentado**: "Lançamentos" e "Classificação" são itens separados para funções que deveriam estar integradas.
6. **Página monolítica**: 1364 linhas num único arquivo, difícil de manter.

### Solução

Unificar tudo no Hub com 3 abas claras e eliminar a página de Classificação separada.

```text
Hub Financeiro (página única)
├── [Aba] Contas a Pagar    ← foco: classificar + preparar pagamento
├── [Aba] Borderôs          ← foco: lotes, aprovação, envio ao banco  
└── [Aba] Contas a Receber  ← foco: recebíveis (futuro)
```

### Mudanças detalhadas

**1. Reestruturar abas do Hub**
- Renomear aba "Lançamentos" → "Contas a Pagar" (filtro `tipo=PAGAR` fixo)
- Mover KPIs de previstos/classificados/pendentes para dentro desta aba
- Manter aba "Borderôs" como está

**2. Simplificar ações por linha (Contas a Pagar)**
- Cada linha mostra no máximo 2 ações visíveis + menu "..." para ações secundárias:
  - **Sem classificação**: Botão primário "Classificar" (abre sheet lateral com select do plano de contas)
  - **Classificado, sem pagamento**: Botão "Preparar Pgto" (abre sheet de PIX/boleto/TED)
  - **Pronto para lote**: Checkbox para seleção de borderô
  - **Ações secundárias** (menu ...): Baixa Manual, Cancelar, Reabrir
- **Remover** o botão "Autorizar" individual — autorização é exclusiva do fluxo de borderô

**3. Eliminar lixo**
- Remover arrays `NATUREZAS` e `CATEGORIAS` hardcoded (linhas 90-102)
- No dialog "Novo Lançamento", substituir selects de natureza/categoria por select único do `dre_plano_contas` (igual ao dialog de edição)
- Remover a página `FinanceiroClassificacaoPage.tsx` inteira
- Remover rota `/financeiro/classificacao` do `App.tsx`
- Remover item "Classificação" do sidebar

**4. Componentizar**
- Extrair a tabela de Contas a Pagar para `src/components/financeiro-hub/ContasPagarTable.tsx`
- Extrair o dialog de novo lançamento para `src/components/financeiro-hub/NovoLancamentoDialog.tsx`
- Manter componentes existentes (`BorderoGuidedActions`, `PrepararPagamentoSheet`, `WorkflowStepper`)

**5. Sidebar limpo**
```text
Hub Financeiro
├── Visão Geral
│   └── Overview Financeiro
├── Hub Financeiro
│   └── Contas a Pagar          ← (era "Lançamentos")
│   └── Conciliação Cartões
│   └── Carteira Recebíveis
│   └── Links de Pagamento
├── Análises
│   └── ...
```

**6. Padronização visual**
- Todas as descrições, nomes de conta e fornecedores em UPPERCASE
- WorkflowStepper responsivo (empilhar em mobile)
- Ações com ícones consistentes + tooltips

### Arquivos

| Arquivo | Ação |
|---|---|
| `src/pages/FinanceiroHubPage.tsx` | Refatorar: 3 abas, remover NATUREZAS/CATEGORIAS, simplificar ações, usar plano de contas no "Novo Lançamento" |
| `src/components/financeiro-hub/ContasPagarTable.tsx` | **Novo** — tabela extraída com ações contextuais |
| `src/components/financeiro-hub/NovoLancamentoDialog.tsx` | **Novo** — dialog extraído usando `dre_plano_contas` |
| `src/pages/FinanceiroClassificacaoPage.tsx` | **Deletar** |
| `src/App.tsx` | Remover rota `/financeiro/classificacao` |
| `src/components/layout/AppSidebar.tsx` | Remover "Classificação", renomear "Lançamentos" → "Contas a Pagar" |
| `src/components/financeiro-hub/WorkflowStepper.tsx` | Tornar responsivo (flex-wrap em mobile) |

### O que NÃO muda
- Lógica de backend (edge functions)
- Tabela `lancamentos_financeiros` / `borderos`
- Fluxo de borderô (aprovar → enviar → confirmar)
- Componentes `PrepararPagamentoSheet` e `BorderoGuidedActions`
