

# Plano: Chaveamento Sandbox/Producao por Adquirente

## Contexto
Hoje cada registro em `adquirentes_config` tem um unico campo `ambiente` (sandbox ou production) e um unico par de credenciais. O usuario quer que cada adquirente tenha credenciais para **ambos** os ambientes, com um toggle para ativar qual esta em uso.

## O que muda

### 1. Migration — novos campos na tabela `adquirentes_config`
Adicionar colunas para credenciais de producao separadas:

- `merchant_id_production` (text, nullable) — PV de producao
- `integration_key_production` (text, nullable) — chave de producao
- `pv_matriz_production` (text, nullable) — PV Matriz de producao

Os campos existentes (`merchant_id`, `integration_key_encrypted`, `pv_matriz`) passam a representar as credenciais de **sandbox**. O campo `ambiente` continua existindo e indica qual ambiente esta **ativo** no momento.

### 2. Atualizar UI — AdminAdquirentesPage
Reorganizar a tabela para mostrar dois blocos de credenciais por linha:

```text
Empresa | Adquirente | Ambiente Ativo [toggle]
        | Sandbox: PV / Chave / PV Matriz
        | Producao: PV / Chave / PV Matriz
        | [Testar SB] [Testar Prod] [Testar GV SB] [Testar GV Prod]
```

- Toggle Sandbox/Producao altera qual conjunto de credenciais as Edge Functions usam
- Botoes de teste para cada ambiente separadamente
- Indicador visual de quais credenciais estao preenchidas

### 3. Atualizar Edge Functions

**`rede-proxy`**: Ler `ambiente` do registro e usar `merchant_id` ou `merchant_id_production` conforme o ambiente ativo.

**`rede-gestao-vendas`**: Ja recebe `ambiente` como parametro — nenhuma mudanca necessaria na funcao em si.

**`sync-vendas-cartao`**: Ler `ambiente` do config para decidir qual `pv_matriz` usar (`pv_matriz` vs `pv_matriz_production`).

**`payment-links`**: Usar `merchant_id` ou `merchant_id_production` conforme o ambiente ativo do registro.

### 4. Corrigir mapeamento do sync-vendas-cartao (pendente)
Ajustar campos conforme a estrutura real da API Gestao de Vendas (conforme descoberto nos testes anteriores):
- `content.transactions` em vez de `content`
- `tx.merchant.companyNumber` em vez de `tx.subsidiaryNumber`
- `tx.amount` em vez de `tx.grossAmount`
- `tx.modality.type` em vez de `tx.modality`
- `tx.brandCode` mapeado para nome da bandeira

## Detalhes tecnicos

| Item | Detalhe |
|------|---------|
| Migration | Adicionar 3 colunas `*_production` em `adquirentes_config` |
| UI | Refatorar `AdminAdquirentesPage.tsx` para layout dual-ambiente |
| Edge Functions | `rede-proxy`, `sync-vendas-cartao`, `payment-links` — resolver credencial pelo campo `ambiente` |
| `rede-gestao-vendas` | Sem mudanca (ja recebe ambiente como parametro) |

## Ordem de implementacao

| Etapa | Entrega |
|-------|---------|
| 1 | Migration: adicionar colunas `*_production` |
| 2 | Refatorar UI com campos separados por ambiente e testes independentes |
| 3 | Atualizar `rede-proxy` e `payment-links` para resolver credenciais pelo ambiente |
| 4 | Atualizar `sync-vendas-cartao` com credencial correta + fix de mapeamento API |

