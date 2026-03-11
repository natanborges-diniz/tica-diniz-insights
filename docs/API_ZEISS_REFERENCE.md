# API MaisZeiss — Referência Técnica

## URLs Base
- **PROD**: `https://a9lt368bb2.execute-api.us-east-2.amazonaws.com/prd`
- **TESTE**: `https://aupk1256rl.execute-api.us-east-2.amazonaws.com/dev`

## Autenticação
- `usersao`: Código SAO da loja (campo no payload, não header)
- `cnpj`: CNPJ da loja (no path ou payload)
- API Key via header `x-api-key` (padrão AWS API Gateway)

## Endpoints

### 01 - Consulta de Produtos
- `GET /produtos/lista/1/{CNPJ}`
- Retorna: `sao.produtos[]` com cod, cat, nome, descr

### 02 - Gravação de Pedido (dois passos)
- `POST /pedidos/criar`

#### Payload de Envio
```json
{
  "sao": {
    "pedido": {
      "usersao": "zeiss",
      "cnpj": "01234567000199",
      "oscliente": "abcd",
      "paciente": "Nome do paciente",
      "medico": "Nome do médico",
      "crm": "12345",
      "voucher": "",
      "corcoloracao": "",
      "amostracoloracao": "",
      "od": {
        "produto": "1",
        "esferico": "2.25",
        "cilindrico": "-1.50",
        "eixocilindrico": "15",
        "adicao": "1.5",
        "regressao": "",
        "prisma": "2",
        "eixoprisma": "270",
        "dnp": "",
        "dnpperto": "28.1",
        "dnplonge": "29.1",
        "alturamontagem": "18.2",
        "sugestaobase": "",
        "sugestaodiametro": ""
      },
      "oe": {
        "produto": "1",
        "esferico": "2.25",
        "cilindrico": "-1.50",
        "eixocilindrico": "15",
        "adicao": "1.5",
        "regressao": "",
        "prisma": "2",
        "eixoprisma": "270",
        "dnp": "",
        "dnpperto": "28.1",
        "dnplonge": "29.1",
        "alturamontagem": "18.2",
        "sugestaobase": "",
        "sugestaodiametro": ""
      },
      "armacao": {
        "compralab": "",
        "modelo": "",
        "ponte": "20",
        "altura": "40",
        "largura": "48",
        "diagonalmaior": "50",
        "tipo": "M",
        "formatoaro": "1AB",
        "distanciahastes": "",
        "distanciafrontal": ""
      },
      "servicos": [
        { "codigo": "1" },
        { "codigo": "2" }
      ]
    }
  }
}
```

**IMPORTANTE**: `corcoloracao` e `amostracoloracao` são filhos diretos de `sao.pedido`, NÃO dentro de `od`/`oe`.

#### Campos do Objeto de Retorno

- `sao.pedido.est`: Código do estabelecimento (string)
- `sao.pedido.nrpedido`: Número do pedido criado (string)
- `sao.pedido.voucher`: Código do voucher ganho (string)
- `sao.pedido.erro`: Mensagem de erro, só quando ocorre erro (string)

##### Aprovação (quando necessária)
- `sao.pedido.aprov`: Objeto de aprovação (só quando necessário)
  - `aprov.precood`: Preço OD — reenviar sem alteração para aprovar (string)
  - `aprov.precooe`: Preço OE — reenviar sem alteração para aprovar (string)
  - `aprov.precoserv`: Preço serviços — reenviar sem alteração (string)
  - `aprov.antec`: Código da análise técnica — reenviar sem alteração (string)
  - `aprov.campanha`: Código da campanha escolhida (string)
  - `aprov.mesmarec`: "true" para rejeitar troca de produto Mesma Receita (string)
  - `aprov.certdig`: "true"/"false" para Certificado Digital (string)
  - `aprov.luzazul`: "true"/"false" para Proteção de Luz Azul (string)

##### Preços
- `sao.pedido.preco[]`: Lista de preços
  - `preco[].c`: "od", "oe" ou código do serviço (string)
  - `preco[].n`: Nome do item (string)
  - `preco[].p`: Preço do item (string)

##### Campanhas
- `sao.pedido.campanha[]`: Lista de campanhas disponíveis
  - `campanha[].c`: Código da campanha (string)
  - `campanha[].n`: Nome da campanha (string)

##### Mesma Receita
- `sao.pedido.mesmarec[]`: Lista de produtos com benefício Mesma Receita
  - `mesmarec[].cp`: Código do produto (string)
  - `mesmarec[].np`: Nome do produto (string)
  - `mesmarec[].nc`: Nome da campanha que originou o benefício (string)

##### Outros
- `sao.pedido.antec`: Descrição da Análise Técnica (string)
- `sao.pedido.certdig`: "true" se deve informar escolha de Certificado Digital (string)
- `sao.pedido.luzazul`: "true" se deve informar escolha de Proteção de Luz Azul (string)

### 03 - Consulta de Serviços
- `GET /servicos/lista/1`

### 04 - Serviços por Produto
- `GET /produtos/servicos/1/{familia}/{CNPJ}`

### 05 - Cancelamento
- `POST /pedidos/cancelar`
- Payload: `{ idpais: 1, estabel, numpedido }`

### 06 - Consulta de Pedido (Tracking)
- `POST /pedidos/detalhe`
- Payload:
```json
{
  "codcli": 19175,
  "idpais": 1,
  "numpedido": 1012334
}
```
- Retorno:
```json
{
  "modo": "1",
  "estabel": "55",
  "cliente": {
    "cod": "19175",
    "cnpj": "29276085000117",
    "nome": "OPTICAL XPRSS ZISS VISION XPRT",
    "garantiaantec": "true"
  },
  "nrpedido": "1012334",
  "oscliente": "363709",
  "paciente": "",
  "medico": "",
  "crm": "",
  "voucher": "",
  "descrvoucher": "",
  "previsao": "2022-12-01",
  "primprevisao": "2022-12-07",
  "aguard": "",
  "situacao": "Faturado - Aguardando processo logístico",
  "codsituacao": "80",
  "rastreamento": "",
  "codneg": "1",
  "nomeneg": "VENDA DE PRODUTOS - DE PRODUCAO PROPRIA",
  "codcamp": "",
  "campanha": "",
  "cor": "",
  "codmot": "0",
  "motivo": "",
  "tracer": "true",
  "prazogarprod": "0",
  "prazogarserv": "13",
  "precototal": "607,82",
  "entrada": { "data": "11/29/2022", "hora": "09:46:57" },
  "producao": { "data": "11/30/2022", "hora": "16:59:18" },
  "fatur": { "data": "11/30/2022", "hora": "18:35:48" },
  "detalhe_sit": [
    { "situacao": "Entrada", "data": "11/29/2022", "hora": "09:46:57" },
    { "situacao": "Estoque", "data": "11/30/2022", "hora": "16:59:16" },
    { "situacao": "Surfaçagem", "data": "11/30/2022", "hora": "16:59:16" },
    { "situacao": "Antirrisco", "data": "11/30/2022", "hora": "16:59:16" },
    { "situacao": "Antirreflexo", "data": "11/30/2022", "hora": "16:59:16" },
    { "situacao": "Corte", "data": "11/30/2022", "hora": "16:59:16" }
  ]
}
```

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
3. Se `certdig` ou `luzazul` retornados como "true", incluir `aprov.certdig` e/ou `aprov.luzazul` no reenvio
4. Se `campanha[]` retornado, escolher uma e enviar em `aprov.campanha`
5. Se `mesmarec[]` retornado e não quiser trocar produto, enviar `aprov.mesmarec = "true"`
