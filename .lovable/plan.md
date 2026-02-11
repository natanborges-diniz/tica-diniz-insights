

# FASE 0 -- Plano Consolidado Final (v4)

Incorpora todos os 6 ajustes obrigatorios da revisao, confirmados contra o estado real do banco.

---

## O que ja estava resolvido (confirmacao)

| Ponto da revisao | Status | Onde foi resolvido |
|---|---|---|
| 1. Policy admin para atualizar cod_empresa | Ja no plano v2 | Policy "Admins update any profile" + trigger protect_cod_empresa |
| 2. Signup publico desabilitado | Ja no plano v2 | Decisao de governanca + configure-auth |
| 3. Classificacao Global vs Tenant | Ja no plano v2 | Lista oficial de tabelas |
| 4. Admin ve tudo em tabelas tenant | Ja no plano v2 | Policy composta com `OR has_role('admin')` |
| 5. verify_jwt default true | Ja no plano v2 (correcao do v1) | Remover todas as linhas verify_jwt=false |
| 6. rate_limits escrita service_role only | Ja no plano v3 | Policy "Service role only rate_limits" |

---

## Ajustes incrementais desta revisao (v4)

### 1. Criterio de aceite E0.1: admin atribui empresa SEM SQL manual

**Antes**: "Admin consegue atualizar cod_empresa via query SQL"
**Agora**: "Admin consegue atualizar cod_empresa de qualquer usuario via aplicacao (sem SQL manual)"

Isso implica que no frontend, mesmo que nao haja tela de admin completa na Fase 0, o `AuthContext` deve expor uma funcao `updateUserEmpresa(userId, codEmpresa)` que um admin pode usar. Uma tela minima de gestao de usuarios sera criada.

Arquivo novo: `src/pages/AdminUsuariosPage.tsx` -- tela simples listando profiles (para admin) com opcao de alterar cod_empresa e atribuir roles.

### 2. Governanca de signup: regra explicita

Adicionar ao plano como regra de governanca documentada:
- "Signups publicos sao desabilitados no Supabase Auth via configure-auth"
- "Novos usuarios sao criados exclusivamente via fluxo administrativo (convite ou cadastro direto pelo admin)"
- "O trigger `handle_new_user` continua ativo para qualquer mecanismo de criacao de usuario"

### 3. Tabelas "config global" -- revalidacao contra banco real

Verificacao feita contra as migracoes existentes:

**Tabelas TENANT** (tem `cod_empresa` e dados sao por empresa):
- `vendas_agregado_diario` -- tem cod_empresa
- `os_hub_receitas` -- tem cod_empresa
- `venda` -- tem cod_empresa
- `pedidos_fornecedor` -- tem cod_empresa
- `lojas_configuracao` -- tem cod_empresa (config POR loja)
- `lojas_excecoes` -- tem cod_empresa (excecoes POR loja)
- `estoque_minimo_loja` -- tem cod_empresa (estoque POR loja)

**Tabelas GLOBAIS** (sem cod_empresa ou dados compartilhados entre empresas):
- `empresa` -- lista de referencia (ja tem policy `TO anon, authenticated USING(true)`)
- `metas_vendas` -- usa cod_referencia, nao cod_empresa do usuario
- `metas_periodos` -- periodos comerciais globais
- `calendario_feriados` -- feriados nacionais/regionais
- `fornecedor_marca` -- associacao global
- `fornecedor_produto_depara` -- de/para compartilhado

**Tabelas SERVICE_ROLE ONLY**:
- `pessoa` -- sync ERP
- `produto` -- sync ERP
- `venda_item` -- sem cod_empresa
- `etl_controle` -- controle interno

### 4. Consistencia sync: apenas admin na Fase 0

Decisao: botao "Sincronizar" e funcoes sync exigem papel `admin` apenas. Gestor nao dispara sync na Fase 0 (pode ser ampliado em fase futura).

### 5. Checklist E0.2: remocao explicita de policies `TO anon`

A unica policy `TO anon` existente esta na tabela `empresa`:
```
CREATE POLICY "Public read empresa" ON public.empresa FOR SELECT TO anon, authenticated USING (true);
```

Na migracao E0.2, esta policy sera substituida por:
```sql
DROP POLICY IF EXISTS "Public read empresa" ON public.empresa;
CREATE POLICY "Authenticated read empresa" ON public.empresa FOR SELECT TO authenticated USING (true);
```

Isso garante que anon key nao le nenhuma tabela.

### 6. rate_limits: confirmacao de que nao existe policy para authenticated

A migracao 4 tera apenas:
```sql
CREATE POLICY "Service role only rate_limits"
  ON public.rate_limits FOR ALL TO service_role
  USING (true) WITH CHECK (true);
```

Nenhuma policy para `authenticated` ou `anon`. Edge Functions escrevem via service_role key internamente.

---

## Migracoes SQL atualizadas (4)

### Migracao 1 -- profiles + trigger

```sql
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  nome TEXT,
  cod_empresa INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own profile"
  ON public.profiles FOR SELECT TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users update own profile"
  ON public.profiles FOR UPDATE TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, cod_empresa)
  VALUES (NEW.id, NEW.email, 1);
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
```

**Nota**: SEM policy `TO service_role` (trigger SECURITY DEFINER contorna RLS). Admin policies sao adicionadas na migracao 2 (apos `has_role` existir).

### Migracao 2 -- user_roles + funcoes + trigger protect + admin policies

```sql
CREATE TYPE public.app_role AS ENUM ('admin', 'gestor', 'vendedor');

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Funcoes helper (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role) $$;

CREATE OR REPLACE FUNCTION public.get_user_empresa(_user_id UUID)
RETURNS INTEGER LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT cod_empresa FROM public.profiles WHERE id = _user_id LIMIT 1 $$;

-- Policies user_roles
CREATE POLICY "Admins read all roles" ON public.user_roles FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins manage roles" ON public.user_roles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Admin policies para profiles (agora que has_role existe)
CREATE POLICY "Admins read all profiles" ON public.profiles FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins update any profile" ON public.profiles FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Trigger protect_cod_empresa (com guard auth.uid() IS NULL)
CREATE OR REPLACE FUNCTION public.protect_cod_empresa()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.cod_empresa IS DISTINCT FROM OLD.cod_empresa THEN
    IF auth.uid() IS NULL THEN
      RAISE EXCEPTION 'Unauthenticated';
    END IF;
    IF NOT public.has_role(auth.uid(), 'admin') THEN
      RAISE EXCEPTION 'Only admins can change cod_empresa';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER protect_cod_empresa_trigger
  BEFORE UPDATE ON public.profiles FOR EACH ROW
  EXECUTE FUNCTION public.protect_cod_empresa();
```

### Migracao 3 -- RLS por tenant (~16 tabelas)

Substituir todas as policies `USING(true)` existentes. Padrao por tipo:

**Tabelas TENANT** (vendas_agregado_diario, os_hub_receitas, venda, pedidos_fornecedor, lojas_configuracao, lojas_excecoes, estoque_minimo_loja):
```sql
DROP POLICY IF EXISTS "<nome_antigo>" ON public.<tabela>;
CREATE POLICY "Tenant or admin read <tabela>" ON public.<tabela> FOR SELECT TO authenticated
  USING (cod_empresa = public.get_user_empresa(auth.uid()) OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Service role full access <tabela>" ON public.<tabela> FOR ALL TO service_role
  USING (true) WITH CHECK (true);
```

Para `pedidos_fornecedor`, adicionar INSERT/UPDATE por tenant.

**Tabelas GLOBAIS** (metas_vendas, metas_periodos, calendario_feriados, fornecedor_marca, fornecedor_produto_depara):
```sql
DROP POLICY IF EXISTS "<nome_antigo>" ON public.<tabela>;
CREATE POLICY "Authenticated read <tabela>" ON public.<tabela> FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin gestor write <tabela>" ON public.<tabela> FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gestor'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gestor'));
```

**Tabela `empresa`** -- remover acesso anon:
```sql
DROP POLICY IF EXISTS "Public read empresa" ON public.empresa;
CREATE POLICY "Authenticated read empresa" ON public.empresa FOR SELECT TO authenticated USING (true);
```

**Tabelas SERVICE_ROLE ONLY** (pessoa, produto, venda_item, etl_controle):
```sql
DROP POLICY IF EXISTS "<nome_antigo>" ON public.<tabela>;
CREATE POLICY "Service role only <tabela>" ON public.<tabela> FOR ALL TO service_role
  USING (true) WITH CHECK (true);
```

### Migracao 4 -- rate_limits

```sql
CREATE TABLE public.rate_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  function_name TEXT NOT NULL,
  called_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_rate_limits_lookup ON public.rate_limits (user_id, function_name, called_at);
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role only rate_limits" ON public.rate_limits FOR ALL TO service_role
  USING (true) WITH CHECK (true);
```

---

## Frontend -- Arquivos

### Novos (5)

| Arquivo | Epico | Descricao |
|---------|-------|-----------|
| `src/contexts/AuthContext.tsx` | E0.1 | Provider com user, profile, role, signIn, signOut, isLoading. Expoe updateUserEmpresa() para admin. |
| `src/hooks/useAuth.ts` | E0.1 | Hook que consome AuthContext |
| `src/components/auth/LoginPage.tsx` | E0.1 | Email + senha. Sem signup. Redirect apos login. |
| `src/components/auth/ProtectedRoute.tsx` | E0.1 | Redireciona /login se nao autenticado |
| `src/pages/AdminUsuariosPage.tsx` | E0.1 | Tela admin: listar profiles, alterar cod_empresa, atribuir roles |

### Modificados (2)

| Arquivo | Epico | Mudanca |
|---------|-------|---------|
| `src/App.tsx` | E0.1 | AuthProvider + ProtectedRoute + rota /login + rota /admin/usuarios |
| `src/components/layout/TopNavigation.tsx` | E0.1 | Nome do usuario + botao Sair no canto direito |

### Modificados (E0.3/E0.4)

| Arquivo | Epico | Mudanca |
|---------|-------|---------|
| `src/services/syncCacheService.ts` | E0.4 | fetch() -> supabase.functions.invoke() |
| 16 Edge Functions | E0.3 | Validacao JWT + role inline |

---

## Config

| Acao | Descricao |
|------|-----------|
| Supabase Auth | Desabilitar signup publico via configure-auth |
| `supabase/config.toml` | Remover TODAS as linhas `verify_jwt = false` (default = true) |

---

## Gates de execucao

### Gate 1 (antes de E0.2)
- [ ] Login funciona end-to-end
- [ ] Profile e role carregam corretamente
- [ ] Admin consegue alterar cod_empresa de outro usuario via tela AdminUsuarios
- [ ] Admin consegue atribuir roles via tela AdminUsuarios
- [ ] Signup publico esta desabilitado
- [ ] Pelo menos 1 admin existe

### Gate 2 (antes de E0.3)
- [ ] Anon key nao acessa tabelas protegidas (retorna erro ou 0 linhas)
- [ ] Usuario empresa 1 nao ve dados empresa 2
- [ ] Admin ve dados de todas as empresas
- [ ] Nao existe policy TO anon em tabelas sensiveis
- [ ] Nao existe Storage publico com dados sensiveis (atualmente nao ha buckets)
- [ ] Edge Functions com service_role continuam gravando

### Gate 3 (antes de E0.4)
- [ ] Funcoes criticas retornam 401 sem token
- [ ] Funcoes sync retornam 403 para nao-admin
- [ ] Nao existe nenhum fetch() chamando Edge Functions sem Authorization Bearer (exceto syncCacheService.ts)
- [ ] Todas as outras chamadas sao via supabase.functions.invoke()
- [ ] Busca por `functions/v1/` retorna apenas syncCacheService.ts

---

## Ordem de execucao

1. Migracao 1 (profiles + trigger)
2. Migracao 2 (user_roles + has_role + get_user_empresa + protect_cod_empresa + admin policies)
3. Desabilitar signup publico
4. Frontend auth (AuthContext, useAuth, LoginPage, ProtectedRoute, TopNavigation, App.tsx)
5. Frontend admin (AdminUsuariosPage)
6. **GATE 1**
7. Migracao 3 (RLS ~16 tabelas)
8. **GATE 2**
9. Migracao 4 (rate_limits) + remover verify_jwt=false do config.toml + hardening 16 Edge Functions
10. **GATE 3**
11. Refatorar syncCacheService.ts (E0.4)
12. Teste end-to-end completo

