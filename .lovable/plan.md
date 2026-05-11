## Contexto

Hoje as 3 páginas de estoque (Visão, Plano de Compra, O que Fazer) já compartilham dados via store global e o Bridge `/estoque/completo` está rápido (≤14s). Falta agora **transformar o Plano de Compra em ferramenta de execução** — saber o que comprar, em que quantidade, focado em armações (RX e Solar) — e **deixar Visão Estoque acionável** (o que fazer com cada peça).

Subcategorias `AR_RX` e `AR_SOLAR` já existem em `categorizarProduto.ts` e estão sendo calculadas em `useEstoqueUnificado.ts` (linhas 261, 309, 431-442 do mix ideal), mas **não são expostas como filtro nas páginas**. Aproveitamos.

---

## 1) Plano de Compra — virar lista executável "O que comprar agora"

### 1.1 Filtros novos (foco do dia-a-dia em armações)
Adicionar barra de filtros no topo da página `AnaliseOTBPage`, persistida no `useEstoqueStore`:

- **Categoria/Subcategoria** (botões): Todas · Armações RX · Solar/OC · Lentes · Acessórios · Outros
  - default: **Armações RX** quando carrega (foco do negócio)
- **Marca** (select com busca) — usa `listaMarcas` já existente
- **Fornecedor** (select) — usa `listaFornecedores` já existente
- **Curva ABC** (chips A · B · C · Todas)
- **Decisão da marca** (chips Repor · Renovar · Descontinuar · Todas) — filtra `resumoPorMarca`

KPIs e Mix Ideal recalculam respeitando esses filtros (já que o hook expõe `itensFiltrados`).

### 1.2 Nova seção "Lista de Compra" (acima do Relatório por Marca)
Tabela única com **uma linha por SKU a comprar**, ordenada por prioridade:

| Coluna | Origem |
|---|---|
| Cód. Barras | `codigoBarra` |
| Descrição | `descricao` |
| Marca / Fornecedor | já existe |
| Subcategoria | AR_RX / AR_SOLAR / etc |
| Vendas 6m | `qtdVendidos` |
| Estoque atual | `estoqueAtual` |
| Velocidade (pç/dia) | `vendaDiaria` |
| Cobertura atual (dias) | `estoqueAtual / vendaDiaria` |
| **Comprar (qtd)** | `qtdAComprar` (já calculado em `skusARepor`) |
| Curva | `curvaABC` |
| Prioridade | URGENTE se cobertura < 15d, ALTA < 30d, MÉDIA < 60d |

- **Toolbar:** total de peças a comprar, valor estimado, exportar CSV/PDF.
- **Multi-seleção:** checkbox por linha → "Exportar pedido selecionado" (CSV pronto para enviar a fornecedor).
- **Agrupamento opcional:** toggle "Agrupar por fornecedor" — vira sub-tabelas com subtotal por fornecedor (facilita fechar pedido).

### 1.3 KPIs ajustados
Trocar o KPI genérico "Capital em Risco" por **dois cards**:
- **A comprar agora** — peças + valor estimado (custo)
- **Capital em risco** — dead stock valor (mantém)

Adicionar:
- **Cobertura média da loja** (dias) — `estoque total / venda diária total`
- **Marcas com gap** — quantas marcas têm `skusARepor.length > 0`

### 1.4 Header com contexto comercial
Header em duas linhas (já planejado em `.lovable/plan.md`, ainda pendente):
```
DINIZ BARUERI
Estoque: 1.388 peças • 1.174 SKUs (posição agora)
Vendas: últimos 180 dias • Filtro: Armações RX
```

---

## 2) Visão Estoque — "o que fazer com este estoque"

A página hoje lista SKUs com `acaoSugerida`, mas não diz **o que fazer agora**. Adições:

### 2.1 Painel "Ações Recomendadas" (novo bloco entre KPIs e tabela)
4 cards clicáveis (filtram a tabela ao clicar):

| Card | Critério | Ação |
|---|---|---|
| **Liquidar** | `acaoSugerida` ∈ LIQUIDA 20/30/50% | Exportar lista p/ marketing precificar |
| **Transferir entre lojas** | dead stock + alta cobertura, mas vende em outra loja (placeholder, requer dado multi-loja na fase 2) | Marcar como "estudar" |
| **Devolver ao fornecedor** | dead stock > 365d + sem venda 6m | Exportar pedido de devolução |
| **Sem cadastro** | `acaoSugerida = SEM CADASTRO` | Exportar p/ corrigir no ERP |

### 2.2 Coluna "Próxima ação" na tabela
Já existe `acaoSugerida`. Adicionar tooltip explicando o porquê de cada classificação (ex.: "LIQUIDA 30% — 220 dias parado, curva C, 0 vendas").

### 2.3 Botão "Ir para Plano de Compra com este filtro"
Quando o usuário filtra por marca/categoria em Visão Estoque, oferecer um botão que leva ao Plano de Compra **mantendo os filtros aplicados** (já dá pra fazer com store global).

---

## 3) Mudanças técnicas

| Arquivo | O que muda |
|---|---|
| `src/stores/useEstoqueStore.ts` | Adicionar `subcategoria: 'TODAS' \| 'AR_RX' \| 'AR_SOLAR' \| 'LENTES' \| 'ACESSORIOS' \| 'OUTROS'` e `decisaoMarca: 'TODAS' \| 'REPOR' \| 'RENOVAR' \| 'DESCONTINUAR'` aos filtros |
| `src/hooks/useEstoqueUnificado.ts` | Aplicar filtro de subcategoria em `itensFiltrados`; expor `listaCompraFlat` (achatamento de `resumoPorMarca[].skusARepor` com prioridade calculada) |
| `src/pages/estoque/AnaliseOTBPage.tsx` | Nova barra de filtros; nova seção "Lista de Compra"; KPIs ajustados; header em duas linhas |
| `src/components/otb/OtbFilters.tsx` | Reaproveitar/estender — adicionar chips RX/Solar |
| `src/pages/estoque/VisaoEstoquePage.tsx` | Painel "Ações Recomendadas" + tooltip explicativo + botão "Ir para Plano de Compra" |

Sem mudanças no Bridge, sem mudanças de schema, sem nova edge function. Só camada de apresentação + um cálculo a mais de prioridade no hook.

---

## 4) Fora de escopo (Fase 2 separada)

- Transferência entre lojas (precisa de dado consolidado multi-loja)
- Estoque mínimo configurável por marca/loja na UI (hoje vem do `estoque_minimo_loja` que está vazio)
- Reposição automática integrada com pedido Hoya/Zeiss/Haytek
- Mix ideal customizável manualmente (hoje é só "vendas 6m define o mix")

---

## 5) Pergunta aberta antes de implementar

**Prioridade de comprar (cobertura mínima):** hoje o cálculo de `qtdAComprar` no hook usa um alvo padrão. Confirmar com você:
- **Armações RX:** alvo de quantos dias de cobertura? (sugestão: 60 dias)
- **Solar/OC:** mesmo número ou menor por sazonalidade? (sugestão: 45 dias fora do verão)

Se você não quiser configurar agora, mantemos o default que já está no hook e ajustamos depois.
