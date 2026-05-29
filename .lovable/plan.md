## Causa raiz

Logo após o login (e em todo reload com sessão válida), aparece o toast vermelho **"Erro ao carregar — Fetch is aborted"** na tela `/estoque`, embora os dados sejam carregados normalmente ~2 segundos depois.

Reproduzido nos logs (login 17:28:13 → primeiro lote falha 17:28:18 → segundo lote sucede 17:28:20). O sintoma vem de **três problemas combinados**, não de um bug do Bridge nem do Supabase:

### 1. `AuthContext` dispara `loadUserData` em duplicidade (origem do burst)

`src/contexts/AuthContext.tsx` (linhas 55–96) faz, no mesmo `useEffect`:

- registra `supabase.auth.onAuthStateChange(...)` — que **dispara imediatamente** o evento `INITIAL_SESSION` com a sessão atual, chamando `loadUserData`;
- **em paralelo** chama `supabase.auth.getSession()` — cujo `.then(...)` também chama `loadUserData`.

Resultado: 2 ciclos de `setUser` + `setProfile` + `setRoles` quase simultâneos. Cada `setUser` re-renderiza todo o app autenticado, que reabre conexões fetch para Supabase REST e Firebird Bridge. No Safari (`TypeError: Load failed` é a assinatura clássica dele) o segundo render cancela os fetches do primeiro → "Fetch is aborted".

### 2. `useEstoqueUnificado` mostra toast de erro mesmo quando o erro é um cancelamento

`src/hooks/useEstoqueUnificado.ts` (linhas 904–935 e o auto-load 941–952):

- O `carregarDados` é disparado pelo auto-load assim que `filters.empresa` muda de `null` → valor real (vindo do `useDefaultEmpresa`/profile).
- Como o profile é setado 2x pelo problema 1, o auto-load também executa 2x; o primeiro `Promise.all([getEstoqueCompleto, getAnaliseSku])` é cancelado pelo re-render.
- No `catch` (linha 928–931) não há filtro: qualquer erro vira `toast({ title: "Erro ao carregar", ... })` — inclusive `REQUEST_CANCELLED` / "Load failed".

### 3. `firebirdBridge` já tem o código de cancelamento, mas o consumidor não o filtra

`src/services/firebirdBridge.ts` (linhas 237–246) **já** marca erros cancelados como `code: 'REQUEST_CANCELLED'`. O Supabase JS, porém, só joga `TypeError: Load failed`. Precisamos detectar ambos no consumidor.

---

## O que vai mudar

### Arquivo 1 — `src/contexts/AuthContext.tsx`
Aplicar o padrão oficial Supabase para evitar a duplicidade:
- Registrar `onAuthStateChange` primeiro, fazendo **apenas** updates síncronos no callback;
- Deferir `loadUserData` com `setTimeout(..., 0)` (evita deadlock dentro do callback);
- Chamar `getSession()` somente para seed inicial; **não** disparar `loadUserData` ali — o `INITIAL_SESSION` que o `onAuthStateChange` emite já faz isso;
- Guardar o último `userId` carregado em um `ref` e ignorar callbacks com o mesmo userId que já está carregado (deduplica `INITIAL_SESSION` + eventual `TOKEN_REFRESHED` cedo).

### Arquivo 2 — `src/lib/isAbortError.ts` (novo, ~15 linhas)
Helper único para detectar erros de cancelamento, cobrindo:
- `err.name === 'AbortError'`
- `err.code === 'REQUEST_CANCELLED'`
- mensagens contendo `aborted`, `Load failed`, `Fetch is aborted`, `cancelled`
- `DOMException` com `name === 'AbortError'`

### Arquivo 3 — `src/hooks/useEstoqueUnificado.ts`
- No `catch` de `carregarDados` (linhas 928–934): se `isAbortError(err)`, apenas logar em `console.debug` e sair sem `setError` / sem toast.
- No auto-load (941–952): adicionar guarda extra `if (loadingEmpresas) return;` para não disparar antes de o AuthContext terminar de carregar o profile.

### Arquivo 4 — `src/hooks/useUserEmpresas.ts` e `src/hooks/useEmpresas.ts`
Aplicar o mesmo `isAbortError` para silenciar warnings/toasts irrelevantes durante o burst inicial.

### Arquivo 5 (opcional, escopo enxuto) — `src/services/empresaService.ts`
O log `"Supabase falhou para empresas, tentando Firebird Bridge"` aparece duas vezes apenas porque o `Load failed` inicial dispara o fallback. Após corrigir o AuthContext o fallback não vai mais acionar; nenhuma mudança aqui é necessária além de degradar o `console.warn` para `console.debug` quando `isAbortError(error)`.

---

## Como vou validar

1. Recarregar `/estoque` logado e confirmar que **não há mais toast vermelho** "Fetch is aborted".
2. Conferir nos logs do console que `[FirebirdBridge] GET /estoque/completo` aparece **uma única vez** por carregamento (em vez de duas).
3. Conferir nos network requests que `user_roles`, `profiles`, `empresa`, `capacidade_expositor` são chamados **uma vez** logo após o login (em vez de duas falhando + duas sucedendo).
4. Login → navegar para `/estoque` → trocar de loja: dados continuam carregando normalmente e o toast verde "Dados Carregados" aparece.

## O que NÃO vai mudar
- Nenhuma lógica de negócio do estoque, OTB, plano de compra.
- Nenhuma alteração no `firebird-bridge`, em RLS, ou em Edge Functions.
- Nenhuma mudança nas telas de pedido Hoya / Zeiss / Haytek.
