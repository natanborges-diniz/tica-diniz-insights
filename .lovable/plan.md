# Conciliação bancária: explicar melhor a tela e mostrar a semana

## Como funciona hoje (verificado no banco e no código)

O extrato do BTG é importado para o sistema e cada linha precisa ser "amarrada" a algo:
um lançamento do contas a pagar, um pagamento/boleto BTG, um recebível de cartão ou uma tarifa.

Estado atual dos dados:

- Extrato importado: 572 linhas — 212 conciliadas automaticamente, 25 manuais, **335 pendentes**.
- Última data importada por loja: a maioria já está em 06/08, mas **loja 17 parou em 27/07** e **loja 14 em 03/08**.
- Pagamentos com baixa nos últimos 7 dias: 91 lançamentos — e a maioria (**94 vindos do ERP**) foi baixada
  pelo sincronismo do ERP, não pelo borderô (só 1 via agrupamento, 1 folha, 4 manuais).
  Ou seja: **não é verdade que tudo que foi pago passou por borderô** — o ERP também baixa.

Por que a semana "não aparece" na tela de extrato:

1. A tela abre com **filtro de status = Pendente**. Tudo que já foi conciliado fica invisível.
2. A tela abre com **uma única loja** (a loja padrão do usuário), nunca uma visão consolidada.
3. A janela padrão é 30 dias, mas se a loja escolhida for a 17 (sem importação desde 27/07),
   a semana realmente não existe no banco.

Onde procurar contas pagas hoje: Hub Financeiro → aba **Pagos**, que já filtra por
**data de pagamento** (não vencimento) e traz o comprovante BTG quando existe. O extrato é o
espelho da conta corrente; o Hub é o espelho do título.

## O que vou mudar

### 1. Tela de extrato deixa de esconder a semana
- Filtro de status abre em **Todos** (com contadores por status ao lado), não mais "Pendente".
- Atalhos de período: **Esta semana / Últimos 7 dias / Este mês / 30 dias**.
- Selo por linha deixando claro a que foi conciliada (Lançamento, Boleto, Cartão, Tarifa) e o método.

### 2. Aviso de extrato desatualizado
Banner no topo quando a última data importada da loja for anterior a ontem (caso das lojas 17 e 14),
com botão de importar o período faltante — hoje a falha de importação fica silenciosa.

### 3. Explicação na própria tela
Bloco curto "como funciona" no topo (recolhível): extrato = dinheiro que entrou/saiu do banco;
conciliar = apontar cada linha para o título; pendente = trabalho humano restante.
Mais um link direto para Hub → Pagos ("procurando uma conta paga? é aqui").

### 4. Consolidado por loja (opcional, mesma entrega)
Opção "Todas as lojas" no seletor de empresa da tela de extrato, para uma visão única da semana
com coluna de loja.

### 5. Contas a Pagar lembra o último período consultado
Hoje o filtro de vencimento volta em branco a cada visita ao Hub. Passa a guardar loja, campo de data
(vencimento/pagamento/emissão), data início e data fim no navegador e reaplicar na volta, com um
botão "Limpar período" para voltar ao estado aberto. Vale também para a aba Pagos, que usa o mesmo
período.

### 6. Seletor de loja padronizado e destacado em todas as telas de filtro
A loja passa a ser sempre o **primeiro campo**, com rótulo "Loja", largura maior e destaque visual
(ícone de loja + nome em negrito), para não haver dúvida de qual unidade está sendo consultada.
Telas contempladas: Hub Financeiro, Extrato, Pagamentos, Cobranças, DDA, Parcelas, DRE, Fluxo de
Caixa, Conciliação de Cartões, Recebíveis, Vendas por Família, Compras, Estoque/OTB, Metas, OS e
Folha de Pagamento. Onde a visão consolidada faz sentido, "Todas as lojas" aparece como primeira
opção e o cabeçalho da página mostra a loja ativa em destaque.


## Detalhes técnicos

- `src/pages/BankingExtratoDashboard.tsx`: `filtroStatus` inicial `"todos"`, presets de data,
  contadores derivados do `resumo`, banner de defasagem usando `max(data_lancamento)` (nova action
  `ultima_data` em `btg-extrato`, ou derivada do resumo), coluna de loja quando `codEmpresa` = todas.
- `supabase/functions/btg-extrato/index.ts`: aceitar `cod_empresa: null` em `listar`/`resumo`
  (consolidado, respeitando as lojas permitidas) e expor a última data importada por loja.
- Sem mudança de schema. Sem alteração nas regras de conciliação nem no motor `conciliar-extrato`.

## Fora deste escopo (aviso)

A parada de importação da loja 17 desde 27/07 tem causa provável no escopo/credencial BTG dessa loja
(já vimos erros 403 de escopo antes) — isso não está confirmado. Após esta entrega o banner vai
expor o erro real; se confirmar credencial, trato em seguida.
