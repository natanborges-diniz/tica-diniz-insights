
-- Tabela para armazenar vouchers vinculados a CPF de clientes
CREATE TABLE public.voucher_cliente (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cpf TEXT NOT NULL,
  voucher TEXT NOT NULL,
  numero_pedido TEXT,
  cod_empresa INTEGER,
  cliente_nome TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Índice para busca rápida por CPF
CREATE INDEX idx_voucher_cliente_cpf ON public.voucher_cliente(cpf);

-- Unique constraint: um voucher por CPF (último cadastrado é o válido)
CREATE UNIQUE INDEX idx_voucher_cliente_cpf_unique ON public.voucher_cliente(cpf);

-- RLS
ALTER TABLE public.voucher_cliente ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read vouchers"
  ON public.voucher_cliente FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert vouchers"
  ON public.voucher_cliente FOR INSERT
  TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update vouchers"
  ON public.voucher_cliente FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);
