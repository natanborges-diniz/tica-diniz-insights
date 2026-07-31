ALTER TABLE public.borderos ADD COLUMN IF NOT EXISTS data_pagamento DATE;

COMMENT ON COLUMN public.borderos.data_pagamento IS
  'Data planejada de execução dos pagamentos (default: próxima segunda). Itens com vencimento anterior são agendados no vencimento.';

NOTIFY pgrst, 'reload schema';