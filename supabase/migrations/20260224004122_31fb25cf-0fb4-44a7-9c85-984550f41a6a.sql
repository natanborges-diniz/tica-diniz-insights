
-- Table to track alerts for negative-status supplier orders
CREATE TABLE public.pedido_alertas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  pedido_fornecedor_id UUID NOT NULL REFERENCES public.pedidos_fornecedor(id),
  cod_empresa INTEGER NOT NULL,
  status_detectado TEXT NOT NULL,
  acknowledged BOOLEAN NOT NULL DEFAULT false,
  acknowledged_by UUID REFERENCES auth.users(id),
  acknowledged_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Unique constraint: one alert per pedido
CREATE UNIQUE INDEX idx_pedido_alertas_pedido ON public.pedido_alertas(pedido_fornecedor_id);

-- RLS
ALTER TABLE public.pedido_alertas ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read alerts for their companies
CREATE POLICY "Users read own company alerts"
  ON public.pedido_alertas FOR SELECT
  USING (
    cod_empresa IN (
      SELECT uep.cod_empresa FROM user_empresa_permissions uep WHERE uep.user_id = auth.uid()
    )
    OR has_role(auth.uid(), 'admin'::app_role)
  );

-- Authenticated users can update (acknowledge) alerts for their companies
CREATE POLICY "Users acknowledge own company alerts"
  ON public.pedido_alertas FOR UPDATE
  USING (
    cod_empresa IN (
      SELECT uep.cod_empresa FROM user_empresa_permissions uep WHERE uep.user_id = auth.uid()
    )
    OR has_role(auth.uid(), 'admin'::app_role)
  )
  WITH CHECK (
    cod_empresa IN (
      SELECT uep.cod_empresa FROM user_empresa_permissions uep WHERE uep.user_id = auth.uid()
    )
    OR has_role(auth.uid(), 'admin'::app_role)
  );

-- Service role full access
CREATE POLICY "Service role full access pedido_alertas"
  ON public.pedido_alertas FOR ALL
  USING (true)
  WITH CHECK (true);

-- Enable realtime for instant badge updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.pedido_alertas;
