

## Plano: DRE com Dois Modos — Realizado vs Projetado

### Situação Atual

- O DRE consulta **apenas lançamentos `BAIXADO`** filtrados por `data_emissao` (competência)
- Não há visibilidade de despesas futuras já validadas (CLASSIFICADO, AUTORIZADO, etc.)
- O Fluxo de Caixa já suporta o conceito de `apenas_baixado` como toggle — o DRE não

### O Que Será Feito

#### 1. Edge Function — Aceitar modo `projetado`

Alterar `financeiro-relatorios/index.ts` na action `dre`:
- Novo parâmetro opcional `modo: "realizado" | "projetado"` (default: `realizado`)
- **Realizado** (atual): `status = "BAIXADO"`, valor = `valor_pago ?? valor`
- **Projetado**: status IN (`CLASSIFICADO`, `BORDERO`, `AUTORIZADO`, `PROCESSANDO`, `BAIXADO`), valor = `valor_pago ?? valor`
- Adicionar campo `realizado: boolean` em cada linha retornada para diferenciar visualmente

#### 2. UI — Toggle no DreFilters

Adicionar um `ToggleGroup` com duas opções no `DreFilters.tsx`:
- **Realizado** — mostra apenas o que foi efetivamente pago (BAIXADO)
- **Projetado** — inclui também lançamentos validados ainda não pagos

Novo campo `modo` no tipo `DreFilters`.

#### 3. Hook + Service — Passar modo

- `useFinanceiroDre.ts`: incluir `modo` nos filtros (default: `realizado`)
- `financeiroDreService.ts`: passar `modo` no body da chamada à edge function

#### 4. DreTable — Indicador visual

- Linhas projetadas (não-BAIXADO) com badge "Previsto" ou fundo levemente diferente
- Subtotais separados: "Realizado" vs "Previsto" quando em modo projetado

#### 5. DreResumoCards — Adaptação

- Em modo projetado, exibir o valor total (realizado + previsto)
- Subtexto indicando quanto do total já foi realizado (ex: "R$ 8.000 de R$ 12.000 realizado")

### Arquivos a Alterar

| Arquivo | Mudança |
|---|---|
| `supabase/functions/financeiro-relatorios/index.ts` | Aceitar `modo`, filtrar status conforme modo, retornar flag `realizado` |
| `src/components/financeiro-dre/DreFilters.tsx` | Toggle Realizado/Projetado |
| `src/hooks/useFinanceiroDre.ts` | Campo `modo` nos filtros |
| `src/services/financeiroDreService.ts` | Passar `modo` na chamada, mapear flag `realizado` |
| `src/components/financeiro-dre/DreTable.tsx` | Badge visual para linhas projetadas, labels dos novos grupos |
| `src/components/financeiro-dre/DreResumoCards.tsx` | Subtexto "realizado de total" em modo projetado |

### O que NÃO muda
- Tabela `lancamentos_financeiros` (sem mudança no banco)
- Lógica de classificação `classificarGrupoDre`
- Fluxo de Caixa (já tem seu próprio toggle)
- Plano de Contas

