

# Plano: Adicionar botão "Pedido Haytek" na tela de receita

## Problema
O `OsHubDetailSheet.tsx` só tem botões para Hoya e Zeiss. Falta o botão para Haytek (Dmax).

## Correção

**Arquivo: `src/components/os-hub/OsHubDetailSheet.tsx`**

1. Adicionar função `handleGerarPedidoHaytek` (mesmo padrão dos outros):
   - Navegar para `/os/pedido-haytek?${buildPedidoParams()}`

2. Adicionar um terceiro botão no footer, ao lado dos existentes:
   - Label: "Pedido Haytek"
   - Variant: `outline`
   - Ícone: `Send`

## Resultado
O footer da sheet passará a ter 3 botões: **Pedido Hoya**, **Pedido Zeiss** e **Pedido Haytek**.

