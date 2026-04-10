

## Plano: Adicionar módulo "Comunicação" à gestão de permissões

### Problema

O módulo `comunicacao` já existe no tipo `ModuleKey`, no hook `useModulePermissions` e na HomePage, mas **não aparece na tela de Administração de Usuários** (`AdminUsuariosPage.tsx`). Isso impede o admin de conceder ou revogar acesso ao módulo Comunicação para cada usuário.

### Revisão completa dos módulos

| Módulo | ModuleKey | useModulePermissions | HomePage | TopNavigation | AdminUsuarios | Sidebar |
|---|---|---|---|---|---|---|
| vendas | OK | OK | OK | OK | OK | OK |
| estoque | OK | OK | OK | OK | OK | OK |
| monitor | OK | OK | OK | OK | OK | OK |
| financeiro | OK | OK | OK | OK | OK | OK |
| ia | OK | OK | OK | OK | OK | OK |
| config | OK | OK | OK | OK | OK | OK |
| **comunicacao** | OK | OK | OK | N/A (externo) | **FALTA** | OK (vazio) |

Todos os demais módulos estão consistentes. O único ponto faltante é a lista `ALL_MODULES` dentro de `AdminUsuariosPage.tsx`.

### Alteração

| Arquivo | Mudança |
|---|---|
| `src/pages/AdminUsuariosPage.tsx` (linha 50-57) | Adicionar `{ key: "comunicacao", label: "Comunicação", desc: "CRM e comunicação (acesso externo)" }` ao array `ALL_MODULES` |

Uma única linha adicionada. Após isso, o admin poderá configurar o nível de acesso (nenhum/consulta/edita/total) para o módulo Comunicação em cada usuário, controlando quem vê o card na Home.

