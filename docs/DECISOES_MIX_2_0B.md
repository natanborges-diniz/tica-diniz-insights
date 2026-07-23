# Decisões de produto — Fase 2.0b (checkpoint aprovado)

**Data:** 2026-07-23
**Contexto:** aprovação do checkpoint da Entrega 1 (motor participação 50/50 + Math.floor + cascata de mínimos). Decisões abaixo são autoridade sobre o comportamento futuro do módulo de mix.

## 1. Sub-linhas infantis são marcas separadas no mix

`RAYBAN JUNIOR`, `OAKLEY INFANTIL`, `VOGUE INFANTIL`, `PRADA LINEA ROSSA` permanecem cadastradas como grifes **distintas** no motor. Não devem ser fundidas com a marca-mãe durante o cálculo de participação nem em relatórios.

**Como aplicar:** sub-linha com participação baixa que o gestor queira preservar deve receber `marca_config.estrategica=true` para a loja específica — o motor já respeita o piso via cascata.

## 2. ANA HICKMANN e HICKMANN são marcas comercialmente distintas

Apesar da proximidade lexical (similaridade Jaccard 0.78) e do padrão de descrição parecido (`AR AHIC …`, `OC HICK …`), o stakeholder confirmou que são **duas grifes separadas** no negócio.

**Como aplicar:** nenhuma normalização/unificação deve ser aplicada. Se surgir sugestão automatizada de deduplicação futuramente, esse par fica na allowlist de "manter separado".

## 3. RAY BAN em Barueri — venda baixa é genuína

`RAY BAN` em Barueri: 8 peças / R$ 7.271 em 6 meses / 32 SKUs em estoque efetivo. Confirmado que não é fragmentação de dados (nenhum SKU Ray Ban órfão em outra grife, nomeação limpa). É um **achado de gestão**, não bug de dados.

**Como aplicar:** tratamento fica a critério do gestor. Candidata natural a `marca_config.estrategica=true` para Barueri se for decisão manter a presença. Sem ação automática.
