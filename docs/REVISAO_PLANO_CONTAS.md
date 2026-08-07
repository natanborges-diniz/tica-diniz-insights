# Revisão do Plano de Contas — modelo alvo (controladoria varejo ótico)

> Iniciada em 07/08/2026 a pedido do stakeholder ("nosso plano segue as melhores
> práticas contábeis/de controladoria?"). Estado: **aguardando dump do plano em
> produção** (o banco divergiu das migrations — a 6.1 RETIRADA MENSAL virou
> RECEITAS NÃO OPERACIONAIS em 04/2026, e há contas do ERP + edições de UI que
> o repositório não registra).

## Estrutura conceitual: grupo × categoria × conta

- **grupo_dre** = os macro-blocos do DRE, em ordem de demonstração. São FIXOS —
  criar grupo novo pela UI quebra o demonstrativo (bug de UX a corrigir: o
  dialog "Nova Conta" permite "Criar" grupo livremente).
- **categoria** = agrupador gerencial dentro do grupo (PESSOAL, OCUPACAO,
  MARKETING...). É aqui que entra "marketing" — nunca como grupo.
- **conta** = o item classificável (3.5.1 PUBLICIDADE). Numeração espelha o
  plano do ERP (Dataweb) — o sync usa o número para classificar sozinho.

## DRE gerencial alvo (padrão de mercado)

| Ordem | grupo_dre | Conteúdo | Categorias típicas |
|---|---|---|---|
| 1 | RECEITA_BRUTA | vendas por meio de pagamento | VENDAS, OUTRAS_RECEITAS |
| 2 | DEDUCOES | impostos s/ venda, devoluções, taxas de cartão, comissões | IMPOSTOS, DEVOLUCOES, TAXAS, COMISSOES |
| = | **Receita Líquida** | | |
| 3 | CUSTO_MERCADORIA | fornecedores de produto (lentes, armações, acessórios, laboratório) | FORNECEDORES_PRODUTO |
| = | **Lucro Bruto (margem)** | | |
| 4 | DESPESAS_OPERACIONAIS | tudo que mantém a loja rodando | PESSOAL, OCUPACAO, MARKETING, ADMINISTRATIVO, COMUNICACAO/TI, SERVICOS, MANUTENCAO |
| = | **EBITDA gerencial** | | |
| 5 | RESULTADO_FINANCEIRO | juros, tarifas bancárias, receitas financeiras | FINANCEIRO |
| 6 | OUTRAS_RECEITAS_DESPESAS | efeitos fora da operação (venda de ativo, acordos) | NAO_OPERACIONAL |
| = | **Resultado Líquido** | | |
| — | INVESTIMENTOS | CAPEX (reformas, equipamentos, veículos) — **não é despesa do DRE**, é linha de caixa | INVESTIMENTOS |
| — | MOVIMENTACOES_SOCIOS | pró-labore excedente/distribuição de lucros — **fora do resultado**, linha própria de caixa | SOCIOS |

Princípios que o mercado segue e vamos aplicar:

1. **Pró-labore formal** (fixo mensal, com INSS) é despesa operacional →
   categoria PESSOAL (ex.: 3.4.x PRO-LABORE). **Distribuição de lucros /
   retirada variável NÃO passa pelo resultado** — grupo próprio
   MOVIMENTACOES_SOCIOS, senão o lucro da loja fica distorcido pelo quanto os
   sócios sacam.
2. **Taxas de adquirente** são dedução da receita (não despesa operacional) —
   já está correto (2.3).
3. **CAPEX fora do DRE** — INVESTIMENTOS como bloco de caixa, não de resultado.
4. **Toda conta ativa deve ter grupo E categoria** — conta sem categoria some
   dos agrupamentos gerenciais.
5. **Conta de uso interno da loja**: bar/café de cortesia ao cliente →
   DESPESAS_OPERACIONAIS + MARKETING (é experiência de venda); copa da equipe →
   DESPESAS_OPERACIONAIS + ADMINISTRATIVO.

## Pendências para fechar a revisão

- [ ] Dump do plano real (`SELECT ... FROM dre_plano_contas ORDER BY conta_numero`)
      → gap analysis conta a conta contra o alvo acima.
- [ ] Recriar conta de retirada dos sócios (grupo fora do resultado) + rubricas
      por sócio.
- [ ] Criar conta do bar da loja (definir: cortesia ao cliente × copa interna).
- [ ] UX: dialog "Nova Conta" deve restringir grupo_dre à lista fixa e exigir
      categoria (hoje deixa criar grupo livre e a categoria fica vazia).
- [ ] Conferir se todos os relatórios (DRE, fluxo) tratam INVESTIMENTOS e
      MOVIMENTACOES_SOCIOS fora do resultado operacional.
