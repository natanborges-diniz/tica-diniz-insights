
# Dashboard de Compras

Novo módulo independente em `/compras`, com a mesma experiência de "Vendas por Família": pivot arrastável + gráficos dinâmicos + exportação PDF completa.

## Fonte de dados

- Base: `parcelas_cache` filtrando `tipo_lancamento = 'PAGAR'`.
- **Reconstituição da Nota Fiscal**: agrupar parcelas pela chave `(cod_empresa, pessoa_nome, documento, data_emissao)`. Cada grupo = 1 compra. Valor da compra = `SUM(valor)` das parcelas, nº de parcelas = `COUNT(*)`.
- Data da compra = `data_emissao` (conforme você confirmou). Filtros de período usam esse campo.
- Sem filtro fixo por conta contábil — trazemos todos PAGAR e o usuário filtra/exclui livremente por fornecedor, conta, loja, forma de pagamento.

## Página `/compras` (novo módulo no menu)

Estrutura idêntica a `SalesFamilyDashboard`:

1. **Filtros** (`ComprasFilters`):
   - Empresa (com "Todas") · Período (data início/fim em `data_emissao`) · Quick filters (mês atual, mês anterior, últimos 30/90 dias, ano atual)
   - **Fornecedor**: multi-select com modos **Incluir** / **Excluir**
   - **Conta contábil**: multi-select com modos **Incluir** / **Excluir**
   - **Forma de pagamento**: multi-select
   - Toggle de comparativo: nenhum / MoM / YoY

2. **KPIs** (`ComprasKPICards`):
   - Total Comprado (R$) · Nº de Notas · Nº de Fornecedores · Ticket Médio (R$/nota) · Nº Parcelas · Prazo Médio (dias entre emissão e vencimento médio)
   - Cada KPI mostra variação vs período comparativo selecionado.

3. **Gráficos dinâmicos** (`ComprasCharts`) — abas:
   - **Top Fornecedores** (Top N configurável 5/10/20): barras horizontais com Valor + Nº Notas (modo "Ambos" usando ComposedChart com eixo duplo, igual `SalesFamilyChart`).
   - **Evolução mensal**: linha/barra por mês de emissão, multi-séries por fornecedor selecionado (até 5) para comparativo direto.
   - **Curva ABC**: Pareto de fornecedores (barras de valor + linha % acumulado, faixas A/B/C).
   - **Comparativo Loja × Fornecedor**: heatmap (ou stacked bar) de valor por loja × top fornecedores.
   - Labels visíveis no PDF (LabelList em todas as séries).

4. **Tabela pivot** (`ComprasPivotTable`) reaproveitando `PivotTable`:
   - Dimensões arrastáveis: Fornecedor, Loja, Mês, Conta contábil, Forma pgto
   - Medidas: Valor total (R$), Nº de notas, Nº de parcelas, Ticket médio, Prazo médio
   - `defaultGroupBy = ['fornecedor']`
   - `onViewChange` integrado com export PDF (igual SalesFamily, respeita o agrupamento atual)

5. **Exportação PDF/CSV/Excel** (`exportComprasReport.ts`):
   - Reaproveita estrutura de `exportSalesFamilyReport.ts`: capa com filtros aplicados, KPIs, snapshots dos gráficos (com labels), tabela pivot conforme view atual do usuário, quebras de página limpas.

## Backend / dados

- Sem nova edge function nem migration. Tudo lido do `parcelas_cache` existente, agregando no cliente.
- Novo service `src/services/comprasService.ts`:
  - `getCompras(filters)` → consulta `parcelas_cache` com `tipo_lancamento='PAGAR'`, range em `data_emissao`, filtros de empresa/conta/fornecedor.
  - `aggregateNotas(parcelas)` → reduz parcelas em registros de nota (chave acima).
  - `aggregateComparativo(parcelas, modo)` → busca período anterior equivalente.
- Novo hook `src/hooks/useCompras.ts` com cache React Query (mesma estratégia do useFinanceiroParcelas), respeitando regra `codEmpresa !== undefined`.

## Navegação e permissões

- Rota nova `/compras` em `App.tsx` protegida por `ModuleGuard`.
- Item de menu próprio "Compras" em `AppSidebar.tsx` (ícone `ShoppingCart`), separado de Financeiro.
- Novo módulo `compras` registrado em permissões (`user_module_permissions`), com fallback para admins. Documentar no registry de módulos.

## Arquivos a criar

- `src/pages/ComprasDashboard.tsx`
- `src/components/compras/ComprasFilters.tsx`
- `src/components/compras/ComprasKPICards.tsx`
- `src/components/compras/ComprasCharts.tsx` (abas: Top, Evolução, ABC, Loja×Fornecedor)
- `src/components/compras/ComprasPivotTable.tsx`
- `src/services/comprasService.ts`
- `src/hooks/useCompras.ts`
- `src/utils/exportComprasReport.ts`

## Arquivos a editar

- `src/App.tsx` — rota `/compras`
- `src/components/layout/AppSidebar.tsx` — item de menu
- Registry de módulos / permissões (se houver lista hardcoded de módulos válidos)

## Limitações conhecidas (a comunicar no UI)

- A janela do `parcelas_cache` hoje é **45 dias passado + 90 dias futuro** em `data_vencimento`. Para análise histórica de compras (vários meses para trás por `data_emissao`), pode haver lacunas. Mostrar aviso quando o range pedido extrapolar o cache, e como evolução futura ampliar a janela de sync (ou criar `compras_cache` dedicado por `data_emissao`) — fica fora deste plano.
- Como usamos parcelas, "Nº de notas" depende da chave (empresa+fornecedor+documento+emissão). Documentos vazios podem inflar a contagem; vamos tratar fallback (`documento || lancamento_id`) e sinalizar no glossário da tabela.
