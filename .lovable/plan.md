
## Contexto

Pedido de teste em produção HiTech foi enviado com sucesso (`POST /orders/lab → 201`, log confirma payload sem serviços), mas:

1. Tracking só exibe os dados do **payload enviado**, não a confirmação que a Haytek retorna.
2. "Consultar Haytek" e a "consulta ao vivo" do card mostram apenas JSON cru (`<pre>{...}</pre>`).
3. Pedido foi cancelado pela Haytek alegando que foi solicitado **serviço de corte e montagem** — porém nenhum lugar da nossa UI envia `services.assembly` ou `services.remoteCut`. O log do proxy comprova: o body enviado terminou em `"corridor":18}}` sem bloco `services`.

## O que vou fazer

### 1. Tracking — exibir confirmação da Haytek de forma estruturada
Em `HaytekTrackingPage.tsx`, no bloco "Status ao Vivo (API Haytek)" e no resultado da consulta avulsa, substituir o `<pre>JSON</pre>` por um card estruturado com:
- Nº pedido / Order ID / Status (badge colorido)
- **Produto confirmado pela Haytek** (productId, treatment, descrição se vier)
- Prescrição confirmada OD/OE (lado a lado com a do payload, para comparar)
- Armação confirmada (code, material, ponte, altura, largura)
- Coloração / Corredor
- Lista de **entregas** (`deliveries[]`) com data prevista, status e tracking
- Bloco de **pagamento** (`payment`) se vier
- Bloco de **serviços** (`services` ou similar) — destacando se houver `assembly`/`remoteCut`, justamente para diagnosticar o caso #3
- Botão "Ver JSON bruto" colapsável (mantém o JSON disponível para debug, mas escondido por padrão)

### 2. Consulta avulsa — mesmo visual estruturado
Reaproveitar o mesmo componente de detalhe (extrair em `HaytekTrackingDetail.tsx`) para o card de consulta avulsa, eliminando o `<pre>` atual.

### 3. Investigação do cancelamento por corte+montagem

Não vou alterar a lógica de envio sem confirmar a causa. O plano é diagnosticar:

- **Verificar no detalhe estruturado** (item 1) se o tracking retornado pela Haytek lista `services.assembly` / `services.remoteCut`. Se sim, é forte indício de que a Haytek está **adicionando o serviço por configuração da conta do laboratório** (não veio do nosso payload — o log prova que enviamos sem `services`).
- **Adicionar no card um aviso explícito**: se o tracking ao vivo trouxer `services` que não estavam no payload original, exibir badge amarelo "Serviços adicionados pela Haytek: corte/montagem" — com link para abrir chamado.
- **Caso de origem oposta**: investigar se o `frameCode = ARF` (Aro Fechado) está fazendo a Haytek inferir montagem automaticamente. Documentar no card.

Como a causa é externa (configuração na Haytek), o plano técnico nosso é **mostrar a evidência** no tracking. A ação concreta com a Haytek fica como recomendação ao final (abrir chamado anexando a evidência que o card vai exibir).

### 4. Histórico — exibir Service flag também na lista
Na lista colapsada (header do card de pedido), adicionar um pequeno badge "C+M" se a resposta da Haytek incluir serviços, para visibilidade rápida.

## Arquivos a alterar

- `src/components/haytek/HaytekTrackingDetail.tsx` (novo) — componente reutilizável com a apresentação estruturada
- `src/pages/HaytekTrackingPage.tsx` — substituir os blocos `<pre>` (consulta avulsa + status ao vivo) pelo novo componente; adicionar aviso de serviços inesperados

## Detalhes técnicos

- Nenhuma mudança em edge function (`haytek-proxy`) — ele já retorna o JSON completo da Haytek.
- Nenhuma mudança no fluxo de envio em `PedidoHaytekPage.tsx` até confirmarmos a origem dos serviços.
- O tipo `HaytekOrderTracking` já tem `deliveries`, `payment` e `[key: string]: unknown` — vou ler campos comuns (`products`, `services`, `prescription`) defensivamente.
- O design segue o padrão do tracking Zeiss (badges, cards aninhados, tipografia mono para números).

## Próximo passo após esta entrega

Com o tracking estruturado mostrando a presença/ausência de `services` na resposta, abrir chamado com a Haytek anexando o screenshot do card — confirmando que o pedido foi enviado sem serviços e a Haytek agregou.
