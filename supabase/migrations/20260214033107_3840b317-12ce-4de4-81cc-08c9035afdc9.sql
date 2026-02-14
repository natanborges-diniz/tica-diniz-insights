-- Phase 4.1: Add audit columns to pedidos_fornecedor
ALTER TABLE public.pedidos_fornecedor 
  ADD COLUMN IF NOT EXISTS requested_by UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS requested_at TIMESTAMPTZ DEFAULT now(),
  ADD COLUMN IF NOT EXISTS hoya_environment TEXT DEFAULT 'staging';

-- Add index for audit queries
CREATE INDEX IF NOT EXISTS idx_pedidos_fornecedor_requested_by ON public.pedidos_fornecedor(requested_by);
CREATE INDEX IF NOT EXISTS idx_pedidos_fornecedor_cod_empresa_created ON public.pedidos_fornecedor(cod_empresa, created_at DESC);

-- Admin can view all pedidos for audit
CREATE POLICY "Admin read all pedidos" ON public.pedidos_fornecedor
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Gestor can read own company's pedidos
CREATE POLICY "Gestor read own company pedidos" ON public.pedidos_fornecedor
  FOR SELECT TO authenticated
  USING (cod_empresa = public.get_user_empresa(auth.uid()));
