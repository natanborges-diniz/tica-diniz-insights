

## Plano: Redesenhar o Plano de Compra — Visão objetiva e sem duplicação

### Problemas identificados pelo usuário

1. **Datas de início/fim confusas** — Estoque é sempre atual. As datas só servem para o período de vendas (6 meses), mas aparecem como se controlassem o estoque
2. **Dados duplicados** — "Peças" aparece na tabela de marcas, nos pilares, no estoque doente — tudo repetido
3. **Mix Ideal não separa AR de OC** — Armações RX e Óculos Solar (SOL/OC) são agrupados juntos como "Armações"
4. **Tabela de marcas não é acionável** — Mostra 50 marcas, "Repor Referências" e "Renovar Coleção" são labels genéricos sem dizer O QUE comprar
5. **Estoque Doente é outra duplicata** — É a mesma visão do estoque atual com filtro de dias
6. **Falta total de peças vendidas em 6 meses** — KPI básico ausente

### Nova estrutura da página (sem duplicação)

```text
PLANO DE COMPRA
├── KPIs (4 cards únicos, sem repetição)
│   ├── Peças vendidas (6m)
│   ├── Peças em estoque
│   ├── Gap de compra (total OTB)
│   └── Capital em risco (doente)
│
├── Mix Ideal (com AR, OC/SOL, LG, AC separados)
│
└── Relatório por Marca (tabela única e completa)
    ├── Marca | Vendas 6m | Estoque | Gap | Peças a comprar
    ├── Dentro: REPOR (refs específicas) | RENOVAR (qtd de novos modelos)
    └── DESCARTAR (peças doentes com ação)
```

### Alterações técnicas

| # | Arquivo | Mudança |
|---|---|---|
| 1 | `src/utils/categorizarProduto.ts` | Adicionar subcategoria `SOLAR` separada de `ARMACOES`. Novo tipo: `SubcategoriaProduto = 'AR_RX' \| 'AR_SOLAR' \| 'LENTES' \| 'ACESSORIOS' \| 'OUTROS'`. Função `subcategorizarProduto()` que detecta SOL/OC no tipo ERP |
| 2 | `src/hooks/useEstoqueUnificado.ts` | (a) Remover campos `dataInicio`/`dataFim` dos filtros expostos — fixar internamente em 180 dias. (b) Adicionar `subcategoria` ao `ItemEstoque`. (c) Reformular `resumoPorMarca` para incluir: `pecasARepor` (lista de refs específicas Curva A/B com giro rápido), `pecasARenovar` (contagem de peças para novos modelos), `pecasDoentes` (com faixa de desconto). (d) Remover `estoqueDoenteAgrupado` separado — integrar dentro do resumo por marca. (e) Adicionar KPI `totalVendido6mPecas` |
| 3 | `src/pages/estoque/AnaliseOTBPage.tsx` | Redesenho completo: (a) Remover seletor de datas (período fixo 180 dias, só escolhe empresa). (b) 4 KPI cards limpos no topo. (c) Mix Ideal com AR RX / OC Solar / Lentes / Acessórios. (d) Tabela única por marca com colunas: Marca, Vendas 6m, Estoque, Gap, Decisão. Ao expandir a marca: seção "Repor estas referências" (lista de SKUs específicos a recomprar) + "Escolher X novos modelos" (quantidade de peças que precisam ser de coleção nova) + "Estoque doente" (itens parados desta marca com ação sugerida). (e) Remover PilaresResumo, MixIdealSection, AcoesCompraSection, EstoqueDoenteSection como componentes separados |

### Lógica por marca (dentro da expansão)

Para cada marca, o relatório mostra 3 blocos:

**Bloco 1 — Repor referências** (verde)
SKUs vendidos nos últimos 6m com giro < 90 dias ou Curva A/B. Lista com: Código, Descrição, Qtd vendida, Qtd em estoque, Qtd a comprar.

**Bloco 2 — Novos modelos** (azul)
"Comprar X peças de novos modelos/coleção" — quando a marca tem gap de compra mas as referências vendidas tinham giro lento (>= 90 dias). Mostra o número de peças a serem substituídas por novidades.

**Bloco 3 — Estoque doente desta marca** (vermelho/laranja)
Peças paradas >180 dias desta marca específica, com a ação sugerida (promoção 20%, liquidação 30%, etc.). Elimina a seção separada de "Estoque Doente" que duplicava dados.

### Resultado visual

```text
┌──────────────────────────────────────────────┐
│  KPIs: 847 vendidas 6m │ 1.204 em estoque   │
│        Gap: 156 pçs    │ R$ 12k doente       │
├──────────────────────────────────────────────┤
│  Mix: AR RX 45%→52% ▼ │ Solar 18%→12% ▲     │
│       Lentes 30%→28%   │ Acess. 7%→8%        │
├──────────────────────────────────────────────┤
│  RAY-BAN    89 vendas │ 45 estoque │ +12 pçs │
│  └─ Repor: RB5154 (3), RB7047 (2), ...      │
│  └─ Doente: 4 pçs (Promoção 20%)            │
│                                              │
│  ARNETTE    8 vendas  │ 22 estoque │ +5 pçs  │
│  └─ Renovar: Escolher 5 novos modelos        │
│  └─ Doente: 14 pçs (Liquidação 30%)         │
│                                              │
│  MARCA X    0 vendas  │ 18 estoque │ 🔴      │
│  └─ Descontinuar: 18 pçs para liquidação     │
└──────────────────────────────────────────────┘
```

