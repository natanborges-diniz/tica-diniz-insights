

# Plano: Corrigir coloração Zeiss + armação Hoya lente pronta

## Resumo do que está errado

### Zeiss — Cor não vai no payload
O seletor de cor funciona normalmente na UI. O problema é que em `PedidoZeissPage.tsx` linha 402, o campo `corcoloracao` está fixo como `""`. Quando o usuário escolhe uma cor, ela não é enviada para a API.

**Correção**: Trocar `corcoloracao: ""` por `corcoloracao: selectedCor !== "none" ? selectedCor : ""`. Nada muda no seletor — ele já funciona. Apenas o payload passa a carregar o valor selecionado.

### Hoya — Sistema exige armação para lente pronta
A UI já esconde os campos de armação quando `productReqs.needsDadosArmacao === false` (linha 1807). Porém, o payload (linhas 757-767) **sempre** envia `dadosMedida` e `armacao` com valores default, mesmo para lentes prontas. Isso pode causar rejeição pela API Hoya ou confusão.

**Correção**: No `buildPayload()`, condicionar os blocos `dadosMedida` e `armacao` ao `productReqs.needsDadosArmacao`. Para lentes prontas, enviar `null` nesses campos.

## Arquivos alterados

| Arquivo | Mudança |
|---------|---------|
| `src/pages/PedidoZeissPage.tsx` | Linha 402: usar `selectedCor` no campo `corcoloracao` |
| `src/pages/PedidoFornecedorPage.tsx` | Linhas 757-767: enviar `dadosMedida` e `armacao` como `null` quando `needsDadosArmacao === false` |

## Ordem
1. Fix Zeiss — injetar cor selecionada no payload
2. Fix Hoya — condicionar armação no payload

