

## Plano: Reestruturar Módulo Estoque — Plano de Compra com Mix Ideal, Decisão por Referência e Tratamento de Estoque Doente

### Visão de Negócio

O módulo precisa responder 4 perguntas por loja:

1. **Qual o mix ideal?** — Distribuição de categorias e marcas baseada nas vendas dos últimos 6 meses
2. **O que repor imediatamente?** — Referências com giro alto (saíram rápido do estoque) → recompra da mesma referência
3. **O que renovar?** — Marcas com gap de compra mas cujas referências vendidas giraram devagar → comprar novos modelos/coleções
4. **O que fazer com o estoque doente?** — Itens parados, dead stock, excesso → ações concretas de liquidação, promoção ou descontinuação

### Problemas Atuais

- "O que Fazer" e "Análise OTB" usam os mesmos dados com visões quase idênticas
- Botão "Ver itens" no Painel de Ações não funciona (noop)
- Não existe conceito de mix ideal por loja
- Não distingue recompra de referência vs renovação de coleção
- Não existe plano de ação para estoque doente (só identifica, não prescreve)

### Nova Estrutura (2 abas)

```text
ESTOQUE
├── Visão Estoque     → "O que tenho?" (mantém como está)
└── Plano de Compra   → "O que fazer?" (fusão OTB + O que Fazer)
     ├── 1. Mix Ideal da Loja (barras comparativas)
     ├── 2. Ações de Compra (reposição + renovação)
     └── 3. Tratamento do Estoque Doente (liquidação/promoção)
```

### Lógica de Mix Ideal

Baseado nos últimos 6 meses de vendas:
- **Por categoria**: % Armações, Lentes, Acessórios vendidos vs % no estoque atual
- **Por marca dentro da categoria**: % de cada marca nas vendas vs % no estoque
- Gap positivo = marca subrepresentada (comprar mais). Gap negativo = excesso.

### Lógica de Decisão por Marca/Referência

Para cada marca com necessidade de compra (OTB > 0):
- Se tem SKUs Curva A OU média de dias em estoque dos vendidos < 90 dias → **REPOR REFERÊNCIA** (mesmo modelo, reposição imediata)
- Se tem OTB > 0 MAS média de dias em estoque >= 90 dias e nenhum Curva A → **RENOVAR COLEÇÃO** (novos modelos)
- Se marca só tem Curva C + dead stock → **AVALIAR DESCONTINUAÇÃO**

### Lógica de Tratamento do Estoque Doente (NOVO)

Seção dedicada a itens parados, com ações prescritivas escalonadas:

| Condição | Ação | Badge |
|---|---|---|
| 180-270 dias parado | Promoção 20% | Amarelo |
| 270-360 dias parado | Liquidação 30% | Laranja |
| > 360 dias parado | Liquidação 50% | Vermelho |
| > 720 dias parado | Descarte / Doação | Vermelho escuro |
| Sem nenhum movimento registrado | Revisão urgente | Vermelho |

Agrupado por marca, com totais de peças e valor de custo em risco, e botão de exportar lista para ação comercial.

### Alterações Técnicas

| # | Arquivo | Mudança |
|---|---|---|
| 1 | `src/hooks/useEstoqueUnificado.ts` | Adicionar cálculos de `mixIdeal` (vendas 6m por categoria/marca), `decisaoMarca` (REPOR/RENOVAR/DESCONTINUAR), e `estoqueDoenteAgrupado` (itens parados agrupados por faixa de ação com valor em risco) |
| 2 | `src/pages/estoque/AnaliseOTBPage.tsx` | Renomear para "Plano de Compra". Reorganizar em 3 seções: (a) Card Mix Ideal com barras comparativas, (b) Tabela por marca com decisão e DataTable paginada, (c) Seção "Estoque Doente" com cards por faixa de ação, lista de itens e botão exportar |
| 3 | `src/pages/estoque/OQueFazerPage.tsx` | Remover arquivo |
| 4 | `src/App.tsx` | Remover rota `/estoque/acoes` e import de `OQueFazerPage` |
| 5 | `src/components/layout/AppSidebar.tsx` | Remover item "O que Fazer?", renomear "Análise OTB" → "Plano de Compra" |
| 6 | `src/components/otb/OtbPainelAcoes.tsx` | Corrigir `onFiltrarCategoria` para filtrar a tabela ao clicar "Ver itens" |

### Resultado Visual Esperado

**Seção 1 — Mix Ideal**
- Barras horizontais: Armações Ideal 60% | Atual 72% → Excesso +12%
- Dentro de Armações: Ray-Ban Ideal 25% | Atual 35% → Excesso

**Seção 2 — Ações de Compra**
- RAY-BAN: 89 vendas 6m, giro médio 45 dias → 🟢 Repor Referências (12 pçs)
- ARNETTE: 8 vendas 6m, giro médio 140 dias → 🔵 Renovar Coleção (5 pçs)

**Seção 3 — Estoque Doente**
- ⚠️ Promoção 20%: 34 peças, R$ 4.200 em custo — marcas X, Y
- 🔴 Liquidação 30%: 18 peças, R$ 2.100 — marcas Z
- 🔴 Liquidação 50%: 12 peças, R$ 800 — sem movimento
- Botão "Exportar lista para ação comercial"

