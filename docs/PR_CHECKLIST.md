# PR Checklist — INFOCO System Design

> Obrigatório para todo PR de UI. Cole no corpo do PR ou valide antes de submeter.

## Tokens e Cores
- [ ] Zero hardcoded Tailwind colors (`text-red-500`, `bg-emerald-600`, etc.)
- [ ] Cores semânticas: `success`, `warning`, `danger`, `info` + variantes `-soft`, `-muted`, `-foreground`
- [ ] Charts usam `chart-1` a `chart-8` (nunca arrays de cores hardcoded)
- [ ] Segmentação de dados → `chart-N`; Status/alertas → tokens semânticos (não misturar)

## Overlays
- [ ] Dialogs usam `BaseDialog` (`@/components/system/BaseDialog`)
- [ ] Sheets usam `BaseSheet` (`@/components/system/BaseSheet`)
- [ ] Nunca importar `Dialog`/`Sheet` direto de `@/components/ui/`

## Tabelas (DataTable)
- [ ] Usa `DataTable` de `@/components/ui/data-table`
- [ ] `emptyState` e `errorState` definidos
- [ ] Sorting restrito a `sortableKeys` (colunas com `sortable: true`)
- [ ] Export via `DataTableToolbar` com dataset filtrado completo
- [ ] Mobile: coluna essencial sempre visível; outras com `mobileVisible: false`
- [ ] `onRowClick` com suporte a teclado (`Enter`/`Space`) quando aplicável

## Edição
- [ ] `ActionBar` para ações de salvar (nunca botão "Salvar" inline)
- [ ] `useDirtyGuard` em formulários com estado editável
- [ ] `guardClose` no `onOpenChange` de overlays com dirty state

## Acessibilidade (A11Y)
- [ ] `aria-sort` em headers de tabela ordenável
- [ ] `aria-label` em botões icon-only
- [ ] Foco visível em todos os interativos
- [ ] Não depender só de cor para status (texto/ícone sempre presente)
- [ ] Skeleton com `aria-busy="true"` e `role="status"`

## Navegação
- [ ] Breadcrumbs registrados em `AppBreadcrumbs.tsx` para rotas profundas
- [ ] Active state correto no TopNav (derivado de `pathname`)

## Performance
- [ ] Tabelas pesadas com paginação (server-side preferido para >1000 linhas)
- [ ] Skeletons para estados de carregamento
- [ ] Sem re-renders desnecessários (memoização onde aplicável)
