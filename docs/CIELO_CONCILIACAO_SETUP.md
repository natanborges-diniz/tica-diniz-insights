# Conciliação Cielo — o que você precisa fazer

Código commitado em `b6ecb09`. O que falta é tudo fora do repositório: migração,
secrets e cadastro. Ordem importa.

---

## 1. Aplicar a migração (Lovable)

Arquivo: `supabase/migrations/20260805120000_cielo_extrato_eletronico.sql`

No Lovable, peça:

> Aplique a migração `20260805120000_cielo_extrato_eletronico.sql` e regenere os
> tipos do Supabase (`src/integrations/supabase/types.ts`).

**A regeneração dos tipos não é opcional.** O código novo usa `as any` em alguns
pontos justamente porque `types.ts` ainda descreve o schema antigo. Enquanto não
regenerar, o TypeScript não vai te avisar se alguma coluna estiver errada.

O que a migração faz:

- Colunas Cielo em `adquirentes_config` (`cielo_estabelecimento_matriz`, `cielo_pvs`, `cielo_documento`, health check)
- Tabelas novas: `cielo_extratos_arquivos`, `cielo_urs`, `cielo_lancamentos`, `cielo_pix` — a camada crua do extrato, com RLS por loja
- `recebiveis_cartao` ganha `chave_ur`, `tipo_lancamento`, `origem_recebivel_id` e `data_liquidacao`
- Índices únicos em `vendas_cartao (adquirente, origem_venda_id)` e `recebiveis_cartao (adquirente, origem_recebivel_id)` — é o que torna a importação idempotente
- `v_conciliacao_loja_resumo` redefinida: era fixada em REDE, agora devolve uma linha por (loja, adquirente)

### Risco na redefinição da view

O `DROP VIEW` falha se existir algo dependendo dela que eu não enxerguei no
código. Se o Lovable reclamar de dependência, me avise com a mensagem de erro.

---

## 2. Publicar as edge functions (Lovable)

Duas funções novas: `cielo-extrato-proxy` e `sync-vendas-cielo`.

> Faça o deploy das edge functions `cielo-extrato-proxy` e `sync-vendas-cielo`.

---

## 3. Secrets (Supabase → Settings → Edge Functions → Secrets)

| Secret | O que é | Obrigatório |
|---|---|---|
| `CIELO_CLIENT_ID` | client_id do Portal Cielo Desenvolvedores | para a API |
| `CIELO_CLIENT_SECRET` | client_secret | para a API |
| `CIELO_MTLS_CERT` | conteúdo do `.cer` assinado pela Cielo (PEM inteiro) | para a API |
| `CIELO_MTLS_KEY` | conteúdo do `.key` gerado por você (PEM inteiro) | para a API |
| `CIELO_EXTC_DOWNLOAD_PATH` | caminho do endpoint de download | provavelmente |

**Nenhum desses é necessário para importar o arquivo manualmente.** Se você ainda
não tem as credenciais da Cielo, pule para o passo 4 e o módulo já funciona.

### Como obter (manual "Integração com as APIs do EXTC")

1. Cadastro em https://desenvolvedores.cielo.com.br/api-portal/pt-br/user/login
2. Gere o par de chaves no seu terminal:
   ```
   openssl req -new -newkey rsa:2048 -nodes \
     -keyout ticadiniz-extc-prd-mulesoft-mtls.key \
     -out ticadiniz-extc-prd-mulesoft-mtls.csr
   ```
   Preencha exatamente como o manual manda (`Organization Name: CIELO SA`,
   `Organizational Unit: EXTRATO CORE E EDI`, `Locality: BARUERI`, `State: SAO PAULO`, `Country: BR`).
3. Anexe o `.csr` no site da Cielo para assinatura. O `.key` **nunca** sai da sua máquina — vai só para o secret.
4. Resgate as credenciais em https://desenvolvedores.cielo.com.br/api-portal/pt-br/myapps/1

---

## 4. Cadastrar as lojas (Admin → Adquirentes)

Para cada loja que vende na Cielo:

1. **Adicionar** → adquirente `CIELO`
2. **Estabelecimento matriz de extrato** — o número que aparece nas posições 2 a 11 do header do arquivo. Agrupa filiais por raiz de CNPJ, então lojas do mesmo grupo repetem o mesmo número.
3. **CNPJ da matriz de extrato**
4. **PVs desta loja** — o "Estabelecimento submissor" de cada registro do extrato.

O passo 4 é o que mais dá trabalho e é o que mais quebra. Sem o PV cadastrado, a
importação grava o registro mas sem `cod_empresa`, e a venda não aparece na
conciliação de nenhuma loja. Exceção: se a matriz de extrato cobrir uma loja só,
a associação é automática.

Se você não souber os PVs de cabeça, importe um arquivo primeiro — a tela de
importação lista exatamente quais estabelecimentos ficaram sem loja associada.
Cadastre e reimporte o mesmo arquivo: a função detecta que ficou pendência e
reprocessa (nos outros casos ela pula, para não duplicar).

---

## 5. Usar

### Caminho A — importação do arquivo (funciona hoje)

Financeiro → Conciliação de Cartões → **Importar extrato Cielo**.

Baixe do portal da Cielo e suba:

- **CIELO03** — vendas e previsão de recebíveis
- **CIELO04** — liquidação (o que caiu na conta)
- **CIELO16** — Pix

Importe o **CIELO03 antes do CIELO04** do mesmo período: o CIELO04 marca como
liquidados recebíveis que o CIELO03 criou. Fora de ordem, não quebra — só não
liquida nada, e você resolve reimportando o CIELO04 depois.

Reimportar o mesmo arquivo não duplica nada.

Se os totais do trailer não baterem com a soma dos registros, o arquivo é
**recusado** e nada é gravado — quase sempre é download truncado; baixe de novo.
Existe uma caixa para importar mesmo assim, mas só marque se você souber o motivo
da diferença.

### Caminho B — API EXTC (depende do teste)

Admin → Adquirentes → aba da Cielo → **Testar API EXTC**.

Se der verde, o botão "Sincronizar" da tela de Conciliação passa a puxar sozinho.

---

## O que eu não consegui garantir

Dois pontos que você vai descobrir no primeiro teste real, e prefiro dizer antes:

**1. O mTLS provavelmente não vai funcionar em Edge Function.** O runtime do
Supabase não expõe `Deno.createHttpClient` de forma estável ([discussão](https://github.com/orgs/supabase/discussions/36035)),
e sem ele não há como apresentar o certificado no handshake — a Cielo responde
`401 {"error":"missing"}`. A função detecta isso e devolve `MTLS_NAO_SUPORTADO`
apontando a importação manual, em vez de um erro de rede genérico. Se confirmar,
as saídas são: proxy mTLS fora do Supabase (uma VM pequena, ou Cloudflare Worker
com mTLS), ou ficar na importação do arquivo — que é como a maioria dos lojistas
opera de fato.

**2. O endpoint de download não está no manual.** O PDF do EXTC documenta só a
autenticação. O `CIELO_EXTC_DOWNLOAD_PATH` está configurável com um palpite como
padrão justamente por isso — quando a Cielo confirmar a rota (canal `edi@cielo.com.br`
ou `(11) 4002-5270`), é só preencher o secret, sem mexer em código.

Nada disso afeta o caminho A. O parser é o mesmo nos dois — a API só entregaria o
arquivo automaticamente.

**3. Não testei contra arquivo real.** O parser foi escrito da especificação e
validado por 37 testes com arquivos sintéticos montados campo a campo pelas
coordenadas do manual. Quando você tiver um CIELO03 de verdade, importe e confira
os totais contra o portal antes de confiar nos números.

---

## Escopo

Ficou de fora: **CIELO09** (saldo em aberto, mensal) e **CIELO15** (antecipação
de recebíveis). O parser ignora esses registros sem quebrar e avisa quantos
ignorou. Se vocês passarem a antecipar recebíveis com a Cielo, o CIELO15 vira
necessário.
