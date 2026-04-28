# Reestruturação dos PVs REDE: técnico vs. comercial + ativação por PV Matriz

## Diagnóstico

`pv_matriz_production = 13381369` está duplicado nas 9 lojas, mas é o **PV técnico de integração** da REDE (provisionado pra consumir API), não tem natureza comercial e não tem filiais subordinadas. Por isso `requestType: "T"` retornou erro e `"I"` aceitou mas com `companyNumbers: []` vazio.

Cada loja tem na verdade **um (ou mais) PV Matriz Comercial próprio**, do qual o PV de e-commerce já cadastrado em `merchant_id_production` é filial. A solicitação `merchant-statement` precisa ser feita por PV Matriz Comercial.

## Mapeamento confirmado

| cod_empresa | Loja | PV Matriz Comercial |
|---|---|---|
| 1 | DINIZ PRIMITIVA I | `31974325` |
| 2 | DINIZ PRIMITIVA II | `37324330` |
| 4 | DINIZ CARAPICUIBA | `49347756` |
| 6 | DINIZ UNIAO | `47586940` |
| 9 | DINIZ ANTONIO AGU | `90059441` *(compartilhado com 17)* |
| 15 | DINIZ ITAPEVI | `94555958` |
| 16 | DINIZ BARUERI | `97679429` |
| 17 | DINIZ STO ANTONIO | `90059441` *(compartilhado com 9)* |
| 18 | DINIZ SUPER SHOPPING | `90058844` + `100711383` *(2 PVs)* |

## Mudanças

### 1. Schema (migração)

- Trocar `pv_matriz_production text` por **`pvs_matriz_production text[]`** em `adquirentes_config` (suporta múltiplos PVs por loja — caso Super Shopping).
- Migrar valores: limpar `13381369` e popular o array com os PVs Matriz Comerciais reais conforme tabela acima.
- Manter `pv_matriz` (sandbox) intocado.
- O PV técnico `13381369` não precisa de coluna — ele é o PV usado pela API Gestão de Vendas (já vive como referência interna do `rede-gestao-vendas`).

### 2. UI `/admin/adquirentes` (aba REDE → Production)

- Substituir o input único "PV Matriz" por um **gerenciador de tags/chips de PVs Matriz Comerciais** (adicionar/remover múltiplos valores).
- Permitir o mesmo PV em múltiplas lojas (case Antonio Agu / Sto Antonio).
- Indicador visual quando o array estiver vazio (badge "PV Matriz não configurado").

### 3. Edge Function `rede-gestao-acessos`

- Trocar a fonte do `requestCompanyNumber`: ler `pvs_matriz_production[]` de cada loja (não mais o `13381369`).
- Voltar a usar `requestType: "T"` + `permissions: ["R"]`.
- Lógica de execução em lote:
  1. Coletar `(cod_empresa, pv_matriz)` de todas as lojas, expandindo o array.
  2. **Deduplicar por `pv_matriz`** — se 2 lojas compartilham o mesmo PV (Antonio Agu/Sto Antonio = `90059441`), faz **1 única chamada** à REDE.
  3. Para cada PV único, POST `merchant-statement-access` com `{requestType:"T", requestCompanyNumber:<pv>, permissions:["R"]}`.
  4. Persistir o `requestId` retornado em **todas as lojas** que usam aquele PV (campo `gv_optin_reference`).
  5. **Pular silenciosamente** lojas com array vazio; retornar resumo `{processed, skipped, failed}`.
- Persistir o payload completo em `gv_optin_request_payload` para auditoria (incluindo o PV usado).

### 4. Limpeza

- Marcar mentalmente a solicitação `fdc5b3d2-b999-400b-8348-ce6aff4bdd45` como obsoleta — não há cancelamento via API, ela vai vencer/ser ignorada no portal REDE.

## Resultado esperado

- 9 lojas mapeadas → **8 PVs únicos** → 8 chamadas à REDE (não 9).
- Super Shopping (cod 18) recebe 2 `requestId` (um por PV); UI exibe ambos.
- Antonio Agu (cod 9) e Sto Antonio (cod 17) compartilham o mesmo `requestId`.
- Após aprovação no portal REDE, o healthcheck (`merchant-statement` GET) confirma acesso a extrato de cada PV Matriz + filiais e-commerce.

## Próximos passos pós-aprovação

1. Migração: alterar coluna + popular dados.
2. UI: trocar input por gerenciador de chips.
3. Edge Function: reescrever `processBatch` com deduplicação.
4. Testar lote → verificar `requestId` por loja → você aprova no portal REDE → healthcheck.
