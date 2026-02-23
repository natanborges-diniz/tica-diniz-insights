-- Enable realtime for pedidos_fornecedor so badges update dynamically
ALTER PUBLICATION supabase_realtime ADD TABLE public.pedidos_fornecedor;