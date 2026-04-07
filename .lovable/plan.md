

## Plano: Segmentar Acesso Admin + Mover DRE Config para Financeiro

### Problemas

1. **DRE Config não aparece no sidebar** — A rota `/admin/dre-config` existe mas não está listada no menu do módulo `config` (sidebar).
2. **Rotas admin sem proteção** — Todas as rotas `/admin/*` estão abertas a qualquer usuário autenticado, sem ModuleGuard.
3. **Responsável financeiro precisa configurar plano de contas** — mas DRE Config está em "admin", inacessível sem ser admin.

### Solução: Mover DRE Config para dentro do módulo Financeiro

Em vez de segmentar o admin em sub-módulos (complexo), a abordagem mais simples é:

1. **Mover "Plano de Contas" para o sidebar do Financeiro** — sob a seção "Hub Financeiro" ou uma nova seção "Configurações". Rota: `/financeiro/plano-contas` (redirect do antigo `/admin/dre-config`).
2. **Proteger com permissão de módulo** — quem tem acesso `edita` ou `total` ao módulo `financeiro` pode editar o plano de contas. Consulta = somente leitura.
3. **Proteger rotas admin restantes** — Envolver as rotas `/admin/*` com verificação de role `admin` (as que são genuinamente administrativas: usuários, sync, health, fornecedores, BTG, adquirentes).

### Detalhamento Técnico

#### Arquivo: `src/components/layout/AppSidebar.tsx`

- Adicionar item no módulo `financeiro`, nova seção "Configurações":
  - `{ title: "Plano de Contas", url: "/financeiro/plano-contas", icon: Settings2 }`
- Remover "DRE Config" do menu `config` (se estivesse — na verdade nem está, confirma o problema)

#### Arquivo: `src/App.tsx`

- Mover rota DRE Config para dentro do bloco `<ModuleGuard module="financeiro">`:
  - `<Route path="/financeiro/plano-contas" element={<AdminDreConfigPage />} />`
- Adicionar redirect: `/admin/dre-config` → `/financeiro/plano-contas`
- Proteger rotas `/admin/*` com um guard de admin (novo componente `AdminGuard` que verifica `isAdmin` do AuthContext)

#### Novo: `src/components/auth/AdminGuard.tsx`

- Componente simples: verifica `isAdmin` do `useAuth()`, se não → `NoPermissionState`, se sim → `<Outlet />`
- Envolver todas as rotas `/admin/*` com este guard

#### Arquivo: `src/pages/AdminDreConfigPage.tsx`

- Adicionar verificação de `canEdit("financeiro")` para habilitar/desabilitar ações de escrita (criar, editar, excluir contas)
- Usuários com `consulta` veem a tabela mas sem botões de ação

### Arquivos a Alterar

| Arquivo | Mudança |
|---|---|
| `src/components/layout/AppSidebar.tsx` | Adicionar "Plano de Contas" no sidebar financeiro |
| `src/App.tsx` | Mover rota, adicionar redirect, envolver admin com AdminGuard |
| `src/components/auth/AdminGuard.tsx` | Criar (verifica isAdmin) |
| `src/pages/AdminDreConfigPage.tsx` | Condicionar botões de escrita à permissão financeiro |

### O que NÃO muda
- Tabela `dre_plano_contas` (sem mudança no banco)
- Edge functions
- Fluxo de classificação/validação no Hub Financeiro

