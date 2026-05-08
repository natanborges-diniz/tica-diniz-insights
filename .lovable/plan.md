## Problema
A API Haytek rejeitou o pedido com HTTP 400:
> `spherical/addition must be a numeric string with exactly 2 decimal places and no '+' sign, for example 0.00, -0.75, 13.00`

Estamos enviando `"+3.00"`, `"+1.00"`, `"+0.25"` — a função `formatDioptria` em `src/pages/PedidoHaytekPage.tsx` (linha 347) prefixa `+` para valores positivos. A API quer:
- Positivo: `"3.00"` (sem sinal)
- Zero: `"0.00"`
- Negativo: `"-0.75"` (mantém o `-`)

## Correção
Em `src/pages/PedidoHaytekPage.tsx`, ajustar `formatDioptria`:

```ts
function formatDioptria(val: string | undefined | null): string {
  if (!val || val.trim() === "") return "0.00";
  const num = parseFloat(val.replace(",", "."));
  if (isNaN(num)) return "0.00";
  return num.toFixed(2); // toFixed já preserva o "-" e omite o "+"
}
```

`Number.prototype.toFixed(2)` já produz exatamente o formato exigido (`"3.00"`, `"-2.00"`, `"0.25"`), então o trabalho da função vira só sanitizar entrada.

## Validação
Reenviar OS 95485 e confirmar 201/200 da Haytek nos logs do `haytek-proxy`.

## Memória
Atualizar `mem://integrations/haytek/master-specification` com a regra: **dioptrias enviadas SEM `+` (apenas `-` para negativos), sempre 2 casas decimais**.