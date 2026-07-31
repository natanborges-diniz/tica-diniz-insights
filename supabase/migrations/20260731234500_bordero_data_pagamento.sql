-- Borderô com data de pagamento planejada (prática da casa: tudo pago na segunda).
-- O envio ao BTG agenda cada item para esta data (vencimento anterior a ela →
-- agenda no vencimento, para não pagar juros).
ALTER TABLE public.borderos ADD COLUMN IF NOT EXISTS data_pagamento DATE;

COMMENT ON COLUMN public.borderos.data_pagamento IS
  'Data planejada de execução dos pagamentos (default: próxima segunda). Itens com vencimento anterior são agendados no vencimento.';

NOTIFY pgrst, 'reload schema';
