
# Cutover Haytek → Produção (todas as lojas Diniz)

## Objetivo
Ativar o ambiente de produção da API Haytek para todas as 9 lojas Diniz já configuradas, usando o token e a base URL informados no PDF, mantendo o staging preservado para rollback rápido.

## Credenciais (do PDF)
- **Base URL produção:** `https://dev.haytek.com.br`
- **Token produção (loja master SP0156):** `eyJ...hxYI6VKq-4oIDkKvxpBucac-BrQvixbifS4VTLKM-oQ`
- **Path da API:** mantém `/external/api/v1/haytek-public` (igual ao staging)

> Observação: o token é único e atende todas as lojas (mesmo padrão do staging). O `storeId` por loja já está mapeado em `haytek_empresa_config`.

## Etapas

### 1. Atualizar configuração no banco
Atualizar a linha de `fornecedor_configuracao` onde `fornecedor='HAYTEK'`:
- `base_url_production = 'https://dev.haytek.com.br'`
- `api_key_production = '<token do PDF>'`
- `ambiente = 'production'` (vira o ambiente ativo)

Mantém `api_key_staging` e `base_url_staging` intactos para rollback.

### 2. Validar via Edge Function
Após salvar, disparar uma chamada de teste no `haytek-proxy` (action `consultar-pedido` com um orderId conhecido, ou um `criar-pedido` mínimo no SP0156) e conferir nos logs:
- `Env: production`
- `Base: https://dev.haytek.com.br`
- HTTP 2xx da Haytek

### 3. UI Admin > Fornecedores
Confirmar visualmente em `/admin/fornecedores` que:
- Badge mostra "Produção"
- Token de produção aparece mascarado
- Botão de "Testar conexão" (se existente) responde OK

### 4. Smoke test operacional
Pedido real de teste em SP0156 (loja 1) via `/pedido-haytek/:codOs`, validar:
- Pedido criado, `numero_pedido` retornado
- Aparece em `pedidos_fornecedor` com `hoya_environment = 'production'`
- Tracking funciona (`atualizar-tracking`)

### 5. Comunicação
Após confirmação do smoke test, as outras 8 lojas Diniz já passam a operar em produção automaticamente (mesma config global). Nenhum deploy adicional necessário.

## Rollback
Caso algo dê errado: reverter `ambiente = 'staging'` na mesma linha de `fornecedor_configuracao` (1 update SQL). Token e URL de staging continuam preservados.

## Sem mudanças de código
Esta operação é **somente configuração**. O `haytek-proxy/index.ts` já lê `ambiente`, `base_url_production` e `api_key_production` dinamicamente do banco — não precisa de redeploy nem alteração de código.

## Detalhes técnicos

```text
fornecedor_configuracao (HAYTEK)
├── ambiente: staging        → production
├── base_url_staging:        https://stg-api.haytek.com.br   (preservada)
├── base_url_production:     NULL                            → https://dev.haytek.com.br
├── api_key_staging:         <preservado>
└── api_key_production:      NULL                            → <token PDF>
```

Resolução em runtime (`loadHaytekGlobalConfig`):
```text
isProd = (ambiente === 'production')
baseUrl = isProd ? base_url_production : base_url_staging
apiKey  = isProd ? api_key_production  : api_key_staging
```

Como o token será gravado via SQL direto (DB column existente), uso o tool `secrets--update_secret` **não é necessário** — manteremos o padrão atual da integração.
