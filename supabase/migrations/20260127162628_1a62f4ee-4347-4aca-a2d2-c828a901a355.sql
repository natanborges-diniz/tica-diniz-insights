-- Tabela de mapeamento marca → fornecedor
CREATE TABLE public.fornecedor_marca (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  marca TEXT NOT NULL,
  fornecedor TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(marca)
);

-- Habilitar RLS
ALTER TABLE public.fornecedor_marca ENABLE ROW LEVEL SECURITY;

-- Política de leitura pública
CREATE POLICY "Public read fornecedor_marca"
ON public.fornecedor_marca
FOR SELECT
USING (true);

-- Política de escrita para service role
CREATE POLICY "Service role full access fornecedor_marca"
ON public.fornecedor_marca
FOR ALL
USING (true)
WITH CHECK (true);

-- Trigger para atualizar updated_at
CREATE TRIGGER update_fornecedor_marca_updated_at
BEFORE UPDATE ON public.fornecedor_marca
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Comentário explicativo
COMMENT ON TABLE public.fornecedor_marca IS 'Mapeamento de marcas para fornecedores, usado como fallback quando produto não tem fornecedor cadastrado';