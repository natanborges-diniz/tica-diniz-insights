# API do Extrato Eletrônico Cielo — o que falta

A documentação oficial de consumo esclareceu a autenticação, e ela é mais
simples do que o PDF de onboarding sugeria: **OAuth2 + assinatura HMAC**, não
TLS mútuo. Isso remove o principal risco técnico — HMAC o Deno faz nativamente
com Web Crypto, então o Supabase dá conta.

O código já está implementado nesse formato. Falta só a credencial.

## Como a API funciona

Três passos, todos dentro da `cielo-extrato-proxy`:

1. **Token OAuth2** — `client_credentials` com `client_id` e `client_secret`.
2. **`POST /link/generate`** — corpo com `merchantCode`, `fileType`,
   `processType`, `startDate`, `endDate`; headers `Authorization: Bearer` e
   `X-Signature` (HMAC do corpo).
3. **Download** — a API devolve links temporários; o proxy baixa os arquivos na
   mesma execução, antes de expirarem, e entrega ao parser.

Endpoint de produção:

```
POST https://api-internet.cielo.com.br/cielo-extc-serv-edi-linkexp-external/extc-serv-edi-link-external/v1/link/generate
```

### O detalhe que mais quebra integração

A documentação avisa: *"se o JSON sofrer qualquer alteração após a assinatura, a
API retornará 401 Invalid HMAC"*. Um byte de diferença — ordem de chaves,
espaço, acento — invalida tudo.

Por isso o corpo é serializado **uma única vez** e a mesma string vai para a
assinatura e para o `body` da requisição. Nunca dois `JSON.stringify` do mesmo
objeto. Se algum dia alguém "melhorar" isso montando o body de novo na hora do
envio, a integração para de funcionar com um 401 difícil de diagnosticar.

## O que falta: as credenciais

Três coisas, todas emitidas pela Cielo:

| Credencial | Onde entra |
|---|---|
| `client_id` | secret `CIELO_CLIENT_ID` |
| `client_secret` | secret `CIELO_CLIENT_SECRET` |
| chave HMAC | secret `CIELO_HMAC_KEY` |

No portal, a chave HMAC fica em "Acessar chave da API".

### Secrets opcionais

| Secret | Quando mexer |
|---|---|
| `CIELO_HMAC_ALGO` | se a Cielo usar SHA-1 ou SHA-512. Padrão: `SHA-256` |
| `CIELO_HMAC_ENCODING` | se a assinatura for base64. Padrão: `hex` |
| `CIELO_EXTC_LINK_PATH` | se o caminho do endpoint mudar |
| `CIELO_MTLS_CERT` / `CIELO_MTLS_KEY` | só se a conta exigir TLS mútuo também |

O algoritmo e o encoding não estão na documentação. `SHA-256` + `hex` é a
combinação mais comum, mas se o primeiro teste voltar `401 Invalid HMAC` com
token válido, é o primeiro lugar a olhar — troca de secret, sem tocar em código.

## Elegibilidade

O manual v15 (p. 64) diz que a contratação via API é *"exclusiva para
conciliadores"*, enquanto quem concilia as próprias lojas recebe por download no
site. O path do endpoint termina em `external`, o que sugere um perfil de
parceiro externo.

Vale confirmar com o Atendimento EDI (`edi@cielo.com.br`, (11) 4002-5270) se o
perfil de vocês — 9 lojas, 8 CNPJs, conciliação em sistema próprio — dá acesso,
antes de investir tempo no processo.

## Uma credencial para todo o grupo

Os secrets identificam a aplicação, não o estabelecimento. O que varia por loja é
o `cielo_estabelecimento_matriz`, que vai como `merchantCode` em cada chamada e
está em `adquirentes_config`. Mesmo desenho da REDE, onde `REDE_GV_CLIENT_ID` e
`REDE_GV_CLIENT_SECRET` são um par só e os PVs ficam por loja.

O que pode ser por CNPJ é a **autorização** — no modelo de conciliador o manual
descreve um link que o estabelecimento acessa para conceder acesso, equivalente
ao Opt-in da REDE. Se for o caso, serão 8 autorizações para 1 credencial.

## Testando

Depois de configurar os três secrets:

1. **Diagnóstico** — invoque `cielo-extrato-proxy` com
   `{"action":"diagnostico","ambiente":"production"}`. Confirma o que está
   configurado sem chamar a Cielo.
2. **Health** — `{"action":"health","ambiente":"production"}`. Gera o token de
   verdade. Também dá para rodar por Admin → Adquirentes → aba Cielo → Testar
   API EXTC.
3. **Um arquivo só** — `{"action":"baixar_extrato","ambiente":"production",
   "merchant_code":"<matriz>","tipo_arquivo":"03","data":"2026-08-04"}`. Devolve
   o arquivo em base64 sem gravar nada no banco. Bom para validar antes de
   deixar o sync solto.
4. **Pipeline completo** — Conciliação de Cartões → Sincronizar CIELO.

### Erros e o que significam

| Código | Causa |
|---|---|
| `CREDENCIAIS_AUSENTES` | falta `CIELO_CLIENT_ID` ou `CIELO_CLIENT_SECRET` |
| `HMAC_AUSENTE` | falta `CIELO_HMAC_KEY` |
| `TOKEN_OU_HMAC_INVALIDO` (401) | token expirado ou assinatura divergente — veja algo/encoding |
| `BODY_INVALIDO` (400) | campo obrigatório ausente |
| `PARAMETROS_FORA_DAS_REGRAS` (422) | período ou `merchantCode` fora das regras da Cielo |
| `SEM_LINKS` | a API respondeu, mas sem link — geralmente não há arquivo no período |
| `LINK_EXPIRADO` | o link temporário venceu antes do download |

## Formato do retorno

O formato da resposta do `/link/generate` não está documentado. Em vez de fixar
um caminho de campo, o proxy varre o JSON recursivamente atrás de qualquer URL
`http(s)` — assim uma mudança de nome de campo não quebra a integração.

Se algo der errado aí, `{"action":"gerar_links", ...}` devolve a resposta crua
da Cielo, sem tentar baixar nada. É o modo de inspecionar o formato real.
