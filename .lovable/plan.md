# Deploy das functions e checagem das migrations

## O que será feito

1. Verificar no banco se as duas migrations pendentes já estão aplicadas:
   - `20260804140000_btg_dda_id_uuid_com_fk.sql` (coluna `btg_dda_id` como UUID + chave estrangeira para os títulos DDA)
   - `20260804160000_rubrica_pagamento_e_liberacoes.sql` (campos de forma de pagamento e liberações restantes nas rubricas)
   Se algum objeto estiver faltando, aplicar a migration correspondente. Se já estiver tudo presente, não aplicar nada (evita erro de duplicidade).

2. Fazer o deploy das Edge Functions, nesta ordem:
   - `financeiro-lancamentos` (inclui a correção de tipo UTILITIES pela linha digitável iniciada em 8)
   - `conciliar-extrato`
   - `btg-dda`
   - `sync-ledger`
   - `btg-poll-status`
   - `btg-pagamentos`

3. Validar após o deploy:
   - Conferir logs da última execução de `financeiro-lancamentos` para garantir que subiu sem erro de import.
   - Confirmar que a conta da SABESP (R$ 122,60, empresa 16) agora é classificada como pagamento de concessionária em vez de boleto.

## Detalhes técnicos

- A tipagem por linha digitável já está no código (`tipoPorLinhaDigitavel` em `_shared/btgPayment.ts`, usado em `financeiro-lancamentos/index.ts`), então o deploy é o que falta para o comportamento entrar em produção.
- Nenhuma alteração de código nova é necessária nesta entrega; é execução de migrations pendentes (se houver) + deploy.
