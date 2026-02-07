
-- Tabela de mapeamento De/Para: produto local → produto fornecedor
CREATE TABLE public.fornecedor_produto_depara (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  fornecedor TEXT NOT NULL DEFAULT 'HOYA',
  descricao_local TEXT NOT NULL,
  codigo_fornecedor INT,
  nome_fornecedor TEXT,
  sku_fornecedor TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(fornecedor, descricao_local)
);

ALTER TABLE public.fornecedor_produto_depara ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Todos podem ler depara" ON public.fornecedor_produto_depara FOR SELECT USING (true);
CREATE POLICY "Todos podem inserir depara" ON public.fornecedor_produto_depara FOR INSERT WITH CHECK (true);
CREATE POLICY "Todos podem atualizar depara" ON public.fornecedor_produto_depara FOR UPDATE USING (true);
CREATE POLICY "Todos podem deletar depara" ON public.fornecedor_produto_depara FOR DELETE USING (true);

CREATE TRIGGER update_depara_updated_at
  BEFORE UPDATE ON public.fornecedor_produto_depara
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Tabela de pedidos enviados a fornecedores
CREATE TABLE public.pedidos_fornecedor (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cod_os INT NOT NULL,
  cod_empresa INT NOT NULL,
  fornecedor TEXT NOT NULL DEFAULT 'HOYA',
  numero_pedido TEXT,
  status TEXT DEFAULT 'pendente',
  payload JSONB,
  response JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.pedidos_fornecedor ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Todos podem ler pedidos_fornecedor" ON public.pedidos_fornecedor FOR SELECT USING (true);
CREATE POLICY "Todos podem inserir pedidos_fornecedor" ON public.pedidos_fornecedor FOR INSERT WITH CHECK (true);
CREATE POLICY "Todos podem atualizar pedidos_fornecedor" ON public.pedidos_fornecedor FOR UPDATE USING (true);

CREATE TRIGGER update_pedidos_fornecedor_updated_at
  BEFORE UPDATE ON public.pedidos_fornecedor
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_pedidos_fornecedor_cod_os ON public.pedidos_fornecedor(cod_os);
CREATE INDEX idx_pedidos_fornecedor_numero ON public.pedidos_fornecedor(numero_pedido);
