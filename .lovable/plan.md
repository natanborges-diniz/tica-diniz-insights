

# Plano: Migrar sync-vendas-cartao para API Gestao de Vendas

## Passo 1 — Atualizar `sync-vendas-cartao` para usar `rede-gestao-vendas`

Hoje o sync chama `rede-proxy` (API e.Rede, Basic Auth por loja). Vamos trocar para chamar `rede-gestao-vendas` (OAuth 2.0), que retorna vendas de **todas as filiais** de uma vez usando o PV da matriz.

### Mudancas na edge function `sync-vendas-cartao/index.ts`:
- Trocar a chamada de `rede-proxy` para `rede-gestao-vendas` action `consultar_vendas`
- Buscar o PV da matriz na tabela `adquirentes_config` (ou receber como parametro)
- Adaptar o mapeamento de campos — a API Gestao de Vendas retorna campos diferentes (ex: `grossAmount`, `netAmount`, `nsu`, `brand`, `modality`)
- Suportar paginacao automatica (a API retorna paginas de ate 20 registros)
- Mapear `cod_empresa` correto para cada transacao usando o campo `subsidiaryNumber` retornado pela API

### Fluxo novo:
```text
sync-vendas-cartao recebe { data_inicio, data_fim }
  → busca PV matriz em adquirentes_config
  → chama rede-gestao-vendas action "consultar_vendas" 
    com parentCompanyNumber = PV matriz
  → percorre todas as paginas
  → para cada transacao, mapeia subsidiaryNumber → cod_empresa
  → insere em vendas_cartao (dedup por nsu+cod_empresa)
  → cria recebiveis_cartao para credito
```

## Passo 2 — Configurar para producao

Ja esta preparado no codigo. Basta:
1. Obter as credenciais OAuth de **producao** no Portal Rede Developer
2. Atualizar os secrets `REDE_GV_CLIENT_ID` e `REDE_GV_CLIENT_SECRET` com os valores de producao
3. Passar `ambiente: "production"` nas chamadas (ou tornar producao o padrao)
4. Cadastrar na tabela `adquirentes_config` o PV da **matriz** que sera usado como `parentCompanyNumber`

### Adicional: tela de config
- Adicionar campo "PV Matriz (Gestao de Vendas)" na pagina Admin Adquirentes
- Botao "Testar conexao GV" que chama `rede-gestao-vendas` action `health`

## Detalhes tecnicos

| Item | Detalhe |
|------|---------|
| Edge function alterada | `sync-vendas-cartao/index.ts` |
| Novo campo necessario | `adquirentes_config.pv_matriz` (ou usar campo existente `merchant_id` de um registro especial) |
| Mapeamento filial | `subsidiaryNumber` da API → `cod_empresa` via lookup em `adquirentes_config` |
| Paginacao | Loop ate `page >= totalPages` |
| Ambiente | Controlado por parametro `ambiente` (default: consultar `adquirentes_config`) |

## Ordem de implementacao
| Etapa | Entrega |
|-------|---------|
| 1 | Adicionar coluna `pv_matriz` em `adquirentes_config` (migration) |
| 2 | Reescrever `sync-vendas-cartao` para usar `rede-gestao-vendas` |
| 3 | Atualizar UI Admin Adquirentes com campo PV Matriz e botao testar GV |
| 4 | Trocar secrets para producao quando tiver credenciais |

