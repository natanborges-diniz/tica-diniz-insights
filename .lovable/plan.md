

## Plano: Melhorar Tracking Haytek + Formulário Inteligente por Produto

### Problemas Identificados

1. **Tracking mostra JSON bruto** — Ao expandir um pedido no tracking Haytek, a seção "Dados do Pedido" exibe `JSON.stringify(pedido.payload)` em `<pre>` (linhas 406-416 de HaytekTrackingPage). Hoya e Zeiss exibem dados estruturados (produto, prescrição OD/OE, armação, etc.)

2. **Tracking NÃO consulta API Haytek ao expandir** — Diferente da Hoya (que faz `consultarPedidoHoya` ao expandir para obter "status ao vivo"), o Haytek tracking apenas carrega a timeline local. Não há consulta em tempo real à API.

3. **Formulário de pedido mostra todos os campos sempre** — Campos como Corredor só aparecem se `isProgressivo`, mas outros campos (DNP, Altura, Prisma, Coloração) são sempre exibidos, mesmo quando o produto não os exige. Hoya já faz isso via `needsDadosArmacao`.

---

### Correções

#### 1. Tracking: substituir JSON bruto por dados estruturados

**Arquivo: `src/pages/HaytekTrackingPage.tsx`**

Substituir o bloco `<pre>{JSON.stringify(pedido.payload)}</pre>` (linhas 406-416) por um painel estruturado similar ao Zeiss/Hoya:
- Mostrar produto (productId), paciente, OS, tratamento
- Mostrar prescrição OD/OE formatada (ESF | CIL | EIX | AD | DNP | ALT)
- Mostrar armação (tipo, ponte, altura, largura, formato)
- Mostrar resposta da API (orderId, status, erros)

#### 2. Tracking: consultar API Haytek ao expandir (status ao vivo)

**Arquivo: `src/pages/HaytekTrackingPage.tsx`**

Adicionar o mesmo padrão da Hoya:
- State `pedidoApiData` e `pedidoApiError` (por pedido ID)
- No `handleExpand`, chamar `consultarPedidoHaytek(orderId, codEmpresa)` em paralelo com a timeline
- Exibir resultado como "Status ao vivo (consultado agora na Haytek)" com campos: status, entregas, etc.

#### 3. Formulário: condicionar campos às exigências do produto

**Arquivo: `src/pages/PedidoHaytekPage.tsx`**

Derivar flags do produto selecionado para controlar visibilidade:
- `isProgressivo` — já existe, controla Corredor: manter
- `needsDnpAltura` — derivar do tipo de produto: surfaçadas exigem, prontas não
- `needsPrisma` — mostrar apenas se prescrição tem cilíndrico ou se é surfaçada
- Ocultar campos que o produto não exige (ex: Corredor para visão simples já funciona; aplicar mesma lógica para DNP/Altura em lentes prontas)

Regra proposta:
- Se produto começa com "SS" (Single Stock/pronta) → ocultar DNP, Altura, Corredor
- Se produto é progressivo → mostrar Corredor, DNP, Altura obrigatórios
- Coloração: sempre opcional (já funciona)
- Prisma: sempre opcional (já funciona, manter)

---

### Arquivos a alterar

| Arquivo | Mudança |
|---|---|
| `src/pages/HaytekTrackingPage.tsx` | Substituir JSON bruto por painel estruturado; adicionar consulta API ao expandir |
| `src/pages/PedidoHaytekPage.tsx` | Condicionar visibilidade de DNP/Altura/Corredor ao tipo de produto |

### O que NÃO muda
- Edge function `haytek-proxy` (consultar-pedido já existe e funciona)
- Serviço `haytekService.ts` (já tem `consultarPedidoHaytek`)
- Lógica de matching/DE-PARA
- Fluxo de confirmação de receita/armação

