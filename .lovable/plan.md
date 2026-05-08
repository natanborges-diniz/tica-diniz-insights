# Fase 1 — Saneamento de dados de Estoque & Plano de Compra

> Objetivo: antes de qualquer redesign de UX (Fase 2), ter UMA fonte de verdade, números bate-com-bate entre páginas, e dados de venda/giro confiáveis. Sem isso, qualquer "inteligência de compra" mente.

A Fase 2 (reestruturação do Plano de Compra como motor de sugestão dinâmica de mix + reposição) será planejada e aprovada em ciclo separado, depois que a Fase 1 estiver validada por você em produção.

---

## 1. Divergência "1.174 itens (filtro Armações) vs 1.388 no card Total em Estoque"

**Diagnóstico esperado** (a confirmar lendo os componentes):
- `1.174` é a contagem de SKUs/linhas exibidas na tabela (`itensComEstoque` filtrados por categoria).
- `1.388` é o **somatório de peças** (`estoqueAtual`) dos mesmos SKUs — não é divergência, é métrica diferente (SKUs vs peças).

**Ações:**
- Auditar `metricas.totalPecas` vs contagem da tabela e confirmar que ambos usam o **mesmo conjunto filtrado** (`itensFiltrados`/`comEstoque`).
- Ajustar rótulos para deixar explícito: card "Total em Estoque" mostra `1.388 peças (1.174 SKUs)` quando há filtro ativo.
- Garantir que TODOS os KPIs (Total, Valor, Dead Stock, Peças p/ Liquidar, Fornecedores, Marcas) reagem ao filtro de Categoria/Curva/Marca/Fornecedor — incluindo a base do percentual ("31,4% do estoque" passa a ser % do estoque da categoria filtrada, não global).
- Adicionar badge no topo dos cards: "Filtro ativo: Armações" para deixar visível.

## 2. Itens com "dias em estoque vazio" e "valor de custo zero" caindo em LIQUIDA 50%

**Investigação no backend (Bridge/Firebird):**
- Levantar exatamente quais campos vêm vazios do endpoint `/estoque/completo`: `precoCusto`, `dataUltimaEntrada`, `diasEmEstoque`.
- Identificar se é:
  - (a) produto sem cadastro de custo no ERP (campo nulo na origem),
  - (b) produto novo sem movimentação ainda registrada,
  - (c) bug na transformação Bridge → Supabase.
- Documentar por SKU exemplo (pegar 5 SKUs problemáticos e rastrear até a Bridge).

**Resultado entregue:** relatório com causa raiz por categoria de problema + recomendação (corrigir cadastro no ERP, popular via Bridge, ou tratar como "SEM CADASTRO" na UI). Sem mexer em UI ainda.

**Patch defensivo mínimo no front:** SKUs com `precoCusto = 0 E diasEmEstoque = 0 E qtdVendidos = 0` deixam de cair em "LIQUIDA 50%" e ficam fora dos cards de ação até o cadastro ser corrigido (evita poluir decisão). Eles continuam visíveis na tabela com flag visual.

## 3. Loja selecionada não persiste entre Visão Estoque ↔ Plano de Compra

**Causa:** cada página instancia `useEstoqueUnificado()` com seu próprio `useState`, então o filtro `empresa` é local.

**Solução:**
- Promover o filtro de empresa (e idealmente o snapshot de dados carregados) para escopo global via Zustand store ou Context (`EstoqueContext`).
- Ao trocar de página, manter `filters.empresa` e os dados já carregados; só re-disparar `carregarDados` se a empresa mudar ou o usuário clicar em atualizar.
- Indicador no topo da página: "Loja: BARUERI · dados carregados há Xmin" + botão "Atualizar".

## 4. Divergência de números entre Visão Estoque e Plano de Compra (5.159 peças, 1.602 SKUs, 92 vendidos)

Como ambas as páginas hoje usam o mesmo hook, a divergência vem de:
- **Estado isolado** (item 3): cada página carrega em momentos diferentes, com filtros diferentes.
- **Possível filtro implícito** no Plano de Compra (ex.: só armações, só curva A) que não está visível no header.

**Ações:**
- Após unificação do contexto (item 3), garantir que ambas as páginas leiam do mesmo `itensProcessados`.
- Auditar se o "92 vendidos em 6 meses" corresponde a uma marca específica (visualização por marca em `resumoPorMarca`) — se sim, deixar explícito no rótulo: "92 peças vendidas em 6 meses (marca X)".
- Validar acuracidade do `qtdVendidos` cruzando com endpoint `/vendas/analise-sku` para 1 loja real (ex.: Barueri, últimos 180 dias) e produzir relatório de conferência. Investigar se há SKUs perdidos por mismatch de `cod_sku` entre `/estoque/completo` e `/vendas/analise-sku`.

## 5. "Gap de compra zerado" no Plano de Compra

**Causa provável:** `estoque_minimo_loja` não tem registros para a loja selecionada → `estoqueMinimo = 0` → `otb = max(0, 0 - estoque) = 0` para todos.

**Ações:**
- Conferir conteúdo da tabela `estoque_minimo_loja` para Barueri.
- Se vazia: documentar que mínimos precisam ser configurados OU mudar regra de fallback para usar projeção de venda diária × N dias quando não houver mínimo configurado (preview da Fase 2).
- Por ora apenas diagnóstico + documentação no card ("Mínimos não configurados para esta loja — gap de compra usando projeção provisória de 90 dias").

---

## Detalhes técnicos

### Arquivos envolvidos
- `src/hooks/useEstoqueUnificado.ts` — fonte única; ajustar rótulos e proteção contra LIQUIDA 50% indevida.
- `src/pages/estoque/VisaoEstoquePage.tsx`, `AnaliseOTBPage.tsx`, `OQueFazerPage.tsx` — consumir contexto compartilhado.
- Novo: `src/contexts/EstoqueContext.tsx` (ou `src/stores/useEstoqueStore.ts` com Zustand) para empresa selecionada + cache de `dadosEstoqueCompleto`/`dadosVendasSku`.
- Backend: investigação read-only via `firebird-bridge` (endpoints `/estoque/completo` e `/vendas/analise-sku`) — não muda contrato.
- Tabela `estoque_minimo_loja` — apenas leitura nesta fase.

### Entregáveis desta Fase 1
1. Contexto/store de Estoque compartilhado entre as 3 páginas.
2. KPIs com rótulos coerentes ao filtro ativo + indicador de filtro.
3. Patch defensivo: SKUs sem cadastro saem do bucket de liquidação.
4. Documento (markdown na pasta `docs/`) com:
   - Causa raiz dos campos vazios na Bridge (com 5 SKUs de exemplo).
   - Conferência de "vendas em 6 meses" para Barueri (esperado vs obtido).
   - Estado de `estoque_minimo_loja` por loja ativa.
5. Lista clara para Fase 2 (não implementar ainda) com requisitos da nova lógica de sugestão de compra:
   - Mix ideal por subcategoria/marca baseado em vendas dos últimos 6 meses.
   - Quantidade mínima por loja e por grife.
   - Reposição com peso = velocidade de saída (dias para vender).
   - Período de venda usado para projeção configurável (default 90d) — sem afetar a janela de 6m do mix.

### Fora do escopo da Fase 1
- Redesign visual do Plano de Compra (relatório do Mark).
- Algoritmo novo de sugestão de compra (mix ideal + qty mínima por grife).
- Mudanças no contrato da Bridge.

## Validação ao final da Fase 1
- Selecionar Barueri em "Visão Estoque", aplicar filtro Armações: KPIs e tabela mostram a mesma base, com rótulos claros.
- Navegar para "Plano de Compra": loja já carregada, mesmos números agregados.
- Nenhum SKU sem custo/dias aparece em "LIQUIDA 50%".
- Relatório de acuracidade entregue para sua revisão antes de abrir a Fase 2.
