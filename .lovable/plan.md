

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

### Gate 3 (antes de E0.4) ✅ CONCLUÍDO
- [x] Funcoes criticas retornam 401 sem token
- [x] Funcoes sync retornam 403 para nao-admin
- [x] Nao existe nenhum fetch() chamando Edge Functions sem Authorization Bearer (E0.4 refatorado)
- [x] Todas as chamadas sao via supabase.functions.invoke()
- [x] Busca por `functions/v1/` retorna vazio
- [x] Sync registra user_id de quem disparou (triggered_by na resposta + console log)

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
10. **GATE 3** ✅
11. Refatorar syncCacheService.ts (E0.4) ✅
12. **FASE 0 CONCLUÍDA** ✅

---

## FASE 1 — Confiabilidade de Dados (Sync e Consistência Histórica)

### E1.1 — Sync Control Plane ✅

**Tabelas criadas:**
- `sync_runs`: execuções (status, janela, empresas, triggered_by, métricas, timestamps)
- `sync_jobs`: jobs por entidade dentro de uma run (métricas granulares)
- Enum `sync_run_status`: pending, running, completed, failed, partial

**orchestrate-sync refatorado:**
- Entry point único para sync manual e agendado
- 3 modos: `janela_movel` (default 7d), `competencia` (mês), `full`
- Registra sync_run + sync_jobs com métricas completas
- Executa entidades em ordem: clientes → produtos → vendas → agregados-diarios
- Suporta service_role (cron) e admin JWT (manual)
- Idempotência via delete+insert nas sub-functions

**Política de re-sync:**
- Janela móvel padrão: 7 dias (configurável via `diasJanela`)
- Reprocessamento por competência: `modo: 'competencia', competenciaAno: 2025, competenciaMes: 1`
- Admin pode forçar janela customizada via `dataInicio/dataFim`

**Cron (preparado, não ativado):**
```sql
-- Executar diariamente às 06:00 UTC (janela móvel 7 dias)
select cron.schedule(
  'sync-diario-automatico',
  '0 6 * * *',
  $$
  select net.http_post(
    url:='https://zmsfntqgxsstnbpzdled.supabase.co/functions/v1/orchestrate-sync',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer SERVICE_ROLE_KEY"}'::jsonb,
    body:='{"modo": "janela_movel", "diasJanela": 7}'::jsonb
  ) as request_id;
  $$
);
```

### E1.2 — Agendamento + Observabilidade ✅

**Cron ativado:**
- `sync-janela-movel-hourly`: a cada hora, `orchestrate-sync` em modo `janela_movel` (7 dias)
- `cleanup-sync-logs-weekly`: domingos 03:00 UTC, `cleanup_old_sync_logs(90)` — retenção 90 dias

**Lock de concorrência:**
- Tabela `sync_locks` com funções `acquire_sync_lock` / `release_sync_lock`
- Lock key = `sync:{modo}` — impede dois runs do mesmo modo simultaneamente
- Se lock ocupado → HTTP 409, run registrado com `error_code: LOCK_BUSY`
- Lock expira em 30 min (fallback para runs travados)

**Observabilidade:**
- Campos adicionados em `sync_runs`: `error_code`, `error_message`, `error_step`, `is_auto_triggered`
- View `sync_failures_summary`: falhas e parciais dos últimos 7 dias com contagem de jobs falhos
- View `sync_runs_recent`: últimos 30 dias de runs com todos os campos

**Retenção:**
- Função `cleanup_old_sync_logs(p_retention_days)` remove runs/jobs/locks > 90 dias
- Agendada via cron semanal

### E1.3 — Reprocessamento por Competência + UI Admin ✅

**Schema:**
- Colunas adicionadas em `sync_runs`: `request_reason` (TEXT), `competencia` (TEXT, formato YYYY-MM)

**orchestrate-sync:**
- Grava `competencia` e `request_reason` automaticamente em sync_runs
- Modo `competencia` calcula janela pelo mês/ano e registra auditoria
- Lock respeitado: retorna 409 se ocupado

**UI Admin (`/admin/sync`):**
- Seletor de empresa (ou todas)
- Seletor de competência (últimos 12 meses)
- Campo obrigatório de motivo/justificativa
- Diálogo de confirmação com impacto estimado
- Tabela de histórico com status, duração, erros, motivo

**Sidebar:**
- Menu "Sync & Reprocessamento" adicionado em Config (admin only)
- Link "Usuários" reativado (sem flag disabled)

### E1.4 — Próximos passos (não iniciado)
- [ ] Padronizar outputs das sub-functions (sync-vendas, sync-clientes, sync-produtos)
- [ ] Alertas push/email em caso de falhas consecutivas

---

## FASE 2 — Resiliência e Padronização

### E2.1 — Monitoramento Bridge Health ✅
- Health check a cada 5 min via Edge Function
- Tabela `bridge_health_logs` com status, latência, versão
- Limpeza automática de logs > 30 dias

### E2.2 — Degradação Controlada ✅
- Circuit breaker no client (`useBridgeStatus.ts`): 3 falhas → bloqueia 60s
- Monitor de OS sem `empresa=ALL` automático — exige seleção de empresa
- `BridgeStatusBanner` reutilizável para todas as telas
- Empresa pré-selecionada pelo perfil do usuário; "Todas" apenas para admin

### E2.3 — Padronização do Contrato Bridge ✅

**Contrato v2 — Envelope Único:**

```
// Sucesso (HTTP 200)
{
  "ok": true,
  "data": [ ... ],
  "meta": {                    // opcional
    "count": 42,
    "elapsed_ms": 230,
    "endpoint": "/vendas/resumo-empresa-vendedor"
  }
}

// Erro (HTTP 400/500/503)
{
  "ok": false,
  "error": {
    "code": "FIREBIRD_TIMEOUT",    // código máquina
    "message": "Firebird não respondeu em 30s"  // mensagem humana
  },
  "details": { ... }              // opcional, debug
}
```

**Códigos de erro padronizados:**

| code | HTTP | Descrição |
|------|------|-----------|
| `VALIDATION_ERROR` | 400 | Parâmetro inválido ou ausente |
| `FIREBIRD_TIMEOUT` | 503 | Firebird não respondeu |
| `FIREBIRD_DISCONNECTED` | 503 | Bridge sem conexão com Firebird |
| `QUERY_ERROR` | 500 | Erro na execução da query |
| `INTERNAL_ERROR` | 500 | Erro genérico do servidor |
| `NOT_FOUND` | 404 | Recurso não encontrado |

**Frontend (`firebirdBridge.ts`):**
- Aceita envelope v2 como formato principal
- Suporte temporário a formatos legados (`{ data }`, `{ rows }`, `[...]`) com logging de deprecação
- Formato não reconhecido → erro explícito (não retorna array vazio silenciosamente)
- Cada endpoint legado logado uma vez por sessão no console para rastreamento

**Guia de migração backend (firebird-bridge):**

Cada endpoint deve ser atualizado para usar o helper:

```javascript
// helpers/response.js (novo no backend)
function success(res, data, meta = {}) {
  return res.json({ ok: true, data, meta: { count: data.length, ...meta } });
}

function error(res, code, message, statusCode = 500, details = null) {
  return res.status(statusCode).json({
    ok: false,
    error: { code, message },
    ...(details && { details }),
  });
}

module.exports = { success, error };
```

**Prioridade de migração dos endpoints:**

1. `/api/v1/health` — já migrado parcialmente
2. `/api/v1/vendas/resumo-empresa-vendedor` — mais usado
3. `/api/v1/vendas/resumo-formas-pagamento`
4. `/api/v1/vendas/resumo-diario-simples`
5. `/api/v1/os/monitor-ultima-etapa`
6. `/api/v1/os/receita-completa`
7. `/api/v1/estoque/*`
8. `/api/v1/financeiro/*`
9. `/api/v1/empresas`

**Prazo:** Suporte legado será removido após todos os endpoints migrarem.
O console warn identifica automaticamente quais ainda precisam migrar.

### E2.4 — Migração Incremental para Envelope v2 ✅

**Escopo concluído:**

**Backend (`firebird-bridge/index.js` v2.4.0):**
- Helpers `success()` e `error()` substituem `apiResponse()` genérico
- `classifyError()` mapeia erros Firebird para códigos padronizados:
  - `FIREBIRD_TIMEOUT` (503): timeout, econnreset, epipe
  - `FIREBIRD_DISCONNECTED` (503): econnrefused, connection refused
  - `QUERY_ERROR` (500): dynamic sql error, dsql, token unknown
  - `VALIDATION_ERROR` (400): parâmetros ausentes/inválidos
  - `INTERNAL_ERROR` (500): fallback genérico
- `executeQuery()` agora tem timeout configurável via `QUERY_TIMEOUT_MS` (default 30s)
- Todos os 8 endpoints `/api/v1/*` migrados para `success()`/`error()` com `meta.elapsed_ms`
- `/api/v1/health` retorna envelope v2 completo com status, latency, version
- `BRIDGE_VERSION` exportada para telemetria (`2.4.0`)

**Endpoints migrados (8/9):**

| # | Endpoint | Status | Formato |
|---|----------|--------|---------|
| 1 | `/api/v1/health` | ✅ | v2 + meta |
| 2 | `/api/v1/vendas/resumo-empresa-vendedor` | ✅ | v2 + meta |
| 3 | `/api/v1/vendas/resumo-formas-pagamento` | ✅ | v2 + meta |
| 4 | `/api/v1/vendas/resumo-diario-simples` | ✅ | v2 + meta |
| 5 | `/api/v1/vendas/analise-sku` | ✅ | v2 + meta |
| 6 | `/api/v1/estoque/analise-acao` | ✅ | v2 + meta |
| 7 | `/api/v1/financeiro/parcelas` | ✅ | v2 + meta |
| 8 | `/api/v1/financeiro/dre` | ✅ | v2 + meta |
| 9 | `/api/v1/empresas` | ✅ | v2 + meta |

**Endpoints legados (NÃO migrados — serão removidos):**
- `/api/kpis` — formato objeto simples
- `/api/vendas-por-dia` — array direto
- `/api/vendas-por-loja` — array direto
- `/api/empresas` — array direto

**Frontend (`firebirdBridge.ts`):**
- Telemetria de migração: `getV2MigrationStatus()` e `getV2MigrationSummary()` rastreiam formato por endpoint
- `BridgeErrorCode` type exportado para tratamento tipado de erros
- Erros agora carregam `code` padronizado: `CIRCUIT_OPEN`, `CLIENT_TIMEOUT`, `REQUEST_CANCELLED`
- `meta.elapsed_ms` do backend logado no console para monitoramento de performance

**Ação necessária:**
- Fazer deploy do `firebird-bridge/index.js` no Railway
- Após deploy, todos os warnings de formato legado devem cessar no console do frontend

### E2.5 — Compatibilidade Controlada + Telemetria ✅

- Frontend aceita envelope v2 como formato principal
- Fallback silencioso para formatos legados (sem spam de console)
- Contagem por sessão de hits v2 vs legado (`getV2MigrationSummary()`)
- Feature flag `bridge_strict_contract` (default OFF): quando ON, rejeita legados com `BRIDGE_CONTRACT_VIOLATION`
- Painel "Telemetria de Contrato v2" na página Admin Health
- Health classificado corretamente: 200→UP, 503→DEGRADED, falha de rede→DOWN

### E2.6 — Contrato Oficial Versionado ✅

- Documento `firebird-bridge/CONTRACT.md` (v2.4.0) com:
  - Envelope padrão (sucesso + erro) com regras de campos
  - Tabela oficial de `error.code` (6 códigos)
  - Política de `meta.elapsed_ms`: sempre presente
  - 9 endpoints v2 documentados com request/response shapes
  - 4 endpoints legados listados com prazo de remoção
  - Variáveis de ambiente documentadas
  - Plano de remoção: confirmar → remover legados → deploy → strict mode → cleanup fallbacks

### E2.7 — Corte Controlado do Legado (Strict Mode Permanente) ✅

- Strict mode ativado permanentemente — `isBridgeStrictContract()` sempre retorna `true`
- Código de fallback legado (`{ data }`, `{ rows }`, `[...]`) removido do `firebirdBridge.ts`
- Contadores de legacy hits removidos (telemetria simplificada: apenas endpoints v2)
- Feature flag `setBridgeStrictContract()` mantida como no-op para compatibilidade de imports
- Toggle de strict mode removido do painel Admin Health (substituído por badge "Strict ON")
- Qualquer resposta não-v2 gera `BRIDGE_CONTRACT_VIOLATION` explícito
- Painel de telemetria mostra apenas endpoints v2 contactados na sessão

**Resultado:** Frontend aceita exclusivamente envelope `{ ok, data, error }`. Código ~80 linhas mais enxuto.

**Fase 2 — CONCLUÍDA ✅**

