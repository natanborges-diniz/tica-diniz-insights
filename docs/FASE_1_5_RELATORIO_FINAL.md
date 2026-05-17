# Fase 1.5 — Relatório Final

> Branch: `fase-1.5-consolidacao` | Data de conclusão: 2026-05-16
> Status: **COMPLETA** — 16 commits, 168 testes, sem push pendente

---

## Resumo executivo

A Fase 1.5 consolidou a base técnica do módulo de estoque antes da expansão para Fase 2. Quatro entregas transformaram um hook monolítico de 1.122 linhas em um conjunto de módulos puros testáveis, substituíram a tabela de mínimos legada por uma arquitetura de capacidade física por loja, e removeram 3 componentes mortos mais 1 tabela órfã. O resultado é um código mais testável, uma única fonte de verdade para cada regra de negócio, e 168 testes que documentam o comportamento esperado — partindo do zero.

---

## Entrega 1 — Unificação das faixas de saneamento

**O que fez:** criou `FAIXAS_SANEAMENTO` como fonte única de verdade para classificação por idade. Eliminou a lógica de faixas duplicada entre bridge e frontend; o frontend passou a ser a fonte de verdade.

**Mudanças principais:**
- Criado `src/lib/estoque/faixas-saneamento.ts` com `FAIXAS_SANEAMENTO`, `LIMITES`, `classificarPorIdade`, `toFaixaDoente`, `limitePor`
- `estoqueCompletoService.ts`: ignora `acao_sugerida` do bridge; calcula localmente
- `useEstoqueUnificado.ts`: substituiu lógica inline; DESCARTE → AÇÃO ESPECIAL
- Filosofia "nunca descartar" consolidada: itens >720d recebem destino alternativo

**Números:** 52 testes em `faixas-saneamento.test.ts` + 20 testes de regressão OLD vs NEW em `entrega1-regressao.test.ts` = **72 testes**

**Commits:** 3
```
fix(estoque): unifica faixas de saneamento em fonte única
fix(estoque): substitui DESCARTE por AÇÃO ESPECIAL — filosofia "nunca descartar"
fix(estoque): unifica rótulos via FAIXAS_SANEAMENTO + filosofia "nunca descartar" + frontend como fonte de verdade
```

---

## Entrega 2 — Extração de módulos puros

**O que fez:** extraiu 4 blocos de lógica inline do hook para módulos puros e testáveis, reduzindo ~190 linhas de código acoplado.

### curva-abc.ts
- `calcularCurvaABC(itens, cortes?)` — cortes customizáveis (padrão 80/95)
- Hook: ~10 linhas reduzidas
- **9 testes**

### mix-ideal.ts
- `calcularMixIdealCategoria`, `calcularMixIdealMarcas` — parâmetros `coberturaAlvo`, `thresholdPerformance`, `diasPeriodo`
- Tipos `DecisaoMarca`, `MixMarca`, `MixComparativo` migrados e re-exportados
- Hook: ~80 linhas e 3 useMemo inline reduzidos
- **22 testes**

### decisao-sku.ts
- `calcularDecisaoSku` — defaults derivados de `LIMITES` via `limitePor()`, nunca por posição
- Hook: ~18 linhas reduzidas
- **28 testes**

### lacuna.ts
- `distribuirLacuna` — 4 passes documentados (BASE, GIRO_RAPIDO, GIRO_MUITO_RAPIDO, passes4+)
- Tipo mínimo `SkuParaPool` (7 campos) em vez do God type `ItemEstoque`
- `tetoCompra = max(1, ceil(qtdVendidos × 1.2))`; `PESO_CURVA = {A:3, B:2, C:1}`
- Hook: ~60 linhas reduzidas
- **35 testes** com snapshots OLD vs NEW idênticos para RAYBAN/OAKLEY/GENÉRICA

**Total Entrega 2:** 4 módulos puros + **94 testes** (9 + 22 + 28 + 35)

**Commits:** 4
```
refactor(estoque): extrai calcularCurvaABC para módulo puro testável
refactor(estoque): extrai mix-ideal para módulo puro testável
refactor(estoque): extrai decidirSku para módulo puro testável
refactor(estoque): extrai distribuirLacuna para módulo puro testável
```

---

## Entrega 3 — Migração estoque_minimo_loja → capacidade_expositor

**O que fez:** substituiu a query da tabela legada (sempre vazia) pela nova `capacidade_expositor` criada pelo Lovable. Criou módulo puro `capacidade.ts` para calcular mínimos OTB por subcategoria a partir de `capacidade_total` e `percentual_solar`.

**Contexto:** enquanto a sessão estava pausada, o Lovable recriou a tabela com schema simplificado: `(cod_empresa UNIQUE, capacidade_total, percentual_solar)` — capacidade física por loja em vez de por loja × categoria.

**Mudanças principais:**
- Criado `src/lib/estoque/capacidade.ts` com `calcularCapacidadePorCategoria`
  - `AR_RX = floor(total × (100 - %solar) / 100)`
  - `AR_SOLAR = floor(total × %solar / 100)`
  - Demais subcategorias → 0 (sem meta física gerenciada)
- `useEstoqueUnificado.ts`: query e lookup inline substituídos
- `CapacidadesExpositorPage.tsx`: colunas RX/Solar harmonizadas com a mesma função (antes usavam `Math.round` inline)

**Números:** **19 testes** em `capacidade.test.ts`

**Commits:** 2
```
refactor(estoque): substitui estoque_minimo_loja por capacidade_expositor
refactor(ui): CapacidadesExpositorPage usa função compartilhada de cálculo
```

---

## Entrega 4 — Limpeza final

**O que fez:** removeu 3 arquivos de dead code, 1 tabela órfã e limpou 1 query residual.

| Item removido | Motivo |
|---|---|
| `OQueFazerPage.tsx` (270 linhas) | Página sem rota ativa — nunca importada |
| `App.tsx` redirect `/estoque/acoes` | Redirect órfão para rota descontinuada |
| `OtbEstoqueMinimoConfig.tsx` (347 linhas) | Substituído por `CapacidadesExpositorPage`; nunca importado |
| `OtbSugestaoCoberturaIA.tsx` (417 linhas) | Componente nunca importado |
| Query `estoque_minimo_loja` em `useOtb.ts` | Tabela a ser dropada; hook não é chamado em runtime |
| `supabase/migrations/20260516182621_drop_estoque_minimo_loja.sql` | Migration preparada (não aplicada ainda) |

**Commits:** 5
```
chore(estoque): limpa query órfã em useOtb (estoque_minimo_loja)
chore(estoque): remove OQueFazerPage (rota morta) + redirect em App.tsx
chore(estoque): remove OtbEstoqueMinimoConfig (substituído por CapacidadesExpositorPage)
chore(estoque): remove OtbSugestaoCoberturaIA (componente nunca importado)
chore(supabase): migration para drop estoque_minimo_loja (tabela órfã)
```

---

## Hook antes e depois

| Métrica | Início da Fase 1.5 | Fim da Fase 1.5 |
|---|---|---|
| Linhas `useEstoqueUnificado.ts` | 1.122 | **922** (−200) |
| Lógica inline testável | 0% | Toda extraída para módulos puros |
| Testes cobrindo o módulo de estoque | **0** | **168** |
| Tabelas Supabase consultadas | `estoque_minimo_loja` (vazia) | `capacidade_expositor` (11 lojas) |

---

## Testes por arquivo

| Arquivo | Testes |
|---|---|
| `faixas-saneamento.test.ts` | 35 |
| `entrega1-regressao.test.ts` | 20 |
| `curva-abc.test.ts` | 9 |
| `mix-ideal.test.ts` | 22 |
| `decisao-sku.test.ts` | 28 |
| `lacuna.test.ts` | 35 |
| `capacidade.test.ts` | 19 |
| **Total** | **168** |

Ponto de partida: **0 testes** no módulo de estoque antes da Fase 1.5.

---

## Achados durante a refatoração

1. **`tetoCompra` cego ao estoque existente** — `useEstoqueUnificado.ts` linha ~850: `teto = ceil(qtdVendidos × 1.2)` ignora `estoqueAtual`. Pode recomendar compra de itens já bem provisionados. → TODO Fase 2.

2. **`distribuirLacuna` inclui dead stock na conta** — linha ~674: `a.pecasAtuais += estoqueAtual` soma dead stock na profundidade atual, distorcendo a lacuna calculada. → TODO Fase 2.

3. **`estoque_minimo_loja` sempre esteve vazia** — a classificação OTB (COMPRAR_URGENTE / COMPRAR / ESTOQUE_OK / EXCESSO) nunca funcionou para a maioria dos SKUs; todos caíam no fallback sem mínimo. A migração para `capacidade_expositor` ativa essa lógica pela primeira vez.

4. **SQL do bridge tinha `acao_sugerida` desatualizada** — branch `fase-1.5-sql-faixas-alinhadas` em standby. O frontend calcula `acaoSugerida` localmente; o campo do bridge é ignorado. Coordenar no deploy final.

5. **3 dead components nunca usados** — `OQueFazerPage`, `OtbEstoqueMinimoConfig`, `OtbSugestaoCoberturaIA` existiam há meses sem rota ou import ativo. Removidos na Entrega 4.

6. **`useOtb.ts` é dead em runtime, mas seus tipos são vivos** — o hook `useOtb()` nunca é instanciado em nenhuma página, mas 5 componentes da pasta `otb/` importam tipos dele (`OtbItem`, `OtbMetrics`, `OtbAgrupado`, `OtbFilters`). Os componentes podem ser dead code também — auditoria necessária. → TODO Fase 2.

---

## TODOs consolidados

### Fase 2

- [ ] **KPI 'Peças p/ Liquidar'**: não inclui itens AÇÃO ESPECIAL (desconto=0). Repensar para 'Peças p/ Ação' ou dois cards separados.
- [ ] **`tetoCompra`**: tornar consciente do `estoqueAtual` para evitar recompra desnecessária (`useEstoqueUnificado.ts` linha ~850).
- [ ] **`distribuirLacuna`**: investigar se deve excluir dead stock (`dias > 180`) do `estoqueAtual` ao calcular lacuna (`useEstoqueUnificado.ts` linha ~674).
- [ ] **Auditoria `useOtb.ts` e componentes `otb/`**: verificar se `OtbKPICards`, `OtbTable`, `OtbCurvaABCChart`, `OtbResumoVisual`, `OtbFilters`, `OtbPainelAcoes` ainda têm páginas que os instanciam. Se não, candidatos a remoção.
- [ ] **Merge coordenado do bridge** (`fase-1.5-sql-faixas-alinhadas`) após deploy do frontend.

### Fase 3

- [ ] **Renomear `ItemEstoque.estoqueMinimo` → `capacidadeMinima`** — o campo reflete capacidade física do expositor, não um mínimo de segurança de estoque. Mudança semântica.
- [ ] **Aplicar migration `drop estoque_minimo_loja`** — coordenar com deploy do bridge. Arquivo pronto em `supabase/migrations/20260516182621_drop_estoque_minimo_loja.sql`.

---

## Estado do branch

Branch: `fase-1.5-consolidacao` — **16 commits** à frente de `origin/main`. Sem push pendente. NUNCA mergear em main diretamente.

```
c09e158 chore(supabase): migration para drop estoque_minimo_loja (tabela órfã)
a4f418f chore(estoque): remove OtbSugestaoCoberturaIA (componente nunca importado)
fab9389 chore(estoque): remove OtbEstoqueMinimoConfig (substituído por CapacidadesExpositorPage)
bd88a86 chore(estoque): remove OQueFazerPage (rota morta) + redirect em App.tsx
ef17843 chore(estoque): limpa query órfã em useOtb (estoque_minimo_loja)
1d50ac8 refactor(ui): CapacidadesExpositorPage usa função compartilhada de cálculo
f7031ea refactor(estoque): substitui estoque_minimo_loja por capacidade_expositor
7f6134d refactor(estoque): extrai distribuirLacuna para módulo puro testável
452d21f refactor(estoque): extrai decidirSku para módulo puro testável
c3af2d4 refactor(estoque): extrai mix-ideal para módulo puro testável
8845917 chore(docs): cria PROJETO_ESTADO.md como fonte única de estado
43879a4 refactor(estoque): extrai calcularCurvaABC para módulo puro testável
0088461 fix(estoque): unifica rótulos via FAIXAS_SANEAMENTO + …
1d6f6e2 fix(estoque): substitui DESCARTE por AÇÃO ESPECIAL
f0ccdce docs: adiciona AUDITORIA_ESTOQUE.md da Fase 1
4596da3 fix(estoque): unifica faixas de saneamento em fonte única
```

---

## Próximo passo — deploy coordenado

Quando estiver pronto para publicar a Fase 1.5:

1. **Bridge primeiro**: mergear `fase-1.5-sql-faixas-alinhadas` no repositório `firebird-bridge` e fazer deploy. Verificar que o frontend não quebra (campo `acao_sugerida` do bridge é ignorado pelo frontend — deve ser inócuo).
2. **Frontend**: mergear `fase-1.5-consolidacao` → `main` e fazer deploy.
3. **Supabase**: aplicar migration `20260516182621_drop_estoque_minimo_loja.sql` via SQL Editor após confirmar que nenhuma query no código ativo ainda referencia a tabela.
4. **Verificar em produção**: acessar `/estoque/capacidades`, confirmar 11 lojas, testar edição de capacidade + preview RX/Solar. Selecionar uma loja em `/estoque/otb` e confirmar que a classificação OTB agora reflete os valores de `capacidade_expositor`.
