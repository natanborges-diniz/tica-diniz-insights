# API MaisZeiss — Referência Técnica

## URLs Base
- **PROD**: `https://a9lt368bb2.execute-api.us-east-2.amazonaws.com/prd`
- **TESTE**: `https://aupk1256rl.execute-api.us-east-2.amazonaws.com/dev`

## Autenticação
- `usersao`: Código SAO da loja (campo no payload, não header)
- `cnpj`: CNPJ da loja (no path ou payload)
- Sem API Key de header — autenticação via payload

## Endpoints

### 01 - Consulta de Produtos
- `GET /produtos/lista/1/{CNPJ}`
- Retorna: `sao.produtos[]` com cod, cat, nome, descr

### 02 - Gravação de Pedido (dois passos)
- `POST /pedidos/criar`
- Payload: `{ sao: { pedido: { usersao, cnpj, oscliente, paciente, ... od: {}, oe: {}, armacao: {}, servicos: [] } } }`
- Resposta 1ª chamada: `sao.pedido.aprov` (preços para aprovação)
- Resposta 2ª chamada (com aprov): `sao.pedido.nrpedido` (confirmação)

### 03 - Consulta de Serviços
- `GET /servicos/lista/1`

### 04 - Serviços por Produto
- `GET /produtos/servicos/1/{familia}/{CNPJ}`

### 05 - Cancelamento
- `POST /pedidos/cancelar`
- Payload: `{ idpais: 1, estabel, numpedido }`

### 06 - Consulta de Pedido (Tracking)
- `POST /pedidos/detalhe`
- Payload: `{ codcli, idpais: 1, numpedido }`
- Retorna: situação, rastreamento, previsão, detalhes de produção

### 07 - Consulta de Cores
- `GET /coloracao/lista/1/{familia}`

### 08 - Consulta de Base
- `GET /pedidos/base/sugestao/1/{cnpj}/{familia}/{esf}/{cil}/{adicao}`

### 09 - Consulta de Preços
- `GET /cliente/tabelapreco/consumidor/1/{cnpj}`

### 10 - Lentes + Serviços
- `GET /produtos/lista/1/{cnpj}`

## Tipos de Armação
- M: Metal, A: Acetato, F: Fio de Nylon, P: Parafuso, C: Fio de Aço, S: Segurança

## Fluxo de Pedido (dois passos)
1. Enviar pedido sem `aprov` → API retorna preços + dados de aprovação
2. Reenviar pedido com `aprov.precood`, `aprov.precooe`, `aprov.precoserv`, `aprov.antec` → API confirma e retorna `nrpedido`
