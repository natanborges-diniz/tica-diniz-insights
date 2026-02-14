
# FASE 4 — Integracao Hoya Completa

Plano de implementacao em 7 subfases para tornar a integracao com o laboratorio Hoya confiavel, auditavel e operacionalmente completa.

---

## F4.1 — Robustez do Gateway (timeout + retry + erros padronizados)

**Arquivo:** `supabase/functions/hoya-proxy/index.ts`

- Criar funcao `fetchWithRetry(url, options, { timeout, maxRetries, backoffMs })` que:
  - Usa `AbortController` com timeout de 15s por request
  - Retenta automaticamente em caso de HTTP 429, 503 ou timeout (ate 3 tentativas)
  - Backoff exponencial: 1s, 2s, 4s
  - Loga cada tentativa com `[hoya-proxy] Retry N/3 for ACTION`
- Padronizar respostas de erro com codigos internos:
  - `HOYA_TIMEOUT` — API nao respondeu
  - `HOYA_RATE_LIMITED` — 429 apos retries
  - `HOYA_UNAVAILABLE` — 503 apos retries
  - `HOYA_API_ERROR` — erro generico da API
  - `HOYA_CONFIG_ERROR` — secret/env faltando
- Substituir o `fetch()` direto (linha 99) pela nova funcao

**Frontend:** `src/services/hoyaService.ts` — tratar novos codigos de erro em `callHoyaProxy` para exibir mensagens amigaveis via toast

---

## F4.2 — Idempotencia de Pedido

**Banco (migracao):**
- Adicionar coluna `idempotency_key TEXT UNIQUE` na tabela `pedidos_fornecedor`
- Criar indice unico: `CREATE UNIQUE INDEX idx_idempotency ON pedidos_fornecedor(idempotency_key) WHERE idempotency_key IS NOT NULL`

**Edge Function (`hoya-proxy`):**
- Na action `criar-pedido`, antes de chamar a Hoya:
  1. Gerar `idempotency_key` = `HOYA_{cod_empresa}_{cod_os}_{hoya_environment}_{sha256(payload)}`
  2. Consultar `pedidos_fornecedor` com essa key
  3. Se existir com status != 'ERRO': retornar o registro existente (sem chamar Hoya)
  4. Se existir com status 'ERRO': permitir retry (deletar/atualizar o registro antigo nao e permitido pela politica de auditoria, entao inserir novo com mesma key nao sera possivel — nesse caso, gerar key com sufixo `_retry_N`)
  5. Inserir a key no registro de auditoria

**Frontend (`PedidoFornecedorPage.tsx`):**
- Desabilitar botao "Enviar" durante submissao (ja existe `enviando` state)
- Adicionar debounce de 2s apos clique para evitar double-click
- Se a resposta retornar registro existente (idempotency hit), exibir toast informativo "Pedido ja enviado para esta OS"

---

## F4.3 — Cache do Catalogo

**Banco (migracao):**
- Criar tabela `hoya_catalogo_cache`:
  - `id UUID PK DEFAULT gen_random_uuid()`
  - `data JSONB NOT NULL` — array completo de produtos
  - `hoya_environment TEXT NOT NULL`
  - `fetched_at TIMESTAMPTZ NOT NULL DEFAULT now()`
  - `expires_at TIMESTAMPTZ NOT NULL` — fetched_at + 24h
  - `produto_count INTEGER`
- RLS: leitura para authenticated, escrita apenas via service_role

**Edge Function (`hoya-proxy`):**
- Na action `listar-produtos`:
  1. Consultar `hoya_catalogo_cache` onde `hoya_environment = env AND expires_at > now()`
  2. Se cache valido: retornar `data` do cache com header `X-Hoya-Cache: HIT`
  3. Se cache expirado ou inexistente: buscar da API Hoya, salvar no cache, retornar com `X-Hoya-Cache: MISS`
- Nova action `invalidar-cache`: permite admin forcar refresh do catalogo

**Frontend:**
- `hoyaService.ts`: adicionar `forceRefresh?: boolean` como parametro opcional em `listarProdutosHoya()`
- `PedidoFornecedorPage.tsx`: remover loading pesado; adicionar botao "Atualizar Catalogo" para admin

---

## F4.4 — Campos Complementares Dinamicos

**Edge Function (`hoya-proxy`):**
- A action `consultar-produto` ja existe e retorna `camposComplementares` do produto

**Frontend (`PedidoFornecedorPage.tsx`):**
- Apos selecionar o produto final (`produtoSelecionado`), verificar `produtoSelecionado.camposComplementares`
- Para cada campo complementar:
  - Renderizar Input com label = `nome`, placeholder com `valorPadrao`
  - Se `obrigatorio = true`, marcar como required e bloquear envio
  - Aplicar validacao de range (`rangeMinimo` / `rangeMaximo`) e incremento
- Novo state: `camposComplementaresValues: Record<number, string>`
- No payload de envio, adicionar array `camposComplementares: [{ codigo, valor }]`

**Validacao (`hoyaValidationService.ts`):**
- Adicionar validacao: se produto tem `camposComplementares` obrigatorios e nao preenchidos, retornar erro

---

## F4.5 — Tracking e Status History

**Banco (migracao):**
- Criar tabela `pedido_status_history`:
  - `id UUID PK`
  - `pedido_fornecedor_id UUID FK -> pedidos_fornecedor(id)`
  - `status TEXT NOT NULL`
  - `status_producao TEXT`
  - `rastreio TEXT`
  - `observacao TEXT`
  - `checked_at TIMESTAMPTZ DEFAULT now()`
- RLS: mesmas politicas de `pedidos_fornecedor` (admin le tudo, gestor le por empresa)
- Indice em `pedido_fornecedor_id`

**Edge Function (`hoya-proxy`):**
- Nova action `atualizar-tracking`:
  1. Receber `pedidoFornecedorId` ou `numeroPedido`
  2. Chamar `GET /pedido/tracking/{numeroPedido}` na API Hoya
  3. Comparar status retornado com ultimo status salvo em `pedido_status_history`
  4. Se mudou: inserir nova entrada em `pedido_status_history` e atualizar `pedidos_fornecedor.status`
  5. Retornar timeline completa

**Cron Job (SQL via pg_cron + pg_net):**
- A cada 30 minutos, chamar `hoya-proxy` com action `atualizar-tracking-batch`:
  - Buscar `pedidos_fornecedor` com `status NOT IN ('Entregue', 'Cancelado', 'ERRO')` e `numero_pedido IS NOT NULL`
  - Para cada pedido, chamar tracking e atualizar historico
  - Limitar a 20 pedidos por execucao para nao estourar rate limit

**Frontend:**
- Nova pagina `src/pages/HoyaTrackingPage.tsx` em rota `/os/tracking`:
  - Filtros: empresa, periodo, status
  - Tabela com: OS, Nro Pedido, Status, Ultima Atualizacao, Rastreio
  - Ao clicar em um pedido: expandir timeline com historico de status
  - Botao "Atualizar agora" para refresh manual de um pedido
- Link de acesso:
  - Na tela de sucesso do `PedidoFornecedorPage` apos envio
  - Na `AdminPedidosAuditoriaPage` como coluna com link
  - No sidebar sob "Monitor > Tracking Hoya"

---

## F4.6 — XML/DANFE

**Edge Function (`hoya-proxy`):**
- Nova action `consultar-xml`:
  - Receber `numeroPedido` ou `chaveDanfe`
  - Chamar endpoint Hoya `GET /pedido/xml/{chave}` (ou equivalente conforme documentacao)
  - Retornar conteudo XML como texto
- Nova action `consultar-danfe`:
  - Receber `numeroPedido`
  - Chamar endpoint Hoya para obter chave DANFE e link de download

**Frontend:**
- Na `HoyaTrackingPage`: botao "XML" e "DANFE" por pedido (visivel quando `status = Faturado` ou equivalente)
- Ao clicar: abrir modal/dialog com XML formatado ou iniciar download do PDF
- `hoyaService.ts`: novas funcoes `consultarXmlHoya()` e `consultarDanfeHoya()`

> **Nota:** Esta subfase depende de confirmacao dos endpoints exatos da API Hoya para XML/DANFE. Se nao existirem, sera marcada como "bloqueada" ate validacao com o laboratorio.

---

## F4.7 — Ambiente Explicito

**Secrets:**
- Adicionar novo secret `HOYA_ENVIRONMENT` com valor `staging` ou `production`
- Remover heuristica de URL (`detectHoyaEnvironment()`)

**Edge Function (`hoya-proxy`):**
- Substituir `detectHoyaEnvironment()` por:
  ```
  const hoyaEnv = Deno.env.get("HOYA_ENVIRONMENT") || "staging";
  ```
- Guardrail de producao: se `hoyaEnv === "production"`, bloquear actions de teste e logar warning se payload vier sem campos obrigatorios
- Incluir `hoya_environment` em todos os logs e respostas

**Frontend:**
- Na `AdminPedidosAuditoriaPage`: destacar visualmente pedidos de producao vs staging
- No `PedidoFornecedorPage`: exibir badge do ambiente atual no header ("Producao" em vermelho ou "Homologacao" em amarelo) — obter via nova action `get-environment` ou incluir no response de qualquer action

---

## Ordem de Execucao Recomendada

```text
F4.7 (Ambiente)      -- pre-requisito, 1 arquivo + 1 secret
F4.1 (Retry/Timeout) -- muda apenas edge function
F4.2 (Idempotencia)  -- migracao + edge + frontend
F4.3 (Cache)         -- migracao + edge + frontend
F4.4 (Campos Compl.) -- apenas frontend + validacao
F4.5 (Tracking)      -- migracao + edge + cron + nova pagina
F4.6 (XML/DANFE)     -- depende de confirmacao API
```

---

## Resumo de Artefatos por Subfase

| Subfase | Migracoes | Edge Function | Frontend | Secrets |
|---------|-----------|---------------|----------|---------|
| F4.1 | -- | hoya-proxy (retry) | hoyaService (erros) | -- |
| F4.2 | 1 (idempotency_key) | hoya-proxy (check) | PedidoFornecedor (debounce) | -- |
| F4.3 | 1 (hoya_catalogo_cache) | hoya-proxy (cache) | PedidoFornecedor + hoyaService | -- |
| F4.4 | -- | -- | PedidoFornecedor + validacao | -- |
| F4.5 | 1 (pedido_status_history) | hoya-proxy (tracking) | HoyaTrackingPage (nova) | -- |
| F4.6 | -- | hoya-proxy (xml/danfe) | HoyaTrackingPage (botoes) | -- |
| F4.7 | -- | hoya-proxy (env) | AdminPedidos + PedidoFornecedor | HOYA_ENVIRONMENT |

