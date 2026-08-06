# Como liberar a API EXTC da Cielo

O diagnóstico da `cielo-extrato-proxy` confirmou que não há nenhuma credencial
configurada: sem `client_id`, sem `client_secret`, sem certificado. Não há o que
testar até a Cielo liberar o acesso.

E existe um detalhe de elegibilidade que precisa ser resolvido antes do técnico.

## O problema de elegibilidade

Manual v15, seção "Modelos de conciliação" (p. 64):

- **Conciliação própria (in-house)** — a Cielo gera os extratos e disponibiliza
  para download no site. É o modelo padrão de quem concilia as próprias lojas.
- **Conciliação com parceiros** — a contratação é feita *"via API (exclusiva
  para conciliadores)"*, com comunicação direta do conciliador com a Cielo e
  aprovação prévia do estabelecimento.

A API EXTC foi desenhada para conciliadoras que prestam serviço a terceiros. O
grupo tem 9 lojas em 8 CNPJs distintos e concilia todas em um sistema próprio,
o que é um argumento razoável para pedir acesso — mas quem decide é a Cielo, e
o caminho é o Atendimento EDI, não o portal de desenvolvedores.

## Passo 1 — e-mail para o Atendimento EDI

Para: `edi@cielo.com.br`
Assunto: Solicitação de acesso à API EXTC — Extrato Eletrônico v15

> Bom dia,
>
> Somos um grupo de óticas com 9 lojas ativas, distribuídas em 8 CNPJs, e
> fazemos a conciliação de cartões internamente, em sistema próprio.
>
> Já implementamos a leitura do layout v15 do Extrato Eletrônico (arquivos
> CIELO03, CIELO04 e CIELO16) e queremos automatizar a obtenção dos arquivos,
> em vez de baixá-los manualmente no site a cada dia, para cada matriz de
> extrato.
>
> Gostaríamos de saber:
>
> 1. Qual o caminho para obtermos acesso às APIs do EXTC no nosso perfil, já que
>    o manual indica que a contratação via API é exclusiva para conciliadores.
> 2. Se houver alternativa de transmissão automática (SFTP ou envio programado)
>    disponível para conciliação in-house, quais os requisitos.
> 3. Confirmação do endpoint de download dos arquivos, caso o acesso via API
>    seja liberado — o manual "Integração com as APIs do EXTC" documenta apenas
>    a autenticação (mTLS + OAuth), não o recurso de download.
> 4. Se um único conjunto de credenciais (client_id, client_secret e
>    certificado) atende todos os nossos CNPJs e matrizes de extrato, ou se é
>    necessário um conjunto por CNPJ. E se houver etapa de autorização por
>    estabelecimento, como funciona e quem executa.
>
> Nossas matrizes de extrato são: [LISTAR OS NÚMEROS]
>
> CNPJs do grupo: 12.107.885/0001-01, 13.844.111/0001-26, 19.280.952/0002-15,
> 19.938.491/0001-44, 35.385.887/0001-68, 35.385.887/0002-49, 59.068.194/0001-00
>
> Atenciosamente,
> Natan Borges

Telefone do Atendimento EDI, se preferir ligar: (11) 4002-5270.

O item 3 é o que mais importa para nós: sem o caminho do endpoint, mesmo com
credencial válida não há como chamar a API. Assim que a Cielo responder, o valor
entra no secret `CIELO_EXTC_DOWNLOAD_PATH` — sem mexer em código.

## Passo 2 — gerar o certificado (só depois do OK da Cielo)

No seu terminal:

```
openssl req -new -newkey rsa:2048 -nodes \
  -keyout ticadiniz-extc-prd-mulesoft-mtls.key \
  -out ticadiniz-extc-prd-mulesoft-mtls.csr
```

Preencha exatamente assim (o manual exige esses valores):

| Campo | Valor |
|---|---|
| Email Address | conciliacao.cliente@cielo.com.br |
| Common Name | ticadiniz-extc-prd-mulesoft-mtls |
| Organizational Unit Name | EXTRATO CORE E EDI |
| Organization Name | CIELO SA |
| Locality Name | BARUERI |
| State or Province Name | SAO PAULO |
| Country Name | BR |

O `.csr` vai para a Cielo assinar. O `.key` **nunca sai da sua máquina** — vai
direto para o secret, e não deve ser commitado nem enviado por e-mail.

## Passo 3 — configurar os secrets

Supabase → Settings → Edge Functions → Secrets:

| Secret | Conteúdo |
|---|---|
| `CIELO_CLIENT_ID` | do portal de desenvolvedores |
| `CIELO_CLIENT_SECRET` | do portal de desenvolvedores |
| `CIELO_MTLS_CERT` | conteúdo do `.cer` assinado pela Cielo |
| `CIELO_MTLS_KEY` | conteúdo do `.key` gerado no passo 2 |
| `CIELO_EXTC_DOWNLOAD_PATH` | o caminho que a Cielo confirmar |

Depois: Admin → Adquirentes → aba Cielo → **Testar API EXTC**.

## O obstáculo que sobra: mTLS no Supabase

Mesmo com tudo liberado, ainda há um risco conhecido. O runtime de Edge
Functions do Supabase não expõe `Deno.createHttpClient` de forma estável, e sem
ele não há como apresentar o certificado no handshake — a Cielo responde
`401 {"error":"missing"}`.

A função detecta e reporta `MTLS_NAO_SUPORTADO` em vez de dar um erro de rede
genérico. Se acontecer, o plano B já existe e é barato: **mover a chamada para o
`firebird-bridge`**, que já roda em Node no Railway. Node suporta mTLS nativo
(`https.Agent` com `cert` e `key`), sem nenhuma das limitações do Deno. Seria um
endpoint novo no bridge — algo como `GET /api/v1/cielo/extrato` — e a edge
function passaria a chamá-lo em vez de falar direto com a Cielo. O parser e todo
o resto do pipeline continuam iguais.

## Enquanto isso

O download no site da Cielo (Vendas e Recebíveis → Recursos → Extrato
Eletrônico) e a importação pela tela continuam funcionando, e usam exatamente o
mesmo parser. Não é uma solução pior em termos de dado — é o mesmo arquivo. Só
não é automática.
