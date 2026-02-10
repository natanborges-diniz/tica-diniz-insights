
# Mapeamento AS-IS -- Sistema de Gestao Otica

## 1. Visao Geral da Arquitetura

O sistema e um dashboard de gestao para uma rede de oticas, construido em React + Vite + TypeScript com duas fontes de dados:

- **Firebird Bridge** (Railway): API REST que consulta o ERP legado (Firebird DB) em tempo real
- **Lovable Cloud (Supabase)**: Cache de dados agregados, receitas de OS, configuracoes e integracao com fornecedores

```text
+------------------+       +-------------------+       +------------------+
|   Frontend       | ----> | Firebird Bridge   | ----> |  Firebird ERP    |
|   (React/Vite)   |       | (Railway)         |       |  (legado)        |
+------------------+       +-------------------+       +------------------+
        |
        v
+------------------+       +-------------------+
| Lovable Cloud    | ----> | Edge Functions    |
| (Supabase)       |       | (hoya-proxy,      |
| - Cache          |       |  sync, ai, etc.)  |
| - Config         |       +-------------------+
| - Pedidos        |
+------------------+
```

---

## 2. Modulos e Telas (14 rotas ativas)

### 2.1 Vendas (3 telas)
| Rota | Pagina | Fonte de Dados | Status |
|------|--------|----------------|--------|
| `/vendas` | Dashboard de Vendas | Bridge `/vendas/resumo-empresa-vendedor` + `/vendas/resumo-formas-pagamento` | Funcional |
| `/vendas-familia` | Vendas por Familia | Bridge `/vendas/analise-familia-vendedor` | Funcional |
| `/vendas/inteligencia` | Inteligencia de Vendas | Bridge + cache agregado Supabase | Funcional |

**Funcionalidades**: KPIs (faturamento, ticket medio, desconto), graficos por loja/vendedor, tabela de vendas diarias, formas de pagamento, exportacao.

### 2.2 Estoque (3 telas)
| Rota | Pagina | Fonte de Dados | Status |
|------|--------|----------------|--------|
| `/estoque` | Visao Estoque | Bridge `/vendas/analise-sku` | Funcional |
| `/estoque/acoes` | O que Fazer? | Bridge `/vendas/analise-sku` (mesmo endpoint) | Funcional |
| `/estoque/otb` | Analise OTB | Bridge `/vendas/analise-sku` + config Supabase | Funcional |

**Funcionalidades**: Analise por SKU, curva ABC, giro de estoque, acoes sugeridas (comprar/manter/liquidar), estoque minimo por loja, configuracao fornecedor-marca.

### 2.3 Monitor de Producao -- OS (2 telas)
| Rota | Pagina | Fonte de Dados | Status |
|------|--------|----------------|--------|
| `/os` | Monitor de Producao | Bridge `/os/monitor-ultima-etapa` + cache Supabase `os_hub_receitas` | Funcional |
| `/os/pedido` | Pedido Fornecedor (Hoya) | Edge Function `hoya-proxy` + Supabase `pedidos_fornecedor` | Parcialmente funcional |

**Funcionalidades**: Grid de OS com filtros (empresa, etapa, status, receita), linha expansivel com detalhes, busca de receita completa on-demand, badges Rx/Foto, geracao de pedido Hoya com matching inteligente.

### 2.4 Financeiro (3 telas)
| Rota | Pagina | Fonte de Dados | Status |
|------|--------|----------------|--------|
| `/financeiro` | Parcelas a Receber | Bridge `/financeiro/parcelas` | Funcional |
| `/financeiro/dre` | DRE | Bridge `/financeiro/dre` | Funcional |
| `/financeiro/fluxo-caixa` | Fluxo de Caixa | Bridge `/financeiro/parcelas` (derivado) | Funcional |

**Funcionalidades**: Parcelas a pagar/receber, situacao (aberto/atraso/paga), DRE com resumo e grafico por competencia, fluxo de caixa projetado.

### 2.5 Central de IA (1 tela)
| Rota | Pagina | Fonte de Dados | Status |
|------|--------|----------------|--------|
| `/ia` | Central de IA | Coleta multi-dimensional + Edge Function `ai-central` e `ai-diretrizes` | Funcional |

**Funcionalidades**: Analise consolidada por IA (vendas, estoque, formas de pagamento, familias, fornecedores). Gera diretrizes de negocio por pilar (vendas, estoque, dre, fluxo_caixa, os, executivo).

### 2.6 Configuracoes (1 tela)
| Rota | Pagina | Fonte de Dados | Status |
|------|--------|----------------|--------|
| `/config/metas` | Metas e Calendario | Supabase (`metas_vendas`, `metas_periodos`, `lojas_configuracao`, etc.) | Funcional |

**Funcionalidades**: CRUD de metas de faturamento por loja/vendedor, configuracao de periodos comerciais (21-20), calendario de feriados, excecoes de abertura.

---

## 3. Entidades de Dados

### 3.1 Supabase (tabelas persistentes)
| Tabela | Finalidade | Uso |
|--------|-----------|-----|
| `empresa` | Cadastro de lojas | Whitelist `[1,2,4,6,9,13,14,15,16,17,18]` |
| `pessoa` | Cadastro de clientes/vendedores | Sync do ERP |
| `produto` | Cadastro de produtos | Sync do ERP |
| `venda` / `venda_item` | Vendas individuais | Sync do ERP |
| `vendas_agregado_diario` | Cache de vendas agregadas por dia/loja/vendedor/forma | Dashboards e IA |
| `os_hub_receitas` | Cache de receitas de OS | Monitor + Hub |
| `pedidos_fornecedor` | Historico de pedidos enviados (Hoya) | Rastreamento |
| `fornecedor_produto_depara` | Mapeamento ERP descricao <-> codigo Hoya | Auto-matching |
| `fornecedor_marca` | Associacao fornecedor-marca para OTB | Config manual |
| `metas_vendas` | Metas de faturamento por loja/vendedor/periodo | Config |
| `metas_periodos` | Definicao dos periodos comerciais | Config |
| `lojas_configuracao` | Tipo loja (rua/shopping), num vendedores, domingo/feriado | Config |
| `lojas_excecoes` | Excecoes pontuais de abertura/fechamento | Config |
| `calendario_feriados` | Feriados nacionais/regionais | Config |
| `estoque_minimo_loja` | Estoque minimo por curva ABC e empresa | Config OTB |
| `etl_controle` | Controle de paginacao/ultima data sync | Interno |

### 3.2 Firebird Bridge (endpoints ativos)
| Endpoint | Metodo | Uso |
|----------|--------|-----|
| `/empresas` | GET | Fallback de empresas |
| `/vendas/resumo-empresa-vendedor` | GET | Dashboard vendas principal |
| `/vendas/resumo-formas-pagamento` | GET | Formas de pagamento |
| `/vendas/analise-familia-vendedor` | GET | Vendas por familia |
| `/vendas/analise-sku` | GET | Estoque + OTB (fonte unica) |
| `/os/monitor-ultima-etapa` | GET | Monitor de producao |
| `/os/hub-receitas` | GET | Receita completa de OS |
| `/financeiro/parcelas` | GET | Parcelas a pagar/receber |
| `/financeiro/dre` | GET | DRE |

### 3.3 Edge Functions (17 funcoes)
| Funcao | Finalidade | Status |
|--------|-----------|--------|
| `hoya-proxy` | Proxy seguro para API Hoya Lab | Funcional (homologacao) |
| `ai-central` | Analise IA multi-dimensional | Funcional |
| `ai-diretrizes` | Diretrizes de negocio por IA | Funcional |
| `ai-sugestao-cobertura` | Sugestao de cobertura de estoque por IA | Funcional |
| `firebird-query` | Query generica ao Firebird | Disponivel |
| `cache-diagnostico` | Diagnostico do cache local | Utilitario |
| `sync-vendas` | Sync vendas ERP -> Supabase | Sync |
| `sync-empresas` | Sync empresas ERP -> Supabase | Sync |
| `sync-clientes` | Sync clientes ERP -> Supabase | Sync |
| `sync-produtos` | Sync produtos ERP -> Supabase | Sync |
| `sync-os-hub` | Sync OS + receitas ERP -> cache | Sync |
| `sync-agregados-diarios` | Gera cache agregado diario | Sync |
| `sync-agregados-mensal` | Gera cache agregado mensal | Sync |
| `sync-agregados-semanal` | Gera cache agregado semanal | Sync |
| `orchestrate-sync` | Orquestra sync completo | Sync |
| `transform-dw` | Transformacao data warehouse | Sync |

---

## 4. O Que Funciona

1. **Dashboard de Vendas completo**: KPIs, graficos, tabelas, filtros por empresa/periodo, exportacao
2. **Analise por familia de produto**: Mix de venda por familia
3. **Estoque com fonte unica**: Consistencia garantida pelo endpoint `/vendas/analise-sku`
4. **OTB**: Curva ABC, estoque minimo configuravel, sugestao de compra por IA
5. **Monitor de OS**: Auto-load com filtros padrao (TRANSLADO + Com Receita), badges Rx/Foto
6. **Receita completa de OS**: Hierarquia 3 niveis (OS -> receita_lente_cliente -> cliente), busca on-demand
7. **Financeiro**: Parcelas, DRE, fluxo de caixa projetado
8. **Central de IA**: Coleta multi-dimensional e geracao de insights
9. **Metas**: CRUD completo com periodos comerciais customizados (21-20)
10. **Integracao Hoya**: Proxy seguro, cataalogo de produtos, matching inteligente, envio de pedidos
11. **Cache inteligente**: Dados agregados no Supabase com politica de meses fechados
12. **Navegacao modular**: Top bar com modulos + sidebar contextual por modulo

---

## 5. O Que Esta Incompleto

1. **Tags de Fornecedor no Monitor**: Implementacao feita e revertida (rollback) por impacto em performance. As colunas `lente_od_descricao` e `lente_oe_descricao` existem na tabela `os_hub_receitas` mas nao estao sendo populadas pelo sync nem consumidas no frontend.

2. **Paginas orfas**: `OsHubPage.tsx`, `OtbDashboard.tsx`, `StockDashboard.tsx` existem como arquivos mas nao estao no roteamento (sem rota no App.tsx). Sao versoes anteriores ou alternativas nunca integradas.

3. **Tela de Usuarios**: Listada no sidebar como "em breve" (`disabled: true`), sem implementacao.

4. **Autenticacao**: Nao existe sistema de login/auth. O app e totalmente aberto. Todas as tabelas usam RLS com `true` (acesso publico) ou `service_role`. Nao ha controle de acesso por usuario.

5. **Pedido Hoya -- Fluxo completo**: A pagina existe mas:
   - Ambiente de homologacao (nem todas as familias disponiveis)
   - Prismas nao sao enviados no payload
   - Nao ha tracking pos-pedido integrado na UI (a funcao `consultarPedidoHoya` existe mas nao e usada em tela)
   - Campo `vendedor` nao e salvo na tabela `pedidos_fornecedor`

6. **Sync automatizado**: Edge functions de sync existem mas nao ha evidencia de cron/schedule configurado. O sync parece ser manual ou via chamada externa.

7. **Formas de pagamento no cache**: O campo `forma_pagamento` no agregado diario e usado, mas a reconciliacao com devolucoes pode ser imprecisa.

---

## 6. Inconsistencias e Lacunas Identificadas

### Dados e Codigo Morto
- **`OsHubPage.tsx`** e **`OsHubListPage.tsx`**: Tela completa de "Hub de Receitas" com grid de exploracao, filtros, paginacao, sheet de detalhes. Tem rota removida -- funcionalidade parcialmente absorvida pelo Monitor mas nao totalmente.
- **`StockDashboard.tsx`** e **`OtbDashboard.tsx`**: Versoes antigas substituidas pelas paginas em `/estoque/*`.
- **`useEstoqueCompleto.ts`** e **`estoqueCompletoService.ts`**: Hooks/services que parecem ser versoes alternativas do fluxo de estoque.

### Normalizacao de Campos
- O DRE service (`financeiroDreService.ts`) mapeia campos em **UPPERCASE** (ex: `COMPETENCIA`, `COD_EMPRESA`), diferente do padrao snake_case de todos os outros endpoints. Isso indica que o endpoint do backend retorna formato diferente.

### Performance
- Endpoint `/os/monitor-ultima-etapa` com `empresa=ALL` causa timeouts (90s+). O sistema mitiga com `campoData` padrao e periodo de 30 dias, mas a experiencia pode ser ruim.
- `fetchReceitaFotoFlags` faz query ao Supabase em paralelo para cada carga do monitor -- funciona mas depende da qualidade do cache.

### Seguranca
- **RLS totalmente permissiva**: Todas as tabelas usam `USING (true)` -- qualquer pessoa com a anon key pode ler/escrever. Sem autenticacao, nao ha como restringir acesso.
- A tabela `pedidos_fornecedor` nao permite DELETE (correto para auditoria), mas qualquer um pode INSERT/UPDATE/SELECT.
- Secrets como `HOYA_API_KEY` estao protegidas na Edge Function, o que e correto.

### Integracao Hoya
- O ambiente esta em **homologacao** (URL: `hoyalab.com.br`). A troca para producao requer alterar a secret `HOYA_BASE_URL`.
- O matching inteligente funciona bem para o fluxo Hoya mas nao ha equivalente para Zeiss ou Essilor.
- O de/para (`fornecedor_produto_depara`) nao tem constraint de unicidade no banco -- o upsert depende de `onConflict` no codigo, mas nao ha unique index definido na tabela.

### Calendario e Metas
- O periodo comercial (21-20) e usado no dashboard de vendas mas a configuracao e hardcoded em `getPeriodoComercial`. A tabela `metas_periodos` existe mas a integracao entre as duas fontes pode ser fragil.

---

## 7. Servicos Frontend (18 services)

| Service | Endpoint/Fonte | Responsabilidade |
|---------|---------------|------------------|
| `firebirdBridge.ts` | HTTP client central | Envelope padrao, timeout, camelCase |
| `vendasService.ts` | Bridge `/vendas/*` | Resumo, formas pagamento, familia, SKU |
| `estoqueService.ts` | Bridge `/vendas/analise-sku` | Acoes de estoque |
| `osService.ts` | Bridge `/os/monitor-ultima-etapa` | Monitor de OS |
| `osHubService.ts` | Bridge `/os/hub-receitas` + Supabase | Receitas completas + cache |
| `financeiroService.ts` | Bridge `/financeiro/parcelas` | Parcelas |
| `financeiroDreService.ts` | Bridge `/financeiro/dre` | DRE |
| `empresaService.ts` | Supabase + Bridge fallback | Lista de empresas |
| `agregadosService.ts` | Supabase `vendas_agregado_diario` | Cache de vendas |
| `metasService.ts` | Supabase `metas_vendas` | CRUD metas |
| `calendarioService.ts` | Supabase `calendario_*` + `lojas_*` | Calendario/config |
| `hoyaService.ts` | Edge Function `hoya-proxy` | API Hoya |
| `hoyaMatchingService.ts` | Local (sem API) | Parser + matching inteligente |
| `aiCentralService.ts` | Coleta multi-service | Dados para IA |
| `aiDiretrizesService.ts` | Edge Function `ai-diretrizes` | Geracao de diretrizes |
| `syncCacheService.ts` | Edge Functions `sync-*` | Disparo de syncs |
| `auditoriaService.ts` | Supabase | Auditoria |
| `estoqueCompletoService.ts` | Bridge | Versao alternativa (possivelmente morta) |

---

## 8. Resumo de Riscos e Recomendacoes (sem alterar codigo)

1. **Seguranca critica**: Sem autenticacao, qualquer um com a URL pode acessar dados financeiros, vendas e receitas de clientes.
2. **Codigo morto**: 3+ paginas e 2+ services/hooks que nao sao usados inflam o bundle e confundem manutencao.
3. **Performance do Monitor**: O endpoint principal de OS e lento com `ALL` -- risco de timeout em uso diario.
4. **Unico ponto de falha**: Se o Firebird Bridge (Railway) cair, 80% das telas param de funcionar. O cache Supabase so cobre vendas agregadas e receitas.
5. **Hoya em homologacao**: Pedidos enviados nao sao reais. A troca para producao requer validacao cuidadosa.
6. **Sem monitoramento**: Nao ha health checks, alertas ou logs estruturados para saber quando o sistema falha silenciosamente.
