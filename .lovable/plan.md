

## Plano: Completar Seed da Tabela `dre_plano_contas` com Todas as Contas Reais do ERP

### Problema

O seed inicial da `dre_plano_contas` tem ~30 contas, mas o ERP real usa ~75 contas distintas. Contas como `3.1.14 ROYALTIES` caem no fallback por prefixo `3.1` → IMPOSTOS, quando na verdade é FRANQUIA. Resultado: classificação errada na importação.

### Diagnóstico do print

O lançamento "DINIZ FRANCHISING AD" (R$ 3.691,21) tem `conta_numero = 3.1.14` e `conta_descricao = ROYALTIES`. Pelo fallback, herda DEDUCOES/IMPOSTOS. A classificação correta é DESPESAS_OPERACIONAIS/FRANQUIA.

### Solução

Inserir na `dre_plano_contas` **todas as contas reais** encontradas no `parcelas_cache`, com classificação correta. Contas que já existem no seed permanecem inalteradas.

### Migração — INSERT das contas faltantes

Contas a inserir com a classificação correta:

```text
conta_numero  conta_descricao                          grupo_dre                categoria
──────────────────────────────────────────────────────────────────────────────────────────
3.1.11        IRPF                                     DEDUCOES                 IMPOSTOS
3.1.12        Contribuições Sindicais e Associativas   DESPESAS_OPERACIONAIS    PESSOAL
3.1.14        ROYALTIES                                DESPESAS_OPERACIONAIS    FRANQUIA
3.10          MANUTENÇÃO E CONSERVAÇÃO                 DESPESAS_OPERACIONAIS    MANUTENCAO
3.10.2        AR CONDICIONADO                          DESPESAS_OPERACIONAIS    MANUTENCAO
3.10.9        EQUIPAMENTOS DE PREVENÇÃO                DESPESAS_OPERACIONAIS    MANUTENCAO
3.10.10       DEDETIZACAO                              DESPESAS_OPERACIONAIS    MANUTENCAO
3.10.15       LIMPEZA DE VITRINE                       DESPESAS_OPERACIONAIS    MANUTENCAO
3.2.2         Outros despesas ocupação                 DESPESAS_OPERACIONAIS    OCUPACAO
3.2.4         Fundo de participação                    DESPESAS_OPERACIONAIS    OCUPACAO
3.2.10        SEGURO                                   DESPESAS_OPERACIONAIS    OCUPACAO
3.3.5         Telefone/Internet                        DESPESAS_OPERACIONAIS    COMUNICACAO
3.3.6         Licenças de software/ERP                 DESPESAS_OPERACIONAIS    COMUNICACAO
3.4           DESPESAS COM PESSOAL                     DESPESAS_OPERACIONAIS    PESSOAL
3.4.16        Contribuição Sindical                    DESPESAS_OPERACIONAIS    PESSOAL
3.4.19        Auxílio Moradia                          DESPESAS_OPERACIONAIS    PESSOAL
3.4.20        Premiação                                DESPESAS_OPERACIONAIS    PESSOAL
3.4.28        AUXILIO ALIMENTACAO                      DESPESAS_OPERACIONAIS    PESSOAL
3.4.29        FREE LANCER                              DESPESAS_OPERACIONAIS    PESSOAL
3.5.12        MARKETING DIGITAL                        DESPESAS_OPERACIONAIS    MARKETING
3.5.13        MÍDIA NACIONAL (Franquia)                DESPESAS_OPERACIONAIS    MARKETING
3.5.16        MARKETING                                DESPESAS_OPERACIONAIS    MARKETING
3.6.3         Consulta de crédito (SPC/Serasa)         DESPESAS_OPERACIONAIS    FINANCEIRO_OPERACIONAL
3.6.5         REEMBOLSO CLIENTES                       DESPESAS_OPERACIONAIS    FINANCEIRO_OPERACIONAL
3.7.1         MATERIAL BAR                             DESPESAS_OPERACIONAIS    ADMINISTRATIVO
3.7.10        CARTORIO                                 DESPESAS_OPERACIONAIS    ADMINISTRATIVO
3.7.13        MANUTENÇÃO VEÍCULOS                      DESPESAS_OPERACIONAIS    ADMINISTRATIVO
3.7.18        TRANSFERENCIA SAIDA                      DESPESAS_OPERACIONAIS    ADMINISTRATIVO
3.7.19        MATERIAL P/ SUPORTE AS LOJAS             DESPESAS_OPERACIONAIS    ADMINISTRATIVO
3.8           FORNECEDORES DE PRODUTOS (Revenda)       CUSTO_MERCADORIA         FORNECEDORES_PRODUTO
3.9.3         FRANQUIA (ROYALTIES)                     DESPESAS_OPERACIONAIS    FRANQUIA
3.9.4         MEDICOS / OPTOMETRISTAS                  DESPESAS_OPERACIONAIS    SERVICOS
3.9.5         Serviços de Montagem e Laboratório       DESPESAS_OPERACIONAIS    SERVICOS
3.9.8         CONSULTORIA E GESTÃO                     DESPESAS_OPERACIONAIS    SERVICOS
5.3           Máquinas e Equipamentos Ópticos          OUTRAS_DESPESAS          INVESTIMENTOS
5.5           Veículos                                 OUTRAS_DESPESAS          INVESTIMENTOS
5.7           Benfeitorias Prediais                    OUTRAS_DESPESAS          INVESTIMENTOS
5.8           Outros Investimentos                     OUTRAS_DESPESAS          INVESTIMENTOS
```

### Detalhes técnicos

| Arquivo | Alteração |
|---|---|
| Migração SQL | INSERT ~38 contas faltantes na `dre_plano_contas` com ON CONFLICT para não duplicar |

### O que NÃO muda
- Lógica de `autoClassify` (fallback por prefixo já funciona — agora terá match exato)
- Tabela `lancamentos_financeiros`
- Lançamentos já importados (mantêm classificação atual; editáveis manualmente)
- UI do Hub e da página de parametrização DRE

