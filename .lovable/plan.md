
## Inteligência de Compra em 2 níveis: Marca → SKU

A lógica passa a ter **duas etapas obrigatórias**, sempre nessa ordem:

```text
ETAPA 1 — A MARCA FAZ SENTIDO?
   ↓ (rótulo: REPOR / RENOVAR / DESCONTINUAR)
ETAPA 2 — Se faz, o que fazer com cada SKU dela?
   ↓ (rótulo por SKU: REPOR / TROCAR / OBSERVAR / LIQUIDAR)
```

Hoje o código mistura as duas — a marca recebe rótulo amplo mas os SKUs são filtrados com regra estreita, e por isso "REPOR" sem nenhum SKU listado. Vamos separar.

---

## ETAPA 1 — Avaliação da marca (contexto de abrangência)

A marca é julgada pelo **conjunto**, não por uma peça isolada. Variáveis:

| Variável | Como calcular |
|---|---|
| `skusAtivos` | nº de SKUs distintos da marca com estoque > 0 OU venda > 0 nos 180d |
| `skusComVenda` | nº desses SKUs que venderam ≥ 1 unidade em 180d |
| `taxaPerformance` | `skusComVenda / skusAtivos` (% da grade que performa) |
| `pctCurvaAB` | % de SKUs em curva A ou B |
| `giroMedio` | média de `vendaDiaria` ponderada por valor |
| `coberturaMedia` | dias de cobertura média dos SKUs ativos |
| `mediaDiasParado` | média de `diasEmEstoque` dos SKUs sem venda |
| `valorEstoque` | total imobilizado na marca |

### Regras de classificação da marca

```text
REPOR_REFERENCIA  ← marca saudável, recomprar os mesmos SKUs
   condição: taxaPerformance ≥ 50%  E  pctCurvaAB ≥ 30%
   significado: "a grade dela funciona — pelo menos metade gira"

RENOVAR_COLECAO   ← marca relevante mas grade envelhecida
   condição: (taxaPerformance entre 20% e 50%)
             OU (existe ≥1 SKU curva A mas mediaDiasParado > 180)
   significado: "a marca vende, mas as referências em estoque cansaram"

AVALIAR_DESCONTINUACAO ← marca não justifica espaço
   condição: taxaPerformance < 20%  E  sem curva A  E  valorEstoque > 0
   significado: "poucos SKUs vendendo, maioria parada — sair gradualmente"

SEM_HISTORICO     ← marca nova, sem dado suficiente
   condição: skusComVenda = 0 E todos SKUs com diasEmEstoque < 90
   significado: "aguardar mais 60d antes de julgar"
```

Os limiares (50%, 30%, 20%) são **propostos por mim** com base em prática óptica — uma grade saudável tem ao menos metade da exposição girando. Pedirei sua validação no fim.

---

## ETAPA 2 — Decisão por SKU (só para marcas REPOR ou RENOVAR)

Marcas DESCONTINUAR não entram no Plano de Compra — vão para a aba "Liquidar/Devolver" da Visão Estoque.

Para cada SKU da marca aprovada:

| Rótulo SKU | Condição | Ação no plano |
|---|---|---|
| **REPOR** | `vendaDiaria > 0` E `coberturaDias < diasAlvo` | calcula `qtdAComprar = vendaDiaria × diasAlvo − estoqueAtual`; entra na lista de compra |
| **TROCAR** | `qtdVendidos = 0` E `diasEmEstoque ≥ 180` E marca = RENOVAR | sinaliza "substituir referência no próximo pedido" — sai da exposição, entra outro modelo |
| **OBSERVAR** | `qtdVendidos > 0` mas `coberturaDias ≥ diasAlvo` | sem ação imediata; monitorar |
| **LIQUIDAR** | `diasEmEstoque ≥ 270` E `qtdVendidos = 0` | vai para fila de promoção (tabela de desconto por idade) |
| **SEM CADASTRO** | `precoCusto = 0` ou dados ausentes | corrigir no ERP antes de qualquer ação |

### Saída na UI da marca expandida

Quando o usuário expande a linha da marca no Plano de Compra, vê **três blocos sempre visíveis** (mesmo que vazios, com contagem):

```text
[Marca: RAY-BAN] — REPOR_REFERENCIA
Performance: 14 de 22 SKUs giraram (64%) · 5 em curva A · cobertura média 38d
─────────────────────────────────────────────
▸ REPOR (8 SKUs · 47 peças · R$ 18.420)
   tabela: cód, descrição, vendas 6m, estoque, vel/dia, cobertura, comprar
▸ TROCAR (3 SKUs · liberar exposição)
   tabela: cód, descrição, dias parado, sugestão "substituir por novo modelo"
▸ OBSERVAR (11 SKUs · estoque saudável)
   contador clicável → expande
```

Para marcas **RENOVAR**, o foco visual é o bloco TROCAR.
Para marcas **DESCONTINUAR**, a expansão mostra apenas LIQUIDAR + total a desmobilizar.

---

## Mudanças técnicas

| Arquivo | O que muda |
|---|---|
| `src/hooks/useEstoqueUnificado.ts` | (1) merge estoque ∪ vendas (corrige "vendas 6m" subcontadas); (2) novos campos por marca: `taxaPerformance`, `pctCurvaAB`, `skusComVenda`, `skusAtivos`, `mediaDiasParado`; (3) nova função `classificarMarca()` com as 4 regras; (4) novo campo `decisaoSku: 'REPOR' \| 'TROCAR' \| 'OBSERVAR' \| 'LIQUIDAR' \| 'SEM_CADASTRO'` por item; (5) constante `COBERTURA_ALVO_DIAS` por subcategoria |
| `src/pages/estoque/AnaliseOTBPage.tsx` | Expansão da marca passa a renderizar 3 blocos (REPOR/TROCAR/OBSERVAR) com contadores; header da marca mostra "X de Y SKUs giraram (Z%)"; mensagem clara quando bloco está vazio |
| `src/components/otb/ListaCompraTable.tsx` | Já existe — passa a consumir só itens com `decisaoSku = REPOR` |
| `src/stores/useEstoqueStore.ts` | Filtro `decisaoMarca` já existe; nada a mudar |

Sem alteração no Bridge, schema ou edge functions.

---

## Racional da inteligência (por que esses critérios)

### Por que avaliar a marca antes do SKU
Comprar SKU isolado sem olhar a marca leva a recomprar uma peça que vende, quando na verdade a marca toda está morrendo (você reabastece um cemitério). Inversamente, descartar um SKU parado de uma marca premium pode tirar uma peça-vitrine que sustenta a percepção da grade.

### Por que `taxaPerformance ≥ 50%` para REPOR
Em loja óptica, exposição costuma ter 6-12 peças por marca. Se metade não vende em 6 meses, a marca está ocupando prateleira sem retorno. 50% é o ponto onde "vale recomprar igual" passa a ser "precisa repensar". Conservador — pode ser ajustado para 40% se você quiser reter mais marcas.

### Por que `pctCurvaAB ≥ 30%` junto
Sozinha, a taxa de performance pode mascarar marca que vende muito barato (gira mas não fatura). Exigir 30% em A/B garante que quem está girando contribui para resultado, não só para volume.

### Por que `taxaPerformance < 20%` para DESCONTINUAR
Abaixo de 1 em 5 SKUs girando, a marca é passivo. Mesmo que tenha 1 SKU "campeão", a perda de espaço dos outros 4 não compensa. Esse SKU campeão pode migrar para outra marca correlata (decisão humana).

### Por que separar TROCAR de LIQUIDAR
TROCAR acontece em marca **viva** (o cliente quer aquela grife, mas o modelo cansou) → trocar referência mantendo marca. LIQUIDAR acontece em marca **morta** ou em SKU velho demais (≥270d) → tirar do estoque a qualquer custo. Ações comerciais diferentes (compra vs promoção).

### Por que cobertura-alvo (60d RX / 45d Solar / 30d Lentes)
Chute baseado em prática genérica:
- **60d RX**: lead time típico de armação (15-30d) + ciclo de pedido mensal (30d) ≈ 60d para não rupturar.
- **45d Solar**: você não quer comprar fora de janela sazonal — cobertura menor evita encalhe pós-verão.
- **30d Lentes**: giro alto, lead curto, peça sob demanda — estoque de prateleira menor.

**Não tenho seu lead time real**. Se você comprar quinzenal ou tiver fornecedor de 60d, esses números mudam. No fim do plano peço para validar.

### Limitações honestas
- Não considera **sazonalidade explícita** (Solar pesa mais ago-fev)
- Não considera **lead time específico por fornecedor**
- Não considera **transferência entre lojas** como alternativa à compra/liquidação
- Usa média simples de 180d (sem peso para vendas recentes)
- Não tem **mínimo de exposição** (ex.: "Ray-Ban precisa ≥ 10 peças expostas mesmo se uma loja só vende 5")

Tudo isso fica para Fase 2.

---

## Perguntas antes de implementar

1. **Limiares da marca** — aceita 50% / 30% / 20% como propostos, ou quer mais conservador (ex.: REPOR só com 60%)?
2. **Cobertura-alvo** — confirma 60/45/30 dias, ou me passa seu lead time real?
3. **Marcas DESCONTINUAR** — devem sumir do Plano de Compra ou aparecer cinza com aviso "saída em curso"?
