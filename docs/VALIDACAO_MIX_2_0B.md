# Validação Fase 2.0b — Motor de Mix (checkpoint Entrega 1)

**Data:** 2026-07-23
**Status:** ⚠️ **NÃO APROVADO** — capacidades usadas são referenciais. Os status `SUGERIR_DESCONTINUAR` e `OK` dependem do limiar do mínimo (25) contra `capacidade × participação`; com capacidades erradas, o mapa de status muda. **Regenerar assim que o stakeholder passar as capacidades reais das duas lojas.**

**Objetivo:** comparar mix ideal ANTES (60/40 pesos, `Math.round`) × DEPOIS (50/50, `Math.floor`) usando dados reais.

## Metodologia

- Dados reais puxados do Firebird Bridge (`/estoque/completo` + `/vendas/analise-sku`, janela 2026-01-24 → 2026-07-23).
- Filtro: apenas armações (`subcategoria IN (AR_RX, AR_SOLAR)`).
- Merge por `cod_sku`: `qtdVendidos` / `totalVendido` vêm de `analise-sku`; `estoqueAtual` e `isDeadStock` de `estoque/completo`.
- Estoque efetivo = `Σ estoqueAtual onde !isDeadStock && estoqueAtual > 0`.
- **Capacidade referencial** (não puxada do Supabase — RLS bloqueia anon):
  - Loja 1 (PRIMITIVA I): **500 peças**
  - Loja 16 (BARUERI): **600 peças**
- Mínimo global: 25 peças (nenhum override de `minimo_proprio` configurado no comparativo).
- Marcas com nome `SEM MARCA` são excluídas (motor V2 também ignora).

> **Nota:** o objetivo é dimensionar o **delta relativo** entre as duas versões. A magnitude absoluta do `mixTotal` escala linearmente com a capacidade real — se você quiser recomputar com valores exatos, me passe as capacidades e regeneramos em ~1 min.


---

## Loja 1 — PRIMITIVA I

- Total de SKUs armação com dado: **1.100**
- Marcas com atividade: **49**
- Faturamento 6M (armações): **R$ 208.372**
- Peças vendidas 6M: **420**

### Top 15 marcas por faturamento (6M)

| Marca | Peças 6M | Fat 6M (R$) | Part 60/40 | Part 50/50 | Mix ANTES | Mix DEPOIS | Δ Mix | Lac. ANTES | Lac. DEPOIS | Δ Lac. | Status ANTES | Status DEPOIS |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---|
| VOGUE | 34 | 21.747 | 9.0% | 9.3% | 45 | 46 | +1 | 18 | 19 | +1 | OK | OK |
| RAY BAN | 24 | 21.546 | 7.6% | 8.0% | 38 | 40 | +2 | 26 | 28 | +2 | OK | OK |
| SPEEDO | 34 | 17.185 | 8.2% | 8.2% | 41 | 40 | -1 | 0 | 0 | 0 | OK | OK |
| DNZ ARMACAO | 79 | 15.163 | 14.2% | 13.0% | 71 | 65 | -6 | 0 | 0 | 0 | OK | OK |
| MICHAEL KORS | 14 | 15.082 | 4.9% | 5.3% | 0 | 26 | +26 | 0 | 15 | +15 | DESC. | OK |
| BULGET | 21 | 10.418 | 5.0% | 5.0% | 25 | 0 | -25 | 0 | 0 | 0 | OK | DESC. |
| DII COLLECTION | 30 | 9.773 | 6.2% | 5.9% | 31 | 29 | -2 | 0 | 0 | 0 | OK | OK |
| ATITUDE | 19 | 7.773 | 4.2% | 4.1% | 0 | 0 | 0 | 0 | 0 | 0 | DESC. | DESC. |
| GRAZI MASSAFERA | 15 | 7.766 | 3.6% | 3.6% | 0 | 0 | 0 | 0 | 0 | 0 | DESC. | DESC. |
| ANA HICKMANN | 13 | 7.714 | 3.3% | 3.4% | 0 | 0 | 0 | 0 | 0 | 0 | DESC. | DESC. |
| HIT | 24 | 7.084 | 4.8% | 4.6% | 0 | 0 | 0 | 0 | 0 | 0 | DESC. | DESC. |
| MARIA VALENTINA | 10 | 6.764 | 2.7% | 2.8% | 0 | 0 | 0 | 0 | 0 | 0 | DESC. | DESC. |
| HICKMANN | 11 | 6.516 | 2.8% | 2.9% | 0 | 0 | 0 | 0 | 0 | 0 | DESC. | DESC. |
| LACOSTE | 7 | 6.049 | 2.2% | 2.3% | 0 | 0 | 0 | 0 | 0 | 0 | DESC. | DESC. |
| ARNETTE | 12 | 5.457 | 2.8% | 2.7% | 0 | 0 | 0 | 0 | 0 | 0 | DESC. | DESC. |
| **Σ top-15** |  |  |  |  | **251** | **246** | **-5** | **44** | **62** | **+18** |  |  |

### Marcas com mudança de status (ANTES → DEPOIS)

| Marca | ANTES | DEPOIS | Mix ANTES | Mix DEPOIS |
|---|---|---|---:|---:|
| MICHAEL KORS | SUGERIR_DESCONTINUAR | OK | 0 | 26 |
| BULGET | OK | SUGERIR_DESCONTINUAR | 25 | 0 |

### Totais gerais da loja

| Métrica | ANTES | DEPOIS | Δ |
|---|---:|---:|---:|
| ΣmixTotal (todas marcas) | 251 | 246 | -5 |
| Σlacuna | 44 | 62 | +18 |
| # marcas SUGERIR_DESCONTINUAR | 43 | 43 | 0 |

---

## Loja 16 — BARUERI

- Total de SKUs armação com dado: **1.217**
- Marcas com atividade: **67**
- Faturamento 6M (armações): **R$ 242.066**
- Peças vendidas 6M: **450**

### Top 15 marcas por faturamento (6M)

| Marca | Peças 6M | Fat 6M (R$) | Part 60/40 | Part 50/50 | Mix ANTES | Mix DEPOIS | Δ Mix | Lac. ANTES | Lac. DEPOIS | Δ Lac. | Status ANTES | Status DEPOIS |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---|
| DNZ ARMACAO | 89 | 18.377 | 14.9% | 13.7% | 89 | 82 | -7 | 0 | 0 | 0 | OK | OK |
| SPEEDO | 29 | 15.808 | 6.5% | 6.5% | 39 | 38 | -1 | 0 | 0 | 0 | OK | OK |
| PRADA | 6 | 15.776 | 3.4% | 3.9% | 0 | 0 | 0 | 0 | 0 | 0 | DESC. | DESC. |
| MIU-MIU | 6 | 13.474 | 3.0% | 3.4% | 0 | 0 | 0 | 0 | 0 | 0 | DESC. | DESC. |
| GRAZI MASSAFERA | 22 | 12.684 | 5.0% | 5.1% | 30 | 30 | 0 | 23 | 23 | 0 | OK | OK |
| BULGET | 23 | 11.918 | 5.0% | 5.0% | 30 | 30 | 0 | 0 | 0 | 0 | OK | OK |
| SWAROVSKI | 9 | 11.416 | 3.1% | 3.4% | 0 | 0 | 0 | 0 | 0 | 0 | DESC. | DESC. |
| DII COLLECTION | 24 | 9.907 | 4.8% | 4.7% | 29 | 28 | -1 | 0 | 0 | 0 | OK | OK |
| ANA HICKMANN | 15 | 9.485 | 3.6% | 3.6% | 0 | 0 | 0 | 0 | 0 | 0 | DESC. | DESC. |
| ARNETTE | 19 | 9.451 | 4.1% | 4.1% | 25 | 0 | -25 | 1 | 0 | -1 | OK | DESC. |
| HICKMANN | 16 | 9.212 | 3.7% | 3.7% | 0 | 0 | 0 | 0 | 0 | 0 | DESC. | DESC. |
| ATITUDE | 20 | 8.903 | 4.1% | 4.1% | 25 | 0 | -25 | 0 | 0 | 0 | OK | DESC. |
| RAY BAN | 8 | 7.271 | 2.3% | 2.4% | 0 | 0 | 0 | 0 | 0 | 0 | DESC. | DESC. |
| OAKLEY | 8 | 7.205 | 2.3% | 2.4% | 0 | 0 | 0 | 0 | 0 | 0 | DESC. | DESC. |
| DUDALINA | 10 | 6.756 | 2.4% | 2.5% | 0 | 0 | 0 | 0 | 0 | 0 | DESC. | DESC. |
| **Σ top-15** |  |  |  |  | **267** | **208** | **-59** | **24** | **23** | **-1** |  |  |

### Marcas com mudança de status (ANTES → DEPOIS)

| Marca | ANTES | DEPOIS | Mix ANTES | Mix DEPOIS |
|---|---|---|---:|---:|
| ARNETTE | OK | SUGERIR_DESCONTINUAR | 25 | 0 |
| ATITUDE | OK | SUGERIR_DESCONTINUAR | 25 | 0 |

### Totais gerais da loja

| Métrica | ANTES | DEPOIS | Δ |
|---|---:|---:|---:|
| ΣmixTotal (todas marcas) | 267 | 208 | -59 |
| Σlacuna | 24 | 23 | -1 |
| # marcas SUGERIR_DESCONTINUAR | 60 | 62 | +2 |

---

## Leitura do delta

- **Pesos 60/40 → 50/50:** aumenta o peso do faturamento em relação às peças. Marcas com **ticket médio alto** ganham participação; marcas de giro alto e ticket baixo perdem um pouco.
- **`Math.round` → `Math.floor`:** tende a **diminuir** o mix por ~0.5 peça por marca, na média. Não muda distribuição.
- **Cascata do mínimo:** neste comparativo, `minimo_proprio` e `mix_minimo` não estão configurados (nenhum override cadastrado), então a cascata rende ao fallback 25 em ambos os casos — o delta observado vem só dos pesos e do floor.
- Total de mix ganho no DEPOIS: +29 peças, perdido: -93. Redistribuição líquida esperada; magnitude escala com a capacidade real.


## Próximos passos

- Stakeholder valida o delta com base nas capacidades **reais** (posso regenerar com valores exatos assim que forem informados).
- Se aprovado, o motor V2 já está usando 50/50 + floor + cascata em produção — nada mais a fazer no motor.
- Passo 5 (remover legado `calcularMixIdealMarcas`) fica pra depois desta aprovação — ele altera OTB e precisa validação separada.
- Entrega 2 (UI modo único) começa depois do Passo 5.
