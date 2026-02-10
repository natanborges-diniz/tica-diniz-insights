

# Reconhecimento Automático de Produtos no "Gerar Pedido"

## Situacao Atual

Hoje, ao clicar "Gerar Pedido", o usuario precisa:
1. Clicar "Carregar Catalogo" para buscar todos os produtos Hoya
2. Buscar manualmente pelo produto correto
3. Selecionar o produto

A tabela `fornecedor_produto_depara` salva o mapeamento apos a primeira selecao manual, mas na primeira vez nao ha automatizacao.

## Estrategia Proposta: Matching em 3 Camadas

```text
Camada 1: DE/PARA (banco)
  descricao_local da OS --> codigo_fornecedor Hoya
  (ja existe, funciona apos primeiro mapeamento)

Camada 2: Matching Inteligente por Atributos
  Prescricao (esf, cil, adicao) + descricao da lente
  --> Filtrar catalogo Hoya por compatibilidade de grau
  --> Ranquear por similaridade textual (desenho, material, tratamento)

Camada 3: Fallback Manual (como esta hoje)
  Catalogo completo com busca
```

## O que preciso de voce (documentacao)

Para implementar a Camada 2 de forma precisa, seria muito util ter:

1. **Catalogo de produtos Hoya em formato tabular** (ou um exemplo da resposta da API `/produto`) -- para entender os campos disponiveis para matching (desenho, material, tratamento, ranges de grau, etc.)

2. **Logica de negocio de equivalencia**: como voce (usuario) identifica hoje qual produto Hoya corresponde a uma lente do ERP? Exemplo:
   - A descricao "LG PROG HOYA ID MYSTYLE V+ SENSITY 2 1.67" mapeia para qual combinacao de desenho + material + tratamento na Hoya?
   - Existe um padrao nos nomes das lentes no ERP que permita extrair esses atributos?

3. **Regras de filtragem por grau**: a API Hoya ja retorna `esfericoMinimo/Maximo`, `cilindricoMinimo/Maximo`, etc. Posso usar esses campos para eliminar produtos incompativeis com a prescricao da OS. Confirma que essa logica e suficiente?

## Plano de Implementacao (apos documentacao)

### Passo 1 -- Auto-load do catalogo
- Ao abrir a pagina de pedido, carregar o catalogo Hoya automaticamente (sem clique manual)
- Carregar em paralelo com os dados da OS

### Passo 2 -- Filtro por compatibilidade de grau
- Usar os campos de prescricao da OS (esf OD/OE, cil, adicao) para filtrar produtos Hoya cujos ranges aceitem esses valores
- Eliminar produtos incompativeis antes de mostrar ao usuario

### Passo 3 -- Ranking por similaridade textual
- Extrair palavras-chave da descricao da lente no ERP (ex: "HOYA", "ID", "MYSTYLE", "1.67", "SENSITY")
- Comparar com `nome`, `desenho`, `material`, `tratamento` do catalogo Hoya
- Ordenar por score de similaridade e pre-selecionar o melhor match

### Passo 4 -- Auto-selecao com confirmacao
- Se score > threshold, pre-selecionar o produto automaticamente com badge "Sugestao automatica"
- Usuario confirma ou altera antes de enviar
- Salvar o DE/PARA na tabela para futuras OSs identicas

### Passo 5 -- Feedback visual
- Indicador de confianca do match (alta/media/baixa)
- Lista de candidatos ordenada por relevancia
- Destaque visual no produto sugerido

## Secao Tecnica

### Arquivos a modificar
- `src/pages/PedidoFornecedorPage.tsx` -- auto-load, logica de matching, UI de sugestao
- `src/services/hoyaService.ts` -- possivel funcao de matching/scoring

### Logica de scoring (exemplo)
```text
score = 0
if descricao contains desenho.nome    --> +30
if descricao contains material.nome   --> +25
if descricao contains tratamento.nome --> +20
if descricao contains indice ("1.67") --> +15
if grau dentro do range               --> +10 (obrigatorio)
```

### Tabela DE/PARA
Ja existe `fornecedor_produto_depara` com campos adequados. Nenhuma alteracao de schema necessaria.

## Proximos Passos

Me envie:
1. Um exemplo de resposta da API Hoya `/produto` (1-2 produtos) para eu validar os campos
2. 2-3 exemplos de descricoes de lente do ERP com o produto Hoya correspondente
3. Confirmacao se a filtragem por range de grau e suficiente

Com essas informacoes, implemento o matching automatico completo.

