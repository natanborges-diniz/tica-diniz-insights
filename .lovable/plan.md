

## O que falta para o SSO funcionar

### Status Atual

| Item | Status |
|---|---|
| Edge function `cross-login` no Lens | Pronto |
| Card "Comunicação" na HomePage | Pronto |
| `INTERNAL_SERVICE_SECRET` no Lens | Configurado |
| `INTERNAL_SERVICE_SECRET` no Connect & Flow | Configurado (usado em `bot-lojas` e `payment-webhook`) |
| Edge function `sso-login` no Connect & Flow | **NÃO EXISTE — causa do erro 502** |

### O que precisa ser feito

Uma única ação: **criar a edge function `sso-login` no projeto Connect & Flow**.

Você precisa ir ao projeto [Connect & Flow](/projects/2a6a2d63-e981-4d12-ac70-37d22a777184) e pedir para criar:

**`supabase/functions/sso-login/index.ts`** com esta lógica:

1. Validar header `X-Service-Key` contra `INTERNAL_SERVICE_SECRET` (mesmo padrão já usado em `payment-webhook`)
2. Receber `{ email }` no body
3. Usar `createClient` com `SUPABASE_SERVICE_ROLE_KEY` (admin)
4. Chamar `auth.admin.generateLink({ type: 'magiclink', email, options: { redirectTo } })`
5. Retornar `{ url: data.properties.action_link }`

### Prompt sugerido para o Connect & Flow

Ao abrir o projeto Connect & Flow, cole algo como:

> Crie a edge function `sso-login` em `supabase/functions/sso-login/index.ts`.
> Ela deve:
> - Validar `X-Service-Key` header contra `Deno.env.get("INTERNAL_SERVICE_SECRET")` (retornar 401 se inválido)
> - Receber `{ email }` no body JSON
> - Usar `createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)` para gerar magic link: `auth.admin.generateLink({ type: 'magiclink', email, options: { redirectTo: 'https://lens-data-vision.lovable.app' } })`
> - Retornar `{ url: data.properties.action_link }` com status 200
> - Incluir CORS headers em todas as respostas
> - Sem verificação de JWT (é autenticado via service key)

### Nada mais precisa mudar

- O Lens já está completo (cross-login, card, permissões)
- O `INTERNAL_SERVICE_SECRET` já existe nos dois projetos
- Basta o `sso-login` existir no CF para o fluxo funcionar de ponta a ponta

