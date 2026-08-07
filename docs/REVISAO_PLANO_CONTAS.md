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

## Gap analysis executada (07/08/2026 — migration 20260807130000)

Dump real: 106 contas. Desvios encontrados e corrigidos:

| Conta | Estava | Problema | Correção |
|---|---|---|---|
| 1.10 TRANSFERENCIA ENTRADA, 1.11 EMPRESTIMOS ENTRADA | RECEITA_BRUTA | transferência/empréstimo **não é receita** — inflava o faturamento do DRE | MOVIMENTACOES_CAIXA (fora do resultado) |
| 2.2 COMISSOES | DEDUCOES | ~~movida a PESSOAL~~ **REVERTIDA (decisão do stakeholder, migration 20260807150000)**: DRE gerencial — comissão é variável e ligada à venda, fica no bloco da margem de contribuição; societariamente o contador trata como despesa comercial | DEDUCOES/COMISSOES (mantida) |
| 3.1.1 TAXAS MUNICIPAIS | DEDUCOES | alvará/licença não deduz receita | DESPESAS_OPERACIONAIS/ADMINISTRATIVO |
| 3.1.3 IRPF | DEDUCOES | IRRF acompanha a folha (⚠️ validar com contabilidade se for IR de sócio) | DESPESAS_OPERACIONAIS/PESSOAL |
| 3.11 CREDITOS DE CLIENTES | OUTRAS_DESPESAS | crédito devolvido é redutor de receita | DEDUCOES/DEVOLUCOES |
| 5.5, 5.7, 5.8 | OUTRAS_DESPESAS | são CAPEX | INVESTIMENTOS/CAPEX |
| grupo INVESTIMENTOS | categorias mistas | INVESTIMENTOS × CAPEX | tudo CAPEX |
| — | inexistente | retirada dos sócios sumiu na remodelação de 04/2026 | 7.1 DISTRIBUICAO DE LUCROS e 7.2 APORTE (MOVIMENTACOES_SOCIOS, fora do resultado); 3.4.90 PRO-LABORE (PESSOAL, só se não houver) |
| — | inexistente | material do bar da loja | 3.5.17 MATERIAL BAR/EXPERIENCIA (MARKETING, só se não houver) |

Backfill incluído: todos os lançamentos re-derivam natureza/categoria pelo
`dados_extras.conta_numero` — o histórico conta a mesma história do plano novo.
Nada de status/valores/pagamentos é tocado.

Impacto de leitura no DRE: receita bruta CAI onde havia transferência/
empréstimo classificado (era inflação artificial). A margem após deduções
continua líquida de comissões — leitura de margem de contribuição, escolhida
pelo stakeholder. O backfill mantém o histórico comparável.

UX corrigida: dialog "Nova Conta" não permite mais criar GRUPO (lista fixa do
DRE); categoria continua livre. DRE exibe MOVIMENTACOES_* ao final, rotulados
"fora do resultado".

## Pendências

- [ ] Validar com a contabilidade o destino do 3.1.3 IRPF (folha × sócio).
- [ ] Rubricas: uma por sócio na 7.1 (retirada mensal sem passar pela Mesa).
- [ ] Conferir nos relatórios de RESULTADO (não só exibição) se
      MOVIMENTACOES_* e INVESTIMENTOS ficam fora do lucro líquido calculado.
