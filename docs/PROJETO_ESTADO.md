# PROJETO_ESTADO.md — Fase 1.5 Mínima

> Fonte única de estado. Atualizar a cada entrega concluída.
> Data: 2026-05-15 | Branch ativo: `fase-1.5-consolidacao` (NUNCA mergear em main)

---

## Decisões de produto e arquitetura

| Decisão | Detalhe |
|---|---|
| **FAIXAS_SANEAMENTO** | Fonte única de verdade para classificação por idade. Toda lógica de faixas e descontos derivada desta tabela. Qualquer alteração de limites/rótulos acontece aqui e se propaga. |
| **"Nunca descartar"** | Itens ópticos com >720d recebem rótulo AÇÃO ESPECIAL (desconto 0). A filosofia é que sempre há destino alternativo: brinde, kit, doação a entidade. Descarte físico 100% foi rejeitado. |
| **Frontend como fonte de verdade** | `acaoSugerida` é calculada 100% no frontend via `classificarPorIdade()`. O bridge retorna um campo `acao_sugerida` mas ele é ignorado por `estoqueCompletoService.ts`. Isso é temporário — bridge será alinhado quando a SQL do branch `fase-1.5-sql-faixas-alinhadas` for mergeada. |
| **capacidade_expositor** | Entrega 3 vai migrar `estoque_minimo_loja` (número simples) para `capacidade_expositor` (por SKU/categoria). A granularidade nova permite mix ideal real por vitrine. |
| **Profundidade > variedade** | Decisão de compra: concentrar SKUs que giram em vez de pulverizar. O mix ideal reflete isso — calcularMixIdealMarcas pondera quota de venda. |
| **Lead time** | 15 dias (padrão para cálculo de estoque mínimo). |
| **Nível de serviço** | 85% (fator de segurança no cálculo de ponto de reposição). |
| **Dois sistemas independentes** | Sistema 1 = Saneamento (`acaoSugerida`, via FAIXAS_SANEAMENTO). Sistema 2 = Oxigenação (`decisaoSku` + `mixIdeal`). Eles NÃO competem — um classifica o que existe, o outro decide o que comprar. |

---

## Trabalho concluído

### Entrega 1 — Unificação das faixas de saneamento ✅

- Criado `src/lib/estoque/faixas-saneamento.ts` com `FAIXAS_SANEAMENTO`, `classificarPorIdade`, `toFaixaDoente`
- `estoqueCompletoService.ts` ignorar `acao_sugerida` do bridge; calcular localmente
- `useEstoqueUnificado.ts`: removida `classificarFaixaDoente` inline; DESCARTE → ACAO_ESPECIAL; filtros migrados para `classificarPorIdade(x).desconto > 0`
- 52 testes passando em `faixas-saneamento.test.ts`
- Regressão OLD vs NEW em `entrega1-regressao.test.ts` — invariantes confirmados, mudanças esperadas documentadas

Commits:
- `fix(estoque): unifica faixas de saneamento em fonte única`
- `fix(estoque): substitui DESCARTE por AÇÃO ESPECIAL — filosofia "nunca descartar"`
- `fix(estoque): unifica rótulos via FAIXAS_SANEAMENTO + filosofia "nunca descartar" + frontend como fonte de verdade`

### Entrega 2 — Extração de módulos puros (em andamento)

#### curva-abc.ts ✅
- Criado `src/lib/estoque/curva-abc.ts` com `calcularCurvaABC(itens, cortes?)`
- Suporta cortes customizáveis `{ a?: number; b?: number }` (padrão 80/95)
- Hook reduz ~10 linhas; lógica inline substituída por chamada única
- 9 testes unitários + regressão OLD vs NEW em `curva-abc.test.ts`
- Commit: `refactor(estoque): extrai calcularCurvaABC para módulo puro testável`

#### mix-ideal.ts ⏳ próximo
#### decisao-sku.ts ⏳ pendente
#### lacuna.ts ⏳ pendente

---

## Bridge — status

- Branch: `fase-1.5-sql-faixas-alinhadas` (repositório firebird-bridge)
- Status: **STANDBY** — aguarda Entrega 1 estabilizar no frontend antes de mergear
- Quando mergear: coordenar com Natan; deploy bridge → verificar que frontend não quebra
- O que muda no bridge: rótulos `acao_sugerida` alinhados com FAIXAS_SANEAMENTO; remoção de 'SEM MOVIMENTO' e 'DADOS INSUFICIENTES'

---

## Achados para Fase 2 / Fase 3

| Achado | Localização | Impacto |
|---|---|---|
| `tetoCompra` cego ao estoque existente | `useEstoqueUnificado.ts` linha ~850 | `teto = ceil(qtdVendidos × 1.2)` ignora `estoqueAtual` — pode recomendar compra de itens com profundidade já alta |
| `distribuirLacuna` usa estoque total | `useEstoqueUnificado.ts` linha ~674 | `a.pecasAtuais += estoqueAtual` — incluí dead stock na conta, distorcendo a lacuna |
| `OQueFazerPage.tsx` página morta | `src/pages/OQueFazerPage.tsx` | Página sem rota ativa. Candidata a delete na Entrega 4 |
| Hook monolítico 1122 linhas | `src/hooks/useEstoqueUnificado.ts` | Difícil testar, difícil manter. Entrega 2 extrai módulos puros progressivamente |

---

## TODOs

### Fase 2

- [ ] KPI 'Peças p/ Liquidar': não inclui itens AÇÃO ESPECIAL (desconto 0). Repensar para 'Peças p/ Ação' ou dois cards separados
- [ ] `tetoCompra`: tornar consciente do `estoqueAtual` para evitar recompra desnecessária (linha ~850)
- [ ] `distribuirLacuna`: investigar se deve excluir dead stock (`dias > 180`) do `estoqueAtual` ao calcular lacuna (linha ~674)
- [ ] Merge coordenado do bridge branch `fase-1.5-sql-faixas-alinhadas` após Entrega 2 concluída

### Fase 3

- [ ] Migrar `estoque_minimo_loja` → `capacidade_expositor` (Entrega 3) — mostrar DDL primeiro, aguardar OK
- [ ] Deletar `OQueFazerPage.tsx` (Entrega 4)
- [ ] Adicionar `LIMITES` em `faixas-saneamento.ts` quando implementar `decisao-sku.ts` (keyed by rotulo via `limitePor()`)

---

## Regras de execução

1. **Branch**: trabalhar exclusivamente em `fase-1.5-consolidacao`. NUNCA mergear em main.
2. **Protocolo por módulo**: criar módulo → criar testes → substituir no hook → regressão OLD vs NEW → mostrar resultado → aguardar OK → commitar
3. **Commits separados**: cada entrega em commit próprio com mensagem semântica (`refactor`, `fix`, `chore`)
4. **Nunca commitar sem OK**: sempre mostrar resultado dos testes antes de commitar
5. **Entrega 3 (DDL)**: mostrar SQL DDL primeiro e aguardar aprovação explícita antes de aplicar qualquer migração
6. **Bridge em standby**: não alterar branch `fase-1.5-sql-faixas-alinhadas` sem instrução explícita
7. **Sem regressões silenciosas**: toda substituição de lógica inline inclui teste de regressão OLD vs NEW
8. **LIMITES indexados por rótulo**: usar `limitePor(rotulo)` para derivar limites de FAIXAS_SANEAMENTO — nunca por posição (quebraria com reordenação da tabela)
9. **Tipos mínimos**: usar `SkuParaPool` (7 campos) em vez de `ItemEstoque` completo onde possível — facilita teste isolado
10. **Não refatorar além do pedido**: cada entrega faz exatamente o que está especificado, sem cleanup colateral

---

## Assinaturas aprovadas (Entrega 2)

```ts
// mix-ideal.ts
export interface DecisaoMarca { marca: string; decisao: 'manter' | 'reduzir' | 'eliminar' | 'ampliar' }
export interface MixComparativo { categoria: string; atual: number; ideal: number; delta: number }
export interface MixMarca { marca: string; vendas: number; percentual: number; skus: number }

export function calcularMixIdealCategoria(
  itens: ReadonlyArray<{ categoria: string; totalVendido: number }>
): MixComparativo[]

export function calcularMixIdealMarcas(
  itens: ReadonlyArray<{ marca: string; totalVendido: number; skus?: number }>,
  opts?: { minQuota?: number; maxMarcas?: number }
): { ranking: MixMarca[]; decisoes: DecisaoMarca[] }
```

```ts
// decisao-sku.ts  (usa LIMITES de faixas-saneamento)
export function calcularDecisaoSku(
  sku: { diasEmEstoque: number; totalVendido: number; estoqueAtual: number },
  cortes?: { diasAtencao?: number; diasAcao?: number }
): DecisaoSku
```

```ts
// lacuna.ts
export type SkuParaPool = {
  codSku: number; categoria: string; marca: string;
  estoqueAtual: number; totalVendido: number; diasEmEstoque: number;
  capacidadeExpositor: number;
}

export function distribuirLacuna(
  pool: ReadonlyArray<SkuParaPool>,
  opts?: { limitesGiro?: { minGiro?: number; maxGiro?: number } }
): LacunaResult[]
```
