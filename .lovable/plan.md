

## Plano: SSO Cross-Project — Login Automático no Connect & Flow via Lens

### Abordagem

Manter os dois projetos separados. Adicionar um card "Comunicação" na Home do Lens que, ao clicar, faz login automático no Connect & Flow via **magic link** gerado por edge function. O usuário é redirecionado sem precisar digitar credenciais novamente.

```text
┌─────────────┐    1. click "Comunicação"     ┌──────────────┐
│   Lens      │ ──────────────────────────────→│  Lens Edge   │
│  (Home)     │                                │  cross-login │
└─────────────┘                                └──────┬───────┘
                                                      │ 2. POST com email +
                                                      │    INTERNAL_SERVICE_SECRET
                                                      ▼
                                               ┌──────────────┐
                                               │  CF Edge     │
                                               │  sso-login   │
                                               └──────┬───────┘
                                                      │ 3. auth.admin.generateLink
                                                      │    (magic link para o email)
                                                      ▼
                                               ┌──────────────┐
                                               │  Retorna URL │
                                               │  magic link  │
                                               └──────┬───────┘
                                                      │
              4. window.location.href = magicLink     │
┌─────────────┐ ◄─────────────────────────────────────┘
│ Connect &   │  (auto-login, redireciona para dashboard)
│ Flow        │
└─────────────┘
```

### Pré-requisito

Os usuários que precisam acessar o Connect & Flow devem existir em **ambos** os projetos com o **mesmo e-mail**. O admin do Lens já gerencia usuários — basta garantir que o mesmo e-mail esteja cadastrado no CF.

### Execução

#### 1. Edge Function no Connect & Flow: `sso-login`
- Recebe `{ email }` + valida `X-Service-Key` contra `INTERNAL_SERVICE_SECRET`
- Chama `auth.admin.generateLink({ type: 'magiclink', email, options: { redirectTo: origin } })`
- Retorna a URL do magic link
- Sem JWT do usuário necessário — autenticação via service key

#### 2. Edge Function no Lens: `cross-login`
- Recebe `{ email }` do usuário autenticado (validado via authGuard)
- Faz fetch para a URL do CF (`https://kvggebtnqmxydtwaumqz.supabase.co/functions/v1/sso-login`) com `X-Service-Key`
- Retorna a magic link URL para o frontend

#### 3. HomePage — Card "Comunicação"
- Novo card com ícone `MessageSquare` e permissão via módulo `comunicacao`
- Ao clicar: chama edge function `cross-login`, recebe a URL, redireciona com `window.open(url, '_blank')`
- O CF abre em nova aba, já logado

#### 4. Permissões
- Adicionar `"comunicacao"` ao tipo `ModuleKey` no `AppLayout.tsx`
- Criar registros em `user_module_permissions` para os usuários que devem ver o card
- Não precisa de rotas internas — é um link externo

### Segurança
- O magic link é de uso único e expira em minutos
- A edge function do CF só aceita chamadas com `INTERNAL_SERVICE_SECRET`
- O e-mail vem do JWT validado no Lens (não pode ser forjado)
- O CF precisa ter o mesmo `INTERNAL_SERVICE_SECRET` configurado (já tem)

### Arquivos a Alterar/Criar

| Arquivo | Mudança |
|---|---|
| `supabase/functions/cross-login/index.ts` (Lens) | Nova edge function — proxy para CF |
| Edge function `sso-login` (Connect & Flow) | Nova — gera magic link |
| `src/pages/HomePage.tsx` | Adicionar card "Comunicação" com lógica de redirect |
| `src/components/layout/AppLayout.tsx` | Adicionar `"comunicacao"` ao tipo `ModuleKey` |
| `src/hooks/useModulePermissions.ts` | Incluir `"comunicacao"` na lista `ALL_MODULES` |

### O que NÃO muda
- Nenhuma tabela nova no banco
- Nenhuma migração de dados
- Connect & Flow continua independente
- Você continua trabalhando nos dois projetos separadamente

