
# Correcao de Permissoes + Modelo CRUD Granular por Modulo

## Problema Atual

A Roseane tem apenas "monitor" habilitado no banco, mas ao logar ve todos os modulos porque:
1. A **HomePage** mostra todos os 6 cards de modulo sem filtrar permissoes
2. As **rotas nao sao bloqueadas** — a permissao apenas esconde itens do menu, mas o usuario acessa qualquer rota digitando a URL
3. O modelo atual e binario (ve/nao ve) sem distincao entre consultar, editar ou inserir

## Solucao Proposta

### 1. Novo modelo de permissoes com niveis CRUD

Substituir o campo `enabled` (boolean) por `access_level` com 4 niveis:

| Nivel | Significado | Permite |
|-------|-------------|---------|
| `nenhum` | Sem acesso | Nada — modulo invisivel |
| `consulta` | Somente leitura | Ve dashboards e dados, nao edita |
| `edita` | Leitura + edicao | Consulta + altera registros existentes |
| `total` | Acesso completo | Consulta + edita + insere + deleta |

### 2. Correcoes de bloqueio

- **HomePage**: filtrar cards por modulos permitidos (qualquer nivel diferente de `nenhum`)
- **Rotas**: criar componente `ModuleGuard` que verifica permissao antes de renderizar a pagina. Se nao tem acesso, redireciona para `/home`
- **TopNavigation**: ja filtra (ok), mas usara o novo modelo

### 3. Hook `useModulePermissions` atualizado

O hook passara a retornar o nivel de acesso por modulo:
- `hasAccess(module)` — retorna true se nivel != nenhum
- `getAccessLevel(module)` — retorna "nenhum" | "consulta" | "edita" | "total"
- `canEdit(module)` — atalho para nivel >= edita
- `canInsert(module)` — atalho para nivel = total

### 4. Interface Admin atualizada

Na pagina `/admin/usuarios`, substituir os checkboxes de modulo por um seletor de nivel (dropdown ou radio group) para cada modulo:

```text
Vendas      [Nenhum] [Consulta] [Edita] [Total]
Estoque     [Nenhum] [Consulta] [Edita] [Total]
Monitor     [Nenhum] [Consulta] [Edita] [Total]
Financeiro  [Nenhum] [Consulta] [Edita] [Total]
Central IA  [Nenhum] [Consulta] [Edita] [Total]
Config      [Nenhum] [Consulta] [Edita] [Total]
```

---

## Detalhes Tecnicos

### Migracao do Banco de Dados

```sql
-- Adicionar coluna access_level e migrar dados existentes
ALTER TABLE user_module_permissions 
  ADD COLUMN access_level text NOT NULL DEFAULT 'nenhum';

-- Migrar: enabled=true vira 'total', enabled=false vira 'nenhum'
UPDATE user_module_permissions 
  SET access_level = CASE WHEN enabled THEN 'total' ELSE 'nenhum' END;

-- Remover coluna antiga
ALTER TABLE user_module_permissions DROP COLUMN enabled;

-- Atualizar funcao has_module_access
CREATE OR REPLACE FUNCTION public.has_module_access(...)
  -- Retorna true se access_level != 'nenhum'
```

### Arquivos Modificados

1. **`src/hooks/useModulePermissions.ts`** — novo modelo com `getAccessLevel`, `canEdit`, `canInsert`
2. **`src/pages/HomePage.tsx`** — filtrar cards por `hasAccess`
3. **`src/components/auth/ModuleGuard.tsx`** (novo) — componente wrapper de rota que verifica permissao
4. **`src/App.tsx`** — envolver rotas de cada modulo com `ModuleGuard`
5. **`src/pages/AdminUsuariosPage.tsx`** — trocar checkboxes por seletor de nivel (toggle group com 4 opcoes)
6. **`src/components/layout/TopNavigation.tsx`** — sem mudanca (ja usa `hasAccess`)

### Fluxo do ModuleGuard

```text
Usuario acessa /vendas
  -> ModuleGuard(module="vendas")
    -> useModulePermissions().hasAccess("vendas")
      -> false? Redireciona para /home
      -> true? Renderiza <Outlet />
```

### Uso pratico do nivel de acesso nos componentes

Componentes que permitem edicao (ex: MetasConfigDashboard, formularios) verificarao:
```typescript
const { canEdit } = useModulePermissions();
// Desabilitar botoes de edicao se canEdit("config") === false
```

Isso sera feito incrementalmente — primeiro o modelo e a infraestrutura, depois cada tela adapta seus botoes conforme necessario.
