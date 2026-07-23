# Validação Fase 2.0b — Motor de Mix (checkpoint Entrega 1)

**Data:** 2026-07-23
**Status:** capacidades REAIS confirmadas pelo stakeholder. Aguardando aprovação do delta.

## Metodologia

- Dados reais do Firebird Bridge (`/estoque/completo` + `/vendas/analise-sku`, janela 2026-01-24 → 2026-07-23).
- Filtro: apenas armações (`subcategoria IN (AR_RX, AR_SOLAR)`).
- Merge por `cod_sku`: `qtdVendidos` / `totalVendido` vêm de `analise-sku`; `estoqueAtual` e `isDeadStock` de `estoque/completo`.
- Estoque efetivo = `Σ estoqueAtual onde !isDeadStock && estoqueAtual > 0`.
- Marcas com nome `SEM MARCA` são excluídas (motor V2 também ignora).

**Capacidades reais aplicadas** (Supabase → `capacidade_expositor`):

| Loja | `capacidade_total` | `mix_minimo` | Mínimo efetivo |
|---|---:|---:|---:|
| 1 — PRIMITIVA I | 1000 | NULL | 25 (herda global) |
| 16 — BARUERI | 800 | NULL | 25 (herda global) |


---

## Loja 1 — PRIMITIVA I

- SKUs armação: **1.100**
- Marcas com atividade: **49**
- Faturamento 6M: **R$ 208.372**
- Peças vendidas 6M: **420**

### Top 15 marcas por faturamento (6M)

| Marca | Peças 6M | Fat 6M (R$) | Part 60/40 | Part 50/50 | Mix ANTES | Mix DEPOIS | Δ Mix | Estoque ef. | Lac. ANTES | Lac. DEPOIS | Status ANTES | Status DEPOIS |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---|
| VOGUE | 34 | 21.747 | 9.0% | 9.3% | 90 | 92 | +2 | 27 | 63 | 65 | OK | OK |
| RAY BAN | 24 | 21.546 | 7.6% | 8.0% | 76 | 80 | +4 | 12 | 64 | 68 | OK | OK |
| SPEEDO | 34 | 17.184 | 8.2% | 8.2% | 82 | 81 | -1 | 62 | 20 | 19 | OK | OK |
| DNZ ARMACAO | 79 | 15.163 | 14.2% | 13.0% | 142 | 130 | -12 | 261 | 0 | 0 | OK | OK |
| MICHAEL KORS | 14 | 15.081 | 4.9% | 5.3% | 49 | 52 | +3 | 11 | 38 | 41 | OK | OK |
| BULGET | 21 | 10.418 | 5.0% | 5.0% | 50 | 49 | -1 | 45 | 5 | 4 | OK | OK |
| DII COLLECTION | 30 | 9.773 | 6.2% | 5.9% | 62 | 59 | -3 | 85 | 0 | 0 | OK | OK |
| ATITUDE | 19 | 7.773 | 4.2% | 4.1% | 42 | 41 | -1 | 89 | 0 | 0 | OK | OK |
| GRAZI MASSAFERA | 15 | 7.765 | 3.6% | 3.6% | 36 | 36 | 0 | 3 | 33 | 33 | OK | OK |
| ANA HICKMANN | 13 | 7.714 | 3.3% | 3.4% | 33 | 33 | 0 | 30 | 3 | 3 | OK | OK |
| HIT | 24 | 7.083 | 4.8% | 4.6% | 48 | 45 | -3 | 52 | 0 | 0 | OK | OK |
| MARIA VALENTINA | 10 | 6.764 | 2.7% | 2.8% | 27 | 28 | +1 | 3 | 24 | 25 | OK | OK |
| HICKMANN | 11 | 6.516 | 2.8% | 2.9% | 28 | 28 | 0 | 23 | 5 | 5 | OK | OK |
| LACOSTE | 7 | 6.049 | 2.2% | 2.3% | 0 | 0 | 0 | 5 | 0 | 0 | DESC. | DESC. |
| ARNETTE | 12 | 5.457 | 2.8% | 2.7% | 28 | 27 | -1 | 7 | 21 | 20 | OK | OK |

### 🔀 Mudanças de status entre 60/40 → 50/50

_Nenhuma marca entrou no mix._

_Nenhuma marca saiu do mix._

### 🚫 Todas as marcas SUGERIR_DESCONTINUAR na versão nova (50/50 floor) — 35 marcas

_Ordenadas por faturamento 6M. Stakeholder valida se cada uma faz sentido descontinuar._

| # | Marca | Peças 6M | Fat 6M (R$) | Part 50/50 | Mix bruto (pré-mínimo) | Estoque efetivo |
|---:|---|---:|---:|---:|---:|---:|
| 1 | LACOSTE | 7 | 6.049 | 2.3% | 22 | 5 |
| 2 | OAKLEY | 6 | 5.233 | 2.0% | 19 | 6 |
| 3 | MORENA ROSA | 7 | 4.084 | 1.8% | 18 | 15 |
| 4 | PRADA | 2 | 3.993 | 1.2% | 11 | 2 |
| 5 | JEAN MARCELL | 9 | 3.737 | 2.0% | 19 | 13 |
| 6 | PERSOL | 2 | 3.196 | 1.0% | 10 | 0 |
| 7 | KIPLING | 6 | 2.827 | 1.4% | 13 | 4 |
| 8 | ARMANI EXCHANGE | 4 | 2.754 | 1.1% | 11 | 13 |
| 9 | MARESIA | 6 | 2.400 | 1.3% | 12 | 12 |
| 10 | LANCA PERFUME | 4 | 2.192 | 1.0% | 10 | 9 |
| 11 | RAYBAN JUNIOR | 5 | 2.110 | 1.1% | 11 | 4 |
| 12 | TCHARGE | 2 | 1.696 | 0.6% | 6 | 16 |
| 13 | EMPORIO ARMANI | 2 | 1.394 | 0.6% | 5 | 1 |
| 14 | VIZZANO | 4 | 1.296 | 0.8% | 7 | 3 |
| 15 | DUDALINA | 2 | 1.194 | 0.5% | 5 | 5 |
| 16 | VOGUE INFANTIL | 2 | 960 | 0.5% | 4 | 1 |
| 17 | JOLIE | 2 | 780 | 0.4% | 4 | 13 |
| 18 | SESTINI | 2 | 572 | 0.4% | 3 | 6 |
| 19 | OAKLEY INFANTIL | 1 | 564 | 0.3% | 2 | 0 |
| 20 | MIRAFLEX | 2 | 540 | 0.4% | 3 | 11 |
| 21 | TIGOR T. TIGRE | 1 | 308 | 0.2% | 1 | 7 |
| 22 | MOSCHINO LOVE | 1 | 299 | 0.2% | 1 | 0 |
| 23 | ONO | 1 | 200 | 0.2% | 1 | 0 |
| 24 | ANIMA | 0 | 0 | 0.0% | 0 | 4 |
| 25 | PLATINI | 0 | 0 | 0.0% | 0 | 9 |
| 26 | VICTOR HUGO | 0 | 0 | 0.0% | 0 | 2 |
| 27 | EVOKE | 0 | 0 | 0.0% | 0 | 1 |
| 28 | FILA | 0 | 0 | 0.0% | 0 | 2 |
| 29 | ATITUDE INFANTIL | 0 | 0 | 0.0% | 0 | 2 |
| 30 | LUMIKER (DNZ) | 0 | 0 | 0.0% | 0 | 4 |
| 31 | LILICA RIPILICA | 0 | 0 | 0.0% | 0 | 1 |
| 32 | NANO KIDS | 0 | 0 | 0.0% | 0 | 2 |
| 33 | SABRINA SATO | 0 | 0 | 0.0% | 0 | 2 |
| 34 | DINIZ SOCIAL | 0 | 0 | 0.0% | 0 | 1 |
| 35 | DNZ KIDS | 0 | 0 | 0.0% | 0 | 3 |

### ✅ Sanidade — mix total vs capacidade

| | Σ mixTotal | Capacidade | Ocupação |
|---|---:|---:|---:|
| ANTES (60/40 round) | 793 | 1000 | 79.3% |
| DEPOIS (50/50 floor) | 781 | 1000 | 78.1% |

✔️ Soma dentro da capacidade em ambas as versões.

### Contagens gerais

| | ANTES | DEPOIS | Δ |
|---|---:|---:|---:|
| Marcas OK | 14 | 14 | 0 |
| Marcas SUGERIR_DESCONTINUAR | 35 | 35 | 0 |

---

## Loja 16 — BARUERI

- SKUs armação: **1.217**
- Marcas com atividade: **67**
- Faturamento 6M: **R$ 242.066**
- Peças vendidas 6M: **450**

### Top 15 marcas por faturamento (6M)

| Marca | Peças 6M | Fat 6M (R$) | Part 60/40 | Part 50/50 | Mix ANTES | Mix DEPOIS | Δ Mix | Estoque ef. | Lac. ANTES | Lac. DEPOIS | Status ANTES | Status DEPOIS |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---|
| DNZ ARMACAO | 89 | 18.376 | 14.9% | 13.7% | 119 | 109 | -10 | 167 | 0 | 0 | OK | OK |
| SPEEDO | 29 | 15.808 | 6.5% | 6.5% | 52 | 51 | -1 | 54 | 0 | 0 | OK | OK |
| PRADA | 6 | 15.775 | 3.4% | 3.9% | 27 | 31 | +4 | 16 | 11 | 15 | OK | OK |
| MIU-MIU | 6 | 13.473 | 3.0% | 3.4% | 0 | 27 | +27 | 4 | 0 | 23 | DESC. | OK |
| GRAZI MASSAFERA | 22 | 12.684 | 5.0% | 5.1% | 40 | 40 | 0 | 7 | 33 | 33 | OK | OK |
| BULGET | 23 | 11.918 | 5.0% | 5.0% | 40 | 40 | 0 | 38 | 2 | 2 | OK | OK |
| SWAROVSKI | 9 | 11.415 | 3.1% | 3.4% | 25 | 26 | +1 | 6 | 19 | 20 | OK | OK |
| DII COLLECTION | 24 | 9.907 | 4.8% | 4.7% | 39 | 37 | -2 | 81 | 0 | 0 | OK | OK |
| ANA HICKMANN | 15 | 9.485 | 3.6% | 3.6% | 29 | 29 | 0 | 39 | 0 | 0 | OK | OK |
| ARNETTE | 19 | 9.450 | 4.1% | 4.1% | 33 | 32 | -1 | 24 | 9 | 8 | OK | OK |
| HICKMANN | 16 | 9.212 | 3.7% | 3.7% | 29 | 29 | 0 | 33 | 0 | 0 | OK | OK |
| ATITUDE | 20 | 8.903 | 4.1% | 4.1% | 33 | 32 | -1 | 71 | 0 | 0 | OK | OK |
| RAY BAN | 8 | 7.270 | 2.3% | 2.4% | 0 | 0 | 0 | 22 | 0 | 0 | DESC. | DESC. |
| OAKLEY | 8 | 7.205 | 2.3% | 2.4% | 0 | 0 | 0 | 16 | 0 | 0 | DESC. | DESC. |
| DUDALINA | 10 | 6.756 | 2.4% | 2.5% | 0 | 0 | 0 | 12 | 0 | 0 | DESC. | DESC. |

### 🔀 Mudanças de status entre 60/40 → 50/50

**Entram no mix** (antes DESC. — agora OK):

| Marca | Mix ANTES | Mix DEPOIS | Lacuna DEPOIS |
|---|---:|---:|---:|
| MIU-MIU | 0 | **27** | 23 |

_Nenhuma marca saiu do mix._

### 🚫 Todas as marcas SUGERIR_DESCONTINUAR na versão nova (50/50 floor) — 55 marcas

_Ordenadas por faturamento 6M. Stakeholder valida se cada uma faz sentido descontinuar._

| # | Marca | Peças 6M | Fat 6M (R$) | Part 50/50 | Mix bruto (pré-mínimo) | Estoque efetivo |
|---:|---|---:|---:|---:|---:|---:|
| 1 | RAY BAN | 8 | 7.270 | 2.4% | 19 | 22 |
| 2 | OAKLEY | 8 | 7.205 | 2.4% | 19 | 16 |
| 3 | DUDALINA | 10 | 6.756 | 2.5% | 20 | 12 |
| 4 | JEAN MARCELL | 15 | 6.121 | 2.9% | 23 | 17 |
| 5 | MORENA ROSA | 10 | 5.815 | 2.3% | 18 | 15 |
| 6 | EMPORIO ARMANI | 4 | 5.689 | 1.6% | 12 | 3 |
| 7 | MICHAEL KORS | 4 | 5.242 | 1.5% | 12 | 15 |
| 8 | TECNOL | 17 | 4.771 | 2.9% | 22 | 8 |
| 9 | VOGUE | 7 | 4.658 | 1.7% | 13 | 16 |
| 10 | MARIA VALENTINA | 8 | 4.434 | 1.8% | 14 | 6 |
| 11 | PLATINI | 10 | 3.938 | 1.9% | 15 | 9 |
| 12 | HIT | 11 | 3.653 | 2.0% | 15 | 34 |
| 13 | LACOSTE | 4 | 3.213 | 1.1% | 8 | 5 |
| 14 | GUCCI | 1 | 2.518 | 0.6% | 5 | 5 |
| 15 | TCHARGE | 3 | 2.444 | 0.8% | 6 | 10 |
| 16 | FENDI | 2 | 2.300 | 0.7% | 5 | 6 |
| 17 | MARESIA | 5 | 2.074 | 1.0% | 7 | 8 |
| 18 | SESTINI | 6 | 1.860 | 1.1% | 8 | 5 |
| 19 | GUESS | 2 | 1.640 | 0.6% | 4 | 1 |
| 20 | TIGOR T. TIGRE | 4 | 1.596 | 0.8% | 6 | 11 |
| 21 | MIRAFLEX | 4 | 1.500 | 0.8% | 6 | 13 |
| 22 | ARMANI EXCHANGE | 2 | 1.396 | 0.5% | 4 | 7 |
| 23 | EVOKE | 2 | 1.350 | 0.5% | 4 | 8 |
| 24 | LILICA RIPILICA | 3 | 1.320 | 0.6% | 4 | 4 |
| 25 | DNZ KIDS | 6 | 1.262 | 0.9% | 7 | 20 |
| 26 | ALLPROT | 4 | 1.070 | 0.7% | 5 | 9 |
| 27 | KIPLING | 2 | 956 | 0.4% | 3 | 15 |
| 28 | SABRINA SATO | 1 | 900 | 0.3% | 2 | 4 |
| 29 | JOLIE | 2 | 878 | 0.4% | 3 | 11 |
| 30 | DINIZ SOCIAL | 3 | 748 | 0.5% | 3 | 1 |
| 31 | PIERRE CARDIN | 1 | 446 | 0.2% | 1 | 0 |
| 32 | HIPER VISION | 1 | 298 | 0.2% | 1 | 0 |
| 33 | HIPER VISION PLUS | 1 | 200 | 0.2% | 1 | 0 |
| 34 | PROMOCAO | 1 | 129 | 0.1% | 1 | 0 |
| 35 | CARRERA | 0 | 0 | 0.0% | 0 | 1 |
| 36 | PERSOL | 0 | 0 | 0.0% | 0 | 4 |
| 37 | SALVATORE FERRAGAMO | 0 | 0 | 0.0% | 0 | 7 |
| 38 | NIKE | 0 | 0 | 0.0% | 0 | 1 |
| 39 | TIFFANI | 0 | 0 | 0.0% | 0 | 1 |
| 40 | DOLCE & GABANNA | 0 | 0 | 0.0% | 0 | 6 |
| 41 | VALENTINO | 0 | 0 | 0.0% | 0 | 3 |
| 42 | JIMMY CHOO | 0 | 0 | 0.0% | 0 | 4 |
| 43 | CHRISTIAN DIOR | 0 | 0 | 0.0% | 0 | 3 |
| 44 | VOGUE INFANTIL | 0 | 0 | 0.0% | 0 | 1 |
| 45 | TOM FORD | 0 | 0 | 0.0% | 0 | 3 |
| 46 | VERSACE | 0 | 0 | 0.0% | 0 | 7 |
| 47 | TOMMY HILFIGER | 0 | 0 | 0.0% | 0 | 1 |
| 48 | ONO | 0 | 0 | 0.0% | 0 | 4 |
| 49 | ATITUDE INFANTIL | 0 | 0 | 0.0% | 0 | 2 |
| 50 | ANIMA | 0 | 0 | 0.0% | 0 | 2 |
| 51 | VICTOR HUGO | 0 | 0 | 0.0% | 0 | 2 |
| 52 | PRADA LINEA ROSSA | 0 | 0 | 0.0% | 0 | 1 |
| 53 | IODICE | 0 | 0 | 0.0% | 0 | 1 |
| 54 | LANCA PERFUME | 0 | 0 | 0.0% | 0 | 4 |
| 55 | RAYBAN JUNIOR | 0 | 0 | 0.0% | 0 | 1 |

### ✅ Sanidade — mix total vs capacidade

| | Σ mixTotal | Capacidade | Ocupação |
|---|---:|---:|---:|
| ANTES (60/40 round) | 466 | 800 | 58.2% |
| DEPOIS (50/50 floor) | 483 | 800 | 60.4% |

✔️ Soma dentro da capacidade em ambas as versões.

### Contagens gerais

| | ANTES | DEPOIS | Δ |
|---|---:|---:|---:|
| Marcas OK | 11 | 12 | +1 |
| Marcas SUGERIR_DESCONTINUAR | 56 | 55 | -1 |

---

## Leitura do delta

- **Pesos 60/40 → 50/50** aumenta o peso do faturamento em relação às peças. Marcas com ticket médio alto ganham participação; marcas de giro alto e ticket baixo perdem.
- **`Math.round` → `Math.floor`** tende a diminuir o mix por ~0.5 peça por marca, na média.
- **Efeito de limiar (mínimo 25):** marcas com mix bruto próximo de 25 são as mais sensíveis. Uma variação pequena na participação empurra a marca de OK para SUGERIR_DESCONTINUAR ou vice-versa. Ver as tabelas 🔀 acima.
- **Cascata do mínimo** nesta simulação recai no fallback global (25) para ambas as lojas porque `mix_minimo` está NULL. Nenhum override `minimo_proprio` cadastrado.

## Próximos passos

- Stakeholder valida a lista SUGERIR_DESCONTINUAR de cada loja contra o conhecimento de negócio (marcas estratégicas que deveriam ficar podem receber `estrategica=true` em `marca_config`, ou `minimo_proprio` menor).
- Se aprovado, o motor V2 já está em produção via commit `56e2202` (Passo 5 fechou a Entrega 1). Nada mais a mudar no motor.
- Entrega 2 (modo único Marcas → Lojas → SKUs) começa após a aprovação.
