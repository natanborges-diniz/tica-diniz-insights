# Fase 1 — Saneamento de Dados de Estoque

## O que foi implementado nesta fase

### 1. Estado compartilhado entre páginas (`src/stores/useEstoqueStore.ts`)
- Empresa selecionada, filtros e dados carregados (`/estoque/completo` + `/vendas/analise-sku`) agora vivem em um Zustand store global.
- As 3 páginas (`VisaoEstoquePage`, `AnaliseOTBPage`, `OQueFazerPage`) consomem o mesmo hook `useEstoqueUnificado`, que delega ao store.
- **Resultado:** ao selecionar Barueri em "Visão Estoque" e clicar em "Carregar Dados", a página "Plano de Compra" já abre com a mesma loja e os mesmos dados (sem precisar carregar de novo).

### 2. Indicador de dados compartilhados (`src/components/estoque/EstoqueLoadStatus.tsx`)
- Aviso no topo das páginas mostrando: `Loja X · dados carregados há Y min (compartilhados entre Visão Estoque e Plano de Compra)`.
- Se o usuário trocar a empresa no seletor mas ainda não recarregou, o indicador fica âmbar avisando.
- Botão "Atualizar" inline para forçar recarga.

### 3. Patch defensivo: SEM CADASTRO (`src/services/estoqueCompletoService.ts`)
- SKUs sem nenhuma informação de tempo (`data_ultima_entrada`, `dias_estoque`, `dias_sem_venda` todos nulos) **deixaram** de ser classificados como `LIQUIDA 50%`.
- Agora são classificados como `SEM CADASTRO` — não poluem o KPI "Peças p/ Liquidar" nem o bucket de liquidação por marca.
- Continuam visíveis na tabela com a ação `SEM CADASTRO` para o usuário identificar e cobrar o cadastro no ERP.

### 4. KPIs com rótulo de filtro ativo
- Cards de "Visão Estoque" agora mostram um chip `Métricas filtradas por categoria: Armações` quando há filtro de categoria ativo.
- "Total em Estoque" deixou explícito `peças • N SKUs distintos` — explicando a aparente "divergência" entre 1.388 (peças) e 1.174 (SKUs).
- "Dead Stock" passa a calcular o percentual sobre a base filtrada (`% de armações`) quando há filtro.

---

## Investigações pendentes (ainda Fase 1, sem código)

### A. Causa raiz dos campos vazios na Bridge
O service identifica três entradas possíveis para o tempo em estoque:
1. `dias_estoque` (calculado pelo backend)
2. `data_ultima_entrada` (fallback 1)
3. `dias_sem_venda` (fallback 2)

Quando os três são nulos, o produto cai em `SEM CADASTRO`. Próximo passo: pegar 5 SKUs `SEM CADASTRO` reais de Barueri e rastrear no ERP para confirmar se é cadastro incompleto ou bug na transformação.

### B. Acuracidade de "vendas em 6 meses"
- "92 peças vendidas em 6 meses" no Plano de Compra provavelmente vem do agregado `qtdVendidos6m` de uma marca específica em `resumoPorMarca` (não é o total da loja).
- Para validar globalmente: cruzar `getAnaliseSku` (180 dias) vs query direta no Firebird por loja.

### C. `estoque_minimo_loja`
- Conferir se há registros para Barueri. Se vazio → `gap de compra zerado` é esperado (não é bug, é falta de configuração).
- Para Fase 2: substituir o gap=0 por uma projeção dinâmica baseada em velocidade de venda quando não houver mínimo configurado.

---

## Fase 2 — escopo a planejar separadamente

Requisitos coletados na conversa:
1. **Mix ideal por subcategoria/marca** baseado nas vendas dos últimos 6 meses (define O QUE deve estar na loja).
2. **Reposição com peso pela velocidade de saída** — quanto mais rápido um SKU vende, maior prioridade de recompra.
3. **Quantidade mínima total + por grife**, parametrizável por loja.
4. **Período de venda** para projeção de demanda (default 90 dias) configurável, sem afetar a janela de 6m do mix.
5. Reestruturar o "Plano de Compra" como página de **execução** (lista "O que comprar agora" com qty sugerida), não como dashboard de panorama.
