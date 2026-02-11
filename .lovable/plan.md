

# FASE 0 -- Plano Executavel de Seguranca

Ordem de execucao: E0.1 -> E0.2 -> E0.3 -> E0.4

---

## EPICO E0.1 -- Autenticacao minima operacional

### Objetivo
Bloquear acesso sem login. Vincular usuario a empresa e papel.

### Estrutura de dados (3 migracoes)

**Migracao 1 -- Tabela de perfis**
```sql
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  nome TEXT,
  cod_empresa INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Usuarios autenticados leem apenas seu proprio perfil
CREATE POLICY "Users read own profile"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

-- Trigger para criar perfil automaticamente no signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, cod_empresa)
  VALUES (
    NEW.id,
    NEW.email,
    -- Empresa padrao; sera ajustada pelo admin depois
    1
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
```

**Migracao 2 -- Tabela de papeis (separada, conforme requisito de seguranca)**
```sql
CREATE TYPE public.app_role AS ENUM ('admin', 'gestor', 'vendedor');

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Funcao segura para checar papel (evita recursao RLS)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Funcao segura para obter cod_empresa do usuario
CREATE OR REPLACE FUNCTION public.get_user_empresa(_user_id UUID)
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT cod_empresa FROM public.profiles
  WHERE id = _user_id
  LIMIT 1
$$;

-- Apenas admins podem ver papeis
CREATE POLICY "Admins read all roles"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Apenas admins podem gerenciar papeis
CREATE POLICY "Admins manage roles"
  ON public.user_roles FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
```

**Migracao 3 -- Seed do primeiro admin**
- Apos o primeiro signup, inserir manualmente via SQL:
```sql
INSERT INTO public.user_roles (user_id, role)
VALUES ('<UUID_DO_PRIMEIRO_USUARIO>', 'admin');
```

### Frontend -- Arquivos a criar/modificar

| Arquivo | Acao | Descricao |
|---------|------|-----------|
| `src/contexts/AuthContext.tsx` | **Criar** | Context com `user`, `profile`, `role`, `isLoading`, `signIn`, `signOut`. Usa `onAuthStateChange` + busca `profiles` e `user_roles`. |
| `src/components/auth/LoginPage.tsx` | **Criar** | Formulario email + senha. Sem signup publico (admin cadastra usuarios). |
| `src/components/auth/ProtectedRoute.tsx` | **Criar** | Wrapper que redireciona para `/login` se nao autenticado. |
| `src/App.tsx` | **Modificar** | Envolver `<AppLayout>` com `<ProtectedRoute>`. Adicionar rota `/login`. |
| `src/components/layout/TopNavigation.tsx` | **Modificar** | Adicionar nome do usuario + botao de logout no canto direito. |

### Fluxo de autenticacao

```text
Usuario abre app
  |
  v
ProtectedRoute verifica sessao
  |
  +-- Sem sessao --> redireciona /login
  |
  +-- Com sessao --> carrega profile + role
       |
       v
    AppLayout renderiza com empresa do usuario no contexto
```

### Criterios de aceite
- Usuario deslogado ve apenas `/login`
- Sessao expirada redireciona automaticamente
- `cod_empresa` do usuario disponivel via `useAuth()` em qualquer componente
- Papel (`admin`/`gestor`/`vendedor`) disponivel no contexto

### Riscos e mitigacao
- **Risco**: Quebra de acesso se RLS mudar antes de auth funcionar
- **Mitigacao**: E0.1 NAO altera RLS existente. Politicas permissivas continuam ate E0.2

---

## EPICO E0.2 -- RLS por tenant/empresa

### Pre-requisito
E0.1 concluido (auth funcional, `get_user_empresa()` disponivel).

### Estrategia
Substituir `USING (true)` por `USING (cod_empresa = public.get_user_empresa(auth.uid()))` nas tabelas que tem `cod_empresa`. Tabelas de configuracao global mantem SELECT publico para authenticated.

### Tabelas e novas politicas

| Tabela | SELECT | INSERT | UPDATE | DELETE | Nota |
|--------|--------|--------|--------|--------|------|
| `vendas_agregado_diario` | `cod_empresa = get_user_empresa(auth.uid())` | service_role only | service_role only | service_role only | Cache: frontend le, sync grava |
| `os_hub_receitas` | `cod_empresa = get_user_empresa(auth.uid())` | service_role only | service_role only | service_role only | Idem |
| `venda` | `cod_empresa = get_user_empresa(auth.uid())` | service_role only | service_role only | service_role only | Sync ERP |
| `venda_item` | sem `cod_empresa` | - | - | - | Precisa JOIN com venda ou adicionar coluna |
| `pessoa` | service_role only | service_role only | service_role only | service_role only | Manter sem acesso anon (Bridge usa) |
| `produto` | service_role only | service_role only | service_role only | service_role only | Idem |
| `pedidos_fornecedor` | `cod_empresa = get_user_empresa(auth.uid())` | `cod_empresa = get_user_empresa(auth.uid())` | `cod_empresa = get_user_empresa(auth.uid())` | nenhum | Auditoria |
| `empresa` | `true` (para authenticated) | service_role only | service_role only | service_role only | Lista de empresas e publica |
| `metas_vendas` | `true` (authenticated) | admin/gestor | admin/gestor | admin/gestor | Config |
| `metas_periodos` | `true` (authenticated) | admin/gestor | admin/gestor | admin/gestor | Config |
| `lojas_configuracao` | `true` (authenticated) | admin/gestor | admin/gestor | admin/gestor | Config |
| `lojas_excecoes` | `true` (authenticated) | admin/gestor | admin/gestor | admin/gestor | Config |
| `calendario_feriados` | `true` (authenticated) | admin/gestor | admin/gestor | admin/gestor | Config |
| `estoque_minimo_loja` | `true` (authenticated) | admin/gestor | admin/gestor | admin/gestor | Config |
| `fornecedor_marca` | `true` (authenticated) | admin/gestor | admin/gestor | admin/gestor | Config |
| `fornecedor_produto_depara` | `true` (authenticated) | authenticated | authenticated | authenticated | De/para Hoya |
| `etl_controle` | service_role only | service_role only | service_role only | service_role only | Interno |

### Caso especial: `venda_item`
A tabela `venda_item` nao tem `cod_empresa`. Duas opcoes:
1. Adicionar coluna `cod_empresa` via migracao e popular via UPDATE com JOIN em `venda`
2. Manter acesso apenas por service_role (frontend nao consulta diretamente)

**Decisao**: Opcao 2 (manter service_role only). O frontend nao faz queries diretas a `venda_item`.

### Migracao SQL (exemplo para vendas_agregado_diario)
```sql
-- Remover politica antiga
DROP POLICY IF EXISTS "Public read vendas_agregado_diario" ON public.vendas_agregado_diario;

-- Nova politica por empresa
CREATE POLICY "Tenant read vendas_agregado_diario"
  ON public.vendas_agregado_diario
  FOR SELECT
  TO authenticated
  USING (cod_empresa = public.get_user_empresa(auth.uid()));

-- Service role mantém acesso total (para sync)
CREATE POLICY "Service role full access vendas_agregado_diario"
  ON public.vendas_agregado_diario
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
```

Padrao repetido para cada tabela listada acima.

### Frontend -- Impacto
- **Nenhum arquivo novo**: O frontend ja filtra por empresa via parametros. A RLS atua como camada extra.
- **Verificar**: `empresaService.ts` faz query em `empresa` com anon key. Apos E0.1, passara JWT automaticamente via `supabase.auth.session()`. Funciona sem mudanca de codigo se o client ja esta configurado com `persistSession: true` (ja esta).

### Criterios de aceite
- Anon key retorna 0 linhas em qualquer tabela sensivel
- Usuario da empresa 1 nao ve dados da empresa 2
- Edge Functions com service_role continuam gravando normalmente
- Todas as telas carregam dados corretamente apos login

### Riscos
- **Risco**: Tabela de config com `cod_empresa` pode bloquear admin de ver todas as empresas
- **Mitigacao**: Admin deve ter acesso a TODAS as empresas. Alternativa: admin nao usa `get_user_empresa` mas sim `has_role('admin')` com `USING (true)` para admin

### Politica composta para admin
```sql
-- Exemplo para vendas_agregado_diario
CREATE POLICY "Tenant or admin read"
  ON public.vendas_agregado_diario
  FOR SELECT
  TO authenticated
  USING (
    cod_empresa = public.get_user_empresa(auth.uid())
    OR public.has_role(auth.uid(), 'admin')
  );
```

---

## EPICO E0.3 -- Hardening das Edge Functions

### Pre-requisito
E0.1 concluido (JWT disponivel no frontend).

### Funcoes a proteger

| Funcao | Protecao | Papel minimo |
|--------|----------|--------------|
| `hoya-proxy` | JWT + empresa | gestor |
| `ai-central` | JWT | authenticated |
| `ai-diretrizes` | JWT | authenticated |
| `ai-sugestao-cobertura` | JWT | authenticated |
| `sync-agregados-diarios` | JWT + papel | admin |
| `sync-vendas` | JWT + papel | admin |
| `sync-empresas` | JWT + papel | admin |
| `sync-clientes` | JWT + papel | admin |
| `sync-produtos` | JWT + papel | admin |
| `sync-os-hub` | JWT + papel | admin |
| `orchestrate-sync` | JWT + papel | admin |
| `sync-agregados-mensal` | JWT + papel | admin |
| `sync-agregados-semanal` | JWT + papel | admin |
| `transform-dw` | JWT + papel | admin |
| `firebird-query` | JWT + papel | admin |
| `cache-diagnostico` | JWT | admin |

### Config.toml
Manter `verify_jwt = false` em TODAS (conforme instrucao do sistema) e validar JWT no codigo via `getClaims()`.

### Padrao de validacao (codigo compartilhado)

Criar `supabase/functions/_shared/auth.ts`:
```typescript
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export async function validateAuth(req: Request, requiredRole?: string) {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return { error: 'Unauthorized', status: 401 };
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } }
  );

  const token = authHeader.replace('Bearer ', '');
  const { data, error } = await supabase.auth.getClaims(token);
  if (error || !data?.claims) {
    return { error: 'Invalid token', status: 401 };
  }

  const userId = data.claims.sub;

  if (requiredRole) {
    const serviceSupabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );
    const { data: roles } = await serviceSupabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId);

    const userRoles = roles?.map(r => r.role) || [];
    if (!userRoles.includes(requiredRole)) {
      return { error: 'Forbidden', status: 403 };
    }
  }

  return { userId, claims: data.claims };
}
```

**Nota**: O arquivo `_shared` nao pode ser importado como modulo separado nas Edge Functions do Lovable Cloud. O codigo sera copiado inline em cada funcao que precisar. Alternativa: criar uma funcao helper diretamente no corpo de cada Edge Function.

### Rate limiting simples para IA
Usar a tabela `etl_controle` ou criar tabela `rate_limits`:
```sql
CREATE TABLE public.rate_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  function_name TEXT NOT NULL,
  called_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_rate_limits_lookup ON public.rate_limits (user_id, function_name, called_at);
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;
-- Apenas service_role grava
```

Logica na Edge Function: contar chamadas do usuario nos ultimos 5 minutos. Se > 10, retornar 429.

### Frontend -- Impacto
- `supabase.functions.invoke()` ja envia JWT automaticamente quando o usuario esta logado. **Nenhuma mudanca necessaria** nas chamadas que ja usam o SDK.
- `syncCacheService.ts` usa `fetch()` manual -- sera resolvido no E0.4.

### Criterios de aceite
- Chamada sem token retorna 401
- Vendedor nao consegue disparar sync (403)
- IA retorna 429 apos 10 chamadas em 5 minutos
- Todas as funcoes continuam funcionando para usuarios autorizados

---

## EPICO E0.4 -- Encerrar sync disparado pelo frontend com anon key

### Pre-requisito
E0.1 e E0.3 concluidos.

### Arquivos a modificar

| Arquivo | Mudanca |
|---------|---------|
| `src/services/syncCacheService.ts` | Substituir `fetch()` manual por `supabase.functions.invoke()`. Remover uso de `VITE_SUPABASE_PUBLISHABLE_KEY`. Remover `EMPRESAS_ATIVAS` local. |

### Codigo atual (problema)
```typescript
const response = await fetch(
  `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sync-agregados-diarios?empresa=${empresa}&...`,
  {
    headers: {
      'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
    },
  }
);
```

### Codigo novo
```typescript
const { data, error } = await supabase.functions.invoke('sync-agregados-diarios', {
  body: { empresa, dataInicio, dataFim },
});
```

O SDK envia automaticamente o JWT do usuario logado.

### Edge Function `sync-agregados-diarios` -- Ajuste
Aceitar parametros via body (JSON) alem de query string, para compatibilidade com `supabase.functions.invoke()`:
```typescript
// Aceitar parametros de body OU query string
let empresa, dataInicio, dataFim;
if (req.method === 'POST') {
  const body = await req.json();
  empresa = body.empresa;
  dataInicio = body.dataInicio;
  dataFim = body.dataFim;
} else {
  const url = new URL(req.url);
  empresa = url.searchParams.get('empresa');
  // ...
}
```

### Adicionar visibilidade
- Adicionar botao "Sincronizar Cache" apenas para admin/gestor na TopNavigation ou Config
- Mostrar quem disparou e quando (log em `etl_controle` ou tabela dedicada)

### Criterios de aceite
- Nenhum `fetch()` manual com `VITE_SUPABASE_PUBLISHABLE_KEY` no codigo
- Sync so funciona para usuarios com papel admin
- Log registra user_id de quem disparou

---

## Resumo de impacto por arquivo

### Arquivos novos (5)
| Arquivo | Epico |
|---------|-------|
| `src/contexts/AuthContext.tsx` | E0.1 |
| `src/components/auth/LoginPage.tsx` | E0.1 |
| `src/components/auth/ProtectedRoute.tsx` | E0.1 |
| `src/hooks/useAuth.ts` | E0.1 |
| `src/components/auth/RequireRole.tsx` | E0.3 |

### Arquivos modificados (5)
| Arquivo | Epico | Mudanca |
|---------|-------|---------|
| `src/App.tsx` | E0.1 | AuthProvider + ProtectedRoute + rota /login |
| `src/components/layout/TopNavigation.tsx` | E0.1 | Nome do usuario + logout |
| `src/services/syncCacheService.ts` | E0.4 | Substituir fetch manual por SDK |
| Edge Functions (16 funcoes) | E0.3 | Adicionar validacao JWT + role |
| `supabase/config.toml` | E0.3 | Manter verify_jwt = false (validacao em codigo) |

### Migracoes SQL (4)
| # | Epico | Conteudo |
|---|-------|----------|
| 1 | E0.1 | Tabela `profiles` + trigger |
| 2 | E0.1 | Tabela `user_roles` + funcoes `has_role` e `get_user_empresa` |
| 3 | E0.2 | Substituir todas as politicas RLS (~16 tabelas) |
| 4 | E0.3 | Tabela `rate_limits` |

### Ordem de execucao detalhada
1. Migracoes 1 e 2 (estrutura de auth)
2. Frontend de auth (context, login, protected route)
3. Testar login funcional
4. Migracao 3 (RLS por tenant)
5. Testar acesso por empresa
6. Migracao 4 + hardening das Edge Functions
7. Refatorar syncCacheService
8. Teste end-to-end completo

