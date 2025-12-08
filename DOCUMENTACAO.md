# Documentação Técnica - Plataforma de Dashboards Gerenciais

## 1. Visão Geral do Projeto

Plataforma de Business Intelligence para análise gerencial de dados empresariais, integrando dados do ERP Firebird via microserviço Node.js (Firebird Bridge) e exibindo dashboards interativos no frontend React/Lovable.

### Principais Funcionalidades

- **Dashboards de Vendas**: Análise por loja, vendedor, família de produtos e formas de pagamento
- **Gestão de Estoque**: Análise de giro, sugestões de ação (liquidação, reposição, promoção)
- **Monitor de Ordens de Serviço**: Acompanhamento de OS em produção, atrasadas e entregues
- **Módulo Financeiro**: Parcelas a pagar/receber, DRE gerencial e fluxo de caixa

---

## 2. Arquitetura do Sistema

```
┌─────────────────────────────────────────────────────────────────┐
│                        FRONTEND (Lovable)                        │
│                  React + Vite + TypeScript + Tailwind            │
│                                                                   │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐         │
│  │  Pages   │  │  Hooks   │  │ Services │  │Components│         │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘         │
│       │             │             │             │                 │
│       └─────────────┴──────┬──────┴─────────────┘                │
│                            │                                      │
└────────────────────────────┼──────────────────────────────────────┘
                             │ HTTP/JSON
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                   FIREBIRD BRIDGE (Railway)                      │
│                  Node.js + Express + node-firebird               │
│                                                                   │
│  URL: https://firebird-bridge-production.up.railway.app          │
│  IP Estático: 162.220.234.15 (whitelisted no firewall)          │
│                                                                   │
│  Endpoints:                                                       │
│  - /api/v1/empresas                                              │
│  - /api/v1/vendas/*                                              │
│  - /api/v1/estoque/*                                             │
│  - /api/v1/os/*                                                  │
│  - /api/v1/financeiro/*                                          │
└────────────────────────────┬──────────────────────────────────────┘
                             │ TCP/3050
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                     FIREBIRD DATABASE                            │
│                   201.20.35.230:3050                             │
│                                                                   │
│  Tabelas principais:                                             │
│  - transacao, transacao_item (vendas)                            │
│  - produto, estoque (inventário)                                 │
│  - ordemservico (OS)                                             │
│  - finlancamento, finlancamentoparcela (financeiro)              │
│  - pessoa, empresa                                               │
└─────────────────────────────────────────────────────────────────┘
```

### Stack Tecnológica

| Camada | Tecnologia | Versão |
|--------|------------|--------|
| Frontend | React | 18.3.1 |
| Build Tool | Vite | - |
| Linguagem | TypeScript | - |
| Estilização | Tailwind CSS | - |
| UI Components | shadcn/ui + Radix | - |
| Gráficos | Recharts | 2.15.4 |
| Roteamento | React Router DOM | 6.30.1 |
| HTTP Client | Fetch API nativo | - |
| Backend Bridge | Node.js + Express | - |
| Driver DB | node-firebird | - |
| Hospedagem Bridge | Railway.app | - |
| Hospedagem Frontend | Lovable Cloud | - |

### Padrão de Desenvolvimento

```
Service → Hook → Layout → Page
   │        │       │       │
   │        │       │       └── Compõe hook + layout
   │        │       └── Renderiza UI (filtros, cards, tabelas)
   │        └── Gerencia estado, fetch, métricas
   └── Chama API, normaliza dados uppercase → camelCase
```

---

## 3. Estrutura de Pastas

```
src/
├── components/
│   ├── ui/                          # Componentes shadcn/ui
│   │   ├── button.tsx
│   │   ├── card.tsx
│   │   ├── select.tsx
│   │   ├── table.tsx
│   │   ├── skeleton.tsx
│   │   └── ...
│   │
│   ├── sales-dashboard/             # Componentes de Vendas
│   │   ├── SalesDashboardLayout.tsx
│   │   ├── VendasDashboardLayout.tsx
│   │   ├── SalesFilters.tsx
│   │   ├── SalesKPICards.tsx
│   │   ├── SalesTable.tsx
│   │   ├── StoreChart.tsx
│   │   ├── StoreTable.tsx
│   │   ├── SellerChart.tsx
│   │   ├── PaymentMethodsChart.tsx
│   │   └── PaymentMethodsTable.tsx
│   │
│   ├── sales-family/                # Vendas por Família
│   │   ├── SalesFamilyFilters.tsx
│   │   ├── SalesFamilyKPICards.tsx
│   │   ├── SalesFamilyChart.tsx
│   │   └── SalesFamilyTable.tsx
│   │
│   ├── stock-dashboard/             # Estoque/OTB
│   │   ├── StockDashboardLayout.tsx
│   │   ├── StockFilters.tsx
│   │   ├── StockKPICards.tsx
│   │   ├── StockTable.tsx
│   │   └── StockActionChart.tsx
│   │
│   ├── os-dashboard/                # Monitor de OS
│   │   ├── OsDashboardLayout.tsx
│   │   └── OsKpiCards.tsx
│   │
│   ├── financeiro-dashboard/        # Financeiro - Parcelas
│   │   ├── FinanceiroDashboardLayout.tsx
│   │   ├── FinanceiroFilters.tsx
│   │   ├── FinanceiroKPICards.tsx
│   │   ├── FinanceiroVencimentoChart.tsx
│   │   └── FinanceiroParcelasTable.tsx
│   │
│   ├── financeiro-dre/              # DRE Gerencial
│   │   ├── DreFilters.tsx
│   │   ├── DreResumoCards.tsx
│   │   ├── DreCompetenciaChart.tsx
│   │   └── DreTable.tsx
│   │
│   └── financeiro-fluxo/            # Fluxo de Caixa
│       ├── FluxoCaixaFilters.tsx
│       ├── FluxoCaixaResumoCards.tsx
│       └── FluxoCaixaChart.tsx
│
├── hooks/
│   ├── useVendasDashboard.ts        # Hook de vendas
│   ├── useResumoVendas.ts           # Resumo vendas (legado)
│   ├── useResumoFormasPagamento.ts  # Formas de pagamento
│   ├── useAnaliseVendasFamilia.ts   # Vendas por família
│   ├── useEstoqueDashboard.ts       # Hook de estoque
│   ├── useAnaliseEstoque.ts         # Análise de estoque
│   ├── useOsMonitor.ts              # Monitor de OS
│   ├── useFinanceiroParcelas.ts     # Parcelas financeiras
│   ├── useFinanceiroDre.ts          # DRE gerencial
│   ├── useFluxoCaixa.ts             # Fluxo de caixa
│   ├── useEmpresas.ts               # Lista de empresas
│   └── use-mobile.tsx               # Detecção mobile
│
├── services/
│   ├── firebirdBridge.ts            # Cliente HTTP principal
│   ├── financeiroService.ts         # Serviço financeiro
│   ├── financeiroDreService.ts      # Serviço DRE
│   └── osMonitor.ts                 # Serviço OS
│
├── pages/
│   ├── Index.tsx                    # Página inicial (navegação)
│   ├── SalesDashboard.tsx           # Dashboard de vendas
│   ├── SalesFamilyDashboard.tsx     # Vendas por família
│   ├── StockDashboard.tsx           # Dashboard de estoque
│   ├── OsDashboard.tsx              # Monitor de OS
│   ├── FinanceiroDashboard.tsx      # Parcelas financeiras
│   ├── FinanceiroDreDashboard.tsx   # DRE gerencial
│   ├── FluxoCaixaDashboard.tsx      # Fluxo de caixa
│   └── NotFound.tsx                 # Página 404
│
├── utils/
│   └── osMetrics.ts                 # Cálculos de métricas OS
│
├── integrations/
│   └── supabase/
│       ├── client.ts                # Cliente Supabase (auto-gerado)
│       └── types.ts                 # Tipos Supabase (auto-gerado)
│
├── lib/
│   └── utils.ts                     # Utilitários (cn, etc.)
│
├── App.tsx                          # Rotas da aplicação
├── App.css                          # Estilos globais
├── index.css                        # Design system tokens
└── main.tsx                         # Entry point

firebird-bridge/
├── index.js                         # Servidor Express + endpoints
├── package.json                     # Dependências do bridge
└── README.md                        # Documentação do bridge
```

---

## 4. Módulos Implementados

### 4.1 Dashboard de Vendas (`/vendas`)

**Descrição**: Análise completa de vendas com visões por loja e por vendedor, incluindo formas de pagamento.

**Recursos**:
- Toggle entre visão "Por Loja" e "Por Vendedor"
- 4 KPIs: Total Vendido, Ticket Médio, Qtd Transações, Total Devoluções
- Gráfico de barras por loja ou vendedor
- Tabela detalhada com ordenação
- Análise de formas de pagamento (pizza + tabela)

**Arquivos**:
- Página: `src/pages/SalesDashboard.tsx`
- Layout: `src/components/sales-dashboard/VendasDashboardLayout.tsx`
- Hook: `src/hooks/useVendasDashboard.ts`
- Service: `src/services/firebirdBridge.ts`

**Endpoints**:
- `GET /api/v1/vendas/resumo-empresa-vendedor?dataInicio=YYYY-MM-DD&dataFim=YYYY-MM-DD`
- `GET /api/v1/vendas/resumo-formas-pagamento?dataInicio=YYYY-MM-DD&dataFim=YYYY-MM-DD`

---

### 4.2 Vendas por Família (`/vendas-familia`)

**Descrição**: Análise de vendas agrupadas por família de produtos e vendedor.

**Recursos**:
- Filtros: Data, Empresa
- KPIs: Total Vendido, Qtd Peças, Ticket Médio, Famílias Ativas
- Gráfico de barras por família
- Tabela detalhada por família/vendedor

**Arquivos**:
- Página: `src/pages/SalesFamilyDashboard.tsx`
- Componentes: `src/components/sales-family/`
- Hook: `src/hooks/useAnaliseVendasFamilia.ts`
- Service: `src/services/firebirdBridge.ts`

**Endpoint**:
- `GET /api/v1/vendas/analise-familia-vendedor?dataInicio=YYYY-MM-DD&dataFim=YYYY-MM-DD&codEmpresa=X`

---

### 4.3 Dashboard de Estoque/OTB (`/estoque`)

**Descrição**: Análise de estoque com sugestões de ação (liquidar, repor, promover).

**Recursos**:
- Seletor de empresa dinâmico
- 4 KPIs: Total Peças, Fornecedores, Marcas, Peças p/ Liquidação
- Filtros: Fornecedor, Marca, Ação Sugerida, Busca por texto
- Gráfico de barras por ação sugerida
- Tabela com produtos e sugestões

**Arquivos**:
- Página: `src/pages/StockDashboard.tsx`
- Layout: `src/components/stock-dashboard/StockDashboardLayout.tsx`
- Hook: `src/hooks/useEstoqueDashboard.ts`
- Service: `src/services/firebirdBridge.ts`

**Endpoint**:
- `GET /api/v1/estoque/analise-acao?codEmpresa=X`

---

### 4.4 Monitor de Ordens de Serviço (`/os`)

**Descrição**: Acompanhamento de OS em produção, atrasadas e entregues.

**Recursos**:
- KPIs clicáveis: Total OS, Em Produção, Atrasadas, Entregues, Tempo Médio, Sem Previsão, Reparo, E-commerce
- Filtros: Empresa, Status, Flags categóricas
- Tags visuais: Reparo, E-commerce
- Detecção automática de atraso

**Arquivos**:
- Página: `src/pages/OsDashboard.tsx`
- Componentes: `src/components/os-dashboard/`
- Hook: `src/hooks/useOsMonitor.ts`
- Service: `src/services/osMonitor.ts`
- Utils: `src/utils/osMetrics.ts`

**Endpoint**:
- `GET /api/v1/os/monitor?dataInicio=YYYY-MM-DD&dataFim=YYYY-MM-DD&codEmpresa=X`

**Regras de Negócio**:
- Status: `codEtapaAtual` 8=Entregue, 9=Cancelada, 6=Concluída Loja, outros=Em Andamento
- Atraso: Apenas "Em Andamento" + (dataPrevisao < hoje OU dataPrevisao null + 7 dias desde emissão)
- Tempo de Ciclo: Apenas para "Entregue", calculado como (dataSaída ou dataPrevisao ou dataEmissao) - dataEmissao

---

### 4.5 Financeiro - Parcelas (`/financeiro`)

**Descrição**: Gestão de contas a pagar e receber com filtros avançados.

**Recursos**:
- Filtros: Tipo (Pagar/Receber), Situação (Aberto/Atraso/Paga), Campo de Data
- Botões rápidos: "Hoje (vencimento)", "Hoje (pagamento)", "Mês atual"
- 4 KPIs: Receber Aberto, Receber Atraso, Pagar Aberto, Pagar Atraso
- Gráfico de vencimentos
- Tabela de parcelas

**Arquivos**:
- Página: `src/pages/FinanceiroDashboard.tsx`
- Layout: `src/components/financeiro-dashboard/FinanceiroDashboardLayout.tsx`
- Hook: `src/hooks/useFinanceiroParcelas.ts`
- Service: `src/services/financeiroService.ts`

**Endpoint**:
- `GET /api/v1/financeiro/parcelas?dataIni=YYYY-MM-DD&dataFim=YYYY-MM-DD&empresa=X&tipo=TODOS|PAGAR|RECEBER&situacao=TODOS|EM ABERTO|EM ATRASO|PAGA&campoData=EMISSAO|VENCIMENTO|PAGAMENTO`

---

### 4.6 DRE Gerencial (`/financeiro/dre`)

**Descrição**: Demonstração do Resultado do Exercício por competência.

**Recursos**:
- Filtros: Empresa, Período (competência)
- Cards de resumo: Receita Líquida, CMV, Lucro Bruto, Despesas, Resultado Líquido
- Gráfico de evolução por competência
- Tabela detalhada por conta contábil

**Arquivos**:
- Página: `src/pages/FinanceiroDreDashboard.tsx`
- Componentes: `src/components/financeiro-dre/`
- Hook: `src/hooks/useFinanceiroDre.ts`
- Service: `src/services/financeiroDreService.ts`

**Endpoint**:
- `GET /api/v1/financeiro/dre?competenciaIni=YYYY-MM&competenciaFim=YYYY-MM&empresa=X`

---

### 4.7 Fluxo de Caixa (`/financeiro/fluxo-caixa`)

**Descrição**: Análise de entradas e saídas de caixa por período.

**Recursos**:
- Filtros: Empresa, Data, Granularidade (Diário/Mensal)
- Cards de resumo: Total Receber, Total Pagar, Saldo
- Gráfico de fluxo por período

**Arquivos**:
- Página: `src/pages/FluxoCaixaDashboard.tsx`
- Componentes: `src/components/financeiro-fluxo/`
- Hook: `src/hooks/useFluxoCaixa.ts`
- Service: `src/services/financeiroService.ts`

**Endpoint**:
- Utiliza `/api/v1/financeiro/parcelas` com agrupamento client-side

---

## 5. Endpoints da API (Firebird Bridge)

### URL Base
```
https://firebird-bridge-production.up.railway.app
```

### 5.1 Empresas

```http
GET /api/v1/empresas
```

**Resposta**:
```json
{
  "data": [
    { "COD_EMPRESA": 1, "NOME": "Loja Centro" },
    { "COD_EMPRESA": 2, "NOME": "Loja Shopping" }
  ]
}
```

---

### 5.2 Vendas - Resumo por Empresa/Vendedor

```http
GET /api/v1/vendas/resumo-empresa-vendedor?dataInicio=2025-01-01&dataFim=2025-01-31
```

**Parâmetros**:
| Parâmetro | Tipo | Obrigatório | Descrição |
|-----------|------|-------------|-----------|
| dataInicio | string | Sim | Data inicial (YYYY-MM-DD) |
| dataFim | string | Sim | Data final (YYYY-MM-DD) |

**Resposta**:
```json
{
  "data": [
    {
      "EMPRESA": "Loja Centro",
      "VENDEDOR": "João Silva",
      "TOTALORIGINAL": 15000.00,
      "TOTALVENDIDO": 14500.00,
      "TICKETMEDIO": 290.00,
      "TOTALDEVOLUCAO": 500.00,
      "QTDTRANSACAO": 50,
      "QTDDEVOLUCAO": 2
    }
  ]
}
```

---

### 5.3 Vendas - Formas de Pagamento

```http
GET /api/v1/vendas/resumo-formas-pagamento?dataInicio=2025-01-01&dataFim=2025-01-31
```

**Resposta**:
```json
{
  "data": [
    {
      "EMPRESA": "Loja Centro",
      "VENDEDOR": "João Silva",
      "FORMA_PAGAMENTO": "Cartão Crédito",
      "TOTAL": 8500.00,
      "QTD_TRANSACOES": 30
    }
  ]
}
```

---

### 5.4 Vendas - Análise por Família/Vendedor

```http
GET /api/v1/vendas/analise-familia-vendedor?dataInicio=2025-01-01&dataFim=2025-01-31&codEmpresa=1
```

**Parâmetros**:
| Parâmetro | Tipo | Obrigatório | Descrição |
|-----------|------|-------------|-----------|
| dataInicio | string | Sim | Data inicial |
| dataFim | string | Sim | Data final |
| codEmpresa | number | Não | Código da empresa |

**Resposta**:
```json
{
  "data": [
    {
      "FAMILIA": "Armações",
      "VENDEDOR": "João Silva",
      "EMPRESA": "Loja Centro",
      "QTD_PECAS": 25,
      "VALOR_TOTAL": 7500.00,
      "TICKET_MEDIO": 300.00
    }
  ]
}
```

---

### 5.5 Estoque - Análise de Ação

```http
GET /api/v1/estoque/analise-acao?codEmpresa=1
```

**Resposta**:
```json
{
  "data": [
    {
      "COD_PRODUTO": 1234,
      "DESCRICAO": "Armação Ray-Ban RB5154",
      "REFERENCIA": "RB5154",
      "FORNECEDOR": "Ray-Ban",
      "MARCA": "Ray-Ban",
      "ESTOQUE_ATUAL": 5,
      "DIAS_SEM_VENDA": 180,
      "ACAO_SUGERIDA": "LIQUIDAR",
      "PRECO_CUSTO": 150.00,
      "PRECO_VENDA": 450.00
    }
  ]
}
```

---

### 5.6 OS - Monitor

```http
GET /api/v1/os/monitor?dataInicio=2025-01-01&dataFim=2025-01-31&codEmpresa=1
```

**Resposta**:
```json
{
  "data": [
    {
      "NUMERO_OS": 12345,
      "EMPRESA": "Loja Centro",
      "COD_EMPRESA": 1,
      "CLIENTE": "Maria Santos",
      "DATA_EMISSAO": "2025-01-15T10:00:00",
      "DATA_PREVISAO": "2025-01-22T10:00:00",
      "DATA_HORA_SAIDA_ULTIMA": null,
      "COD_ETAPA_ATUAL": 3,
      "ETAPA_ATUAL": "Em produção",
      "TOTAL": 850.00,
      "IS_REPARO": 0,
      "IS_ECOMMERCE": 1,
      "TELEFONE": "(11) 99999-0000"
    }
  ]
}
```

---

### 5.7 Financeiro - Parcelas

```http
GET /api/v1/financeiro/parcelas?dataIni=2025-01-01&dataFim=2025-01-31&empresa=1&tipo=TODOS&situacao=EM ABERTO&campoData=VENCIMENTO
```

**Parâmetros**:
| Parâmetro | Tipo | Obrigatório | Valores |
|-----------|------|-------------|---------|
| dataIni | string | Sim | YYYY-MM-DD |
| dataFim | string | Sim | YYYY-MM-DD |
| empresa | number | Sim | Código empresa |
| tipo | string | Não | TODOS, PAGAR, RECEBER |
| situacao | string | Não | TODOS, EM ABERTO, EM ATRASO, PAGA |
| campoData | string | Não | EMISSAO, VENCIMENTO, PAGAMENTO |

**Resposta**:
```json
{
  "ok": true,
  "rows": [
    {
      "COD_EMPRESA": 1,
      "EMPRESA_NOME": "Loja Centro",
      "TIPO_LANCAMENTO": "RECEBER",
      "DOCUMENTO": "NF-001234",
      "PESSOA_NOME": "Cliente ABC",
      "DATA_VENCIMENTO": "2025-01-20",
      "DATA_EMISSAO": "2025-01-05",
      "DATA_PAGAMENTO": null,
      "VALOR": 1500.00,
      "VALOR_PAGO": 0,
      "SITUACAO": "EM ABERTO",
      "CONTA_NUMERO": "1.1.01",
      "CONTA_DESCRICAO": "Caixa Geral",
      "FORMA_PAGAMENTO_TIPO": "Boleto"
    }
  ]
}
```

---

### 5.8 Financeiro - DRE

```http
GET /api/v1/financeiro/dre?competenciaIni=2025-01&competenciaFim=2025-12&empresa=1
```

**Resposta**:
```json
{
  "ok": true,
  "rows": [
    {
      "COMPETENCIA": "2025-01",
      "COD_EMPRESA": 1,
      "EMPRESA_NOME": "Loja Centro",
      "CONTACLA_CODIGO": "3.1",
      "CONTACLA_NUMERO": "3.1.01",
      "CONTACLA_DESCRICAO": "Receita de Vendas",
      "VALOR_TOTAL": 150000.00
    }
  ]
}
```

---

## 6. Hooks Disponíveis

| Hook | Descrição | Retorno Principal |
|------|-----------|-------------------|
| `useVendasDashboard` | Gerencia dados de vendas | filters, dadosPorLoja, dadosFormas, metrics, loading, reload |
| `useResumoVendas` | Resumo de vendas (legado) | data, loading, error |
| `useResumoFormasPagamento` | Formas de pagamento | data, loading, error |
| `useAnaliseVendasFamilia` | Vendas por família | data, loading, error, filters |
| `useEstoqueDashboard` | Gerencia estoque | filters, data, filteredData, loading, reload |
| `useAnaliseEstoque` | Análise de estoque | data, loading, error |
| `useOsMonitor` | Monitor de OS | data, filteredData, metrics, filters, loading |
| `useFinanceiroParcelas` | Parcelas financeiras | data, metrics, filters, loading, reload |
| `useFinanceiroDre` | DRE gerencial | data, resumo, dadosPorCompetencia, filters, loading |
| `useFluxoCaixa` | Fluxo de caixa | fluxoAgrupado, resumo, filters, loading |
| `useEmpresas` | Lista de empresas | empresas, loading, error |

---

## 7. Services Disponíveis

### `src/services/firebirdBridge.ts`

```typescript
// Constante base URL
const FIREBIRD_BRIDGE_BASE_URL = "https://firebird-bridge-production.up.railway.app";

// Funções exportadas
fetchResumoEmpresaVendedor(dataInicio: string, dataFim: string): Promise<ResumoEmpresaVendedor[]>
fetchResumoFormasPagamento(dataInicio: string, dataFim: string): Promise<ResumoFormaPagamento[]>
fetchEmpresas(): Promise<Empresa[]>
fetchAnaliseEstoqueAcao(codEmpresa: number | string): Promise<AnaliseEstoqueAcao[]>
fetchAnaliseFamiliaVendedor(params): Promise<AnaliseFamiliaVendedor[]>
```

### `src/services/financeiroService.ts`

```typescript
getFinanceiroParcelas(params: GetParcelasParams): Promise<FinanceiroParcela[]>
```

### `src/services/financeiroDreService.ts`

```typescript
getFinanceiroDre(params: GetDreParams): Promise<DreLinha[]>
calcularResumoDre(linhas: DreLinha[]): DreResumo
```

### `src/services/osMonitor.ts`

```typescript
getOsMonitor(filters: OsMonitorFilters): Promise<OsRecord[]>
```

---

## 8. Rotas da Aplicação

```typescript
// src/App.tsx
<Routes>
  <Route path="/" element={<Index />} />
  <Route path="/vendas" element={<SalesDashboard />} />
  <Route path="/vendas-familia" element={<SalesFamilyDashboard />} />
  <Route path="/estoque" element={<StockDashboard />} />
  <Route path="/os" element={<OsDashboard />} />
  <Route path="/financeiro" element={<FinanceiroDashboard />} />
  <Route path="/financeiro/dre" element={<FinanceiroDreDashboard />} />
  <Route path="/financeiro/fluxo-caixa" element={<FluxoCaixaDashboard />} />
  <Route path="*" element={<NotFound />} />
</Routes>
```

| Rota | Página | Descrição |
|------|--------|-----------|
| `/` | Index | Navegação principal |
| `/vendas` | SalesDashboard | Dashboard de vendas |
| `/vendas-familia` | SalesFamilyDashboard | Vendas por família |
| `/estoque` | StockDashboard | Análise de estoque |
| `/os` | OsDashboard | Monitor de OS |
| `/financeiro` | FinanceiroDashboard | Parcelas financeiras |
| `/financeiro/dre` | FinanceiroDreDashboard | DRE gerencial |
| `/financeiro/fluxo-caixa` | FluxoCaixaDashboard | Fluxo de caixa |

---

## 9. Configuração de Ambiente

### Frontend (Lovable)

```env
# .env (auto-gerado pelo Lovable Cloud)
VITE_SUPABASE_URL=https://zmsfntqgxsstnbpzdled.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
VITE_SUPABASE_PROJECT_ID=zmsfntqgxsstnbpzdled

# Opcional - pode ser hardcoded no service
VITE_FIREBIRD_BRIDGE_BASE_URL=https://firebird-bridge-production.up.railway.app
```

### Backend (Firebird Bridge - Railway)

```env
# Configurações no Railway
FIREBIRD_HOST=201.20.35.230
FIREBIRD_PORT=3050
FIREBIRD_DATABASE=/path/to/database.fdb
FIREBIRD_USER=SYSDBA
FIREBIRD_PASSWORD=****
PORT=3000
```

---

## 10. Como Executar

### Frontend (Lovable)

O frontend é hospedado automaticamente no Lovable Cloud. Para desenvolvimento local:

```bash
# Clone o repositório (se disponível via GitHub)
git clone <repo-url>
cd <project-folder>

# Instale dependências
npm install

# Execute em modo desenvolvimento
npm run dev

# Build para produção
npm run build
```

### Backend (Firebird Bridge)

```bash
# Navegue até a pasta do bridge
cd firebird-bridge

# Instale dependências
npm install

# Execute localmente
node index.js

# Ou via Railway CLI
railway up
```

---

## 11. Padrões de Código

### Normalização de Dados (Firebird → Frontend)

O Firebird retorna campos em UPPERCASE. A normalização para camelCase ocorre na camada de service:

```typescript
// Service normaliza uppercase → camelCase
const response = await fetch(url);
const json = await response.json();

return json.data.map((row: any) => ({
  codEmpresa: row.COD_EMPRESA,
  empresaNome: row.EMPRESA_NOME,
  dataEmissao: row.DATA_EMISSAO,
  isReparo: row.IS_REPARO === 1,
  // ...
}));
```

### Estrutura de Hook

```typescript
export function useDominioDashboard(initialFilters?: Partial<Filters>) {
  const [filters, setFilters] = useState<Filters>(getDefaultFilters());
  const [data, setData] = useState<Item[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const result = await serviceFetch(filters);
      setData(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filteredData = useMemo(() => {
    return data.filter(/* client-side filters */);
  }, [data, filters]);

  const metrics = useMemo(() => {
    return calculateMetrics(filteredData);
  }, [filteredData]);

  const reload = useCallback(() => fetchData(), [fetchData]);

  return { filters, setFilters, data, filteredData, metrics, loading, error, reload };
}
```

### Estrutura de Layout

```typescript
interface DominioLayoutProps {
  filters: Filters;
  setFilters: (f: Filters) => void;
  data: Item[];
  metrics: Metrics;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

export function DominioDashboardLayout(props: DominioLayoutProps) {
  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header com navegação e refresh */}
      <header className="flex justify-between items-center">
        <div className="flex items-center gap-4">
          <Link to="/"><Button variant="ghost"><ArrowLeft /></Button></Link>
          <h1 className="text-2xl font-bold">Título</h1>
        </div>
        <Button onClick={props.reload}><RefreshCw /></Button>
      </header>

      {/* Filtros */}
      <DominioFilters filters={props.filters} onChange={props.setFilters} />

      {/* Erro */}
      {props.error && <Alert variant="destructive">{props.error}</Alert>}

      {/* KPIs */}
      {props.loading ? <Skeleton /> : <DominioKPICards metrics={props.metrics} />}

      {/* Gráfico */}
      <DominioChart data={props.data} loading={props.loading} />

      {/* Tabela */}
      <DominioTable data={props.data} loading={props.loading} />
    </div>
  );
}
```

---

## 12. Próximos Passos Sugeridos

1. **Cliente 360**: Criar página de busca de cliente por nome/CPF com histórico de compras e geração de mensagens via IA
2. **Exportação CSV/Excel**: Adicionar botões de exportação em todas as tabelas
3. **Integração OpenAI**: Gerar insights automáticos dos KPIs usando Lovable AI Gateway
4. **Filtro de Empresa Global**: Adicionar seletor de empresa nos dashboards de vendas
5. **Dashboard Consolidado**: Criar visão executiva com principais KPIs de todos os módulos
6. **Alertas Automáticos**: Notificações para OS atrasadas e parcelas vencidas
7. **Comparativo de Períodos**: Adicionar comparação mês anterior/ano anterior nos gráficos

---

## 13. Contato e Suporte

- **Plataforma**: Lovable Cloud
- **Backend**: Railway.app
- **Banco de Dados**: Firebird 2.5/3.0

---

*Documentação gerada em Dezembro/2025*
