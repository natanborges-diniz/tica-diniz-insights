
## Objetivo

No Dashboard de Vendas, adicionar uma nova análise que permita **comparar qualquer mês contra qualquer outro mês** (independente do ano), usando o mesmo filtro de empresa e a mesma bateria de indicadores já usados no Comparativo Anual (Faturamento, Venda Bruta, Desconto, % Desconto, Qtd. Transações, Ticket Médio).

Hoje o dashboard já tem o "Comparativo Anual" (mesmo período em anos diferentes). Falta a granularidade mês-a-mês.

## Como o usuário vai usar

1. Abre `/vendas`, aplica os filtros normais (empresa, período).
2. Um novo card **"Comparativo Mensal"** aparece abaixo do Comparativo Anual.
3. Escolhe o **indicador** (mesmo dropdown do anual).
4. Adiciona 2 ou mais **meses** via seletores ano+mês (chips "+ Adicionar mês"), podendo remover cada um.
   - Default inicial: mês corrente + mês anterior.
   - Sem restrição — pode comparar Mar/2024 vs Nov/2025 vs Jul/2023, por exemplo.
5. Vê barras lado a lado (uma por mês selecionado), variações percentuais entre pares consecutivos, e uma tabela resumo.

Empresa vem sempre do filtro global do dashboard (mesma regra do Anual).

## Escopo técnico

### Novo hook `src/hooks/useComparativoMensal.ts`
- Espelha `useComparativoAnual`, mas o parâmetro é uma lista `mesesComparar: { ano: number; mes: number }[]`.
- Para cada item, calcula início/fim do mês (dia 1 ao último dia) e chama a mesma função `buscarAgregadosPeriodo` (ler do cache `vendas_agregado_diario`, mesma lógica de exclusão de DEVOLUCAO/CREDITOS já existente).
- Retorna array `DadosMensais` com `{ ano, mes, label: "MMM/YY", totalVendido, totalBruto, totalDesconto, percentualDesconto, qtdVendas, ticketMedio }`, ordenado cronologicamente.
- Reaproveita `IndicadorComparativo` e `INDICADORES_LABELS` já exportados por `useComparativoAnual`.

Nota: `buscarAgregadosPeriodo` está privado dentro de `useComparativoAnual.ts`. Refatoração leve: extrair essa função (e o toggle DEVOLUCAO/CREDITO) para `src/services/agregadosService.ts` (arquivo já existe) e reusar nos dois hooks. Nenhuma mudança de comportamento no Anual.

### Novo componente `src/components/sales-dashboard/ComparativoMensalChart.tsx`
- Estrutura visual idêntica ao `ComparativoAnualChart` (mesmo Card/BarChart/tabela/variações), trocando "anos" por "meses".
- Controles:
  - Select de Indicador (reusa `INDICADORES_LABELS`).
  - Lista de meses selecionados, cada um com dois `Select` (Ano, Mês) e botão remover.
  - Botão "+ Adicionar mês" (limite prático: 6).
- Label do eixo X: `"Mai/25"`, `"Abr/25"`, etc.
- Variações percentuais: comparação sequencial entre meses ordenados (igual anual).
- Empresa vem por prop, igual ao Anual.

### Integração no layout
- Em `src/components/sales-dashboard/VendasDashboardLayout.tsx`, inserir `<ComparativoMensalChart dataInicio={...} dataFim={...} empresa={...} />` logo abaixo do `<ComparativoAnualChart />` existente, recebendo os mesmos props (empresa e datas do filtro atual — datas são só referência de contexto, não limitam os meses escolhidos).

### Não muda
- Nada em Firebird Bridge, sync, RLS, ou tabelas.
- Todos os dados vêm do cache `vendas_agregado_diario` já em uso.
- Nenhuma mudança no Comparativo Anual (só extração da helper para o service).

## Arquivos afetados

- `src/services/agregadosService.ts` — adicionar/expor `buscarAgregadosPeriodo`.
- `src/hooks/useComparativoAnual.ts` — passa a importar helper do service (sem mudança de comportamento).
- `src/hooks/useComparativoMensal.ts` — **novo**.
- `src/components/sales-dashboard/ComparativoMensalChart.tsx` — **novo**.
- `src/components/sales-dashboard/VendasDashboardLayout.tsx` — inserir o novo card.

## Fora de escopo

- Comparar meses de empresas diferentes no mesmo gráfico.
- Persistir seleção de meses entre sessões.
- Exportação específica desse card (usa a exportação global do dashboard se já existir).
