# Especificação Técnica: Módulo Estoque & OTB

## 📋 Visão Geral

O módulo unificado de **Estoque & OTB (Open-to-Buy)** é a central de inteligência para gestão de inventário e decisões de compra. Integra visualização completa do estoque, análise de giro, identificação de oportunidades e riscos, e planejamento de reposição.

---

## 🎯 Objetivos do Módulo

1. **Visibilidade Total**: Ver TODO o estoque físico (vendeu ou não nos últimos meses)
2. **Inteligência de Giro**: Identificar velocidade de venda por SKU/categoria/marca
3. **Gestão de Capital**: Detectar capital parado e oportunidades de liquidação
4. **Prevenção de Ruptura**: Alertar sobre itens críticos abaixo do mínimo
5. **Planejamento de Compras**: Sugerir o que comprar, quanto e de quem

---

## 📊 Estrutura de Abas

### Aba 1: "O que Fazer?" (Painel de Ações)
Resumo executivo com alertas priorizados e ações imediatas.

### Aba 2: "Visão Estoque" (Inventário Completo)
Lista de todos os SKUs com estoque físico, independente de vendas.

### Aba 3: "Análise OTB" (Planejamento de Compras)
Curva ABC, sugestões de mínimos, agrupamento por fornecedor/marca.

---

## 📈 KPIs Necessários

### KPIs Globais (Header)
| KPI | Descrição | Cálculo |
|-----|-----------|---------|
| **Total SKUs** | Quantidade de produtos únicos em estoque | COUNT(DISTINCT cod_sku) WHERE estoque_atual > 0 |
| **Total Peças** | Volume físico total de unidades | SUM(estoque_atual) WHERE estoque_atual > 0 |
| **Valor Estoque (Custo)** | Capital investido no inventário | SUM(estoque_atual * preco_custo) |
| **Valor Estoque (Venda)** | Potencial de faturamento | SUM(estoque_atual * preco_venda) |
| **Fornecedores Ativos** | Quantidade de fornecedores com estoque | COUNT(DISTINCT fornecedor) |
| **Marcas Ativas** | Quantidade de marcas com estoque | COUNT(DISTINCT marca) |

### KPIs de Saúde do Estoque
| KPI | Descrição | Cálculo |
|-----|-----------|---------|
| **SKUs Críticos** | Abaixo de 30% do mínimo | COUNT WHERE estoque < minimo * 0.3 |
| **SKUs p/ Comprar** | Abaixo do mínimo configurado | COUNT WHERE estoque < minimo |
| **SKUs OK** | Entre 100% e 200% do mínimo | COUNT WHERE estoque >= minimo AND estoque <= minimo * 2 |
| **SKUs Excesso** | Acima de 200% do mínimo | COUNT WHERE estoque > minimo * 2 |
| **SKUs Zerados** | Sem estoque (ruptura) | COUNT WHERE estoque_atual = 0 AND ativo = true |

### KPIs de Giro (baseado em vendas)
| KPI | Descrição | Cálculo |
|-----|-----------|---------|
| **Giro Médio (dias)** | Tempo médio para vender o estoque atual | estoque_atual / (qtd_vendida / dias_periodo) |
| **Cobertura Atual** | Quantos dias o estoque cobre | estoque_atual / venda_media_diaria |
| **% Curva A** | Participação dos itens de alto giro | COUNT Curva A / Total SKUs |
| **% Curva C** | Participação dos itens de baixo giro | COUNT Curva C / Total SKUs |
| **Dead Stock (peças)** | Estoque sem venda há +180 dias | SUM(estoque_atual) WHERE dias_sem_venda > 180 |
| **Dead Stock (R$)** | Valor do estoque parado | SUM(estoque_atual * preco_custo) WHERE dias_sem_venda > 180 |

---

## 🗄️ Endpoints Necessários

### Endpoint 1: Estoque Completo (NOVO/AJUSTADO)
**Rota**: `/api/v1/estoque/completo`  
**Propósito**: Retornar TODOS os SKUs com estoque físico > 0, independente de vendas

#### Parâmetros de Entrada
```json
{
  "empresa": "1" | "1,2,3" | "ALL",
  "categoria": "AR" | "LG" | "GC" | "AC" | "ALL",
  "dataReferencia": "2025-01-29"  // Data para snapshot do estoque
}
```

#### Campos de Saída (por SKU)
```json
{
  "cod_sku": 12345,
  "codigo_barra": "7891234567890",
  "descricao": "ARMAÇÃO RAY-BAN RB5154 2000 51",
  "categoria": "AR",
  "tipo": "ARMAÇÃO",
  "marca": "RAY-BAN",
  "fornecedor": "LUXOTTICA",
  "cod_fornecedor": 123,
  
  // Estoque
  "estoque_atual": 5,
  "estoque_reservado": 1,
  "estoque_disponivel": 4,
  
  // Custos e Preços
  "preco_custo": 150.00,
  "preco_venda": 450.00,
  "margem_percentual": 66.67,
  
  // Localização (se multi-loja)
  "cod_empresa": 1,
  "empresa_nome": "Antonio Agú",
  
  // Datas importantes
  "data_ultima_entrada": "2024-10-15",
  "data_ultima_venda": "2024-12-20",
  "dias_sem_venda": 40,
  "dias_em_estoque": 106,
  
  // Status calculado
  "ativo": true
}
```

---

### Endpoint 2: Análise de Giro e Vendas (EXISTENTE - AJUSTAR)
**Rota**: `/api/v1/vendas/analise-sku`  
**Propósito**: Análise de performance de vendas por SKU para cálculo de giro e curva ABC

#### Parâmetros de Entrada
```json
{
  "empresa": "1" | "1,2,3" | "ALL",
  "dataInicio": "2024-07-29",
  "dataFim": "2025-01-29",
  "categoria": "AR" | "LG" | "GC" | "AC" | "ALL"
}
```

#### Campos de Saída (por SKU com vendas)
```json
{
  "cod_sku": 12345,
  "descricao_item": "ARMAÇÃO RAY-BAN RB5154 2000 51",
  "marca": "RAY-BAN",
  "fornecedor": "LUXOTTICA",
  "tipo": "AR",
  
  // Estoque atual (snapshot)
  "estoque_atual": 5,
  
  // Métricas de Venda no Período
  "qtd_produtos": 12,           // Unidades vendidas
  "total_vendido": 5400.00,     // Faturamento
  "total_custo": 1800.00,       // Custo das vendas
  "margem_bruta": 3600.00,      // Lucro bruto
  "margem_percentual": 66.67,
  
  // Métricas de Giro
  "venda_media_diaria": 0.067,  // qtd_produtos / dias_periodo
  "dias_estoque": 75,           // estoque_atual / venda_media_diaria
  "giro_mensal": 2.4,           // (qtd_produtos / dias_periodo) * 30
  
  // Curva ABC (calculada pelo backend)
  "curva_abc": "A" | "B" | "C",
  "participacao_faturamento": 0.85,  // % do total vendido
  
  // Custos
  "caf": 150.00,                // Custo de Aquisição Final (último custo)
  "cmv": 150.00                 // Custo Médio de Venda
}
```

---

### Endpoint 3: Resumo por Fornecedor/Marca
**Rota**: `/api/v1/estoque/resumo-agrupado`  
**Propósito**: Visão consolidada para negociação com fornecedores

#### Parâmetros de Entrada
```json
{
  "empresa": "1",
  "dataInicio": "2024-07-29",
  "dataFim": "2025-01-29",
  "agrupamento": "fornecedor" | "marca" | "fornecedor_marca"
}
```

#### Campos de Saída
```json
{
  "fornecedor": "LUXOTTICA",
  "marca": "RAY-BAN",  // Quando agrupamento inclui marca
  
  // Totais de Estoque
  "total_skus": 45,
  "total_pecas": 234,
  "valor_estoque_custo": 35100.00,
  "valor_estoque_venda": 105300.00,
  
  // Totais de Vendas (período)
  "total_vendido_unidades": 156,
  "total_vendido_valor": 70200.00,
  "margem_media": 65.5,
  
  // Classificações
  "skus_curva_a": 12,
  "skus_curva_b": 18,
  "skus_curva_c": 15,
  
  // Saúde do Estoque
  "skus_criticos": 3,      // < 30% do mínimo
  "skus_para_comprar": 8,  // < 100% do mínimo
  "skus_excesso": 5,       // > 200% do mínimo
  "skus_dead_stock": 7,    // Sem venda há +180 dias
  
  // OTB Calculado
  "otb_unidades": 45,      // Total de unidades a comprar
  "otb_valor": 6750.00     // Investimento necessário
}
```

---

### Endpoint 4: Histórico de Movimentação
**Rota**: `/api/v1/estoque/movimentacao`  
**Propósito**: Rastrear entradas e saídas para análise de tendência

#### Parâmetros de Entrada
```json
{
  "empresa": "1",
  "cod_sku": 12345,  // Opcional - se vazio, traz resumo geral
  "dataInicio": "2024-01-01",
  "dataFim": "2025-01-29",
  "tipoMovimento": "ENTRADA" | "SAIDA" | "ALL"
}
```

#### Campos de Saída
```json
{
  "data_movimento": "2024-10-15",
  "tipo": "ENTRADA" | "SAIDA",
  "subtipo": "COMPRA" | "VENDA" | "DEVOLUCAO" | "TRANSFERENCIA" | "AJUSTE",
  "cod_sku": 12345,
  "descricao": "ARMAÇÃO RAY-BAN...",
  "quantidade": 10,
  "valor_unitario": 150.00,
  "valor_total": 1500.00,
  "documento": "NF-12345",
  "fornecedor": "LUXOTTICA",  // Para entradas
  "cod_empresa_origem": null,  // Para transferências
  "cod_empresa_destino": 1
}
```

---

### Endpoint 5: Sugestão de Mínimos por IA
**Rota**: `/api/v1/estoque/sugestao-minimos`  
**Propósito**: Calcular mínimos ideais baseado em vendas e rupturas

#### Parâmetros de Entrada
```json
{
  "empresa": "1",
  "categoria": "AR" | "ALL",
  "periodoAnalise": 180  // dias para análise
}
```

#### Campos de Saída
```json
{
  "categoria": "AR",
  "curva_abc": "A",
  
  // Métricas base
  "venda_media_diaria": 2.5,
  "cobertura_ideal_dias": 30,
  "taxa_ruptura_atual": 15.5,  // % de dias sem estoque
  
  // Sugestão
  "minimo_sugerido": 4,
  "justificativa": "Curva A com alta ruptura (15%). Sugerido mínimo de 4 unidades para garantir 30 dias de cobertura.",
  
  // Comparativo
  "minimo_atual_configurado": 2,
  "diferenca": 2,
  "acao": "AUMENTAR"  // AUMENTAR | DIMINUIR | MANTER | NOVO
}
```

---

## 🔄 Lógica de Negócio (Frontend)

### Cálculo da Curva ABC
```
1. Ordenar SKUs por total_vendido DESC
2. Calcular participação acumulada
3. Curva A: Primeiros 80% do faturamento
4. Curva B: Próximos 15% do faturamento
5. Curva C: Últimos 5% do faturamento
```

### Classificação de Ação
```
IF estoque_atual = 0 AND ativo = true:
  → RUPTURA (vermelho crítico)
  
IF estoque_atual < minimo * 0.3:
  → COMPRAR_URGENTE (vermelho)
  
IF estoque_atual < minimo:
  → COMPRAR (laranja)
  
IF estoque_atual >= minimo AND estoque_atual <= minimo * 2:
  → ESTOQUE_OK (verde)
  
IF estoque_atual > minimo * 2:
  → EXCESSO (azul - considerar liquidação)
  
IF dias_sem_venda > 180:
  → DEAD_STOCK (cinza - capital parado)
```

### Cálculo OTB
```
OTB = MAX(0, minimo_configurado - estoque_atual)

// Por fornecedor
OTB_Fornecedor = SUM(OTB) WHERE fornecedor = X
Investimento = SUM(OTB * preco_custo) WHERE fornecedor = X
```

---

## 🎨 Filtros do Dashboard

| Filtro | Opções | Comportamento |
|--------|--------|---------------|
| **Empresa** | Dropdown com lojas | Obrigatório. Recalcula tudo |
| **Período** | Date range (vendas) | Afeta giro e curva ABC |
| **Categoria** | AR, LG/GC, AC, Todos | Filtra e recalcula KPIs |
| **Curva ABC** | A, B, C, Todas | Filtra e recalcula KPIs |
| **Fornecedor** | Dropdown dinâmico | Filtra tabela |
| **Marca** | Dropdown dinâmico | Filtra tabela |
| **Ação** | COMPRAR_URGENTE, COMPRAR, OK, EXCESSO | Filtra tabela |
| **Busca** | Texto livre | Busca em descrição, código, marca |

---

## 📱 Responsividade

- **Desktop**: Layout completo com todas as colunas
- **Tablet**: Colunas secundárias ocultadas
- **Mobile**: Cards empilhados, tabela com scroll horizontal

---

## 🔗 Integrações

### Tabelas Supabase Existentes
- `estoque_minimo_loja`: Configuração de mínimos por loja/categoria/curva
- `fornecedor_marca`: Mapeamento fornecedor → marca

### Dados do Firebird (via Bridge)
- Estoque físico atual
- Histórico de vendas
- Cadastro de produtos
- Movimentação de estoque

---

## ✅ Checklist para Validação Backend

### Endpoint `/estoque/completo`
- [ ] Retorna TODOS os SKUs com estoque > 0 (não apenas os que venderam)
- [ ] Inclui data da última venda (mesmo se nunca vendeu = null)
- [ ] Inclui data da última entrada
- [ ] Calcula dias_sem_venda corretamente
- [ ] Retorna preço de custo e preço de venda
- [ ] Fornecedor nunca é nulo (usar "DESCONHECIDO" se vazio)
- [ ] Marca nunca é nula (usar "SEM MARCA" se vazio)

### Endpoint `/vendas/analise-sku`
- [ ] Retorna giro calculado (dias_estoque)
- [ ] Retorna curva ABC calculada
- [ ] Retorna margem percentual
- [ ] Estoque atual bate com endpoint de estoque completo
- [ ] Período de vendas é respeitado corretamente

### Endpoint `/estoque/resumo-agrupado`
- [ ] Agrupa corretamente por fornecedor e/ou marca
- [ ] Calcula totais de estoque e vendas
- [ ] Inclui contagem por curva ABC
- [ ] Inclui OTB calculado por grupo

---

## 📝 Observações Importantes

1. **Consistência de Dados**: O campo `estoque_atual` DEVE ser idêntico em todos os endpoints para o mesmo SKU/empresa/data.

2. **Dead Stock**: Produtos que estão há mais de 180 dias sem venda devem ser claramente identificados para ações de liquidação.

3. **Fornecedor Obrigatório**: Nunca retornar fornecedor nulo. Se o cadastro não tem, usar "FORNECEDOR DESCONHECIDO".

4. **Performance**: Para lojas com +5000 SKUs, considerar paginação ou lazy loading.

5. **Cache**: Dados de estoque podem ter cache de 15-30 minutos. Dados de vendas podem ter cache de 1 hora.

---

## 🚀 Próximos Passos

1. **Backend**: Validar e ajustar endpoints conforme especificação
2. **Frontend**: Implementar consumo dos novos endpoints
3. **Testes**: Validar consistência de dados entre endpoints
4. **Deploy**: Disponibilizar em produção

---

*Documento gerado em: 29/01/2025*
*Versão: 1.0*
