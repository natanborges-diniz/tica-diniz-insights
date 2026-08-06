# Campo do boleto: validar e formatar ao colar

Hoje a linha digitável pode ser colada com espaços, pontos e barras — a pontuação é removida antes da validação, então nada quebra. O problema é o silêncio: o campo aceita qualquer coisa e o erro só aparece quando o borderô vai ao banco.

## O que muda na tela

Ao colar ou digitar no campo "Linha digitável / Código de barras":

- A linha aparece formatada em blocos, como está impressa no boleto
  (`03399.94030 80900.001985 84636.301016 4 15310000001596`), para conferência
  visual contra o papel.
- Abaixo do campo, um retorno imediato:
  - **Válido**: tipo reconhecido (boleto de cobrança ou conta de concessionária),
    valor lido do próprio código e vencimento lido do fator.
  - **Inválido**: o motivo em português — dígito verificador que não confere
    (linha corrompida ou trocada) ou quantidade de dígitos fora de 44/47/48
    (linha incompleta), com quantos dígitos faltam.
  - **Incompleto**: enquanto tem menos dígitos que o esperado, mostra o
    progresso em vez de acusar erro.
- O botão de salvar só libera com linha válida, em vez de apenas "mais de 10
  caracteres" como hoje.
- O aviso de divergência de valor e a detecção de arrecadação, que já existem,
  continuam funcionando e passam a se apoiar na mesma validação.

O mesmo campo no diálogo de novo lançamento manual recebe o tratamento
idêntico.

## Detalhes técnicos

- `supabase/functions/_shared/boleto.ts` (módulo puro já compartilhado com o
  frontend) ganha três funções, sem alterar as existentes:
  - `formatarLinhaDigitavel(entrada)` — máscara FEBRABAN por tamanho (47 de
    cobrança, 48 de arrecadação, 44 em barras).
  - `vencimentoDoCodigoBarras(entrada)` — data a partir do fator de vencimento
    (base 07/10/1997, com a regra de rolagem pós-fator 9999), `null` para
    arrecadação.
  - `diagnosticarBoleto(entrada)` — retorna
    `{ status: 'vazio' | 'incompleto' | 'invalido' | 'ok', tipo, valor, vencimento, mensagem }`
    reaproveitando `paraCodigoBarras`/`valorDoCodigoBarras` e capturando o erro
    de DV como mensagem.
- Testes novos em `src/lib/financeiro/__tests__/boleto.test.ts` para as três
  funções, usando o boleto real Luxottica já presente no arquivo (fator 1531 =
  07/08/2026) mais um caso de DV corrompido e um de arrecadação.
- `PrepararPagamentoSheet.tsx`: exibe o valor formatado no input (estado guarda
  só dígitos), renderiza o diagnóstico e usa `status === 'ok'` no `isValid()`
  para BANKSLIP/DARF.
- `NovoLancamentoDialog.tsx`: mesma formatação e mesmo diagnóstico no campo
  "Código de barras".
- Sem migration. Sem mudança de contrato nas edge functions — o que é gravado em
  `dados_extras.linha_digitavel` continua sendo a linha em dígitos.
