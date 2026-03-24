

# Plano: Finalizar Links de Pagamento

## Diagnostico

Os logs mostram que o link e salvo no banco com status PENDENTE, mas **sem URL de pagamento** porque a API e.Rede sandbox retorna 401:
```
returnCode: 25 — "Affiliation: Invalid parameter format"
```
O PV cadastrado (104171855) e a key podem nao ser validos para o sandbox, ou o formato da transacao esta incorreto para e-commerce (a API e.Rede exige campos adicionais como `urls` de callback para gerar um link de pagamento).

## Problema Real

A API e.Rede **nao gera links de pagamento autonomos**. Ela processa transacoes com dados de cartao ja informados. Para gerar um link onde o cliente insere os dados do cartao, precisamos de uma **pagina de checkout hospedada** que:
1. Exibe valor, descricao e parcelas
2. Coleta dados do cartao
3. Chama `rede-proxy` com `criar_transacao` incluindo os dados do cartao

## O que sera feito

### 1. Pagina de Checkout Publica
Nova rota `/pay/:linkId` — acessivel sem login. Busca dados do link via edge function (`payment-links` action `detalhe_publico`), exibe formulario de cartao e processa o pagamento.

### 2. Atualizar `payment-links` edge function
- Nova action `detalhe_publico`: retorna dados do link sem autenticacao (apenas campos publicos: valor, descricao, parcelas, status, expira_em)
- Atualizar action `criar`: gerar `url_pagamento` como URL do proprio sistema (`https://{domain}/pay/{id}`), status ATIVO (nao depende mais da Rede para criar)
- Nova action `processar_pagamento`: recebe dados do cartao, chama `rede-proxy`, atualiza status para PAGO e baixa lancamento

### 3. Melhorar UI da pagina de links
- Mostrar URL copiavel quando link criado
- Botao de compartilhar via WhatsApp
- Feedback visual melhor para status

### 4. Validar credenciais Rede
- Adicionar botao "Testar conexao" na pagina Admin Adquirentes que chama `rede-proxy` action `health`
- Mostrar resultado: conectado/erro

## Detalhes Tecnicos

### Pagina de Checkout (`/pay/:linkId`)
- Rota publica (sem ProtectedRoute)
- Formulario: numero cartao, validade, CVV, nome, parcelas
- Mascara e validacao nos campos
- Chama `payment-links` action `processar_pagamento`
- Exibe confirmacao ou erro
- Design limpo, mobile-first (sera acessado pelo cliente via WhatsApp)

### Fluxo completo
```text
Loja cria link → URL gerada (nosso dominio) → 
Cliente abre URL → Preenche cartao → 
Edge function processa via rede-proxy → 
Status atualiza para PAGO → Lancamento baixado
```

### Seguranca
- A pagina de checkout nao requer login (e para o cliente)
- Os dados do cartao nunca sao armazenados — vao direto para a Rede
- Link expirado/cancelado/pago retorna mensagem adequada
- Rate limiting no processamento

## Ordem de implementacao
| Etapa | Entrega |
|-------|---------|
| 1 | Atualizar edge function `payment-links` (3 actions novas) |
| 2 | Criar pagina de checkout publica `/pay/:linkId` |
| 3 | Atualizar UI da listagem (URL, WhatsApp, feedback) |
| 4 | Botao testar conexao no Admin Adquirentes |

