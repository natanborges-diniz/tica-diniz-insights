# AUDITORIA_ESTOQUE.md
> Fase 1 — Leitura e mapeamento. Nenhum arquivo foi modificado.  
> Data: 2026-05-15  
> Arquivos lidos: 24

---

## A. Inventário de código

### Páginas (`src/pages/estoque/`)

| Arquivo | O que faz |
|---------|-----------|
| `VisaoEstoquePage.tsx` | Lista detalhada de todos os SKUs com KPIs, filtros por categoria/fornecedor/marca/ação e exportação |
| `AnaliseOTBPage.tsx` | Plano de Compra: KPIs executivos, Mix Ideal por subcategoria/marca, Relatório por Marca com SKUs a repor/trocar/observar, Lista de Compra achatada |
| `OQueFazerPage.tsx` | Painel de ações prioritárias — **⚠️ NÃO ESTÁ ROTEADA em `App.tsx`; rota `/estoque/acoes` faz `Navigate → /estoque/otb`** |

### Layouts

Nenhum layout específico de estoque. As 3 páginas herdam `AppLayout.tsx` via `ModuleGuard`.

### Componentes específicos

| Arquivo | O que faz |
|---------|-----------|
| `components/estoque/EstoqueLoadStatus.tsx` | Banner que mostra empresa/tempo de carga e avisa quando a empresa do seletor difere dos dados carregados |
| `components/otb/ListaCompraTable.tsx` | Tabela achatada de SKUs a comprar, ordenada por prioridade (URGENTE/ALTA/MEDIA/BAIXA) |
| `components/otb/OtbCurvaABCChart.tsx` | Gráfico de distribuição da curva ABC |
| `components/otb/OtbEstoqueMinimoConfig.tsx` | Dialog de CRUD da tabela `estoque_minimo_loja` (loja × categoria × curva → quantidade mínima) |
| `components/otb/OtbFilters.tsx` | Filtros do módulo OTB (empresa, tipo, período) |
| `components/otb/OtbFornecedorMarcaConfig.tsx` | Dialog de CRUD da tabela `fornecedor_marca` (marca → fornecedor) |
| `components/otb/OtbKPICards.tsx` | Cards de KPIs do módulo OTB |
| `components/otb/OtbPainelAcoes.tsx` | Painel "O que Fazer?": seções de ruptura, capital parado, saúde do mix |
| `components/otb/OtbResumoVisual.tsx` | Resumo visual do estoque (gráficos de distribuição) |
| `components/otb/OtbSugestaoCoberturaIA.tsx` | Chama a edge function `ai-sugestao-cobertura` para sugerir mínimos via IA |
| `components/otb/OtbTable.tsx` | Tabela OTB agrupada por fornecedor ou marca |
| `components/otb/PlanoCompraFiltros.tsx` | Filtros do plano de compra por decisão de marca |

### Hooks (`src/hooks/`)

| Arquivo | O que faz |
|---------|-----------|
| `useEstoqueUnificado.ts` | **Hook central** (1122 linhas): mescla `/estoque/completo` + `/vendas/analise-sku`, calcula curva ABC, cobertura, OTB, mix ideal por marca/subcategoria, distribuição da lacuna, plano de compra e estoque doente |
| `useOtb.ts` | Hook **legado** de OTB (usa apenas `/vendas/analise-sku`, sem `/estoque/completo`); aparentemente não é chamado pelas 3 páginas atuais que usam `useEstoqueUnificado` |
| `useApiQuery.ts` | Hook genérico de fetch (fetch puro, sem TanStack Query); não é usado pelo módulo de estoque diretamente |

### Serviços relevantes (`src/services/`)

| Arquivo | O que faz |
|---------|-----------|
| `estoqueCompletoService.ts` | Adapta `/estoque/completo`: normaliza campos, calcula `diasEmEstoque` (3 fallbacks), classifica `acaoSugerida` (dias-based), guarda de regressão de duplicatas |
| `vendasService.ts` | Adapta `/vendas/analise-sku`: normaliza campos, calcula `margemBruta` e `giroEstoque` |
| `firebirdBridge.ts` | Cliente HTTP central: `apiGet()` com fetch puro, circuit breaker, timeout, envelope v2 obrigatório |

### Store

| Arquivo | O que faz |
|---------|-----------|
| `stores/useEstoqueStore.ts` | Estado Zustand global compartilhado pelas 3 páginas de estoque (filtros, dados brutos de ambos os endpoints, timestamp de carga) |

### Utils (`src/utils/`)

| Arquivo | O que faz |
|---------|-----------|
| `utils/categorizarProduto.ts` | Fonte única de verdade para categorização (ARMACOES/LENTES/ACESSORIOS/OUTROS) e subcategorização (AR_RX/AR_SOLAR/LENTES/LENTES_GRAU/LENTES_CONTATO/ACESSORIOS/OUTROS) a partir do campo `tipo` ou prefixo da descrição |

### Types/Interfaces

Não há arquivo `types/` dedicado ao módulo de estoque. Interfaces estão inline nos arquivos. Tipos Supabase gerados automaticamente em `src/integrations/supabase/types.ts`.

---

## B. Mapeamento de cálculos

### 1. Curva ABC (A / B / C)

**Arquivo:** `src/hooks/useEstoqueUnificado.ts`, linhas 353–363 (useMemo `itensProcessados`)

```ts
const totalVendasGeral = dadosVendasSku.reduce((acc, sku) => acc + sku.totalVendido, 0);
const ordenadosPorVenda = [...dadosVendasSku].sort((a, b) => b.totalVendido - a.totalVendido);
let acumulado = 0;
ordenadosPorVenda.forEach(sku => {
  acumulado += sku.totalVendido;
  const percentual = totalVendasGeral > 0 ? (acumulado / totalVendasGeral) * 100 : 0;
  if (percentual <= 80) curvaMap.set(sku.codSku, 'A');
  else if (percentual <= 95) curvaMap.set(sku.codSku, 'B');
  else curvaMap.set(sku.codSku, 'C');
});
```

**Parâmetros mágicos:** 80 (corte A↔B), 95 (corte B↔C)  
**⚠️ DUPLICADO em:** `useOtb.ts` (linhas 242–249) com a mesma lógica; e em `mixIdealMarcas` (linhas 680–689) aplicada sobre faturamento por marca.  
**Base de cálculo:** faturamento (`totalVendido`) dos últimos 180 dias — não unidades, não margem.

---

### 2. Classificação por giro (COMPRAR_URGENTE / COMPRAR / ESTOQUE_OK / EXCESSO)

**Arquivo:** `src/hooks/useEstoqueUnificado.ts`, linhas 431–442

```ts
if (estoqueMinimo > 0) {
  const percentualDoMinimo = (estoqueAtual / estoqueMinimo) * 100;
  if (percentualDoMinimo < 30)  classificacao = 'COMPRAR_URGENTE';
  else if (percentualDoMinimo < 100) classificacao = 'COMPRAR';
  else if (percentualDoMinimo > 200) classificacao = 'EXCESSO';
  else classificacao = 'ESTOQUE_OK';
} else {
  // Sem mínimo configurado: fallback baseado em venda/dead stock
  if (qtdVendidos > 0 && estoqueAtual === 0) classificacao = 'COMPRAR_URGENTE';
  else if (isDeadStock) classificacao = 'EXCESSO';
  else classificacao = 'ESTOQUE_OK';
}
```

**Parâmetros mágicos:** 30%, 100%, 200% do `quantidade_minima` configurado na tabela `estoque_minimo_loja`.  
**⚠️ Dependência crítica:** sem registro em `estoque_minimo_loja`, a classificação por mínimo não funciona e todos os itens caem em `ESTOQUE_OK` ou `COMPRAR_URGENTE` (apenas se zerados).

---

### 3. Cálculo de "dias em estoque" (DSI)

**Arquivo:** `src/services/estoqueCompletoService.ts`, linhas 113–126

```ts
let diasEmEstoque = 0;
if (r.dias_estoque !== undefined && r.dias_estoque !== null) {
  diasEmEstoque = r.dias_estoque;                       // Preferência: backend calcula
} else if (r.data_ultima_entrada) {
  const dataEntrada = new Date(r.data_ultima_entrada);
  diasEmEstoque = Math.floor(
    (hoje.getTime() - dataEntrada.getTime()) / (1000 * 60 * 60 * 24)
  );                                                    // Fallback 1: data de entrada
} else if (r.dias_sem_venda !== undefined && r.dias_sem_venda !== null) {
  diasEmEstoque = r.dias_sem_venda;                     // Fallback 2: proxy de venda (impreciso)
}
// Se nenhum campo disponível: diasEmEstoque = 0 → acaoSugerida = 'SEM CADASTRO'
```

**Parâmetros mágicos:** nenhum no frontend (a lógica de preferência é de qualidade de dado).  
**⚠️ Problema identificado:** o Fallback 2 usa `dias_sem_venda` como proxy de DSI, o que pode superestimar o tempo em estoque para itens que venderam mas têm outra peça parada.

---

### 4. Mix Ideal por marca (lacuna, status)

**Arquivo:** `src/hooks/useEstoqueUnificado.ts`, função `mixIdealMarcas` (useMemo), linhas 657–731

```ts
// Cobertura-alvo por curva da marca
const COBERTURA_ALVO_MARCA = { A: 60, B: 75, C: 90 }; // dias

const vendaDiaria = agg.pecasVendidas / DIAS_PERIODO;   // 180 dias
const pecasIdeais = incluidaNoMix
  ? Math.ceil(vendaDiaria * COBERTURA_ALVO_MARCA[curvaMarca])
  : 0;
const lacuna = Math.max(0, pecasIdeais - agg.pecasAtuais);

// Decisão da marca
if (agg.skusComVenda === 0) {
  decisao = 'SEM_HISTORICO'; incluidaNoMix = false;
} else if (curvaMarca === 'C' && taxaPerformance < 0.5) {
  decisao = 'AVALIAR_DESCONTINUACAO'; incluidaNoMix = false;
} else {
  decisao = taxaPerformance >= 0.5 ? 'REPOR_REFERENCIA' : 'RENOVAR_COLECAO';
  incluidaNoMix = true;
}
// taxaPerformance = skusComVenda / skusAtivos
```

**Parâmetros mágicos:** COBERTURA_ALVO_MARCA (A=60, B=75, C=90), threshold taxaPerformance=0.5, DIAS_PERIODO=180.

---

### 5. Mix Ideal por subcategoria (% atual vs % ideal)

**Arquivo:** `src/hooks/useEstoqueUnificado.ts`, função `mixIdealCategoria` (useMemo), linhas 607–631

```ts
const percentualIdeal  = totalVendas > 0   ? (vendasSub  / totalVendas)   * 100 : 0;
const percentualAtual  = totalEstoque > 0  ? (estoqueSub / totalEstoque)  * 100 : 0;
const gap = percentualIdeal - percentualAtual;
```

Onde `percentualIdeal` = participação desta subcategoria nas vendas (em peças, 180 dias) e `percentualAtual` = participação no estoque físico atual.

---

### 6. Decisão "ANALISE PARA RECOMPRA" vs "LIQUIDA X%" vs "REPOR"

Há **dois sistemas paralelos** com nomenclaturas diferentes que coexistem:

**Sistema 1 — `acaoSugerida` (baseado em dias em estoque)**  
**Arquivo:** `src/services/estoqueCompletoService.ts`, linhas 129–154

```ts
if (!temInfoTempo)           acaoSugerida = 'SEM CADASTRO';
else if (diasEmEstoque <= 90)  acaoSugerida = 'ANALISE PARA RECOMPRA';
else if (diasEmEstoque <= 180) acaoSugerida = 'ACOMPANHAMENTO';
else if (diasEmEstoque <= 270) acaoSugerida = 'SINAL DE ALERTA';
else if (diasEmEstoque <= 360) acaoSugerida = 'LIQUIDA 20%';
else if (diasEmEstoque <= 720) acaoSugerida = 'LIQUIDA 30%';
else                           acaoSugerida = 'LIQUIDA 50%';
```

**Parâmetros mágicos:** 90, 180, 270, 360, 720 dias.  
Este campo vem do backend quando disponível (`r.acao_sugerida`) — o frontend o usa como fallback.

**Sistema 2 — `decisaoSku` (baseado em giro real + cobertura)**  
**Arquivo:** `src/hooks/useEstoqueUnificado.ts`, linhas 456–471

```ts
if (precoCusto === 0)
  decisaoSku = 'SEM_CADASTRO';
else if (estoqueAtual > 0 && qtdVendidos === 0 && diasEmEstoque >= 270)
  decisaoSku = 'LIQUIDAR';
else if (estoqueAtual > 0 && qtdVendidos === 0 && diasEmEstoque >= 180)
  decisaoSku = 'TROCAR';
else if (temGiroReal && pecasGiroConsideradas >= 1 && coberturaDias < diasAlvo)
  decisaoSku = 'REPOR';
else if (!temGiroReal && vendaDiaria > 0 && coberturaDias < diasAlvo)
  decisaoSku = 'REPOR';  // fallback sem giro real
else
  decisaoSku = 'OBSERVAR';
```

**Parâmetros mágicos:** 270 dias (LIQUIDAR), 180 dias (TROCAR); `diasAlvo` vem de `COBERTURA_ALVO_DIAS[subcategoria]`.

---

### 7. Cálculo do plano de liquidação (descontos por idade)

**Arquivo:** `src/hooks/useEstoqueUnificado.ts`, função `classificarFaixaDoente`, linhas 737–742

```ts
const classificarFaixaDoente = (dias: number): { faixa: FaixaDoente; desconto: string } => {
  if (dias >= 720) return { faixa: 'DESCARTE',      desconto: '100%' };
  if (dias >= 360) return { faixa: 'LIQUIDACAO_50', desconto: '50%' };
  if (dias >= 270) return { faixa: 'LIQUIDACAO_30', desconto: '30%' };
  return           { faixa: 'PROMOCAO_20',           desconto: '20%' }; // >= 180
};
```

**Parâmetros mágicos:** 720, 360, 270, 180 dias.

**⚠️ CONFLITO DE FAIXAS:** o `estoqueCompletoService.ts` usa `LIQUIDA 20%` para 270–360d e `LIQUIDA 30%` para 360–720d. O `classificarFaixaDoente` usa `30%` em 270–360d e `50%` em 360–720d. Os dois sistemas calculam descontos diferentes para as mesmas faixas de idade.

---

### 8. Cálculo de "Capital em Risco" / "Peças Doentes"

**Arquivo:** `src/pages/estoque/AnaliseOTBPage.tsx`, linhas 93–97 (KPI Card)  
Consumido de: `metricas.deadStockValor` / `metricas.deadStockPecas`

**Definição de dead stock** — `src/services/estoqueCompletoService.ts`, linha 191:
```ts
isDeadStock: diasEmEstoque > 180
```

**Cálculo das métricas** — `src/hooks/useEstoqueUnificado.ts`, linhas 555–558:
```ts
const deadStock = comEstoque.filter(i => i.isDeadStock);
const deadStockPecas = deadStock.reduce((acc, i) => acc + i.estoqueAtual, 0);
const deadStockValor = deadStock.reduce((acc, i) => acc + i.valorEstoqueCusto, 0);
// valorEstoqueCusto = quantidadeEstoque * precoCusto (calculado no service)
```

---

### 9. Cálculo de "Cobertura Média"

**Cobertura global (KPI Card)** — `src/pages/estoque/AnaliseOTBPage.tsx`, linhas 37–42:
```ts
const vendaDiariaTotal = metricas.totalVendido6mPecas / Math.max(1, metricas.diasPeriodo);
return Math.round(metricas.totalPecas / vendaDiariaTotal);
```

**Cobertura por SKU** — `src/hooks/useEstoqueUnificado.ts`, linhas 415–418:
```ts
// Preferência: giro real do Bridge (dias por peça × estoque atual)
const coberturaDias = diasGiroEfetivo && diasGiroEfetivo > 0
  ? Math.round(estoqueAtual * diasGiroEfetivo)
  : (vendaDiaria > 0 ? Math.round(estoqueAtual / vendaDiaria) : 999);
// diasGiroEfetivo = diasGiroUltimaPeca ?? diasGiroMedio (Bridge af64a42)
```

---

### 10. Recomendação "A Comprar Agora"

**Arquivo:** `src/hooks/useEstoqueUnificado.ts`, bloco "FASE 2 — DISTRIBUIÇÃO DA LACUNA", linhas 831–930, dentro de `resumoPorMarca`.

```ts
// Pool de SKUs elegíveis (giro real ≤ 90 dias, vendeu alguma coisa, tem custo)
const pool = skus.filter(s =>
  s.precoCusto > 0 && s.qtdVendidos > 0 &&
  giroEf !== null && giroEf > 0 && giroEf <= GIRO_BOM_MAX_DIAS /* 90 */
).map(s => ({
  score: (1 / giroEf) * Math.max(1, s.pecasGiroConsideradas) * PESO_CURVA[s.curvaABC],
  // PESO_CURVA: A=3, B=2, C=1
  tetoCompra: Math.max(1, Math.ceil(s.qtdVendidos * 1.2)),
  qtd: 0,
})).sort(desc por score);

// 4 passes de distribuição da lacuna:
// Passe 1 (BASE): +1 por SKU, do melhor para o pior
// Passe 2 (GIRO_RAPIDO): +1 nos giros ≤ 45d
// Passe 3 (GIRO_MUITO_RAPIDO): +1 nos giros ≤ 30d
// Passes 4+: limites [21, 15, 10, 7] dias
```

**Lista achatada final:** `listaCompraFlat` (linhas 1001–1013) — todos os SKUs de todas as marcas, ordenados por prioridade.  
**Parâmetros mágicos:** GIRO_BOM_MAX_DIAS=90, PESO_CURVA={A:3,B:2,C:1}, teto=qtdVendidos×1.2, limites=[45,30,21,15,10,7].

---

## C. Integração com backend

### Como o frontend chama o bridge?

- **Biblioteca:** `fetch` puro nativo (sem axios, sem react-query, sem TanStack Query)
- **Função central:** `apiGet()` em `src/services/firebirdBridge.ts` (linha 124)
- **URL base:**
  ```ts
  const FIREBIRD_BRIDGE_BASE_URL =
    import.meta.env.VITE_FIREBIRD_BRIDGE_BASE_URL ||
    'https://firebird-bridge-production.up.railway.app';
  ```
- **⚠️ O `.env` NÃO define `VITE_FIREBIRD_BRIDGE_BASE_URL`** — em produção sempre usa o fallback hardcoded. Qualquer mudança de URL exige alterar o código.
- **Formato obrigatório:** envelope v2 `{ ok, data, error, meta }`. Qualquer resposta fora deste formato lança `BRIDGE_CONTRACT_VIOLATION`.
- **Circuit breaker:** 3 falhas consecutivas suspendem novas chamadas (via `useBridgeStatus.ts`).

### Endpoints do bridge consumidos pelo módulo de estoque

| Endpoint | Status | Chamado em |
|----------|--------|-----------|
| `GET /api/v1/estoque/completo` | ✅ Implementado | `estoqueCompletoService.ts` |
| `GET /api/v1/vendas/analise-sku` | ✅ Implementado | `vendasService.ts` |
| `GET /api/v1/estoque/resumo-agrupado` | 🔄 Pendente | Não implementado no frontend |
| `GET /api/v1/estoque/movimentacao` | 🔄 Pendente | Não implementado no frontend |
| `GET /api/v1/estoque/sugestao-minimos` | 🔄 Pendente | Substituído por edge function IA |

### Exemplo completo de uma chamada (do hook até o fetch)

```ts
// 1. Página: AnaliseOTBPage.tsx
const { carregarDados } = useEstoqueUnificado();
<Button onClick={carregarDados}>Carregar Dados</Button>

// 2. Hook: useEstoqueUnificado.ts (linha 1083)
const [estoqueCompleto, vendasSku] = await Promise.all([
  getEstoqueCompleto({ empresa: filters.empresa }),
  getAnaliseSku({ empresa: filters.empresa, dataInicio, dataFim }),
]);

// 3. Service: estoqueCompletoService.ts (linha 90)
const raw = await apiGet<EstoqueCompletoRaw>('/estoque/completo', {
  empresa: formatEmpresaParam(params.empresa), // ex: "1"
}, { timeoutMs: 60000 });

// 4. Cliente HTTP: firebirdBridge.ts (linha 167)
const url = new URL('https://firebird-bridge-production.up.railway.app/api/v1/estoque/completo');
url.searchParams.append('empresa', '1');
const response = await fetch(url.toString(), {
  method: 'GET',
  headers: { 'Content-Type': 'application/json' },
  signal: abortController.signal,  // timeout de 60s
});
// Espera: { ok: true, data: EstoqueCompletoRaw[], error: null, meta: { count, elapsed_ms } }
```

---

## D. Supabase

### Este projeto usa Supabase?

**Sim** — para autenticação E dados de configuração.

### Configuração

- **Cliente:** `src/integrations/supabase/client.ts`
- **URL:** `https://zmsfntqgxsstnbpzdled.supabase.co` (via `VITE_SUPABASE_URL`)
- **Chave:** anon key em `VITE_SUPABASE_PUBLISHABLE_KEY` (`.env` e código)
- **Autenticação:** `AuthContext.tsx` + `ProtectedRoute.tsx`; sessão persistida em `localStorage`, auto-refresh habilitado

### Tabelas do Supabase relevantes para o módulo de estoque

**`estoque_minimo_loja`**
```
id            uuid (PK)
cod_empresa   number   -- código da loja no ERP
categoria     string   -- 'TODOS' | 'ARMACOES' | 'LENTES' | 'ACESSORIOS'
curva_abc     string   -- 'A' | 'B' | 'C'
quantidade_minima  number
created_at    timestamp
updated_at    timestamp
-- UNIQUE: (cod_empresa, categoria, curva_abc)
```

**`fornecedor_marca`**
```
id          uuid (PK)
marca       string   -- nome da marca (lookup em UPPERCASE)
fornecedor  string   -- nome do fornecedor que representa esta marca
created_at  timestamp
updated_at  timestamp
```

### Todas as tabelas Supabase existentes (inventário completo)

`adquirentes_config`, `borderos`, `bridge_health_logs`, `btg_cobrancas`, `btg_contas_bancarias`, `btg_dda_titulos`, `btg_extrato`, `btg_pagamentos`, `btg_tokens`, `btg_webhook_events`, `calendario_feriados`, `etl_controle`, `estoque_minimo_loja`, `fornecedor_configuracao`, `fornecedor_marca` — e pelo menos ~30 tabelas adicionais relacionadas a financeiro, OS, vendas, sincronização.

### Uso do Supabase

- **Autenticação:** sim, via `supabase.auth`
- **Dados de configuração de estoque:** `estoque_minimo_loja`, `fornecedor_marca` (lidos a cada montagem dos hooks via `useEffect`)
- **Edge functions de IA:** `ai-sugestao-cobertura`, `ai-module-insights`
- **Dados transacionais de estoque:** NÃO — estoque físico e vendas vêm do Firebird via Bridge

---

## E. Configurações e constantes

### Existe cadastro de "capacidade", "expositor", "mostruário", "vitrine"?

**Não existe.** O único conceito de "limite" é a `quantidade_minima` em `estoque_minimo_loja`, configurada manualmente por loja × categoria × curva ABC.

### Páginas de configuração / admin relevantes

| Página | O que configura |
|--------|----------------|
| `AdminHealthPage.tsx` | Monitoramento do Bridge (latência, circuit breaker) |
| `AdminSyncPage.tsx` | Sincronização de dados |
| `AdminFornecedoresPage.tsx` | Credenciais de fornecedores externos (Hoya, Zeiss, Haytek) |
| `OtbEstoqueMinimoConfig.tsx` (componente) | Dialog de CRUD de `estoque_minimo_loja` — acessível dentro do módulo OTB |
| `OtbFornecedorMarcaConfig.tsx` (componente) | Dialog de CRUD de `fornecedor_marca` — acessível nas 3 páginas de estoque |

### Constantes hardcoded (todos em `useEstoqueUnificado.ts` e `estoqueCompletoService.ts`)

| Constante | Valor | Onde | Significado |
|-----------|-------|------|-------------|
| `DIAS_PERIODO` | 180 | `useEstoqueUnificado.ts:228`, `useOtb.ts:112` | Janela de vendas para cálculo de giro e curva ABC |
| `GIRO_BOM_MAX_DIAS` | 90 | `useEstoqueUnificado.ts:249` | Giro máximo para um SKU entrar no plano de compra |
| `COBERTURA_ALVO_DIAS[AR_RX]` | 60 | `useEstoqueUnificado.ts:233` | Cobertura-alvo em dias para armações RX |
| `COBERTURA_ALVO_DIAS[AR_SOLAR]` | 45 | `useEstoqueUnificado.ts:234` | Cobertura-alvo para solar/OC |
| `COBERTURA_ALVO_DIAS[LENTES*]` | 30 | `useEstoqueUnificado.ts:235-237` | Cobertura-alvo para lentes |
| `COBERTURA_ALVO_DIAS[ACESSORIOS]` | 60 | `useEstoqueUnificado.ts:238` | Cobertura-alvo para acessórios |
| `COBERTURA_ALVO_MARCA[A]` | 60 | `useEstoqueUnificado.ts:254` | Cobertura-alvo de estoque para marcas curva A |
| `COBERTURA_ALVO_MARCA[B]` | 75 | `useEstoqueUnificado.ts:255` | Cobertura-alvo para marcas curva B |
| `COBERTURA_ALVO_MARCA[C]` | 90 | `useEstoqueUnificado.ts:256` | Cobertura-alvo para marcas curva C |
| `PESO_CURVA[A/B/C]` | 3/2/1 | `useEstoqueUnificado.ts:260-264` | Peso do SKU no score do plano de compra |
| Corte ANALISE PARA RECOMPRA | ≤ 90d | `estoqueCompletoService.ts:141` | |
| Corte ACOMPANHAMENTO | ≤ 180d | `estoqueCompletoService.ts:143` | |
| Corte SINAL DE ALERTA | ≤ 270d | `estoqueCompletoService.ts:145` | |
| Corte LIQUIDA 20% | ≤ 360d | `estoqueCompletoService.ts:147` | |
| Corte LIQUIDA 30% | ≤ 720d | `estoqueCompletoService.ts:149` | |
| Corte LIQUIDA 50% | > 720d | `estoqueCompletoService.ts:151` | |
| Corte dead stock / capital em risco | > 180d | `estoqueCompletoService.ts:191` | |
| Teto de compra por SKU | `qtdVendidos × 1.2` | `useEstoqueUnificado.ts:856` | |

---

## F. Decisões arquiteturais observadas

### 1. A inteligência de estoque está mais no frontend ou no backend?

**Predominantemente no frontend.**

O backend (Bridge Firebird) entrega dados brutos e, desde a versão `af64a42`, também calcula `dias_giro_medio/mediano/ultima_peca` e opcionalmente `acao_sugerida`. Mas toda a lógica de negócio estratégica roda no cliente:

- Curva ABC por faturamento
- Mix ideal por marca (cobertura-alvo × velocidade)
- Distribuição da lacuna (4 passes de prioridade)
- Decisão por SKU (REPOR/TROCAR/LIQUIDAR/OBSERVAR)
- Mix ideal por subcategoria (% atual vs % ideal)
- Classificação OTB (COMPRAR_URGENTE/COMPRAR/OK/EXCESSO)
- Plano de liquidação (faixas de desconto por dias)

### 2. Existe algum padrão de "calculadora" / "estratégia" / "service" no front?

**Não.** Toda a inteligência de estoque está concentrada em `useEstoqueUnificado.ts` (1122 linhas) como uma sequência de `useMemo` encadeados. Não há separação de responsabilidades: o hook faz ao mesmo tempo acesso a dados, normalização, cálculos de negócio e composição de estruturas de exibição.

`estoqueCompletoService.ts` e `vendasService.ts` atuam apenas como adaptadores de API (normalização snake_case → camelCase + tratamento de nulos). `categorizarProduto.ts` é o único utilitário puro extraído.

### 3. Há testes? Para quê?

**Playwright está configurado**, mas:
- A pasta `e2e/` não existe — **nenhum teste escrito**
- **Zero testes unitários** para qualquer cálculo de estoque
- Todos os algoritmos críticos (curva ABC, mix ideal, distribuição da lacuna, plano de liquidação) operam sem cobertura de teste

---

## Relatório final

### Quantos arquivos lidos
**24 arquivos** lidos integralmente ou em partes selecionadas.

### Maior surpresa encontrada

**`OQueFazerPage.tsx` existe mas é rota morta.** A página está implementada com lógica completa, mas `App.tsx` redireciona `/estoque/acoes → /estoque/otb`. O `OtbPainelAcoes` (painel de ações) é renderizado dentro de `AnaliseOTBPage`, não na página dedicada. Se havia intenção de ter uma aba separada "O que Fazer?", ela foi desconectada.

A segunda surpresa é o **conflito de faixas de liquidação**: `estoqueCompletoService.ts` usa LIQUIDA 20% em 270–360d e LIQUIDA 30% em 360–720d. `classificarFaixaDoente` (no hook) usa 30% em 270–360d e 50% em 360–720d. O mesmo SKU recebe rótulos diferentes dependendo de onde o usuário olha na UI.

### 3 pontos para discutir antes da Fase 2

**1. Hook monolítico vs separação de responsabilidades**  
`useEstoqueUnificado.ts` tem 1122 linhas e mistura fetch, normalização, curva ABC, mix ideal, distribuição da lacuna e classificação de liquidação. Qualquer mudança de regra de negócio exige mexer neste arquivo. Antes de adicionar Fase 2, vale discutir se extraímos as funções de cálculo para módulos puros (testáveis) ou se continuamos acumulando no hook.

**2. Conflito de sistemas de decisão e constantes não governadas**  
Existem dois sistemas paralelos de decisão (`acaoSugerida` baseado em dias no service vs `decisaoSku` baseado em giro no hook) com nomenclaturas e cortes diferentes. Somado ao conflito de faixas de liquidação, o risco é de inconsistência na UI. Antes da Fase 2, precisamos definir qual sistema é a fonte de verdade e aposentar o outro — e também decidir se as constantes de corte (90/180/270/360/720 dias) serão configuráveis ou permanecerão hardcoded.

**3. Ausência total de testes nos algoritmos críticos**  
O algoritmo de distribuição da lacuna (4 passes), a curva ABC e o mix ideal por marca não têm nenhum teste. Antes de refinar ou substituir qualquer desses algoritmos na Fase 2, precisamos decidir se vamos criar pelo menos testes de snapshot/regressão — especialmente porque o algoritmo de 4 passes é não-trivial e tem efeitos sutis de ordenação e teto.
