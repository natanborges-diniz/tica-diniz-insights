
## Racional correto (duas fases)

**Fase 1 — Mix ideal por marca (top-down)**
A inteligência olha 180 dias e decide *quais marcas* compõem o mix e *quanto de estoque* cada uma deve ter. SKU não entra aqui.

**Fase 2 — Seleção de peças (bottom-up, condicionada)**
Só se a marca tem **lacuna** (estoque atual < ideal definido na Fase 1), aí olho dentro dela quais SKUs são "bons" (giro ≤ 90 d) e distribuo a lacuna entre eles, escalonando pela performance.

A regra-chave que falta hoje: **se a marca está no mix mas já tem estoque ≥ ideal, não compra nada — independente de haver SKUs zerados ou rápidos**.

---

## Fase 1 — Mix Ideal de Marcas

Em `useEstoqueUnificado.ts`, criar `mixIdealMarcas`:

1. **Universo elegível**: marcas com vendas nos 180 d (ignora marcas zeradas/sem histórico → categoria à parte "Sem histórico").
2. **Curva ABC por marca** (faturamento 6 m): A = 80%, B = 95%, C = 100%.
3. **Pertence ao mix?** Critério padrão: marcas A e B entram; C entra apenas se `taxaPerformance ≥ 0.5` (≥50% dos SKUs ativos venderam) — caso contrário cai em "Avaliar descontinuação".
4. **Estoque ideal por marca**:
    - `pecasIdeaisMarca = ceil(vendaMediaDiariaMarca × COBERTURA_ALVO_MARCA[curva])`
    - Cobertura padrão por curva: A = 60 d, B = 75 d, C = 90 d (configurável depois).
5. **Lacuna**: `lacunaMarca = max(0, pecasIdeaisMarca - pecasEstoqueAtualMarca)`
6. **Output por marca**:
    ```
    { marca, curvaMarca, pecasVendidas6m, vendaDiaria,
      pecasIdeais, pecasAtuais, lacuna,
      decisao: REPOR | RENOVAR | AVALIAR | SEM_HISTORICO,
      noMix: boolean }
    ```

**Regra dura**: `lacuna === 0` ⇒ marca não gera nenhuma compra, mesmo com SKUs zerados.

---

## Fase 2 — Seleção de SKUs dentro da Lacuna

Para cada marca com `lacuna > 0`:

1. **Pool de SKUs "bons"**: SKUs vendidos da marca com `diasGiroEfetivo ≤ 90` (`diasGiroUltimaPeca ?? diasGiroMedio`). SKUs sem giro real ou com giro > 90 → **excluídos** do plano de compra (entram em "Observar / Avaliar").
2. **Score por SKU**: `score = (1 / diasGiroEfetivo) × pecasGiroConsideradas × pesoCurvaABC` (A=3, B=2, C=1). Ordenar desc.
3. **Distribuir a lacuna** percorrendo o pool ordenado:
    - Cada SKU recebe ao menos 1 peça até a lacuna acabar.
    - Sobrou lacuna depois de dar 1 a todos? Segundo passe: dar +1 aos SKUs com giro ≤ 45 d, terceiro passe ≤ 30 d, e assim por diante (escalonamento pela velocidade).
    - Limite por SKU: `min(lacunaRestante, ceil(qtdVendidos180d × 1.2))` — não pede mais que o histórico de venda da peça +20%.
4. **Esgotou o pool antes de zerar a lacuna?** Compra só o que tem qualidade; o restante da lacuna é reportado como **"Lacuna não preenchível — pool de SKUs bons insuficiente"** (sinal para curadoria/novos modelos via TROCAR/RENOVAR).

---

## Constantes (topo do hook)

```ts
const GIRO_BOM_MAX_DIAS = 90;
const COBERTURA_ALVO_MARCA: Record<'A'|'B'|'C', number> = { A: 60, B: 75, C: 90 };
const PESO_CURVA: Record<'A'|'B'|'C', number> = { A: 3, B: 2, C: 1 };
```

(Padrão por enquanto; depois movemos para tabela Supabase como já é convenção do projeto.)

---

## Estruturas alteradas

**`useEstoqueUnificado.ts`**

- Novo memo `mixIdealMarcas: MixMarca[]` (Fase 1).
- `resumoPorMarca`: passa a consumir `mixIdealMarcas` para preencher `pecasIdeais`, `lacuna`, `noMix`.
- Substituir o cálculo atual de `skusARepor` (que hoje decide SKU-a-SKU) pelo algoritmo de **distribuição da lacuna** descrito na Fase 2. Marcas com `lacuna = 0` retornam `skusARepor: []`.
- Manter `skusATrocar` / `itensDoentes` / `skusObservar` como estão — são ortogonais ao plano de compra.
- Eliminar a regra antiga "qtdAComprar = projeção via giro" do `buildSkuView` — agora a quantidade vem **imposta pela distribuição da lacuna**, não pelo SKU.
- Novo retorno `lacunasNaoPreenchiveis: { marca, faltam, motivo }[]` para a UI.

**`SkuARepor`** ganha:
- `qtdAComprar` (vinda da distribuição, não mais projeção)
- `motivoQtd: 'PASSE_1_BASE' | 'PASSE_2_GIRO_RAPIDO' | 'PASSE_3_GIRO_MUITO_RAPIDO'` (para tooltip explicativo)
- `prioridade` recalibrada: deriva da posição no pool ordenado por score, não mais da cobertura.

---

## UI

**`ListaCompraTable.tsx`**
- Cabeçalho passa a mostrar lacuna total e nº de marcas com lacuna.
- Coluna "Comprar" exibe a qtd alocada + tooltip com o motivo do passe.
- Rodapé: bloco "Lacunas não preenchíveis — falta curadoria" com link/expansão.

**`AnaliseOTBPage.tsx`**
- Nova seção no topo: **"Mix Ideal por Marca"** (tabela enxuta: marca, curva, vendas 6m, ideal, atual, lacuna, decisão). Marcas com `lacuna = 0` aparecem com badge "estoque suficiente — sem compra".
- O `MarcaExpandida` atual continua, mas o bloco REPOR só renderiza se a marca tem lacuna; caso contrário mostra "Estoque dentro do ideal — nenhuma reposição planejada".

---

## Casos de validação

1. **Ray-Ban — 50 ideal, 20 atual, 10 SKUs bons no pool**
   → Lacuna 30. Distribui 1 a cada um dos 10 (=10). Sobram 20. Segundo passe nos com giro ≤ 45 d (digamos 4) → +4. Terceiro passe ≤ 30 d (1) → +1. Total 15 peças compradas. Reporta lacuna não preenchível: 15 peças.
2. **Marca X — 30 ideal, 35 atual, vários SKUs zerados**
   → Lacuna 0. **Nenhum SKU entra na lista de compra**, mesmo zerados. UI mostra "Estoque acima do ideal — não comprar".
3. **Marca Y — SKU com 1200 dias de giro e estoque 0**
   → SKU fica fora do pool (giro > 90). Não vira URGENTE. Aparece em "Observar / Avaliar troca".

---

## Não muda

- Endpoints e Bridge — todo o cálculo é frontend.
- Mix ideal por subcategoria, dead stock, curva ABC de SKU — preservados.
- Fluxo de marcas SEM_HISTORICO / AVALIAR_DESCONTINUACAO — continua igual.

---

## Arquivos

- `src/hooks/useEstoqueUnificado.ts` — Fase 1 + Fase 2 + novos retornos.
- `src/components/otb/ListaCompraTable.tsx` — coluna de motivo, rodapé de lacuna.
- `src/pages/estoque/AnaliseOTBPage.tsx` — seção "Mix Ideal por Marca" no topo, ajuste de `MarcaExpandida`.

(Memória de Inventory Health será atualizada após confirmação para registrar este racional como padrão.)
