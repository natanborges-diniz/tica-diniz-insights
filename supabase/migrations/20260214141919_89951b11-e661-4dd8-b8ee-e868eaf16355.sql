
-- F4.2: Add idempotency_key to pedidos_fornecedor for duplicate prevention
ALTER TABLE public.pedidos_fornecedor 
ADD COLUMN idempotency_key TEXT;

-- Unique partial index (only where key is not null)
CREATE UNIQUE INDEX idx_pedidos_fornecedor_idempotency 
ON public.pedidos_fornecedor(idempotency_key) 
WHERE idempotency_key IS NOT NULL;
