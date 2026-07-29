# SPEC P3.G — Garimpo da OS (resultado financeiro real por venda)

> Desenhada com o stakeholder em 30/07/2026. Camada de visualização do P3
> (SPEC_P3_MODO_FISCAL_NF_ENTRADA.md): drill-down do resultado de uma OS,
> compondo receita real e custos reais — e servindo de **validador do racional**
> do CMV por competência.

---

## 1. Conceito

**Margem da OS = receita real − custos reais atribuíveis à OS.**

```
RECEITA
  valor final da venda (com descontos), aberto por forma de pagamento
(−) DEDUÇÕES DA VENDA
  taxa de adquirente REAL da(s) transação(ões) de cartão (conciliação REDE)
  comissão do vendedor (regra vigente)
(−) CMV
  lente:   custo REAL da NF amarrada ao pedido da OS  ← sempre NF (encomenda)
  armação/acessório: custo de estoque do ERP do produto vendido
(=) MARGEM DA OS   (R$ e %)
```

### Estados do custo da lente (o validador)

| Estado | Quando | Exibição |
|---|---|---|
| **REAL (NF)** | NF amarrada ao pedido da OS (P3 F1/F2) | valor da NF, selo verde |
| **ESTIMADO** | pedido existe, NF ainda não chegou/amarrou | custo estimado (tabela de custo do laboratório ou último custo), selo cinza "aguardando NF" |
| **PENDENTE** | OS sem pedido identificado | alerta — furo de processo |

A coluna "Δ estimado × real" nas OS que já viraram REAL é a métrica de validação:
convergência = racional confiável; divergência recorrente por fornecedor = tabela
de custo desatualizada ou problema no processo de compra.

## 2. Fontes de dados (ancoradas no que existe)

| Dado | Origem | Estado |
|---|---|---|
| OS, valores, itens, vendedor | sync OS/vendas já em produção (hub OS) | ✅ |
| Taxa real de cartão por venda | `vendas_cartao`/`conciliacao_vendas` (REDE×ERP) | ✅ |
| Custo de estoque da armação | bridge — último custo do produto (módulo estoque) | ✅ (conferir endpoint/granularidade) |
| Pedido da OS | F0 em curso (PEDIDO/TRANSACAO na bridge) + `pedidos_fornecedor` interno | 🔄 |
| Custo real da lente (NF) | `notas_fiscais_entrada` amarrada ao pedido (P3 F1/F2) | 🔜 |
| Comissão | regra de comissão (% por vendedor/produto — confirmar fonte) | pendência |

## 3. UI — duas visões

**3.1 Garimpo (drill-down de uma OS):** busca por nº da OS/cliente → ficha com a
cascata do §1 linha a linha, cada valor com selo da fonte (NF / estoque ERP /
conciliação REDE / estimado) e link para o documento (NF, transação de cartão,
título no ledger). É a tela de auditoria de uma venda.

**3.2 Painel de margem (agregado):** margem por período/loja/vendedor/tipo de
produto; distribuição de OS por estado do custo (REAL/ESTIMADO/PENDENTE);
ranking de Δ estimado×real por fornecedor; lista de OS com margem anômala
(negativa ou fora da faixa) para garimpar.

Rota sugerida: `/financeiro/garimpo-os` (+ atalho a partir do Hub OS).

## 4. Plano de entrega

| Etapa | Entrega | Depende de |
|---|---|---|
| **PG1** | View/função `resultado_os` compondo receita + taxa cartão + custo armação (ERP) + comissão; lente ESTIMADO/PENDENTE | F0 (pedido da OS) |
| **PG2** | Tela Garimpo (drill-down) + painel agregado com estados | PG1 |
| **PG3** | Lente REAL via NF + coluna Δ estimado×real + ranking por fornecedor | P3 F1/F2 |

Entregar PG1/PG2 **antes** do custo real existir é proposital: o dash já nasce
útil (margem estimada + fila de PENDENTE revela furos de pedido) e vira o painel
de acompanhamento da migração para o modo fiscal — a cada fornecedor migrado,
OS viram REAL e o Δ aparece.

## 5. Pendências

1. Fonte da regra de comissão (existe estruturada ou é % fixo por ora? v1 pode
   aceitar % configurável por loja).
2. Endpoint/granularidade do custo de armação na bridge (último custo vs custo
   médio; conferir módulo estoque).
3. Custo estimado de lente: tabela de custo por laboratório existe em algum
   lugar? (fallback: último custo real do mesmo produto/grade).
