# Prompt pronto para colar no Lovable — diagnóstico do cron `sync-estoque` (SÓ LEITURA)

Cole o bloco abaixo diretamente no Lovable. Ele pede apenas leitura/diagnóstico, **nenhuma alteração, criação ou delete**.

**Contexto para o Lovable:** as edge functions `sync-estoque-completo`, `sync-estoque-loja` e `sync-estoque-orchestrator` existem e a tabela `public.estoque_sincronizado` existe, mas a sincronização está **congelada desde ~01/07**. Hipóteses a investigar:

1. Comando errado no cron (URL, header, action inválidos).
2. `pg_net` travado (requests enfileirados, sem resposta).
3. Path divergente entre o `command` do cron e o path real da edge function no Supabase.

---

## PROMPT

Preciso de um diagnóstico do cron `sync-estoque` deste projeto. A sincronização está congelada desde ~01/07 e não sei se o cron parou, se está disparando com erro, ou se está disparando mas o `pg_net` não completa. **NÃO altere, NÃO crie, NÃO delete, NÃO reative jobs e NÃO reexecute nada.** Só rode as queries abaixo e me devolva os resultados brutos. Depois eu decido o próximo passo.

Rode as 5 queries na ordem (L1 → L5) e devolva cada uma separada com o resultado bruto (linhas ou "vazio").

---

### L1 — Jobs de cron relacionados a estoque

Buscar por **nome** e por **command**, pois o job pode ter nome genérico e só o command referenciar a edge function.

```sql
-- L1a) Jobs por nome
SELECT jobid, jobname, schedule, active, command
FROM cron.job
WHERE jobname ILIKE '%estoque%'
   OR jobname ILIKE '%sync%'
ORDER BY jobname;

-- L1b) Jobs por command (chamada a qualquer sync-estoque-*)
SELECT jobid, jobname, schedule, active, command
FROM cron.job
WHERE command ILIKE '%sync-estoque-completo%'
   OR command ILIKE '%sync-estoque-loja%'
   OR command ILIKE '%sync-estoque-orchestrator%'
ORDER BY jobname;
```

**O que preciso ver:** `jobid`, `jobname`, `schedule`, `active` e o `command` **completo** (URL, headers, action). Se o job estiver com `active = false`, me diga. Se o command apontar pra path diferente de `/functions/v1/sync-estoque-completo`, `/functions/v1/sync-estoque-loja` ou `/functions/v1/sync-estoque-orchestrator`, destaque a divergência.

---

### L2 — Últimas 20 execuções desses jobs (`cron.job_run_details`)

Precisamos saber **quando o cron parou** e **por quê** (erro explícito ou silêncio).

```sql
-- L2) Últimas 20 execuções dos jobs identificados em L1
SELECT
  jrd.jobid,
  j.jobname,
  jrd.status,
  jrd.return_message,
  jrd.start_time,
  jrd.end_time
FROM cron.job_run_details jrd
JOIN cron.job j ON j.jobid = jrd.jobid
WHERE j.jobname ILIKE '%estoque%'
   OR j.jobname ILIKE '%sync%'
   OR j.command ILIKE '%sync-estoque-completo%'
   OR j.command ILIKE '%sync-estoque-loja%'
   OR j.command ILIKE '%sync-estoque-orchestrator%'
ORDER BY jrd.start_time DESC
LIMIT 20;
```

**O que preciso ver:**
- `status` de cada run (`succeeded` / `failed`).
- `return_message` — se veio erro, quero o texto exato.
- `start_time` da execução mais recente — comparar com hoje pra saber há quantos dias o cron não roda.
- Se houve **transição de sucesso → falha**, me aponte a data.
- Se a tabela `cron.job_run_details` estiver **vazia** para esses jobs, me confirme.

---

### L3 — Últimas respostas HTTP do `pg_net` (`net._http_response`)

Se o cron dispara mas o `pg_net` não completa (ou completa com erro HTTP), a evidência está aqui.

```sql
-- L3a) Respostas recentes de requests que bateram nas edge functions sync-estoque-*
SELECT
  id,
  status_code,
  content_type,
  LEFT(content::text, 500) AS content_preview,
  error_msg,
  created
FROM net._http_response
WHERE id IN (
  SELECT id FROM net._http_request_queue
  WHERE url ILIKE '%sync-estoque-completo%'
     OR url ILIKE '%sync-estoque-loja%'
     OR url ILIKE '%sync-estoque-orchestrator%'
)
ORDER BY created DESC
LIMIT 20;

-- L3b) Requests enfileirados que ainda NÃO têm resposta (pg_net travado?)
SELECT
  q.id,
  q.method,
  q.url,
  q.created
FROM net._http_request_queue q
LEFT JOIN net._http_response r ON r.id = q.id
WHERE (q.url ILIKE '%sync-estoque-completo%'
    OR q.url ILIKE '%sync-estoque-loja%'
    OR q.url ILIKE '%sync-estoque-orchestrator%')
  AND r.id IS NULL
ORDER BY q.created DESC
LIMIT 20;
```

**O que preciso ver:**
- `status_code` — se veio `401`/`403` é problema de auth do cron; `404` é path divergente; `5xx` é erro na edge function; `null` + `error_msg` é problema de rede/timeout.
- `content_preview` — corpo da resposta, especialmente em erros (`4xx`/`5xx`).
- `error_msg` — mensagem do próprio `pg_net` se o request falhou antes de resposta HTTP.
- Se **L3b não estiver vazio** (requests enfileirados sem resposta), é evidência forte de `pg_net` travado — me traga os `created` mais antigos.
- Se o schema `net` ou as tabelas `_http_response` / `_http_request_queue` **não existirem** neste projeto, me diga (a extensão `pg_net` pode estar desabilitada).

---

### L4 — Estado atual da tabela `estoque_sincronizado`

Confirmar oficialmente há quanto tempo cada loja não recebe update.

```sql
-- L4a) Total de linhas
SELECT COUNT(*) AS total_linhas FROM public.estoque_sincronizado;

-- L4b) Linhas + última atualização por cod_empresa
SELECT
  cod_empresa,
  COUNT(*) AS linhas,
  MAX(atualizado_em) AS ultima_atualizacao
FROM public.estoque_sincronizado
GROUP BY cod_empresa
ORDER BY cod_empresa;

-- L4c) Última sync global (independente de loja)
SELECT MAX(atualizado_em) AS ultima_sync_global
FROM public.estoque_sincronizado;
```

**O que preciso ver:**
- `total_linhas` global.
- Por `cod_empresa`: `linhas` + `ultima_atualizacao`.
- `ultima_sync_global` — vai confirmar (ou refutar) a hipótese de "congelou em ~01/07".
- Se alguma loja está **muito mais atrasada** que as outras, aponte.

---

### L5 — Logs / invocações recentes das 3 edge functions

Se você (Lovable) tem acesso aos logs de invocação das edge functions do Supabase (via dashboard ou API), me diga para cada uma das 3:

- `sync-estoque-completo`
- `sync-estoque-loja`
- `sync-estoque-orchestrator`

Devolva:

- **Última invocação** (timestamp).
- **Resultado** dessa última invocação (status HTTP + mensagem, se houver).
- **Quantas invocações** nos últimos 7 e 30 dias.
- Se houve **erro recorrente** (mesmo stack/mensagem), me traga o texto.

Se você não tem acesso aos logs de invocação, apenas me confirme: **"sem acesso aos logs de edge functions"** — nesse caso eu vou olhar no dashboard do Supabase manualmente.

---

### Formato da resposta

Para cada uma das 5 verificações (L1 → L5), devolva:

1. **Query executada** (ou "sem acesso" no caso de L5).
2. **Resultado bruto** (linhas ou "vazio").
3. **Observação sua**, se houver algo evidente (ex.: "job com `active=false` desde X", "todos os requests em L3b têm >20 dias sem resposta", "path do command diverge do path real da function").

**Nenhuma alteração de schema, nenhum job novo, nenhum delete, nenhuma reexecução.** Só leitura + relatório.
