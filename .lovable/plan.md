# Aceitar vírgula e ponto como separador decimal no valor do link

## Problema
Em `src/pages/PaymentLinksPage.tsx` o input "Valor (R$)" usa `type="number"` e `parseFloat(newLink.valor)`. Isso só aceita ponto como separador decimal — quando o usuário digita `150,00`, o navegador rejeita silenciosamente (alguns aceitam, outros não) e o `parseFloat` retorna `NaN`, gerando erro genérico.

## Mudança

### `src/pages/PaymentLinksPage.tsx`

1. Trocar o input de `type="number"` para `type="text"` com `inputMode="decimal"` e `placeholder="0,00"`, permitindo digitar vírgula livremente:

```tsx
<Input
  type="text"
  inputMode="decimal"
  value={newLink.valor}
  onChange={e => setNewLink(f => ({ ...f, valor: e.target.value.replace(/[^\d.,]/g, "") }))}
  placeholder="0,00"
/>
```

2. Adicionar helper `parseValor` que normaliza ambos os formatos (BR e US, com ou sem milhar) antes de enviar:

```ts
const parseValor = (v: string): number => {
  const s = String(v ?? "").trim();
  if (!s) return NaN;
  const hasComma = s.includes(",");
  const hasDot = s.includes(".");
  let n = s;
  if (hasComma && hasDot) {
    // último separador é o decimal
    n = s.lastIndexOf(",") > s.lastIndexOf(".")
      ? s.replace(/\./g, "").replace(",", ".")
      : s.replace(/,/g, "");
  } else if (hasComma) {
    n = s.replace(/\./g, "").replace(",", ".");
  }
  return parseFloat(n);
};
```

3. Em `criarMutation.mutationFn`, validar antes de chamar a edge function e abortar com toast claro se inválido:

```ts
const valorNum = parseValor(newLink.valor);
if (!Number.isFinite(valorNum) || valorNum <= 0) {
  throw new Error("Valor inválido. Use números com vírgula ou ponto (ex.: 150,00 ou 150.00).");
}
return invokeAction("criar", { ..., valor: valorNum, ... });
```

Aceitará: `150`, `150,00`, `150.00`, `1.234,56`, `1,234.56`, `1234,5`.

## Arquivo editado
- `src/pages/PaymentLinksPage.tsx`

## Fora do escopo
- Edge function `payment-links` já recebe `valor` como número — sem mudança no backend.
