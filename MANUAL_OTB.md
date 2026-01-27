# Manual do Módulo OTB (Open to Buy)

## 📋 O que é o OTB?

O **OTB (Open to Buy)** é uma ferramenta de **avaliação mensal de compras** que analisa seu estoque atual e histórico de vendas para indicar exatamente **o que comprar, quanto comprar e com qual urgência**.

### Fórmula Principal

```
OTB = MAX(Venda Diária × Dias de Cobertura, Mínimo Loja) - Estoque Atual
```

- **Venda Diária**: média de vendas por dia no período analisado (padrão: últimos 180 dias)
- **Dias de Cobertura**: quantos dias de estoque você quer manter (padrão: 60 dias)
- **Mínimo Loja**: quantidade mínima configurada por categoria/curva ABC
- **Estoque Atual**: quantidade em estoque no momento

---

## 🚀 Como Usar

### 1. Acessar o Módulo
Navegue até **IA > OTB** no menu lateral.

### 2. Configurar Parâmetros
Na seção "Parâmetros de Análise":

| Parâmetro | Descrição | Valor Padrão |
|-----------|-----------|--------------|
| **Empresa** | Loja a ser analisada (ou "Todas") | Todas |
| **Período Base Início/Fim** | Período para calcular média de vendas | Últimos 180 dias |
| **Cobertura (dias)** | Meta de dias de estoque | 60 dias |
| **Categoria** | Filtrar por tipo de produto | Todas |

### 3. Calcular OTB
Clique em **"Calcular OTB"** para processar os dados.

### 4. Analisar Resultados
O sistema apresenta duas visões:
- **Aba "O que Fazer?"**: Painel de ações priorizadas
- **Aba "Análise Detalhada"**: KPIs, gráficos e tabelas completas

---

## 📊 Classificações de SKU

Cada produto recebe uma classificação automática:

| Classificação | Critério | Ação |
|---------------|----------|------|
| 🔴 **Comprar Urgente** | Estoque < 15 dias de venda | Comprar imediatamente |
| 🟠 **Comprar** | OTB > 0 (precisa repor) | Incluir no próximo pedido |
| 🟢 **Estoque OK** | Cobertura dentro da meta | Monitorar |
| ⚪ **Excesso** | Estoque > 2x a cobertura meta | Considerar promoção |

---

## 📈 Curva ABC

O sistema classifica automaticamente os produtos pela **curva ABC de giro**:

| Curva | Participação nas Vendas | Recomendação |
|-------|------------------------|--------------|
| **A** | 80% do faturamento | Nunca deixar faltar |
| **B** | 15% do faturamento | Manter cobertura |
| **C** | 5% do faturamento | Estoque mínimo |

---

## 🎯 Painel de Ações - Os 3 Pilares

### 1. Risco de Ruptura 🔴
- **Curva A em ruptura crítica** (< 7 dias): Ação imediata!
- **Compra urgente geral** (< 15 dias): Incluir no pedido

### 2. Capital Parado 🔵
- **Curva C com excesso** (> 180 dias): Capital congelado
- **Estoque acima do ideal** (> 2x meta): Dinheiro parado

### 3. Saúde do Mix 🟣
- **Curva A zerada**: Perdendo vendas agora
- **Sem venda há 90+ dias**: Produto dormindo

---

## ⚙️ Configurações

### Estoque Mínimo por Loja
O sistema permite configurar um **mínimo de estoque por loja, categoria e curva ABC**. Este mínimo é usado como piso no cálculo OTB.

**Como funciona:**
1. A IA calcula sugestões baseada nos dados reais de vendas
2. O sistema compara com o mínimo configurado
3. A tabela comparativa mostra: **Atual vs Sugerido**

**Lógica de sugestão da IA:**
- **Curva A**: Mínimo 3-4 unidades (produtos TOP não podem faltar)
- **Curva B**: Mínimo 2-3 unidades
- **Curva C**: Mínimo 1 unidade (exposição)
- Se há muita ruptura, os valores são aumentados automaticamente

### Mapeamento Fornecedor/Marca
Configure quais marcas pertencem a quais fornecedores para agrupar corretamente os pedidos de compra.

---

## 📂 Filtros e Categorias

O OTB suporta filtro por categoria de produto:

| Categoria | Código ERP | Descrição |
|-----------|------------|-----------|
| **Armações** | AR, ARMAC | Óculos de armação |
| **Lentes** | LG, GC, LENT | Lentes de grau e contato |
| **Acessórios** | AC, ACESS | Acessórios óticos |
| **Outros** | - | Demais produtos |

> **Importante**: Ao mudar o filtro de categoria, todos os KPIs, gráficos e sugestões da IA são recalculados automaticamente.

---

## 📋 Tabela de Análise

### Agrupamento
Escolha entre visualizar por:
- **Fornecedor**: Agrupa todos os produtos do mesmo fornecedor
- **Marca**: Agrupa por fornecedor e marca

### Colunas
| Coluna | Descrição |
|--------|-----------|
| **SKUs** | Quantidade de produtos |
| **Estoque** | Total de peças em estoque |
| **Vendidos** | Quantidade vendida no período |
| **OTB (un)** | Unidades a comprar |
| **OTB (R$)** | Valor a investir (preço de custo) |
| **Urgente** | SKUs com estoque < 15 dias |
| **Comprar** | SKUs com OTB > 0 |
| **Margem** | Margem bruta média |

### Expandir Detalhes
Clique em uma linha para ver os SKUs individuais daquele fornecedor/marca.

---

## 🤖 Sugestões da IA

O sistema usa Inteligência Artificial para:

1. **Analisar a saúde do estoque** por categoria
2. **Sugerir cobertura ideal** baseada no giro real
3. **Comparar mínimos configurados** vs recomendados
4. **Alertar sobre anomalias** (excesso, ruptura, etc.)

### Como usar
1. Clique em **"Análise IA"** na seção de sugestões
2. Aguarde a análise (pode levar alguns segundos)
3. Revise as recomendações
4. Aplique a cobertura sugerida se desejar

---

## 📆 Fluxo de Trabalho Mensal

O OTB foi desenhado para um **processo mensal de compras**:

### Semana 1-2: Análise
1. Acesse o OTB
2. Selecione a loja ou "Todas"
3. Calcule o OTB com cobertura de 60 dias
4. Analise o Painel de Ações

### Semana 2-3: Decisão
1. Identifique os fornecedores prioritários
2. Exporte a lista de compras
3. Negocie com fornecedores

### Semana 3-4: Execução
1. Faça os pedidos
2. Acompanhe entregas
3. Atualize o estoque no sistema

---

## 📤 Exportação

O módulo permite exportar os dados para Excel/PDF:
- Lista completa de SKUs a comprar
- Agrupamento por fornecedor
- Investimento necessário por fornecedor
- Justificativas e classificações

---

## ❓ FAQ

### Por que o OTB de um produto é zero?
O estoque atual já cobre a meta de cobertura configurada.

### Por que alguns produtos aparecem como "Excesso"?
O estoque atual é maior que 2x a cobertura meta. Considere promoções.

### Como a Curva ABC é calculada?
Ordenamos todos os produtos por valor de venda. Os 80% do topo são Curva A, os próximos 15% são B, e o restante é C.

### O mínimo por loja substitui o cálculo de cobertura?
Não. O sistema usa o **maior valor** entre (Venda Diária × Cobertura) e (Mínimo Loja).

### Posso usar o OTB para múltiplas lojas ao mesmo tempo?
Sim, selecione "Todas" no filtro de empresa para uma visão consolidada.

---

## 📞 Suporte

Em caso de dúvidas sobre o módulo OTB, entre em contato com a equipe de suporte.
