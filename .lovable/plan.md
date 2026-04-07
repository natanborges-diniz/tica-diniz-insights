

## Plano: Padronização do Plano de Contas DRE

### Diagnóstico Atual

**82 contas cadastradas** com os seguintes problemas identificados:

| Problema | Exemplos |
|---|---|
| **Duplicidades** | IRPF (3.1.11 e 3.1.3), DEDETIZACAO (3.10.2 e 3.10.10), Telefone/Internet (3.3.5 duplica 3.3.1+3.3.2), Licenças software/ERP (3.3.6 duplica 3.3.3), Contribuição Sindical (3.4.16 duplica 3.1.12) |
| **Nomenclatura inconsistente** | Mix de CAIXA ALTA e Title Case ("Telefone/Internet", "Licenças de software/ERP", "Serviços de Montagem e Laboratório") |
| **Classificação indevida** | TRANSFERENCIA SAIDA (3.7.18) como ADMINISTRATIVO — não é despesa operacional. JUROS PAGOS (3.6.2) em FINANCEIRO_OPERACIONAL deveria ir para RESULTADO_FINANCEIRO. MANUTENÇÃO VEÍCULOS (3.7.13) em ADMINISTRATIVO deveria ir para MANUTENCAO |
| **Empresa no Simples** | ICMS (3.1.2), IRPJ (3.1.4), CSLL (3.1.5), PIS/COFINS (3.1.6) separados — deveriam ser consolidados sob SIMPLES NACIONAL apenas |
| **Grupos faltantes** | RECEITA_BRUTA (0 contas), RESULTADO_FINANCEIRO (0 contas), OUTRAS_RECEITAS_DESPESAS (0 contas) |
| **Coluna `sinal` inexistente** | O sinal é derivado em código (financeiroDreService.ts L39-59) mas não está na tabela para visibilidade do usuário |

### O Que Será Feito

#### 1. Migração de banco — Adicionar coluna `sinal`

```sql
ALTER TABLE dre_plano_contas ADD COLUMN sinal text NOT NULL DEFAULT '-';
-- Atualizar sinais corretos
UPDATE dre_plano_contas SET sinal = '+' WHERE grupo_dre IN ('RECEITA_BRUTA', 'OUTRAS_RECEITAS');
UPDATE dre_plano_contas SET sinal = '-' WHERE grupo_dre NOT IN ('RECEITA_BRUTA', 'OUTRAS_RECEITAS');
```

#### 2. Migração de dados — Limpeza via SQL

Executar em uma única migration:

- **Remover duplicatas**: Desativar 3.1.11 (IRPF duplicado), 3.10.10 (DEDETIZACAO duplicado), 3.3.5, 3.3.6, 3.4.16
- **Padronizar nomenclatura**: UPDATE todas as descrições para CAIXA ALTA sem abreviações
- **Reclassificar**:
  - TRANSFERENCIA SAIDA (3.7.18) → desativar (não é DRE)
  - JUROS PAGOS (3.6.2) → grupo RESULTADO_FINANCEIRO, categoria FINANCEIRO
  - TARIFAS BANCARIAS (3.6.1) → grupo RESULTADO_FINANCEIRO, categoria FINANCEIRO
  - MANUTENÇÃO VEÍCULOS (3.7.13) → categoria MANUTENCAO
  - Impostos separados (ICMS, IRPJ, CSLL, PIS/COFINS) → desativar (Simples Nacional)
- **Criar contas faltantes**:
  - 1.1 VENDAS MERCADORIAS (RECEITA_BRUTA / VENDAS / +)
  - 1.2 VENDAS SERVICOS (RECEITA_BRUTA / VENDAS / +)
  - 4.1 RECEITAS FINANCEIRAS (RESULTADO_FINANCEIRO / FINANCEIRO / +)
  - 4.2 DESPESAS FINANCEIRAS (RESULTADO_FINANCEIRO / FINANCEIRO / -)
  - 4.3 JUROS PAGOS (RESULTADO_FINANCEIRO / FINANCEIRO / -)
  - 6.1 RECEITAS NAO OPERACIONAIS (OUTRAS_RECEITAS_DESPESAS / NAO_OPERACIONAL / +)
  - 6.2 DESPESAS NAO OPERACIONAIS (OUTRAS_RECEITAS_DESPESAS / NAO_OPERACIONAL / -)
  - 2.4 DEVOLUCOES (DEDUCOES / DEVOLUCOES / -)

#### 3. UI — Exibir coluna `sinal` na tabela e formulário

- Adicionar coluna "Sinal" na tabela de contas (badge verde "+" ou vermelho "−")
- No formulário de criação/edição, auto-preencher o sinal com base no grupo DRE selecionado (editável como override)
- Atualizar `SEED_GRUPOS` e `SEED_CATEGORIAS` para refletir os novos grupos

#### 4. DRE Service — Usar `sinal` do banco

- Em `financeiroDreService.ts`, consultar o campo `sinal` da tabela `dre_plano_contas` em vez de usar o hardcoded `GRUPOS_SINAL_NEGATIVO`

### Grupos Finais Padronizados

```text
RECEITA_BRUTA          (+)  VENDAS
DEDUCOES               (-)  IMPOSTOS, COMISSOES, TAXAS, DEVOLUCOES
CUSTO_MERCADORIA       (-)  FORNECEDORES_PRODUTO
DESPESAS_OPERACIONAIS  (-)  PESSOAL, OCUPACAO, COMUNICACAO, MARKETING,
                            MANUTENCAO, ADMINISTRATIVO, SERVICOS, FRANQUIA
RESULTADO_FINANCEIRO   (-)  FINANCEIRO
OUTRAS_RECEITAS_DESPESAS(±) NAO_OPERACIONAL
INVESTIMENTOS          (-)  CAPEX
```

### Arquivos a Alterar

| Arquivo | Mudança |
|---|---|
| Migration SQL | Adicionar coluna `sinal`, limpar duplicatas, reclassificar, inserir contas faltantes |
| `src/pages/AdminDreConfigPage.tsx` | Coluna sinal na tabela, auto-preenchimento no form, SEED atualizados |
| `src/services/financeiroDreService.ts` | Usar sinal do banco em vez de constante hardcoded |

### Contas Recomendadas (Sugestão Extra)

Contas que deveriam existir para análise gerencial completa:
- **CUSTO LABORATORIO PROPRIO** (CMV) — se há lab interno
- **FRETE FORNECEDORES** (CMV) — custo logístico de produto
- **DEPRECIACAO** (Despesas Operacionais) — para DRE completa
- **PRO LABORE** (Despesas Operacionais / Pessoal) — retirada dos sócios

