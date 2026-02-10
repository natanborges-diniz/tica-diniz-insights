

# Diagnostico Estruturado -- Sistema de Gestao Otica

Classificacao: **Critico** | **Importante** | **Desejavel**

---

## PLAN 1 -- DADOS

### Dividas Tecnicas

| # | Item | Classificacao | Evidencia |
|---|------|---------------|-----------|
| D1 | **RLS totalmente permissiva em todas as tabelas** | Critico | Todas as tabelas usam `USING (true)`. Qualquer pessoa com a anon key pode ler dados financeiros, receitas medicas e dados pessoais de clientes. |
| D2 | **Sem autenticacao no sistema** | Critico | Nao existe login. RLS permissiva sem auth significa zero protecao de dados. |
| D3 | **`fornecedor_produto_depara` sem unique index** | Importante | O upsert depende de `onConflict` no codigo, mas nao ha constraint de unicidade na tabela. Pode gerar duplicatas silenciosas. |
| D4 | **`os_hub_receitas` upsert em `cod_os` sem unique constraint visivel** | Importante | O sync-os-hub faz `upsert({ onConflict: "cod_os" })` mas a tabela nao mostra unique constraint explicita no schema fornecido. |
| D5 | **Whitelist de empresas duplicada em 3 lugares** | Importante | `syncCacheService.ts` (linha 7), `empresaService.ts`, e tabela `empresa` no Supabase. Cada um pode divergir. |
| D6 | **Tabelas `venda`/`venda_item`/`pessoa`/`produto` sem policy de SELECT para anon** | Importante | Usam apenas `Service role full access`. O frontend com anon key nao consegue ler estas tabelas diretamente (pode estar correto se so a Bridge usa, mas gera confusao sobre qual camada acessa o que). |
| D7 | **Colunas `lente_od_descricao`/`lente_oe_descricao` existem mas nao sao consumidas** | Desejavel | Adicionadas por migracao, preenchidas pelo sync, mas rollback no frontend removeu o consumo. Dados orfaos. |

### Funcionalidades Duplicadas

| # | Item | Classificacao | Evidencia |
|---|------|---------------|-----------|
| D8 | **Dois services de estoque: `estoqueCompletoService.ts` vs `vendasService.ts` (analise-sku)** | Importante | `estoqueCompletoService` chama `/estoque/completo`, `vendasService` chama `/vendas/analise-sku`. Ambos retornam dados de estoque com interfaces diferentes. |
| D9 | **Dois hooks de estoque: `useEstoqueCompleto.ts` vs `useEstoqueUnificado.ts`** | Importante | `useEstoqueCompleto` usa `estoqueService.getAnaliseEstoqueAcao`, enquanto `useEstoqueUnificado` combina ambos endpoints. Duplicacao de logica de filtragem, metricas e categorizacao. |
| D10 | **Funcao `categorizarTipo()` duplicada** | Desejavel | Logica de categorizar AR/LG/AC aparece em `estoqueCompletoService.ts` (como `extrairTipoDeDescricao`) e em `useEstoqueUnificado.ts` (como `categorizarTipo`), com regras ligeiramente diferentes. |

### Pontos Frageis de Regra de Negocio

| # | Item | Classificacao | Evidencia |
|---|------|---------------|-----------|
| D11 | **Dados do Firebird sao mutaveis retroativamente** | Critico | Ate registros "pagos" podem ser editados no ERP. O cache `vendas_agregado_diario` nao tem mecanismo de re-sync para meses ja cacheados. |
| D12 | **Sem cron/schedule para sync automatico** | Importante | Edge Functions de sync existem mas nao ha evidencia de pg_cron configurado (exceto a nota sobre sync-os-hub a cada 15 min). O sync de vendas agregadas depende de disparo manual do frontend (`syncCacheService`). |
| D13 | **Fluxo de Caixa derivado de parcelas sem saldo acumulado** | Desejavel | O `useFluxoCaixa` calcula receber-pagar por periodo mas nao projeta saldo acumulado (saldo inicial + entradas - saidas), que e o padrao de fluxo de caixa. |

---

## PLAN 2 -- IA / AUTOMACOES

### Dividas Tecnicas

| # | Item | Classificacao | Evidencia |
|---|------|---------------|-----------|
| A1 | **Edge Functions de IA sem rate limiting** | Importante | `ai-central`, `ai-diretrizes`, `ai-sugestao-cobertura` sao publicas (`verify_jwt = false`) sem protecao contra abuso. Qualquer um pode chamar repetidamente. |
| A2 | **Sync manual pelo frontend usando anon key** | Importante | `syncCacheService.ts` constroi URLs manuais com `VITE_SUPABASE_PUBLISHABLE_KEY` para chamar Edge Functions (linha 186-193). Contorna o SDK e expoe padrao fragil. |

### Fluxos Confusos

| # | Item | Classificacao | Evidencia |
|---|------|---------------|-----------|
| A3 | **Orquestracao de sync nao e clara** | Importante | Existem `orchestrate-sync`, `sync-vendas`, `sync-empresas`, `sync-clientes`, `sync-produtos`, `sync-agregados-*`, `transform-dw`, `sync-os-hub`. Nao ha documentacao de qual chama qual, em que ordem, ou se `orchestrate-sync` e o entry point unico. |
| A4 | **`aiCentralService` coleta dados de multiplos services** | Desejavel | O servico faz fetch de vendas, estoque, pagamentos e familias em paralelo para montar o contexto da IA. Se qualquer um falhar, a analise pode ser parcial sem indicacao clara ao usuario. |

### Pontos Frageis

| # | Item | Classificacao | Evidencia |
|---|------|---------------|-----------|
| A5 | **Periodo comercial hardcoded (21-20)** | Importante | `getPeriodoComercial` e hardcoded no frontend. A tabela `metas_periodos` existe com `dia_inicio` e `dia_fim` mas a integracao entre ambas nao e evidente. Se o periodo mudar, ha duas fontes de verdade. |

---

## PLAN 3 -- UX / FLUXO

### Dividas Tecnicas

| # | Item | Classificacao | Evidencia |
|---|------|---------------|-----------|
| U1 | **3 paginas orfas no bundle** | Importante | `OsHubPage.tsx`, `OtbDashboard.tsx`, `StockDashboard.tsx` existem no codigo mas nao tem rotas no `App.tsx`. Inflam o bundle e confundem a manutencao. |
| U2 | **Modulo Monitor sem sidebar** | Desejavel | `moduleMenus.monitor` e um array vazio (AppSidebar.tsx linha 63). O Monitor tem 2 rotas (`/os` e `/os/pedido`) mas navegacao entre elas so ocorre por fluxo interno (botao "Pedir Lente"), nao por menu. |

### Fluxos Confusos

| # | Item | Classificacao | Evidencia |
|---|------|---------------|-----------|
| U3 | **Rota `/vendas-familia` fora do padrao** | Desejavel | Todas as rotas usam padrao `/modulo/sub` (ex: `/estoque/acoes`, `/financeiro/dre`), mas vendas-familia usa hifen no root (`/vendas-familia`) em vez de `/vendas/familia`. |
| U4 | **Filtro "empresa=ALL" causa timeout no Monitor de OS** | Importante | O auto-load do `useOsMonitor` (linha 173) busca com `empresa: "ALL"`, que no endpoint Bridge causa lentidao de 90s+. O usuario ve loading prolongado no primeiro acesso. |
| U5 | **Tela de Usuarios marcada como "em breve" sem implementacao** | Desejavel | Sidebar mostra "Usuarios (em breve)" com `disabled: true` (AppSidebar.tsx linha 87). Nao ha pagina, rota, nem placeholder. |

### Falta de Padronizacao

| # | Item | Classificacao | Evidencia |
|---|------|---------------|-----------|
| U6 | **Filtros inconsistentes entre dashboards** | Desejavel | Estoque usa `empresa: null` (obriga selecao), Vendas usa `empresa: "ALL"`, Financeiro usa `empresa: "ALL"`, OS usa `empresa: "ALL"`. Comportamento do usuario e diferente em cada modulo. |

---

## PLAN 4 -- FINANCEIRO

### Dividas Tecnicas

| # | Item | Classificacao | Evidencia |
|---|------|---------------|-----------|
| F1 | **DRE retorna campos em UPPERCASE** | Importante | `financeiroDreService.ts` recebe `COMPETENCIA`, `COD_EMPRESA`, `CONTACLA_DESCRICAO` etc (interface `DreLinhaRaw`). Todos os outros endpoints usam snake_case. A funcao `mapDreLinhaRaw` corrige, mas indica inconsistencia no backend. |
| F2 | **Calculo do DRE usa soma direta sem validacao de sinais** | Importante | `calcularResumoDre` (linha 128-130) faz `receitaLiquida = receitaBruta + deducoes`, assumindo que deducoes vem com valor negativo do backend. Se o backend mudar a convencao de sinal, o DRE inteiro fica errado silenciosamente. |

### Pontos Frageis de Regra de Negocio

| # | Item | Classificacao | Evidencia |
|---|------|---------------|-----------|
| F3 | **Fluxo de caixa sem saldo acumulado** | Importante | O hook `useFluxoCaixa` calcula `saldo = receber - pagar` por periodo isolado (linha 123), mas nao projeta o saldo acumulado dia a dia, que e essencial para analise de liquidez. |
| F4 | **Parcelas sem reconciliacao com devolucoes** | Desejavel | O campo `formaPagamentoTipo` existe mas devolucoes podem aparecer como parcelas negativas ou registros separados. Nao ha logica explicita de reconciliacao. |
| F5 | **Tipo de lancamento derivado de flag obscura** | Desejavel | `financeiroService.ts` linha 59: `lancamentoPagar === 'T' ? 'PAGAR' : 'RECEBER'`. O campo `lancamento_pagar` com valor `'T'` e uma convencao do ERP Firebird que nao e documentada no codigo. |

---

## PLAN 5 -- INTEGRACOES

### Dividas Tecnicas

| # | Item | Classificacao | Evidencia |
|---|------|---------------|-----------|
| I1 | **Hoya em ambiente de homologacao** | Critico | A URL padrao e `hoyalab.com.br` (producao real do lab, mas acesso de homologacao). Pedidos enviados podem nao ser reais. A troca para producao requer apenas alterar a secret `HOYA_BASE_URL`, mas sem validacao de campos obrigatorios. |
| I2 | **Prismas nao sao enviados no payload Hoya** | Importante | O tipo `HoyaPedidoPayload` tem `prescricao.esquerdo/direito` com campos `prismaH`, `prismaV`, `basePRPrismaH`, `basePRPrismaV`, mas a tela de pedido nao popula esses campos a partir da receita da OS (que tem `prisma`, `prismaAngulo`, `prismaEixo`). |
| I3 | **Campo `vendedor` nao salvo em `pedidos_fornecedor`** | Desejavel | O `hoya-proxy` (linha 144-152) insere `cod_os`, `cod_empresa`, `fornecedor`, `numero_pedido`, `status`, `payload`, `response`, mas nao grava quem fez o pedido. |

### Pontos Frageis

| # | Item | Classificacao | Evidencia |
|---|------|---------------|-----------|
| I4 | **Firebird Bridge como ponto unico de falha** | Critico | Se o Railway cair, 80% das telas param (vendas, estoque, OS, financeiro). O cache Supabase so cobre vendas agregadas e receitas de OS. |
| I5 | **Sem health check ou monitoramento do Bridge** | Importante | Nao ha endpoint `/health` sendo verificado, nem alertas quando o Bridge falha. O usuario so descobre quando a tela da timeout. |
| I6 | **`firebirdBridge.ts` aceita 4 formatos de resposta** | Desejavel | A funcao `apiGet` (linhas 120-154) tenta: envelope `{ ok, data }`, legacy `{ data: [] }`, legacy `{ rows: [] }`, e array direto. Indica que o backend Bridge nao tem formato padrao estabilizado. |
| I7 | **Sem equivalente de matching para Zeiss ou Essilor** | Desejavel | `hoyaMatchingService.ts` faz parsing inteligente de descricoes para Hoya, mas nao existe equivalente para outros fornecedores de lentes. |

---

## Resumo por Severidade

| Severidade | Qtd | Itens |
|------------|-----|-------|
| **Critico** | 4 | D1, D2, D11, I1, I4 |
| **Importante** | 17 | D3, D4, D5, D6, D8, D9, D12, A1, A2, A3, A5, U1, U4, F1, F2, F3, I2, I5 |
| **Desejavel** | 12 | D7, D10, D13, A4, U2, U3, U5, U6, F4, F5, I3, I6, I7 |

