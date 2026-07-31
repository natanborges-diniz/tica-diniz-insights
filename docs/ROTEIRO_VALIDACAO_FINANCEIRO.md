# Roteiro de Validação — Módulo Financeiro (com o analista)

> Para a primeira rodada de validação do redesenho financeiro (jul/2026).
> Papéis: **operador** (analista — cria, classifica, monta) e **admin** (aprova
> na Mesa). Regra de ouro do sistema: **nenhum pagamento sem lastro**.

## Como o dado chega (expectativas antes de validar números)

- **ERP (Dataweb)**: entra 1× ao dia, ~08h (após o restore da cópia). Lançou hoje
  no Dataweb → aparece amanhã de manhã. Botão "Importar ERP" (Contas a Pagar)
  força uma carga manual se preciso.
- **Banco (BTG)**: quase tempo real — extrato importa diariamente sozinho,
  retorno de pagamento baixa em ≤30 min (ou ~1 min com webhook ativo).
- **Classificações**: classificar uma linha do extrato replica para todas as
  linhas idênticas (todas as lojas) e vira regra permanente para os próximos
  extratos.

---

## Bloco 1 — Conferência de números (o analista é o juiz)

Objetivo: confirmar que o sistema espelha o ERP fielmente.

1. **Contas a Pagar** (Financeiro → Contas a Pagar): o total em aberto por loja
   bate com o Dataweb? Amostrar 5–10 títulos: fornecedor, valor, vencimento,
   parcela. *(Documento com 4 parcelas deve aparecer como 4 títulos.)*
2. **Parcelas ERP** (Análises → Parcelas ERP): espelho de leitura do ERP —
   conferir contra uma consulta no próprio Dataweb.
3. **DRE e Fluxo de Caixa**: os números fazem sentido contra o fechamento em
   planilha do mês anterior? Divergência = anotar o caso concreto (loja, conta,
   valor) para investigarmos — não precisa bater centavo na primeira rodada,
   precisa não ter distorção grosseira.

**Reportar**: qualquer título faltando, duplicado ou com valor errado (com nº
do documento do ERP).

## Bloco 2 — Rubricas (o orçamento vivo dos recorrentes)

1. Financeiro → Rubricas → **"Sugerir do histórico"**: o sistema minera 12 meses
   e cria rascunhos (aluguel, energia, impostos, folha...).
2. Analista revisa cada rascunho: valor esperado correto? dia de vencimento?
   teto razoável (sugerido = 2× a mediana — apertar!)? conta DRE certa? Para os
   pagos por PIX: preencher a **chave PIX exata** (é a proteção anti-fraude).
   Excluir o que não fizer sentido; criar manualmente o que faltar.
3. **Admin aprova** (quem criou não consegue aprovar — é proposital).
4. **"Provisionar 12 meses"**: o ano inteiro aparece como previsto no Contas a
   Pagar e no Fluxo de Caixa. Validar: as competências e valores fazem sentido?
5. No dia seguinte (pós-sync das 8h): se o fiscal digita aluguel no Dataweb,
   o título real deve **substituir** a provisão do mês — conferir que não há
   duplicidade (aluguel 1× por loja/mês, não 2×).

## Bloco 3 — Conciliação Bancária (a fila de exceções)

1. Financeiro → Banking BTG → Conciliação Bancária → escolher loja →
   **Rodar motor**.
2. Trabalhar a fila de pendentes: **Confirmar** as sugestões corretas (a ficha
   mostra fornecedor, valor, diferença e datas), **Classificar** o que não tem
   contraparte (replica + vira regra), **Ignorar** transferências internas.
3. Cadastrar **Regras de tarifas** para tarifas/IOF/juros recorrentes.
4. Acompanhar o KPI de conciliação — meta: ≥80% automático após ~30 dias de
   regras ajustadas. Pendentes >7 dias em vermelho = tratar, não acumular.

**Validação chave**: os débitos de fornecedor devem sugerir o título do ERP
correspondente (valor + data de pagamento). Se sugerirem errado ou não
sugerirem, anotar o caso.

## Bloco 4 — Primeiro ciclo de pagamento ponta a ponta (o teste real)

Com um borderô PEQUENO (2–3 títulos de verdade):

1. **Operador**: seleciona títulos (verdes) no Contas a Pagar → prepara
   pagamento (PIX/boleto) → monta o borderô.
2. **Admin**: abre a **Mesa de Aprovação** → confere os selos → Aprovar borderô.
   - 🟢 nota/título ERP · 🔵 rubrica na faixa · 🟡 fora da faixa (com o desvio) ·
     🔴 exceção · **Sem lastro** (não aprova — resolver antes)
3. Enviar ao BTG (Contas a Pagar) → **autorizar no app do BTG** (a confirmação
   final é sempre no banco — por desenho).
4. NÃO clicar em "Confirmar Processado": a baixa deve acontecer **sozinha**
   (webhook/polling). Se precisar do botão manual, é bug — reportar.
5. No dia seguinte: a linha do débito no extrato deve casar automaticamente com
   o pagamento na Conciliação Bancária. Os três lados fecham sem toque.

## Bloco 5 — Exceção emergencial (circuito de teste)

1. Operador cria lançamento com lastro "Exceção emergencial" + justificativa
   (mín. 20 caracteres). Sem justificativa, o sistema recusa — testar isso.
2. Admin vê na Mesa (vermelho, com a justificativa à vista) → aprova
   individualmente. Exceção **nunca** entra em borderô.
3. Confirmar também o bloqueio: admin que criou não consegue aprovar a própria.

---

## O que anotar durante a validação (formato do reporte)

Para cada problema: **tela + loja + documento/valor + o que esperava vs o que
viu**. Print ajuda. Divergência de número sem o caso concreto não é acionável.

## O que trazer para as próximas fases (dever de casa do analista)

1. **XMLs de NF-e** de 5–10 notas dos laboratórios (Hoya/Zeiss) e de armações —
   vamos validar se o nº do pedido vem no campo xPed (destrava o modo fiscal:
   entrada de NF amarrada ao pedido, CMV automático).
2. **Processo atual das contas de consumo**: quais chegam por DDA, quais por
   e-mail/papel, quem paga como (define o fino das rubricas).
3. **Folha**: como é paga hoje (individual? arquivo do banco?) — define a v2.
4. Lista de quem deve ser **admin** (aprovador) além do titular — mínimo 2.
