# E-mail para o Atendimento EDI da Cielo

**Para:** edi@cielo.com.br
**Assunto:** Habilitação da API de Extrato Eletrônico (EXTC) — grupo de óticas, 7 matrizes

> Falta preencher um dado: os números das **matrizes de extrato eletrônico**
> (posições 2 a 11 do header dos arquivos). Você acabou de cadastrá-los no
> sistema — copie de Admin → Adquirentes → aba Cielo, campo "Estabelecimento
> matriz de extrato", e substitua os `[MATRIZ]` abaixo.

---

Bom dia,

Somos um grupo de óticas com 7 lojas ativas e fazemos a conciliação de cartões
internamente, em sistema próprio. Já recebemos o Extrato Eletrônico e hoje
baixamos os arquivos manualmente pelo site, loja a loja, todos os dias.

Implementamos a leitura do layout v15 (CIELO03, CIELO04 e CIELO16) e queremos
automatizar a obtenção dos arquivos pela API do EXTC.

**O bloqueio que encontramos**

Nosso cadastro no Portal Cielo Desenvolvedores está ativo. Ao criar uma nova
aplicação em Perfil → Cadastrar Client-ID, a seção "API Disponível" lista apenas
"Cielo Smart | Order Manager". A API de Extrato Eletrônico não aparece como
opção, então não conseguimos gerar o client_id e o client_secret necessários.

**O que precisamos**

Habilitar a API de Extrato Eletrônico para o nosso cadastro, de modo a obter
client_id, client_secret e a chave HMAC (X-Signature) para os estabelecimentos
abaixo.

**Estabelecimentos matriz de extrato**

| Matriz de extrato | CNPJ | Razão social |
|---|---|---|
| [MATRIZ] | 12.107.885/0001-01 | MILZETE M G BORGES OPTICA LTDA |
| [MATRIZ] | 13.844.111/0001-26 | M DE M GOMES OPTICA |
| [MATRIZ] | 19.280.952/0002-15 | A B BORGES OPTICA |
| [MATRIZ] | 19.938.491/0001-44 | J. M. GOMES MELO OPTICA LTDA |
| [MATRIZ] | 35.385.887/0001-68 | SP CASTRO OPTICA LTDA |
| [MATRIZ] | 35.385.887/0002-49 | SP CASTRO OPTICA LTDA |
| [MATRIZ] | 59.068.194/0001-00 | MOUBOR OPTICA LTDA |

**Estabelecimentos submissores vinculados**

- 12.107.885/0001-01: 2838722713, 1028427902, 1033439069, 2809988395
- 13.844.111/0001-26: 2809988433, 1032636880, 2837060040
- 13.844.111/0002-07: 1072478584
- 19.280.952/0001-34: 1048250935
- 19.280.952/0002-15: 2809988409, 2838722330, 1055799637
- 19.938.491/0001-44: 2809657925, 1050240283, 2839970010
- 35.385.887/0001-68: 2837031318, 2809988441
- 35.385.887/0002-49: 2895579967
- 59.068.194/0001-00: 2898942388

**Dúvidas técnicas**

1. A documentação de consumo indica o endpoint
   `POST /cielo-extc-serv-edi-linkexp-external/extc-serv-edi-link-external/v1/link/generate`.
   Ele é o correto para o nosso perfil?

2. Para a assinatura do header `X-Signature`, qual o algoritmo (SHA-256?) e o
   formato do valor (hexadecimal ou base64)?

3. As credenciais (client_id e client_secret) atendem todos os nossos
   estabelecimentos, ou é necessário um conjunto por matriz de extrato? E a
   chave HMAC — é uma por matriz?

4. O manual v15 (p. 64) indica que a contratação via API é destinada a
   conciliadoras. Como já somos os titulares dos estabelecimentos e conciliamos
   apenas as nossas próprias lojas, precisamos passar pelo fluxo de concessão e
   registrar os merchantIDs, ou as credenciais já operam sobre os
   estabelecimentos que hoje geram os nossos extratos?

Ficamos à disposição.

Atenciosamente,
Natan Borges
[TELEFONE]

---

## Notas para você, não vão no e-mail

**Por que listar os estabelecimentos.** A habilitação é por estabelecimento, não
por conta. Sem a lista, a primeira resposta deles seria pedindo exatamente isso —
e aí se perde uma rodada de e-mail.

**Por que os 22 PVs e não 19.** A lista de submissores inclui os CNPJs
13.844.111/0002-07 e 19.280.952/0001-34, que você disse não estarem em uso. Aqui
eles entram de propósito: se algum dia voltarem a operar, já estarão habilitados,
e habilitar depois custa outro e-mail. NAM (20.118.761/0001-50) e A M BORGES
(41.743.168/0001-74) ficaram de fora porque você disse que não utilizam mais.

**As perguntas 2 e 4 são as que mais valem.** A 2 poupa horas de tentativa e erro
com `401 Invalid HMAC` — hoje o código assume SHA-256 + hex, que é o palpite mais
provável, e trocar é só mudar um secret. A 4 define se ainda falta implementar o
fluxo de concessão ou se, com a credencial, já funciona.

**Se preferir ligar:** (11) 4002-5270. Tenha em mãos os CNPJs e a informação de
que o portal só oferece "Cielo Smart | Order Manager" — é o que torna o pedido
concreto e evita a resposta genérica de "baixe pelo site".
