

# Plano: Corrigir coloração Zeiss + armação Hoya lente pronta

## Problema 1 — Zeiss: Coloração não é enviada no payload

Em `PedidoZeissPage.tsx` linha 402, `corcoloracao` está hardcoded como `""`. O estado `selectedCor` é preenchido pelo componente `ZeissServicosSection` mas nunca é injetado no payload.

### Correção
No `buildPayload()` de `PedidoZeissPage.tsx`:
- Substituir `corcoloracao: ""` por `corcoloracao: selectedCor !== "none" ? selectedCor : ""`
- Manter `amostracoloracao: ""` (campo opcional, raramente usado)

---

## Problema 2 — Hoya: Payload envia armação mesmo para lente pronta

A UI corretamente esconde os campos de armação quando `productReqs.needsDadosArmacao === false`. Porém, o payload montado nas linhas 757-767 **sempre** inclui `dadosMedida` e `armacao` com valores default (`tipoArmacao: 1`, `formaArmacao: 1`), o que pode causar rejeição pela API Hoya.

### Correção
No `buildPayload()` de `PedidoFornecedorPage.tsx`:
- Condicionar `dadosMedida` e `armacao` ao `productReqs.needsDadosArmacao`
- Quando lente pronta: enviar `dadosMedida: null` e `armacao: null` (ou omitir)

---

## Arquivos alterados

| Arquivo | Mudança |
|---------|---------|
| `src/pages/PedidoZeissPage.tsx` | Injetar `selectedCor` no campo `corcoloracao` do payload |
| `src/pages/PedidoFornecedorPage.tsx` | Condicionar `dadosMedida` e `armacao` ao `needsDadosArmacao` |

## Ordem
1. Fix Zeiss coloração no payload
2. Fix Hoya armação condicional no payload

