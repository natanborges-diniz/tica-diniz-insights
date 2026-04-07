

## Plano: Ajustar 3 Contas — Contribuição Sindical, Software Sistemas, Licenças Software

### Mudanças

| Conta | Situação Atual | Ação |
|---|---|---|
| **3.4.16** CONTRIBUIÇÃO SINDICAL | Desativada | **Reativar** — conta distinta de 3.1.12 no ERP |
| **3.3.3** SOFTWARE/SISTEMAS | Ativa, COMUNICACAO | **Renomear** para "ASSINATURA SOFTWARE E SISTEMAS". Reclassificar para categoria **SERVICOS** (taxa mensal recorrente) |
| **3.3.6** LICENÇAS DE SOFTWARE/ERP | Desativada, COMUNICACAO | **Reativar e reclassificar**: Renomear para "AQUISICAO SOFTWARE E LICENCAS". Mover para grupo **INVESTIMENTOS**, categoria **CAPEX**, sinal **-** |

### Resumo da Distinção

```text
3.3.3  ASSINATURA SOFTWARE E SISTEMAS   → DESPESAS_OPERACIONAIS / SERVICOS  (-)
       Ex: mensalidade do ERP, SaaS, manutenção de sistemas

3.3.6  AQUISICAO SOFTWARE E LICENCAS    → INVESTIMENTOS / CAPEX             (-)
       Ex: compra de licença perpétua, implantação de sistema em loja nova
```

### Execução

Uma única operação de UPDATE em 3 registros (dados, sem mudança de schema):
- UPDATE 3.4.16: `ativo = true`
- UPDATE 3.3.3: `conta_descricao = 'ASSINATURA SOFTWARE E SISTEMAS'`, `categoria = 'SERVICOS'`
- UPDATE 3.3.6: `ativo = true`, `conta_descricao = 'AQUISICAO SOFTWARE E LICENCAS'`, `grupo_dre = 'INVESTIMENTOS'`, `categoria = 'CAPEX'`

### Arquivos

Nenhum arquivo de código precisa ser alterado — apenas dados no banco.

