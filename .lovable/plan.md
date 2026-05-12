## Contexto

O Bridge entregou (commit `af64a42`):

- `/api/v1/estoque/completo` agora retorna `tipo` (código real do ERP: `AR`, `OC`, `LG`, etc.), `subcategoria` (`AR_RX | AR_SOLAR | LENTES | ACESSORIOS | OUTROS`) e métricas de giro real:
  - `dias_giro_medio`
  - `dias_giro_mediano`
  - `dias_giro_ultima_peca`
  - `pecas_vendidas_consideradas`
- `/api/v1/vendas/analise-sku` recebeu os mesmos campos (subcategoria + giro real), calculados sobre a janela consultada.
- Novo alias `GET /api/v1/estoque/analise-sku` (mesmo controller de `/vendas/analise-sku`).
- Regra mantida: 1 linha por `cod_sku`, estoque consolidado.
- Aproximação documentada: o giro usa "última entrada anterior/igual à venda" quando não há lote/serial.

Hoje o frontend deriva subcategoria por regex em `tipo`/descrição e calcula `vendaDiaria = qtdVendidos / 180`, o que penaliza injustamente itens novos e mascara peças lentas. É isso que vamos corrigir.

## Objetivo

1. Trocar a derivação local de subcategoria pelo campo enviado pelo Bridge (com fallback ao regex como rede de segurança).
2. Substituir a métrica "velocidade por dia" por **dias reais de giro** (médio, mediano e última peça).
3. Refazer Curva ABC e decisões do Plano de Compra (`REPOR / TROCAR / OBSERVAR / LIQUIDAR`) usando o giro real, não a média diluída.
4. Destravar o filtro Solar (subcategoria `AR_SOLAR`) que hoje vem vazio.

## Escopo de alterações (todas frontend)

### 1. `src/services/estoqueCompletoService.ts`
- Adicionar ao `EstoqueCompletoRaw` e `EstoqueCompleto`: `subcategoria`, `dias_giro_medio`, `dias_giro_mediano`, `dias_giro_ultima_peca`, `pecas_vendidas_consideradas`.
- Mapear `tipo` direto do ERP (`AR`, `OC`, `LG`, …) sem reagrupar para `ARMACOES/LENTES/OUTROS`.
- Manter `categorizarPorDescricao` apenas como fallback se `tipo` vier vazio.
- Logs: contagem por `subcategoria` (esperar `AR_SOLAR > 0` em Barueri).

### 2. `src/services/vendasService.ts` (`AnaliseSku`)
- Mesmos campos novos: `subcategoria`, `dias_giro_medio`, `dias_giro_mediano`, `dias_giro_ultima_peca`, `pecas_vendidas_consideradas`.
- Não mexer no `giroEstoque` atual (proporção qtd/estoque) — vira métrica complementar.

### 3. `src/utils/categorizarProduto.ts`
- Aceitar a `subcategoria` vinda do backend como fonte canônica.
- Manter `subcategorizarProduto`/`subcategorizarPorDescricao` como **fallback** rotulado nos comentários.

### 4. `src/hooks/useEstoqueUnificado.ts` (núcleo da inteligência)
- `ItemEstoque`: novos campos `diasGiroMedio`, `diasGiroMediano`, `diasGiroUltimaPeca`, `pecasGiroConsideradas`.
- Preferir `subcategoria` enviada pelo Bridge (estoque OU vendas), fallback para `subcategorizarProduto(tipo)`.
- Substituir `vendaDiaria = qtdVendidos / 180` pela exibição/uso de `diasGiroMediano` (mais robusto que a média).
- Recalcular `coberturaDias`:
  - Se `diasGiroMediano > 0`: `cobertura ≈ estoqueAtual * diasGiroMediano` (dias até esgotar mantendo o ritmo real).
  - Se sem giro: marcar como `Sem giro` (não 999 numérico mascarado).
- Repensar `decisaoSku`:
  - `REPOR`: `pecasGiroConsideradas ≥ N` E `diasGiroMediano ≤ alvo` E `coberturaDias < diasAlvo`.
  - `TROCAR`: estoque > 0, `pecasGiroConsideradas == 0`, `diasEmEstoque ≥ 180`.
  - `LIQUIDAR`: idem, mas `diasEmEstoque ≥ 270`.
  - `OBSERVAR`: vendeu pouco mas `diasGiroMediano > alvo` (peça lenta — não é prioridade de recompra).
- `qtdAComprar` na lista de SKUs a repor passa a usar `diasGiroMediano` para projetar quantidade no horizonte do `diasAlvo`.

### 5. UI — `VisaoEstoquePage` / `AnaliseOTBPage` / `OQueFazerPage` + tabela de SKUs
- Coluna "Velocidade/dia (0,01)" vira **"Giro mediano"** com sufixo `dias` e tooltip explicando a fonte (`MAX(data_venda - data_entrada)` aproximado).
- Adicionar coluna secundária "Última peça (dias)" para mostrar se a última saída foi rápida ou lenta.
- Filtro `Subcategoria` agora populará `AR_SOLAR` corretamente (chip "Solar" deve trazer dados).
- Chip de `decisaoSku` ganha tooltip com `dias_giro_mediano` + `pecas_vendidas_consideradas` para justificar a sugestão.

### 6. `firebird-bridge/CONTRACT.md`
- Atualizar a documentação local com os novos campos e o alias `/estoque/analise-sku`, espelhando o que o Bridge publicou. Sem mudança de código no Bridge — é só sincronizar contrato.

## Detalhes técnicos

```text
Pipeline atualizado por SKU
─────────────────────────────
Bridge → tipo (AR/OC/LG/…) + subcategoria (AR_RX/AR_SOLAR/…)
       → dias_giro_medio / mediano / ultima_peca
       → pecas_vendidas_consideradas

Frontend (useEstoqueUnificado)
       → categoria/subcategoria do backend (fallback regex)
       → diasGiroMediano substitui vendaDiaria como medida principal
       → coberturaDias = estoqueAtual × diasGiroMediano
       → decisaoSku considera giro real + amostra (pecasGiroConsideradas)
       → qtdAComprar = ceil(diasAlvo / diasGiroMediano) − estoqueAtual
```

Edge cases:
- `pecas_vendidas_consideradas = 0` → não classifica como `REPOR`; cai para `OBSERVAR`/`TROCAR`/`LIQUIDAR` conforme `diasEmEstoque`.
- `diasGiroMediano` ausente (peça nova sem venda) → mostrar `—` na UI.
- Subcategoria ausente → fallback `subcategorizarProduto(tipo)` continua valendo (mantém compatibilidade caso o Bridge regrida).

## Fora do escopo

- Mudanças de business rules de mix ideal e cobertura-alvo (planeja-se para fase seguinte).
- Persistência de novas configurações em Supabase.
- Alterações no Bridge (já entregues).

## QA

Loja recomendada: **DINIZ BARUERI**.
- Filtro `Solar` deve trazer SKUs (chave `AR_SOLAR`).
- Tabela mostra `Giro mediano (dias)` em vez de `Velocidade 0,01`.
- SKU campeão (vendeu rápido logo após entrada) deve aparecer como `REPOR` mesmo com poucas vendas absolutas.
- SKU enganoso (vendeu só no fim dos 180d) deve cair em `OBSERVAR`/`TROCAR`, não em `REPOR`.
- Nenhuma regressão em "Peças p/ Liquidar" e "SEM CADASTRO".
