# Estado real do estoque materializado no Supabase

**Data da apuração:** 2026-07-23 (reescrito após merge de `origin/main` na feature branch — a versão anterior desta doc estava desatualizada porque foi produzida contra uma main local sem 150+ commits de trabalho do Lovable).

## TL;DR

**O estoque materializado no Supabase EXISTE.** Foi implementado pelo Lovable ao longo de junho/julho de 2026 e o frontend já tem um dispatcher com feature flag para alternar entre fontes.

## Infraestrutura pronta

### Tabela `public.estoque_sincronizado`

Criada via Lovable UI (não versionada em migration — só o commit `84ea0ab` reflete o tipo em `src/integrations/supabase/types.ts`). Uma alteração posterior `20260701033048_04fcce32-31b0-4c7e-9626-4f3183b87ee5.sql` adiciona colunas de giro. Schema atual (31 colunas):

- Identificação: `id`, `cod_empresa`, `cod_sku`, `cod_produto_tipo`, `cod_barras_interno`, `ean`
- Descritivo: `descricao`, `marca`, `fornecedor`, `categoria`, `subcategoria`
- Estoque: `quantidade_estoque`, `valor_estoque_custo`, `custo_ultima_compra`, `preco_venda`
- Temporais: `data_ultima_compra`, `data_ultima_entrada`, `data_ultima_venda`, `dias_em_estoque`, `dias_desde_ultima_venda`
- Estado: `is_dead_stock`, `acao_sugerida`, `faixa_saneamento`, `desconto_sugerido`, `origem_custo`
- Giro: `dias_giro_medio`, `dias_giro_mediano`, `dias_giro_ultima_peca`, `pecas_giro_consideradas`
- Vendas 180d: `qtd_vendidos_180d`
- Metadata: `atualizado_em`

**`cod_empresa` está no schema** — resolve o problema do bridge `empresa=ALL` sem discriminação.

### Edge functions de sync

Três funções trabalham juntas para popular a tabela:

**`sync-estoque-completo/index.ts`** (337 linhas)
- Loop pelas 12 empresas ativas (`[1,2,4,6,9,10,13,14,15,16,17,18]`)
- Para cada uma: lê `/estoque/completo` + `/estoque/ultimo-custo` do Bridge
- UPSERT idempotente em `estoque_sincronizado` com `BATCH_SIZE=500`
- Timeout de 300s por chamada ao Bridge, throttle 1s entre lojas
- Classificação de faixas de saneamento inline (espelho de `src/lib/estoque/faixas-saneamento.ts`)

**`sync-estoque-loja/index.ts`** (190 linhas)
- Versão "1 loja por vez" (chamada individual, sem loop de empresas)
- Mesma lógica de classificação P31
- Timeout de 90s

**`sync-estoque-orchestrator/index.ts`** (127 linhas)
- Orquestra `sync-estoque-loja` em 3 batches de 4 lojas cada
- Auto-reagenda entre batches (throttle 30s, timeout 120s por loja)
- Serve requests via HTTP (POST/GET)

### Cron

Comentário no `estoqueCompletoService.ts:305` afirma "diariamente às 07:00". **Não achei `cron.schedule` em nenhuma migration versionada** — provavelmente agendado via Supabase Dashboard (pg_cron) sem versionamento. Precisa validar no dashboard ou perguntar ao Lovable.

### Dispatcher no frontend

`src/services/estoqueCompletoService.ts` foi refatorado em "SUB-ENTREGA 1.4.b":

```ts
const ESTOQUE_SOURCE = (import.meta.env.VITE_ESTOQUE_SOURCE ?? 'bridge').toLowerCase();

export async function getEstoqueCompleto(params) {
  if (ESTOQUE_SOURCE === 'supabase') return getEstoqueCompletoDoSupabase(params);
  return getEstoqueCompletoDoBridge(params);
}
```

- Contrato de retorno idêntico entre as duas fontes (`EstoqueCompleto[]`)
- Default é `bridge` — a feature flag ainda **não está ativada** para os usuários
- `getEstoqueCompletoDoSupabase` paginação defensiva de 1000 linhas, suporta `empresa=null`/`ALL` (trazer todas as lojas de uma vez ✅)

## O que a auditoria anterior errou

O documento anterior (commit `1be73a5`) afirmou:
> "stg.estoque continua vazio; não existe sync-estoque; não existe fato_estoque_snapshot."

**Verdadeiro para o main local desatualizado** (base era `35a0778`, de 2026-07-03). **Falso para o origin/main atual**:

| Afirmação anterior | Realidade em origin/main |
|---|---|
| `stg.estoque` vazio | Ainda vazio, mas irrelevante — nova tabela é `public.estoque_sincronizado` |
| Não existe sync-estoque | Existem 3 edge functions (`sync-estoque-completo/loja/orchestrator`) |
| Não existe `fato_estoque_snapshot` | Não existe com esse nome — `estoque_sincronizado` cumpre o papel |
| Bridge `empresa=ALL` sem `cod_empresa` inutilizado | Ainda verdade, mas contornado — Supabase substitui essa via para leitura multi-loja |

A medição de tempo (66.6s / 7.79MB / 10 246 rows) do bridge `empresa=ALL` continua útil como referência histórica, mas **não é mais o caminho recomendado** para leitura multi-loja.

## O que ficou em aberto (para verificar/decidir)

1. **Cron está rodando?** Preciso ver o Supabase Dashboard → `pg_cron` para confirmar. Se sim, a tabela deve ter dados de 2026-07-23 07:00.

2. **A tabela tem dados?** Query anônima retornou `content-range: */0` — pode ser RLS bloqueando anon OU zero linhas. Precisa consulta com service role ou UI logada.

3. **Feature flag deve virar padrão?** `VITE_ESTOQUE_SOURCE=supabase` está pronto pra ativar. Impacto:
   - Tempo de resposta cai de ~22s (Bridge por loja) para query Postgres (~ms)
   - `empresa=ALL` passa a funcionar de verdade (com `cod_empresa` discriminado)
   - Perde-se atualização em tempo real — mostra estado do último cron (7h da manhã)
   - Motor multi-loja da Fase 2.0b (`calcularMixIdealMultiLoja`) ganha alimentação natural

4. **Falta uma migration versionada** criando `estoque_sincronizado`? Se sim, deploy em ambiente novo (staging futuro) não recria a tabela. Vale versionar via `pg_dump --schema-only` do Supabase remoto.

## Implicação para a Entrega 1.5 (que estava planejada)

A Entrega 1.5 mencionada no brief original visava **fechar a lacuna de leitura multi-loja para o modo único da Entrega 2** — via uma das três opções listadas em `docs/ESTADO_ESTOQUE_MATERIALIZADO.md` anterior (adicionar `cod_empresa` no bridge, criar sync-estoque, ou N chamadas paralelas).

**Opção "criar sync-estoque" JÁ FOI IMPLEMENTADA.** O que sobra para a Entrega 1.5 é bem menor:
- Ativar `VITE_ESTOQUE_SOURCE=supabase` (uma linha em env var, gradual por ambiente)
- Adaptar `useEstoqueUnificado` para carregar todas as lojas de uma vez quando `empresa=ALL` (o dispatcher já suporta)
- Integrar `calcularMixIdealMultiLoja` (motor puro do Passo 4) no hook — sem mudar assinatura, só passar `LojaInput[]` por empresa
- Testar performance com o dataset real

**Entrega 1.5 permanece suspensa até o stakeholder confirmar:**
- Cron está rodando e tabela populada?
- Dados batendo com bridge dentro de tolerância aceitável?
- Aprovação para ativar a feature flag em produção?
