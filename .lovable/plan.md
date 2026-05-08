## Objetivo

Responder às 3 dúvidas levantadas e entregar um checklist de QA para validar que itens `SEM CADASTRO` não poluem mais os KPIs de liquidação. Inclui correções pequenas de UI/dados onde a ambiguidade vem do código.

---

## 1) Respostas às dúvidas

### a) "DINIZ BARUERI • 1.388 peças em estoque • 1174 SKUs • Período: 180 dias" — ambíguo
Concordo. O endpoint `/estoque/completo` retorna **inventário físico atual** (snapshot agora). Os 180 dias só se aplicam às métricas de **vendas/giro** que vêm de `/vendas/analise-sku` (mesclado por `cod_sku`).

**Correção proposta (UI only, em `VisaoEstoquePage.tsx` e `AnaliseOTBPage.tsx`):**
Trocar a linha única atual por duas informações separadas:
```
DINIZ BARUERI
Estoque: 1.388 peças • 1.174 SKUs (posição agora)
Vendas: últimos 180 dias
```
Sem mudar nenhuma lógica de cálculo.

### b) Mesmo SKU repetido (1761149 aparecendo duas vezes com fornecedores diferentes)
Origem confirmada: o Firebird Bridge `/estoque/completo` está retornando **uma linha por vínculo SKU↔fornecedor** (no print: `AVODAH ACESSORIO EIRELI` e `A-ACESSORIOS OPTICAL LTDA` para o mesmo `cod_sku=1761149`). Hoje o frontend não deduplica — cada linha vira uma row independente, o que **infla peças, valor e contagem de "LIQUIDA 30%"**.

**Correção proposta (`estoqueCompletoService.ts`):** deduplicar por `cod_sku` mantendo o fornecedor "preferencial" (regra: o que tem `data_ultima_entrada` mais recente; empate → ordem alfabética). Logar quantas linhas foram colapsadas para auditoria.

Impacto esperado: 1.388 peças continua igual (já está somando estoque do SKU, não do vínculo, no Bridge — confirmar) **ou** cai para o número correto após dedupe. O QA abaixo cobre os dois cenários.

### c) O que é "Dead Stock"?
Definido em `estoqueCompletoService.ts` linha 178: **`isDeadStock = diasEmEstoque > 180`** (mais de 180 dias desde a última entrada na loja, sem giro). É independente da `acaoSugerida`. O card "Dead Stock" mostra peças e % do estoque com `diasEmEstoque > 180`.

**Correção proposta (UI only):** adicionar tooltip no card explicando "Peças paradas há mais de 180 dias desde a última entrada".

---

## 2) Checklist de QA — `SEM CADASTRO` não polui KPIs de liquidação

Loja recomendada: **DINIZ BARUERI**. Repetir em pelo menos 1 outra loja (ex.: RJ1062) para garantir.

### Pré-condição
- [ ] Limpar cache do estoque (botão "Carregar Dados" em Visão Estoque)
- [ ] Confirmar que `acaoSugerida = 'SEM CADASTRO'` está sendo gerado pelo backend ou pelo fallback do `estoqueCompletoService.ts` (linhas 117–127)

### KPIs (Visão Estoque → card "Peças p/ Liquidar")
- [ ] Número do card = soma de `estoqueAtual` apenas de itens com `acaoSugerida` contendo `LIQUIDA` (`LIQUIDA 20%`, `LIQUIDA 30%`, `LIQUIDA 50%`)
- [ ] Itens com `acaoSugerida = 'SEM CADASTRO'` **NÃO** entram nesse total
- [ ] Aplicar filtro Categoria=Armações → KPI recalcula e ainda exclui SEM CADASTRO

### Tabela detalhada (Visão Estoque)
- [ ] Filtrar coluna "Ação" por `SEM CADASTRO` retorna lista esperada
- [ ] Filtrar por `LIQUIDA 50%` não traz nenhum item com `precoCusto = 0` E `diasEmEstoque = 0` E `qtdVendidos = 0`
- [ ] Exportar CSV → abrir e confirmar que nenhuma linha `LIQUIDA *` tem os 3 zeros simultâneos

### Plano de Compra (`AnaliseOTBPage`)
- [ ] Card "Capital em Risco" (dead stock valor) exclui itens SEM CADASTRO
- [ ] Bloco "Estoque doente" por marca não mostra itens SEM CADASTRO
- [ ] Mix Ideal por subcategoria continua somando os SEM CADASTRO no estoque (eles existem fisicamente) mas não como ação de liquidação

### Persistência entre páginas
- [ ] Carregar Barueri em Visão Estoque → ir para Plano de Compra → mesma loja, mesmos números, sem reload
- [ ] Indicador `EstoqueLoadStatus` mostra "carregado há Xmin" nas duas páginas

### Logs / Backend
- [ ] Console: `[estoqueCompletoService] Contagem por tipo` deve listar quantos SEM CADASTRO existem
- [ ] Documentar em `docs/estoque-fase-1.md` quantos SKUs Barueri caíram em SEM CADASTRO e listar 5 exemplos para investigação no ERP

### Regressão
- [ ] Total em Estoque (peças e SKUs) **não** mudou após o patch defensivo
- [ ] Dead Stock continua usando `diasEmEstoque > 180` (independente da ação)

---

## 3) Mudanças de código propostas (pequenas, UI + 1 service)

| Arquivo | Mudança |
|---|---|
| `src/pages/estoque/VisaoEstoquePage.tsx` | Header em duas linhas: "Estoque (posição agora)" vs "Vendas (180d)"; tooltip no card Dead Stock |
| `src/pages/estoque/AnaliseOTBPage.tsx` | Mesmo header reescrito |
| `src/services/estoqueCompletoService.ts` | Dedupe por `cod_sku` mantendo fornecedor preferencial + log de colapsos |
| `docs/estoque-fase-1.md` | Anexar este checklist + resultado do QA em Barueri |

Sem mudanças de schema, sem mudanças no Bridge, sem mexer em lógica de classificação além do que já foi feito.
