# Estado real do estoque materializado no Supabase

**Data da apuração:** 2026-07-23
**Contexto:** auditoria pré-Entrega 2 da Fase 2.0b (motor multi-loja).

## Corrigindo a crença sobre o "Sprint Estoque Materializado"

O sprint entregou **otimização do endpoint** `/estoque/completo` do Firebird
Bridge (cache, meta de `dias_giro_*`, subcategoria vinda do backend). Ele **não**
materializou o estoque no Supabase.

## Fatos verificados no repo

- **`stg.estoque` (schema em `20251130211629_...sql:81`)**: tabela existe com
  `PK (cod_produto, cod_empresa)`. Está vazia.
- **`etl_controle` (mesma migration, l.98-103)**: `('estoque', 'pending')` desde
  a criação — nunca foi promovido.
- **Nenhuma edge function `sync-estoque`**. Existem `sync-produtos`,
  `sync-vendas`, `sync-agregados-{diarios,mensal,semanal}`, `sync-clientes`,
  `sync-empresas`, `sync-os-hub`, `sync-parcelas`, `sync-vendas-cartao`.
- **Nenhum `dw.fato_estoque_snapshot`** ou view equivalente.
- Consumidores atuais (`useEstoqueUnificado.ts:1068`, `PlanoMensalPage.tsx:542`)
  chamam `getEstoqueCompleto` → Firebird Bridge, uma empresa por vez.

## Medição empírica — `/estoque/completo?empresa=ALL`

Chamadas contra o bridge em produção
(`firebird-bridge-production.up.railway.app`), cache desligado.

| Métrica                 | `empresa=1`        | `empresa=ALL`      |
|-------------------------|--------------------|--------------------|
| HTTP                    | 200                | 200                |
| Tempo total (1 amostra) | **21.8 s**         | **66.6 s**         |
| Payload                 | 0.79 MB            | **7.79 MB**        |
| Linhas retornadas       | 1 036              | 10 246             |
| SKUs distintos          | 1 036              | 5 524              |
| Duplicatas por SKU      | nenhuma            | até 8 (2 000 SKUs) |

Exemplo: SKU `3293456` aparece **8 vezes** em `empresa=ALL` com quantidades
distintas (`[213, 249, 208, 223, 207, 207, 206, 216]`). Cada linha corresponde
a uma loja.

### Achado crítico

**As linhas retornadas por `empresa=ALL` NÃO trazem `cod_empresa`.** O bridge
devolve as N cópias (uma por loja) mas sem discriminar qual linha é qual loja.

Chaves da linha de `empresa=ALL`:
```
cod_sku, cod_barras_interno, codigo_barras, ean, descricao, tipo,
subcategoria, fornecedor_nome, grife, quantidade_estoque, preco_custo,
preco_venda, data_ultima_compra, data_ultima_entrada, data_ultima_venda,
dias_giro_medio, dias_giro_mediano, dias_giro_ultima_peca,
pecas_vendidas_consideradas, dias_estoque, dias_sem_venda, acao_sugerida
```

Sem `cod_empresa` na resposta, `empresa=ALL` é inútil para alimentar o motor
multi-loja (`calcularMixIdealMultiLoja`) — não dá para atribuir linhas a lojas.

## Consequências para as próximas entregas

**Para alimentar `calcularMixIdealMultiLoja` hoje**, o consumidor precisa
fazer **N chamadas** (uma por loja ativa). Com 8 lojas ativas × ~22 s por
chamada = **~3 min sequencial**. Em paralelo com concorrência razoável (4-6),
cai para ~45-60 s + risco de o bridge saturar.

**Alternativas para o stakeholder decidir no checkpoint:**

1. **Adicionar `cod_empresa` na resposta de `empresa=ALL`** no bridge (mudança
   pequena no SQL da Firebird). Uma única chamada de ~66 s, 8 MB — servível.
2. **Criar `sync-estoque` + `dw.fato_estoque_snapshot`** no Supabase, com
   política de refresh (a cada X min). Trabalho grande. Único benefício claro:
   queries agregadas por marca × loja no Postgres em ms em vez de segundos, e
   Bridge deixa de ser dependência crítica de leitura em tempo real.
3. **Manter status quo** (N chamadas em paralelo do frontend) — para a Entrega 2
   funcionar, exige gerenciamento de N loading states e possível backpressure.

Nenhuma dessas é pré-requisito do motor puro do Passo 4 — ele aceita
`LojaInput[]` independentemente de como o consumidor monta o input.
