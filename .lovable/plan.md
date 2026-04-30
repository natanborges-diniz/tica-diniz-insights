Revisei a documentação da REDE Gestão de Vendas, o código atual e a base. Confirmado: Diniz Super (13) e Diniz Jandira (14) estão inativas — fora do escopo. As 9 lojas ativas (1, 2, 4, 6, 9, 15, 16, 17, 18) já têm `pvs_matriz_production[]` cadastrados conforme os prints do portal.

O problema real do consumo está no nosso código: o sync usa **um único** PV Matriz arbitrário e o mapeamento de retorno só olha `merchant_id_production`. Por isso só uma loja recebe dados, mesmo com tudo liberado no portal da REDE.

## Mudanças

### 1. `supabase/functions/rede-gestao-vendas` — pequenos ajustes

- Confirmar base URL de produção: hoje usamos `https://api.userede.com.br`. Ajustar para `https://api.userede.com.br/redelabs` (URL oficial de produção da Gestão de Vendas no portal). Sandbox permanece `https://rl7-sandbox-api.useredecloud.com.br`.
- Manter regra: omitir `subsidiaries` em sandbox; em produção só envia se passado.
- `health` continua igual (1 PV consultado por chamada). A varredura de múltiplos PVs fica no caller, não aqui.
- Logs já estão estruturados; manter.

### 2. `supabase/functions/sync-vendas-cartao` — refatoração principal

Substituir a lógica "um único matrizConfig" por uma varredura de **todos os PVs Matriz Comerciais ativos**:

- Buscar todas as `adquirentes_config` REDE ativas em produção.
- Coletar union de `pvs_matriz_production[]` de todas (deduplicado).
  - Em sandbox cair no `pv_matriz` legado (mantém compatibilidade).
- Para cada PV Matriz único: chamar `rede-gestao-vendas` paginando até esgotar.
- Consolidar todas as transações em uma única lista, mantendo de qual PV Matriz vieram (para debug).

Mapeamento `companyNumber → cod_empresa`:

- Construir um mapa que cobre simultaneamente:
  - `merchant_id_production` (PV de filiação direto da loja)
  - cada item de `pvs_matriz_production[]` (PV Matriz Comercial)
- Resolver `cod_empresa` da transação tentando, nesta ordem: `tx.merchant.companyNumber` → `tx.subsidiaryNumber` → `tx.companyNumber`.
- Quando a transação vier por um PV Matriz compartilhado por mais de uma loja (ex.: 90059441 cobre Antonio Agu + Sto Antonio), o mapeamento ainda diferencia pela filial real (`merchant.companyNumber`), porque a REDE retorna o PV da filial dentro da transação.

Robustez:

- Dedup por `(nsu, cod_empresa)` já existe — manter.
- Aumentar `size` do paginate para `100` (estava `20`) para reduzir round-trips.
- Coletar `unmappedPvs` com contagem por PV para diagnóstico, não só o set de PVs.
- Resumo final passa a incluir: `pvs_consultados`, `pvs_com_falha`, `pvs_com_dados`, `total_api`, `inserted`, `skipped`, `unmapped` (com contagem), `recebiveis_created`.

Tolerância a falha por PV: se um PV específico falhar (ex.: ainda não aceito), continuar com os demais e reportar no resumo, em vez de abortar a função inteira.

### 3. `/admin/adquirentes` — diagnóstico por PV

- "Validar Ativação" passa a iterar sobre todos os PVs em `pvs_matriz_production[]` da loja e mostrar o resultado por PV (✓/✗ com mensagem). Persistir o status agregado em `gv_last_healthcheck_status` (ATIVA se todos OK; ERRO se algum falhar).
- Adicionar botão "Sincronizar vendas (últimos 7 dias)" no header da página, que dispara `sync-vendas-cartao` em produção e exibe o resumo retornado num toast/popover (PVs consultados, inseridos, unmapped) — facilita conferir se a integração está realmente puxando dados.

### 4. Memória

- Atualizar `mem://integrations/rede/system-architecture` para registrar que o sync varre **todos** os PVs Matriz Comerciais ativos, não um único.

## Fora do escopo

- Não criar configurações para lojas inativas (13, 14).
- Não tocar em secrets nem em credenciais OAuth — já estão configuradas.
- Não alterar `rede-gestao-acessos` (Opt-in já está funcionando: 9 lojas com `AGUARDANDO_ACEITE`/`APROVADO`).
- Não mexer em `rede-proxy` (e.Rede / links de pagamento).