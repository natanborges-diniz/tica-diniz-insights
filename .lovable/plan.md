

## Plano: Classificação Automática pelo Plano de Contas do ERP + Tabela de Parametrização DRE

### Problema atual

A função `autoClassify` ignora `conta_numero` e `conta_descricao` do ERP, classificando tudo genericamente. O ERP já traz um plano de contas detalhado (ex: "3.4.1 Salário", "3.2.1 Aluguel", "3.8.1 Fornecedores de Lentes") que precisa ser preservado no lançamento e usado para classificação hierárquica automática.

### Abordagem

A `conta_descricao` do ERP é a informação primária do lançamento (ex: "Salário", "FGTS", "Aluguel"). O sistema mapeia automaticamente para a hierarquia DRE padrão usando uma **tabela de parametrização configurável** (`dre_plano_contas`). Isso permite ajustes futuros sem código.

### Hierarquia (3 níveis)

```text
grupo_dre (nível DRE)         → ex: DESPESAS_OPERACIONAIS
  └─ categoria (subgrupo)     → ex: PESSOAL
       └─ subcategoria (item) → ex: Salário  ← vem do ERP (conta_descricao)
```

### 1. Migração — Tabela `dre_plano_contas`

Tabela de parametrização que mapeia `conta_numero` → grupo DRE + categoria:

```sql
CREATE TABLE public.dre_plano_contas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conta_numero text NOT NULL,
  conta_descricao text NOT NULL,
  grupo_dre text NOT NULL,        -- RECEITA_BRUTA, DEDUCOES, CUSTO_MERCADORIA, etc.
  categoria text NOT NULL,         -- PESSOAL, OCUPACAO, MARKETING, etc.
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(conta_numero)
);

ALTER TABLE public.dre_plano_contas ENABLE ROW LEVEL SECURITY;

-- RLS: admin lê/escreve, authenticated lê
CREATE POLICY "Admin full access dre_plano_contas" ON public.dre_plano_contas
  FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "Authenticated read dre_plano_contas" ON public.dre_plano_contas
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Service role full access dre_plano_contas" ON public.dre_plano_contas
  FOR ALL TO service_role USING (true) WITH CHECK (true);
```

Seed com dados reais do ERP:

| conta_numero | conta_descricao | grupo_dre | categoria |
|---|---|---|---|
| 1.9 | CREDITOS FORNECEDORES | RECEITA_BRUTA | VENDAS |
| 1.10 | TRANSFERENCIA ENTRADA | RECEITA_BRUTA | OUTRAS_RECEITAS |
| 1.13 | CAIXA | RECEITA_BRUTA | VENDAS |
| 2.1 | SIMPLES NACIONAL | DEDUCOES | IMPOSTOS |
| 2.2 | COMISSÕES | DEDUCOES | COMISSOES |
| 2.3 | TAXAS ADQUIRENTES | DEDUCOES | TAXAS |
| 3.1.x | Taxas Municipais, ICMS, IRPF... | DEDUCOES | IMPOSTOS |
| 3.2.x | Aluguel, Condomínios, Água, Energia, IPTU... | DESPESAS_OPERACIONAIS | OCUPACAO |
| 3.3.x | Telefone, Internet, Software... | DESPESAS_OPERACIONAIS | COMUNICACAO |
| 3.4.x | Salário, FGTS, Vale Transporte, Férias... | DESPESAS_OPERACIONAIS | PESSOAL |
| 3.5.x | Marketing, Eventos, Brindes... | DESPESAS_OPERACIONAIS | MARKETING |
| 3.6.x | Tarifas Bancárias, Reembolsos... | DESPESAS_OPERACIONAIS | FINANCEIRO_OPERACIONAL |
| 3.7.x | Material, Embalagens, Correios... | DESPESAS_OPERACIONAIS | ADMINISTRATIVO |
| 3.8.x | Fornecedores Lentes, Armações... | CUSTO_MERCADORIA | FORNECEDORES_PRODUTO |
| 3.9.x | Franquia, Médicos, Laboratório... | DESPESAS_OPERACIONAIS | SERVICOS |
| 3.10.x | Manutenção, Dedetização... | DESPESAS_OPERACIONAIS | MANUTENCAO |
| 3.11 | CRÉDITOS DE CLIENTES | OUTRAS_DESPESAS | DEVOLUCOES |
| 4.x | Empréstimos, Juros... | OUTRAS_DESPESAS | FINANCEIRO |
| 5.x | Software, Equipamentos, Veículos... | INVESTIMENTOS | INVESTIMENTOS |
| 6.1 | Retirada Mensal | OUTRAS_DESPESAS | PRO_LABORE |

### 2. Edge function `financeiro-lancamentos` — Refatorar `autoClassify`

- Ao importar (`importar_erp_auto`), consultar `dre_plano_contas` para montar um mapa `conta_numero → {grupo_dre, categoria}`
- Se match exato: usar `grupo_dre` como `natureza`, `categoria` como `categoria`, `conta_descricao` do ERP como `subcategoria`
- Se sem match exato: fallback por prefixo (ex: "3.4.28" → tenta "3.4" → "3")
- Se sem match nenhum: fallback genérico atual
- Salvar `conta_numero` e `conta_descricao` em `dados_extras` para rastreabilidade

### 3. Edge function `financeiro-relatorios` — `classificarGrupoDre`

- Atualizar para reconhecer as novas categorias (PESSOAL, OCUPACAO, COMUNICACAO, etc.) e mapeá-las corretamente nos grupos DRE
- O DRE agrupa por `natureza` (grupo) e pode detalhar por `categoria` (subgrupo)

### 4. UI — `FinanceiroHubPage.tsx`

- Coluna classificação exibe: `categoria › subcategoria` (ex: "PESSOAL › Salário")
- Quando `subcategoria` vem do ERP, exibir com ícone indicando origem automática

### 5. UI — Página de parametrização DRE (nova rota `/admin/dre-config`)

- Tabela editável com as contas cadastradas
- CRUD: adicionar/editar/desativar contas
- Colunas: conta_numero, conta_descricao, grupo_dre (select), categoria (select/editável)
- Acessível apenas para admins

### Detalhes técnicos

| Arquivo | Alteração |
|---|---|
| Migração SQL | Criar tabela `dre_plano_contas` + seed com ~50 contas do ERP |
| `supabase/functions/financeiro-lancamentos/index.ts` | Refatorar `autoClassify`: consultar tabela, fallback por prefixo, salvar `subcategoria` = `conta_descricao`, `dados_extras` com `conta_numero` |
| `supabase/functions/financeiro-relatorios/index.ts` | Expandir `classificarGrupoDre` para novas categorias |
| `src/pages/FinanceiroHubPage.tsx` | Exibir `categoria › subcategoria` na coluna classificação |
| `src/pages/AdminDreConfigPage.tsx` (novo) | CRUD da tabela `dre_plano_contas` |
| `src/App.tsx` | Rota `/admin/dre-config` |

### O que NÃO muda
- Tabela `lancamentos_financeiros` (sem migração — campos já existem)
- Lançamentos já importados (mantêm classificação atual)
- Fluxo de borderô, autorização e baixa

