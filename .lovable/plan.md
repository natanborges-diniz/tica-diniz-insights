

## Análise: Seleção de Loja no Link de Pagamento

### Situação Atual

A tela **já possui** o seletor de loja funcionando corretamente:
- O filtro de empresa aparece na área de filtros (linha 211-223) quando o usuário tem acesso a múltiplas lojas
- O `codEmpresa` selecionado no filtro é usado tanto para **listar** quanto para **criar** links (linha 69: `cod_empresa: codEmpresa`)
- Porém, o seletor de empresa está **apenas nos filtros da lista**, não aparece dentro do **dialog de criação**

O problema é sutil: ao criar um link, o sistema usa o `codEmpresa` que está selecionado no filtro da tabela. Se o operador não perceber qual loja está selecionada, pode gerar o link para a loja errada.

### Plano

**1. Adicionar seletor de loja dentro do Dialog "Criar Link"** (`src/pages/PaymentLinksPage.tsx`)

- Incluir um campo `Select` de empresa como **primeiro campo** do formulário de criação
- Pré-selecionar com o `codEmpresa` atual do filtro
- Usar um state separado (`newLinkEmpresa`) para não confundir com o filtro da lista
- Mostrar o nome da loja de forma clara para evitar erros

**2. Para o Connect & Flow** — nenhuma alteração aqui

O bot já envia `cod_empresa` no payload da action `criar`. O mapeamento telefone → loja já resolve o código correto (tabela `telefones_lojas`). A edge function `payment-links` já aceita o `cod_empresa` no body e resolve as credenciais Rede via `adquirentes_config`. O fluxo do chatbot está correto.

### Resumo do racional

| Origem | Como identifica a loja |
|---|---|
| **Tela admin (este projeto)** | Seletor de empresa no dialog de criação |
| **Connect & Flow (chatbot)** | Mapeamento automático telefone → cod_empresa |
| **Edge Function** | Recebe `cod_empresa` → busca credenciais em `adquirentes_config` |

### Arquivo a modificar

| Arquivo | Alteração |
|---|---|
| `src/pages/PaymentLinksPage.tsx` | Adicionar Select de empresa dentro do DialogContent de criação |

