# Manual do Módulo OTB (Open to Buy)

## 📋 O que é o OTB?

O **OTB (Open to Buy)** é uma ferramenta de **avaliação mensal de compras** que analisa seu estoque atual em relação ao **mínimo configurado por loja** para indicar exatamente **o que comprar, quanto comprar e com qual urgência**.

### Fórmula Principal

```
OTB = Mínimo por Loja - Estoque Atual
```

- **Mínimo por Loja**: quantidade mínima configurada por categoria/curva ABC
- **Estoque Atual**: quantidade em estoque no momento
- Se OTB > 0 → Precisa comprar
- Se OTB = 0 → Estoque OK

---

## 🚀 Como Usar

### 1. Acessar o Módulo
Navegue até **IA > OTB** no menu lateral.

### 2. Configurar Parâmetros
Na seção "Parâmetros de Análise":

| Parâmetro | Descrição | Valor Padrão |
|-----------|-----------|--------------|
| **Empresa** | Loja a ser analisada (ou "Todas") | Todas |
| **Período Base Início/Fim** | Período para calcular vendas e curva ABC | Últimos 180 dias |
| **Categoria** | Filtrar por tipo de produto | Todas |

### 3. Calcular OTB
Clique em **"Calcular OTB"** para processar os dados.

### 4. Analisar Resultados
O sistema apresenta duas visões:
- **Aba "O que Fazer?"**: Painel de ações priorizadas
- **Aba "Análise Detalhada"**: KPIs, gráficos e tabelas completas

---

## 📊 Classificações de SKU

Cada produto recebe uma classificação automática baseada no estoque vs mínimo configurado:

| Classificação | Critério | Ação |
|---------------|----------|------|
| 🔴 **Comprar Urgente** | Estoque < 30% do mínimo | Comprar imediatamente |
| 🟠 **Comprar** | Estoque abaixo do mínimo | Incluir no próximo pedido |
| 🟢 **Estoque OK** | Entre 100% e 200% do mínimo | Monitorar |
| ⚪ **Excesso** | Estoque > 2x o mínimo | Considerar promoção |

---

## 📈 Curva ABC

O sistema classifica automaticamente os produtos pela **curva ABC de giro**:

| Curva | Participação nas Vendas | Mínimo Sugerido |
|-------|------------------------|-----------------|
| **A** | 80% do faturamento | 3-4 unidades (nunca pode faltar) |
| **B** | 15% do faturamento | 2-3 unidades |
| **C** | 5% do faturamento | 1 unidade (exposição) |

---

## 🎯 Painel de Ações - Os 3 Pilares

### 1. Risco de Ruptura 🔴
- **Curva A em ruptura crítica** (< 30% do mínimo): Ação imediata!
- **Abaixo do mínimo configurado**: Incluir no pedido

### 2. Capital Parado 🔵
- **Curva C parada há +180 dias**: Capital congelado
- **Estoque acima de 2x o mínimo**: Dinheiro parado

### 3. Saúde do Mix 🟣
- **Curva A zerada**: Perdendo vendas agora
- **Sem venda há 90+ dias**: Produto dormindo

---

## ⚙️ Configurações

### Estoque Mínimo por Loja
O sistema utiliza uma tabela de **mínimo por loja, categoria e curva ABC**. Este mínimo é a base do cálculo OTB.

**Configuração automática via IA:**
1. O sistema analisa os dados de vendas e rupturas
2. Sugere mínimos baseados na realidade do negócio
3. Exibe comparativo: **Atual vs Sugerido**
4. Clique em "Aplicar Sugestões" para salvar

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
| **Urgente** | SKUs abaixo de 30% do mínimo |
| **Comprar** | SKUs abaixo do mínimo |
| **Margem** | Margem bruta média |

### Expandir Detalhes
Clique em uma linha para ver os SKUs individuais daquele fornecedor/marca.

---

## 📆 Fluxo de Trabalho Mensal

O OTB foi desenhado para um **processo mensal de compras**:

### Semana 1-2: Análise
1. Acesse o OTB
2. Selecione a loja
3. Calcule o OTB
4. Revise e aplique as sugestões de mínimo da IA

### Semana 2-3: Decisão
1. Analise o Painel de Ações
2. Identifique os fornecedores prioritários
3. Exporte a lista de compras

### Semana 3-4: Execução
1. Faça os pedidos aos fornecedores
2. Acompanhe entregas
3. Atualize o estoque no sistema

---

## 📤 Exportação

O módulo permite exportar os dados para Excel/PDF:
- Lista completa de SKUs a comprar
- Agrupamento por fornecedor
- Investimento necessário por fornecedor
- Classificações e prioridades

---

## ❓ FAQ

### Por que o OTB de um produto é zero?
O estoque atual já está igual ou acima do mínimo configurado.

### Por que alguns produtos aparecem como "Excesso"?
O estoque atual é maior que 2x o mínimo configurado. Considere promoções.

### Como a Curva ABC é calculada?
Ordenamos todos os produtos por valor de venda. Os 80% do topo são Curva A, os próximos 15% são B, e o restante é C.

### Preciso configurar mínimos antes de usar?
A IA sugere mínimos automaticamente baseada nos dados de vendas. Você pode revisar e aplicar as sugestões.

### Posso usar o OTB para múltiplas lojas ao mesmo tempo?
Sim, selecione "Todas" no filtro de empresa para uma visão consolidada. Para configurar mínimos, selecione uma loja específica.

---

## 📞 Suporte

Em caso de dúvidas sobre o módulo OTB, entre em contato com a equipe de suporte.
