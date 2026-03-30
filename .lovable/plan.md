

# Plano: Adicionar campo USUARIO à configuração Haytek e corrigir autenticação

## Problema identificado

A documentação Haytek fornece **três dados de acesso**:
- LOJA: `SP0156`
- USUARIO: `sp.osasco.adm@oticasdiniz.com.br`
- TOKEN: `eyJhbGciOiJIUzI1NiIs...`

Porém nosso sistema **só armazena o TOKEN** (campo `api_key_staging` na tabela `fornecedor_configuracao`). O campo USUARIO não existe em nenhum lugar do sistema.

Além disso, o token salvo no banco tem **127 caracteres**, mas o token correto fornecido tem **~131 caracteres** — indicando que pode estar truncado ou ser de uma versão anterior.

## Correções

### 1. Migração: adicionar campos de usuário à tabela `fornecedor_configuracao`

Adicionar `api_user_staging` e `api_user_production` (text, nullable) para armazenar o email/usuário do fornecedor por ambiente.

### 2. Atualizar dados: salvar o usuário e o token correto

- `api_user_staging` = `sp.osasco.adm@oticasdiniz.com.br`
- `api_key_staging` = token completo sem quebras de linha (131 chars)

### 3. Proxy `haytek-proxy/index.ts`

- Carregar `api_user_staging`/`api_user_production` junto com os demais campos
- Enviar o usuário no header `X-User` (ou campo equivalente) nas chamadas à API Haytek
- Se a API não aceitar como header, tentar como campo `user` no body do payload
- Log mascarado do usuário para debug

### 4. Tela Admin Fornecedores (`AdminFornecedoresPage.tsx`)

- Adicionar campo "Usuário API" (staging e produção) na seção de credenciais da aba Haytek
- Segue o mesmo padrão visual dos campos de API Key existentes

### 5. Tipos (`haytekService.ts`)

- Atualizar `HaytekRuntimeConfig` no proxy para incluir `apiUser`

## Resultado esperado

O proxy enviará tanto o token (`Authorization: Bearer`) quanto o usuário (header ou body) conforme necessário, resolvendo o 401.

