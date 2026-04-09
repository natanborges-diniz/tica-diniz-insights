

## Plano: Aviso de Retirada em Loja no Comprovante de Pagamento

### O que será feito

Adicionar um bloco de alerta visual na página de confirmação de pagamento (`CheckoutReceipt.tsx`), entre os detalhes da transação e o rodapé "Via do Cliente", com o seguinte aviso:

> **Retirada em loja**: Para retirada da mercadoria, é obrigatória a apresentação do **cartão físico** utilizado nesta transação, acompanhado de um **documento de identificação** com foto do titular do cartão.

### Design

- Bloco com fundo âmbar claro (`bg-amber-50`, borda `border-amber-200`), ícone `AlertTriangle` em âmbar
- Texto curto e direto, em tamanho pequeno (`text-xs`) para manter a estética do comprovante
- Posicionado após a seção "Detalhes" e antes do rodapé "Via do Cliente"

### Arquivo alterado

| Arquivo | Mudança |
|---|---|
| `src/components/checkout/CheckoutReceipt.tsx` | Inserir bloco de aviso entre linhas 167-169 (após Detalhes, antes do rodapé) |

