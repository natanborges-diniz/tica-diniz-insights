# Plano: corrigir Compras (NF e extração)

Confirmei no banco o problema relatado: o campo `documento` vem no formato `NUMERO/PARCELA` (ex.: `3080021/1`, `3080021/2`, `3080021/3`). Hoje o agregador trata cada parcela como uma NF diferente, inflando contagem de notas e quebrando a média de parcelas.

Também confirmei a limitação de extração: `sync-parcelas` filtra por `data_vencimento` numa janela de 45 dias passados / 90 dias futuros. Notas antigas cujos vencimentos já passaram dessa janela desaparecem do cache — por isso o ano inteiro de Coopervision aparece incompleto.

## 1. Corrigir agrupamento de NF (frontend)

Arquivo: `src/services/comprasService.ts` — função `aggregateNotas`.

- Extrair o número-base da NF removendo o sufixo de parcela:
  - `numeroNF = documento.split('/')[0].trim()` (fallback `(s/doc)` se vazio).
- Nova chave de agrupamento: `cod_empresa | pessoa_nome | numeroNF | data_emissao`.
- Campo `documento` exibido passa a ser apenas `numeroNF` (sem `/1`, `/2`...).
- `qtdParcelas` continua sendo `arr.length` — agora reflete corretamente as 3 parcelas de 1 NF.
- `prazoMedioDias` permanece como média dos `vencimento − emissao` das parcelas da mesma NF.

Efeito: a tela passará a mostrar 2 NFs com 3 parcelas no exemplo, e a Média Parcelas/NF ficará em 3.

## 2. Ampliar janela do cache de parcelas (backend)

Arquivo: `supabase/functions/sync-parcelas/index.ts`.

Hoje a busca no Firebird usa `campoData=VENCIMENTO` numa janela curta. Para o dashboard de Compras (que filtra por `data_emissao`), precisamos garantir que toda NF emitida no período esteja no cache, independente de quando vence.

Mudanças:
- Adicionar uma segunda chamada ao Firebird usando `campoData=EMISSAO`, cobrindo a mesma janela que a UI permite consultar.
  - Modo `incremental`: últimos 90 dias por emissão (além da janela atual por vencimento).
  - Modo `backfill`: últimos 24 meses por emissão (hoje são apenas 6).
- Fazer upsert por chave natural (`cod_empresa`, `documento`, `data_vencimento`, `pessoa_nome`) para evitar duplicar registros que vêm pelas duas janelas. Hoje o código faz `DELETE` por intervalo de `data_vencimento` antes do `INSERT`, o que apaga parcelas legítimas vindas pela query de emissão — substituir por upsert idempotente.
- Manter `tipo_lancamento = 'PAGAR'` como prioridade na limpeza para não tocar em RECEBER.

Observação: não vou alterar o contrato do endpoint Firebird; ele já aceita `campoData`.

## 3. Validação

- Recarregar `/compras` no período atual: NF `3080021` deve aparecer 1× com `qtdParcelas=3` para empresa 6, e `3075685` 1× com `qtdParcelas=3` para empresa 2.
- KPI "Média Parcelas/NF" deve cair para próximo de 3 nos cenários típicos.
- Rodar `sync-parcelas` manualmente em modo `incremental` e conferir contagem de NFs Coopervision ao longo de 2025–2026.

## Fora de escopo

- Não vou mudar UI de filtros, KPIs adicionais ou exportação PDF.
- Não vou mudar o módulo Financeiro / Fluxo / DRE (mesma tabela, mas consumo diferente — só altero a estratégia de sync, que já beneficia ambos).
