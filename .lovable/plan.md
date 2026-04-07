

## Plano: Reestruturar Contas a Pagar — Visão Unificada com Validação Inline

### Problema Central

A estrutura atual tem 3 abas separadas (Contas a Pagar, Agenda, Borderôs) que fragmentam o fluxo. A "Agenda" como aba separada não funciona para previsão de longo prazo — ela só mostra o que já foi classificado manualmente. O ERP já possui todas as contas futuras (parcelamentos, fornecedores fixos) que são a verdadeira previsão, mas hoje entram como "rascunhos" e ficam escondidos até serem classificados um a um.

### Solução: Eliminar a Aba Agenda, Unificar Tudo em "Contas a Pagar"

A ideia é tratar a aba "Contas a Pagar" como a **visão única e definitiva**, com agrupamento visual que separa claramente o que está validado do que está pendente. A aba "Agenda" é removida.

#### Nova Estrutura de Abas

```text
[ Contas a Pagar ]  [ Borderôs ]  [ Contas a Receber ]
```

#### Nova Organização da Aba "Contas a Pagar"

Dentro da aba, a tabela ganha **2 seções visuais** (como grupos colapsáveis):

1. **"Pendentes de Validação"** — status PREVISTO (importados do ERP, ainda não confirmados)
   - Fundo levemente amarelo/ambar
   - Ações: Validar (individual ou lote), Classificar, Cancelar
   - Checkbox + barra flutuante para ações em lote

2. **"Contas Validadas"** — status CLASSIFICADO, BORDERO, AUTORIZADO, PROCESSANDO
   - Visual limpo, agrupado por mês de vencimento com subtotais
   - Ações: Preparar Pgto, Criar Borderô, Baixa Manual, Reclassificar
   - Checkbox + barra flutuante

#### Mudança no Conceito de "Classificar"

Hoje, classificar = atribuir conta do plano de contas + mudar status para CLASSIFICADO. Proposta: manter essa lógica mas com nome mais claro na UI:

- Botão principal na seção de pendentes: **"Validar"** (que internamente faz classificar — atribui conta DRE + muda status)
- Para itens que já têm conta do ERP mapeada automaticamente: mostrar com ícone de "auto-classificado" e permitir **"Validar em Lote"** sem precisar escolher conta (mantém a classificação automática)

#### KPIs Atualizados

```text
[ Total Pendente ]  [ Total Validado ]  [ Em Borderô ]  [ Vencidos ]  [ Borderôs Abertos ]
```

- "Total Pendente" = soma dos PREVISTO (o que ainda precisa ser validado)
- "Total Validado" = soma dos CLASSIFICADO+ (a agenda oficial real)

#### Workflow Stepper Simplificado

```text
1. Importar/Cadastrar → 2. Validar → 3. Preparar Pgto → 4. Montar Borderô → 5. Aprovar → 6. Banco
```

Mudança: "Classificar" → "Validar" (mesmo efeito, nome mais intuitivo)

---

### Detalhamento Técnico

#### Arquivo: `src/pages/FinanceiroHubPage.tsx`

- Remover aba "Agenda" e o `TabsTrigger`/`TabsContent` correspondentes
- Remover import do `AgendaOficialTab`
- Passar novo prop `viewMode="unified"` para `ContasPagarTable`
- Ajustar KPIs: trocar "Agenda Oficial" por "Total Validado", "Rascunhos" por "Pendentes"
- Renomear step 2 do WorkflowStepper: "Classificar" → "Validar"
- Barra flutuante: renomear botão "Classificar" → "Validar"

#### Arquivo: `src/components/financeiro-hub/ContasPagarTable.tsx`

- Adicionar agrupamento visual: dividir a tabela em 2 seções
  - Seção "Pendentes" (PREVISTO) com header amarelo
  - Seção "Validados" (CLASSIFICADO+) agrupados por mês com subtotais
- Cada seção tem seu checkbox "selecionar todos"
- Itens BAIXADO e CANCELADO ficam no final, colapsáveis

#### Arquivo: `src/components/financeiro-hub/AgendaOficialTab.tsx`

- **Deletar** este arquivo (funcionalidade absorvida pela ContasPagarTable)

---

### Arquivos a Alterar

| Arquivo | Mudança |
|---|---|
| `src/pages/FinanceiroHubPage.tsx` | Remover aba Agenda, ajustar KPIs, renomear "Classificar"→"Validar" |
| `src/components/financeiro-hub/ContasPagarTable.tsx` | Adicionar agrupamento visual (Pendentes vs Validados por mês) |
| `src/components/financeiro-hub/AgendaOficialTab.tsx` | Deletar |
| `src/components/financeiro-hub/ClassificarLoteDialog.tsx` | Renomear labels para "Validar em Lote" |

### O que NÃO Muda

- Edge functions (financeiro-lancamentos) — mesma lógica de backend
- Fluxo de borderô (aprovar → enviar → confirmar)
- Plano de contas e classificação automática por prefixo
- PrepararPagamentoSheet
- Tabela `lancamentos_financeiros` (sem mudança no banco)

