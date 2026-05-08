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

---

## QA Checklist — SEM CADASTRO fora dos KPIs de liquidação

Loja recomendada: **DINIZ BARUERI**. Repetir em pelo menos 1 outra (ex.: RJ1062).

### Pré-condição
- [ ] Botão "Carregar Dados" em Visão Estoque
- [ ] Confirmar geração de `acaoSugerida = 'SEM CADASTRO'` (estoqueCompletoService linhas 117–127)

### KPIs (card "Peças p/ Liquidar")
- [ ] Total = soma de `estoqueAtual` somente onde `acaoSugerida` contém `LIQUIDA`
- [ ] Itens `SEM CADASTRO` NÃO entram
- [ ] Filtro Categoria=Armações → KPI recalcula e ainda exclui SEM CADASTRO

### Tabela detalhada
- [ ] Filtrar Ação=`SEM CADASTRO` retorna a lista esperada
- [ ] Filtrar Ação=`LIQUIDA 50%` não traz item com `precoCusto=0` E `diasEmEstoque=0` E `qtdVendidos=0`
- [ ] CSV exportado confirma o mesmo

### Plano de Compra
- [ ] "Capital em Risco" exclui SEM CADASTRO
- [ ] "Estoque doente" por marca não lista SEM CADASTRO
- [ ] "Mix Ideal" continua somando SEM CADASTRO no estoque físico

### Persistência entre páginas
- [ ] Carregar Barueri em Visão Estoque → ir para Plano de Compra: mesmos números, sem reload
- [ ] `EstoqueLoadStatus` mostra "carregado há Xmin"

### Dedupe SKU↔fornecedor (novo)
- [ ] Console: `[estoqueCompletoService] Dedupe por cod_sku: N linhas colapsadas` aparece quando aplicável
- [ ] SKU 1761149 (AR MVAL MV 3022) aparece UMA vez na tabela após carregar Barueri
- [ ] Total de SKUs distintos ≤ Total de linhas pré-dedupe

### Logs / Backend
- [ ] Console: `[estoqueCompletoService] Contagem por ação` lista qtd de SEM CADASTRO
- [ ] Anexar aqui: SEM CADASTRO em Barueri = ___ SKUs; 5 exemplos para investigar no ERP

### Regressão
- [ ] Total em Estoque (peças e SKUs distintos) coerente após dedupe
- [ ] Dead Stock continua usando `diasEmEstoque > 180`

---

## Esclarecimentos de UI aplicados

- **Header da loja** agora separa "Estoque (posição agora)" de "Vendas/giro: últimos 180 dias" — eliminando a ambiguidade do "Período: 180 dias" aplicado a estoque físico.
- **Card Dead Stock** ganhou tooltip e legenda "+180 dias sem entrada".
- **SKU duplicado**: causa identificada — Bridge `/estoque/completo` retornava 1 linha por vínculo SKU↔fornecedor. Aplicado dedupe por `cod_sku` mantendo o vínculo com `data_ultima_entrada` mais recente.

---

## Atualização: Dedupe movido para o Bridge (decisão)

Decisão: o dedupe SKU↔fornecedor **deixa de ser feito no frontend** e passa a ser
responsabilidade do Bridge (`/api/v1/estoque/completo`).

- **Regra acordada:** "vínculo mais recente" — uma linha por `cod_sku`, com fornecedor
  de `MAX(data_ultima_entrada)`. `quantidade_estoque` permanece sendo o estoque do SKU
  (já consolidado em `ESTOQUE`), **não** somar entre vínculos.
- **Frontend:** `estoqueCompletoService.ts` removeu o dedupe e mantém apenas um
  `console.warn` se detectar `cod_sku` duplicado (sinal de regressão no Bridge).
- **Contrato:** documentado em `firebird-bridge/CONTRACT.md` § 3.7.b com SQL sugerido.
- **Ação pendente (equipe Bridge / Railway):** ajustar o SQL do endpoint conforme
  CONTRACT.md e fazer deploy. Testar em DINIZ BARUERI: SKU 1761149 deve voltar 1 vez.
