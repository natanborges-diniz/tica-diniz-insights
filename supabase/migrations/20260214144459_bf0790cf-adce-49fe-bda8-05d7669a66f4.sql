
-- F4.5: Tabela de histórico de status de pedidos
CREATE TABLE public.pedido_status_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  pedido_fornecedor_id UUID NOT NULL REFERENCES public.pedidos_fornecedor(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  status_producao TEXT,
  rastreio TEXT,
  observacao TEXT,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índice para consultas por pedido
CREATE INDEX idx_pedido_status_history_pedido ON public.pedido_status_history(pedido_fornecedor_id);
CREATE INDEX idx_pedido_status_history_checked ON public.pedido_status_history(checked_at DESC);

-- Enable RLS
ALTER TABLE public.pedido_status_history ENABLE ROW LEVEL SECURITY;

-- Admin lê tudo
CREATE POLICY "Admins podem ler todo histórico de status"
  ON public.pedido_status_history FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

-- Gestor lê pedidos da sua empresa
CREATE POLICY "Gestores podem ler histórico da sua empresa"
  ON public.pedido_status_history FOR SELECT
  USING (
    public.has_role(auth.uid(), 'gestor')
    AND EXISTS (
      SELECT 1 FROM public.pedidos_fornecedor pf
      WHERE pf.id = pedido_status_history.pedido_fornecedor_id
      AND pf.cod_empresa = public.get_user_empresa(auth.uid())
    )
  );

-- Inserção apenas via service_role (edge functions)
-- Não precisa de policy de INSERT para usuários comuns
