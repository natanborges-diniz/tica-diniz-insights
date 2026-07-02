## Objetivo
Permitir liberar **páginas/relatórios específicos** para um usuário mesmo sem dar acesso ao módulo inteiro. Modelo **aditivo**: nada muda para quem já tem permissão de módulo — só ganha um "extra" para casos como "Roseane vê Vendas por Família, mas nada mais em Vendas".

## Como funciona

1. Se o usuário tem acesso ao módulo (`user_module_permissions` ≥ consulta) → vê tudo como hoje.
2. Se NÃO tem o módulo, mas tem a página liberada em `user_page_permissions` → o item aparece no menu daquele módulo e a rota abre normalmente (só leitura por padrão).
3. Admin continua vendo tudo.

## Banco (migration)

Nova tabela `user_page_permissions`:
- `user_id` (fk auth.users)
- `page_key` (text — ex: `vendas.familia`, `vendas.inteligencia`, `financeiro.dre`)
- `granted_at`, `granted_by`
- PK composta `(user_id, page_key)`
- RLS: usuário lê as próprias; admin gerencia todas.
- GRANTs para `authenticated` e `service_role`.

Function `has_page_access(_user_id, _page_key)` (security definer): retorna true se admin, ou se módulo liberado, ou se linha existe em `user_page_permissions`.

## Frontend

**Catálogo de páginas** (`src/lib/pageCatalog.ts`, novo): lista central `{ key, module, title, path }` cobrindo todas as rotas dos 8 módulos — fonte de verdade única compartilhada por sidebar e admin.

**Hook `useModulePermissions`**: adicionar `allowedPages: Set<string>` + método `hasPageAccess(pageKey)`. Fetch paralelo de `user_module_permissions` e `user_page_permissions`.

**`AppSidebar`**: filtrar `moduleMenus` por `hasPageAccess(pageKey)`. Renderizar seção do módulo mesmo sem `hasAccess(module)` desde que exista ≥1 página liberada.

**`ModuleGuard`**: permitir entrada se qualquer página do módulo estiver liberada; guard por rota individual fica em um novo `PageGuard` fino aplicado nas rotas do `App.tsx` (ou dentro do próprio `ModuleGuard` recebendo `pageKey` opcional).

**AdminUsuariosPage — sheet de edição**: abaixo do bloco de módulos, nova seção "Páginas específicas" agrupada por módulo, com checkboxes por página. Só aparece marcado como "extra" quando o módulo pai não estiver liberado. Salva delta contra `user_page_permissions` (insert/delete) no mesmo submit já existente.

## Escopo de páginas (todas)
Vendas (3), Compras (1), Estoque (5), Monitor (3), Financeiro (13), IA (1), Config (7). Catálogo derivado direto de `AppSidebar.moduleMenus`.

## Fora do escopo
- Não altera níveis (`consulta/edita/total`) — página liberada = consulta. Se precisar granularidade de edição por página depois, adicionamos coluna `access_level` na tabela.
- Não mexe em RLS de tabelas de dados (permissão é de UI/navegação; dados continuam por `cod_empresa`).

## Entregáveis
1. Migration `user_page_permissions` + função `has_page_access`.
2. `src/lib/pageCatalog.ts`.
3. Update `useModulePermissions` + novo `PageGuard`.
4. `AppSidebar` filtrado por página.
5. UI de admin (nova seção no sheet de edição de usuário).
