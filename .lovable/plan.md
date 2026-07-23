## Diagnóstico

Hoje existem dois cards separados (`ComparativoAnualChart` e `ComparativoMensalChart`), cada um com sua lógica de seleção de anos/meses. Quando várias lojas estão selecionadas no filtro global, o eixo X mistura período + loja no mesmo rótulo (`"2024 · Loja X"`), o que fica visualmente confuso e às vezes o nome não aparece porque:

- Quando o filtro global está em `"todas"` (sem multi-select real), o hook trata como agregado único e não itera por loja → some o nome.
- Quando há multi-select mas o rótulo é longo, o `XAxis` corta o texto.

## Objetivo

Substituir os dois cards por **um único painel "Comparativo"** com:

1. **Período base** = período do filtro global da página (sempre). Mostrado como leitura, não editável no painel.
2. **Período de comparação** = escolhido pelo usuário no próprio painel, com presets rápidos (mesmo período ano anterior, mês anterior, mês customizado, ano customizado) + opção livre "data inicial → data final".
3. **Lojas** = as do filtro global. Se >1, gera séries lado a lado.
4. **Indicador** = seletor (faturamento, ticket, qtd, desconto, etc).

## Layout do gráfico (chave da clareza)

Agrupamento por **loja** no eixo X, com duas barras coladas por loja (base vs comparação). Assim o nome da loja aparece uma única vez, grande, e a comparação fica visualmente óbvia.

```text
Faturamento
│
│  ██ ▓▓        ██ ▓▓        ██ ▓▓
│  ██ ▓▓        ██ ▓▓        ██ ▓▓
│  ██ ▓▓        ██ ▓▓        ██ ▓▓
└──Loja Centro──Loja Sul────Loja Norte──
     ██ Base (21/nov–20/dez 2026)
     ▓▓ Comparação (21/nov–20/dez 2025)
```

Quando só há 1 loja, o mesmo layout funciona — mostra uma única categoria no X.
Quando o usuário escolhe "TOTAL agregado" no seletor do painel, mostra apenas uma categoria "Todas as lojas" com 2 barras.

Abaixo do gráfico:
- Chips de variação % por loja (Base vs Comparação), com cor verde/vermelha respeitando semântica do indicador.
- Tabela detalhada: uma linha por loja, colunas Base | Comparação | Δ absoluto | Δ %.

## Controles do painel

```text
┌─ Comparativo ─────────────────────────────────────────────┐
│ Base: 21/nov → 20/dez 2026  ·  3 lojas (do filtro)        │
│                                                            │
│ Comparar com: [Ano anterior ▾]   Indicador: [Faturamento▾]│
│   presets: [Ano anterior] [Mês anterior] [Personalizado…] │
│                                                            │
│ Agrupar: (•) Por loja  ( ) Total agregado                 │
└────────────────────────────────────────────────────────────┘
```

"Personalizado…" abre dois date pickers (data inicial / data final) — sem limite de duração, mas alerta se o range for muito diferente do base.

## Mudanças técnicas

1. **Novo componente** `src/components/sales-dashboard/ComparativoPanel.tsx` — substitui os dois cards atuais no `VendasDashboardLayout`.
2. **Novo hook** `src/hooks/useComparativoPeriodos.ts` — recebe `{ baseInicio, baseFim, compInicio, compFim, empresas[], empresasCatalogo }`, faz 2×N queries (`buscarAgregadosPeriodo` já existe em `useComparativoAnual.ts`, extrair para service) e retorna `{ porLoja: [{ empresaCod, empresaNome, base, comp, deltaAbs, deltaPct }], totalBase, totalComp }`.
3. **Remover uso** de `ComparativoAnualChart` e `ComparativoMensalChart` do `VendasDashboardLayout.tsx` (mantém os arquivos por ora para não quebrar imports externos, mas fora do layout).
4. **Presets de período de comparação** — helpers puros: `deslocarAno(-1)`, `deslocarMes(-1)`, mantendo dia inicial/final.
5. **Eixo X sempre mostra nome da loja** vindo de `useUserEmpresas`, com fallback `"Loja {cod}"`. `interval={0}` e altura extra quando >4 lojas.
6. **Legenda fixa** identificando cor da barra Base e cor da barra Comparação — não misturar cor por loja (evita confusão anterior).

## Fora do escopo

- Não altera filtros globais, hooks de KPI, tabelas diárias, DRE, fluxo de caixa.
- Não mexe em `firebirdBridge` nem `vendasService`.
- Mantém regra de exclusão `DEVOLUCAO`/`CREDITOS` já existente no `buscarAgregadosPeriodo`.
