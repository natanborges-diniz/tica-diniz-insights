# Mapeamento do Módulo Financeiro — Estado Atual e Desenho Futuro

> Gerado em 2026-07-03 a partir de varredura completa do código (frontend, migrations, edge functions, docs).
> Objetivo: base única para redesenhar a gestão financeira — menos planilhas, menos processo manual, mais acuracidade.

---

## 1. Visão geral — o que existe hoje

O módulo financeiro é **muito maior do que parece** e já cobre 4 frentes, mas cresceu por ondas
(ERP → BTG → adquirentes) sem um desenho unificador. Resultado: telas sobrepostas, três "fontes de
verdade" de títulos e conciliações que não conversam entre si.

### As 4 frentes implementadas

| Frente | O que faz | Maturidade |
|---|---|---|
| **Legado ERP (Firebird)** | Parcelas a pagar/receber, DRE, fluxo de caixa — leitura via bridge + `parcelas_cache` | ✅ Estável (read-only, sem write-back) |
| **BTG Banking** | OAuth, extrato, saldo, pagamentos (PIX/TED/boleto/DARF), cobranças/boletos, DDA | ✅ Implementado (plano de 6 fases do `PLANO_BTG_BANKING.md` foi executado) |
| **Adquirente REDE** | Sync de vendas cartão, agenda de recebíveis, conciliação REDE×ERP, links de pagamento/checkout | ✅ Implementado (opt-in Gestão de Vendas por loja, healthcheck) |
| **Contas a Pagar próprio** | `lancamentos_financeiros` + workflow de borderô → envio BTG | ✅ Funcional (Contas a Receber no Hub está desabilitado — "em breve") |

### Telas (rotas em `src/App.tsx`)

| Rota | Página | Papel |
|---|---|---|
| `/financeiro` (overview) | `FinanceiroOverviewPage` | Landing executiva: KPIs + alertas + atalhos |
| `/financeiro/hub` | `FinanceiroHubPage` | **Centro operacional de contas a pagar**: classificar → borderô → aprovar → enviar BTG → baixar |
| `/financeiro/parcelas` | `FinanceiroDashboard` | Dashboard read-only de parcelas do ERP (cache Firebird) |
| `/financeiro/dre` | `FinanceiroDreDashboard` | DRE realizado/projetado (dados direto do Firebird — lento, até 60s) |
| `/financeiro/fluxo-caixa` | `FluxoCaixaDashboard` | Entradas/saídas diário/mensal + saldo acumulado (Firebird) |
| `/financeiro/cartoes` | `ConciliacaoCartoesPage` | Conciliação REDE × ERP (lojas / PVs / transações) |
| `/financeiro/recebiveis` | `CarteiraRecebiveisPage` | Agenda de crédito futuro de cartão (+90 dias) |
| `/financeiro/banking/extrato` | `BankingExtratoDashboard` | Extrato BTG: importar, classificar por natureza, conciliar (checkbox manual) |
| `/financeiro/banking/pagamentos` | `BankingPagamentosDashboard` | Pagamentos avulsos BTG com workflow de aprovação |
| `/financeiro/banking/cobrancas` | `BankingCobrancasDashboard` | Emissão/gestão de boletos BTG |
| `/financeiro/banking/dda` | `BankingDdaDashboard` | DDA: importa títulos, conciliação automática com parcelas |
| `/financeiro/links-pagamento` + `/pay/:linkId` | `PaymentLinksPage` + `CheckoutPage` | Links de pagamento e.Rede + checkout público |
| `/financeiro/plano-contas` | `AdminDreConfigPage` | Plano de contas DRE (grupos 1.x–6.x) |
| `/admin/adquirentes`, `/admin/btg-validacao`, `/admin/fornecedores` | Admin | Credenciais REDE/BTG/fornecedores, opt-in GV, OAuth |

### Modelo de dados (Supabase) — núcleo

- **`lancamentos_financeiros`** — ledger central (PAGAR/RECEBER), status `PREVISTO → CLASSIFICADO → BORDERO → AUTORIZADO → PROCESSANDO → BAIXADO`, com FKs de rastreio: `bordero_id`, `recebivel_cartao_id`, `btg_pagamento_id`, `btg_cobranca_id`, `btg_dda_id`, `btg_extrato_id`, `origem`+`origem_id`
- **`borderos`** — lotes de pagamento (aprovação interna → `btg_batch_id`)
- **`parcelas_cache`** — espelho dos títulos do ERP (sync via bridge, `sync-parcelas`)
- **`btg_*`** — `contas_bancarias`, `tokens`, `pagamentos`, `cobrancas`, `dda_titulos`, `extrato`, `webhook_events`
- **`vendas_cartao`** + **`recebiveis_cartao`** (+`_parcelas`) — transações REDE e agenda de crédito
- **`conciliacao_vendas`** — match REDE×ERP: `CONCILIADO / DIVERGENTE / PENDENTE_ERP / PENDENTE_ADQ`
- **`payment_links`**, **`adquirentes_config`**, **`dre_plano_contas`**, **`v_conciliacao_loja_resumo`**

Migrations-chave: `20260319161014` (ledger/borderô/recebíveis), `20260225*` (BTG fases), `20260324003020` (adquirentes/vendas_cartao/payment_links/conciliacao), `20260404031856` (DRE).

### Edge functions financeiras

`financeiro-lancamentos` (17 actions — CRUD, borderô, importar ERP, resumo), `financeiro-relatorios`,
`btg-auth`, `btg-token-refresh`, `btg-extrato`, `btg-pagamentos`, `btg-cobrancas`, `btg-dda`,
`btg-recebiveis-cartao`, `sync-vendas-cartao`, `conciliar-vendas`, `payment-links`,
`rede-proxy`, `rede-gestao-vendas`, `rede-gestao-acessos`, `sync-parcelas`.

---

## 2. Onde está a confusão (diagnóstico)

### 2.1 Três "fontes de verdade" de títulos que não se unificam
1. **`parcelas_cache`** (espelho ERP) — alimenta Dashboard de Parcelas, DRE e Fluxo de Caixa
2. **`lancamentos_financeiros`** (ledger próprio) — alimenta Hub, borderôs, Overview
3. **Firebird ao vivo** — DRE e Fluxo consultam a bridge diretamente (lento e volátil)

O "Saldo Projetado" do Overview vem do ledger; o Fluxo de Caixa vem do Firebird. Podem divergir.
Existe uma action `importar_erp_auto` que puxa do ERP para o ledger, mas o vínculo parcela↔lançamento
é frouxo (não há chave de conciliação dura documentada).

### 2.2 Conciliações existem em pares, nunca fechando o triângulo
- REDE ↔ ERP (`conciliacao_vendas`) ✅
- DDA ↔ parcelas (`btg-dda conciliar_auto`) ✅
- Extrato BTG ↔ ??? — a "conciliação" do extrato é **um checkbox manual + classificação por natureza**. Não há match automático extrato ↔ lançamento ↔ recebível de cartão.

Ou seja: sabemos o que a REDE diz que vendemos, sabemos o que o ERP registrou, sabemos o que caiu na
conta — mas **ninguém fecha as três pontas** (venda → crédito previsto → crédito efetivo no extrato).
Essa é exatamente a lacuna que hoje vira planilha.

### 2.3 Elos manuais no meio de fluxos automatizados
- Borderô enviado ao BTG exige **"Confirmar Processamento" manual** (não há consumo de webhook para baixa automática; `btg_webhook_events` existe como fila, mas o retorno de pagamento não fecha o ciclo sozinho)
- Status de boleto BTG pode divergir do local (polling, não webhook)
- Conciliação de extrato é 100% manual

### 2.4 Sobreposição de telas
- **Overview vs Dashboard vs Hub**: três entradas para "contas"; o Dashboard de Parcelas (ERP read-only) compete com o Hub (ledger operacional)
- **BankingPagamentosDashboard vs Hub/borderô**: dois caminhos para pagar via BTG (avulso vs lote), sem regra clara de quando usar cada um

### 2.5 Contas a Receber incompleto
Abas desabilitadas no Hub. Recebíveis de cartão têm agenda, mas boletos/PIX/crediário do ERP não têm
gestão ativa de recebimento — só leitura.

---

## 3. Lacuna crítica: Pedidos → NF de entrada → Contas a Pagar

**Não existe nada** ligando o pipeline de pedidos a fornecedores (Hoya/Zeiss/Haytek — que está maduro:
matching 3 camadas, validação, idempotência, auditoria em `pedidos_fornecedor`, tracking) ao financeiro:

- Zero tabelas/código de entrada de NF (`DanfeVisual.tsx` só renderiza DANFE do tracking)
- `pedidos_fornecedor.numero_pedido` não linka a nenhuma conta a pagar
- Custo de mercadoria (grupo 3.8 do DRE) não nasce dos pedidos

Fluxo desejado (a desenhar):
```
Pedido enviado (numero_pedido)
  → Fornecedor emite NF-e referenciando o pedido
  → Captura do XML (manifestação SEFAZ? e-mail? upload?)   ← decisão de arquitetura pendente
  → Match NF ↔ pedido (numero_pedido / CNPJ / valor)
  → Gera lancamentos_financeiros (PAGAR, categoria 3.8, parcelas da NF)
  → DDA do boleto do fornecedor concilia com o lançamento (já existe!)
  → Borderô paga via BTG (já existe!)
  → Extrato confirma (elo a construir)
```
Note que **as duas pontas finais já existem** — falta o começo (captura NF) e o elo NF↔pedido↔lançamento.

---

## 4. Proposta de direção (prioridade sugerida)

### P1 — Conciliação em 3 vias (fecha a demanda urgente de acuracidade)
Motor de conciliação extrato-cêntrico: todo crédito/débito do `btg_extrato` deve apontar para um
`lancamento_financeiro`, `recebivel_cartao` ou `btg_pagamento/cobranca`. Match automático por
valor+data+contraparte com fila de exceções (só o que não casou vira trabalho humano).
Inclui: consumir `btg_webhook_events` para baixa automática de borderô/pagamento (elimina o
"Confirmar Processamento" manual).

### P2 — Unificar a fonte de verdade de títulos
Definir `lancamentos_financeiros` como ledger único: sync ERP→ledger com chave dura de conciliação
(empresa+documento+parcela), e migrar DRE/Fluxo de Caixa para ler do ledger/cache (mata a consulta
Firebird de 60s e as divergências entre telas). Dashboard de Parcelas vira visão do ledger ou é absorvido pelo Hub.

### P3 — Entrada de NF amarrada a pedidos (habilita o plano mensal)
Decidir mecanismo de captura de NF-e (manifestação do destinatário via SEFAZ é o caminho robusto;
upload de XML é o MVP), criar `notas_fiscais_entrada` + match com `pedidos_fornecedor`, gerar
contas a pagar automaticamente. Fecha também o custo real no DRE.

### P4 — Contas a Receber ativo
Habilitar o lado RECEBER no Hub reutilizando o que existe: cobranças BTG, recebíveis de cartão, DDA.

### P5 — Racionalizar navegação
Overview como única entrada; Hub como única tela operacional (pagar + receber); pagamentos avulsos
BTG viram ação dentro do Hub, não tela paralela.

---

## 5. Riscos e pontos de atenção

- **Webhooks BTG**: validação de assinatura e retry precisam ser desenhados antes de confiar na baixa automática
- **Divergências de conciliação de cartão** (taxas, antecipação) precisam de regra de tolerância explícita
- **Multi-tenant**: tudo é chaveado por `cod_empresa` (convenção do repo — não usar `loja_codigo`); RLS já cobre as tabelas financeiras
- **Firebird é read-only** via bridge: baixas feitas aqui não voltam ao ERP — definir se o ERP continua sendo o registro contábil oficial ou se o ledger assume
