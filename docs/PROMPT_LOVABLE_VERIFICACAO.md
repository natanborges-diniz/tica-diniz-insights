# Prompt pronto para colar no Lovable — verificação Supabase (só leitura)

Cole o bloco abaixo diretamente no Lovable. Ele pede apenas leitura/verificação, nenhuma alteração ou aplicação.

---

## PROMPT

Preciso de 3 verificações no Supabase deste projeto, apenas retornando o que encontrar. **NÃO altere, NÃO crie, NÃO delete e NÃO aplique nada.** Após ver as respostas eu decido os próximos passos.

---

### Verificação 1 — colisão de schema com 3 migrations pendentes

Existem 3 migrations de uma feature branch (`20260703120000`, `20260703121000`, `20260703122000`) que ainda não foram aplicadas neste Supabase. Antes de aplicá-las, verifique se algum dos objetos abaixo **já existe**. Se existir, me mostre a versão atual para comparar.

**Alterações em `public.btg_extrato`:**
- Colunas a adicionar: `transaction_id TEXT`, `dedupe_key TEXT`
- Constraint: `dedupe_key SET NOT NULL`
- Índice novo: `idx_btg_extrato_status`
- Índice único novo: `uq_btg_extrato_dedupe (dedupe_key)`

**Tabelas novas (esperado: não existem):**
- `public.btg_extrato_dedup_backup` — RLS policies "Service role full access", "Admin read"
- `public.conciliacao_extrato` — índices `idx_conc_extrato_extrato`, `idx_conc_extrato_alvo`, `idx_conc_extrato_empresa`; RLS "Service role full access", "Admin full access", "Tenant read"
- `public.extrato_regras_classificacao` — RLS "Service role full access", "Admin full access", "Authenticated read"

**Functions novas (esperado: não existem):**
- `public.fn_conciliar_extrato(uuid, jsonb, text, numeric, text, uuid)` RETURNS jsonb (SECURITY DEFINER)
- `public.fn_desconciliar_extrato(uuid, uuid)` RETURNS jsonb (SECURITY DEFINER)

**Cron jobs novos (esperado: não existem):**
- `btg-poll-status-30min` — schedule `*/30 * * * *` → chama `/functions/v1/btg-poll-status?action=executar`
- `btg-importar-extratos-diario` — schedule `20 9 * * *` → chama `/functions/v1/btg-poll-status?action=importar_extratos`
- `conciliar-extrato-diario` — schedule `40 9 * * *` → chama `/functions/v1/conciliar-extrato?action=executar`

**Queries sugeridas:**

```sql
-- 1a) Colunas de btg_extrato
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'btg_extrato'
ORDER BY ordinal_position;

-- 1b) Tabelas novas existem?
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'btg_extrato_dedup_backup',
    'conciliacao_extrato',
    'extrato_regras_classificacao'
  );

-- 1c) Índices existem?
SELECT indexname
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname IN (
    'idx_btg_extrato_status',
    'uq_btg_extrato_dedupe',
    'idx_conc_extrato_extrato',
    'idx_conc_extrato_alvo',
    'idx_conc_extrato_empresa'
  );

-- 1d) Functions existem?
SELECT proname, pg_get_function_arguments(oid) AS args
FROM pg_proc
WHERE pronamespace = 'public'::regnamespace
  AND proname IN ('fn_conciliar_extrato','fn_desconciliar_extrato');

-- 1e) Cron jobs existem?
SELECT jobname, schedule, active
FROM cron.job
WHERE jobname IN (
  'btg-poll-status-30min',
  'btg-importar-extratos-diario',
  'conciliar-extrato-diario'
);
```

Se **qualquer objeto** já existir, me mostre a versão atual completa (colunas / argumentos / schedule) para comparar com o esperado acima.

---

### Verificação 2 — tabela `estoque_sincronizado`

Preciso confirmar se o cron de sync-estoque está populando a tabela:

```sql
-- 2a) Total de linhas
SELECT COUNT(*) AS total_linhas FROM public.estoque_sincronizado;

-- 2b) Linhas por loja + última atualização por loja
SELECT
  cod_empresa,
  COUNT(*) AS linhas,
  MAX(atualizado_em) AS ultima_atualizacao
FROM public.estoque_sincronizado
GROUP BY cod_empresa
ORDER BY cod_empresa;

-- 2c) Última sync global (qualquer loja)
SELECT MAX(atualizado_em) AS ultima_sync_global
FROM public.estoque_sincronizado;
```

Traga os resultados exatos.

---

### Verificação 3 — cron das syncs de estoque

O código do frontend afirma que `sync-estoque-orchestrator` roda "diariamente às 07:00", mas não achei essa configuração em migrations versionadas. Preciso saber se está agendado via `pg_cron`:

```sql
-- 3a) Jobs cujo nome menciona sync-estoque
SELECT jobname, schedule, active, command
FROM cron.job
WHERE jobname ILIKE '%sync-estoque%'
   OR jobname ILIKE '%estoque%';

-- 3b) Jobs cujo command chama uma das edge functions
SELECT jobname, schedule, active, command
FROM cron.job
WHERE command ILIKE '%sync-estoque-completo%'
   OR command ILIKE '%sync-estoque-loja%'
   OR command ILIKE '%sync-estoque-orchestrator%';
```

Se ambas as queries retornarem vazio, me confirme que **não há cron agendado para essas syncs** e me diga como o Lovable está executando o sync hoje (manual? outro mecanismo?).

---

### Formato da resposta

Para cada verificação, retorne:
- Query executada
- Resultado bruto (linhas ou "vazio")
- Sua observação, se houver

**Nenhuma alteração de schema, nenhum job novo, nenhum delete.** Só leitura + relatório.
