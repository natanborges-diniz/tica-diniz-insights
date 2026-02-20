
-- Tabela principal de configuração por fornecedor
CREATE TABLE public.fornecedor_configuracao (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  fornecedor text NOT NULL UNIQUE,           -- 'HOYA', 'ZEISS', etc.
  ambiente text NOT NULL DEFAULT 'staging',  -- 'staging' | 'production'
  base_url_staging text,
  base_url_production text,
  api_key text,                              -- Chave de API (admin only)
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.fornecedor_configuracao ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin read fornecedor_configuracao"
  ON public.fornecedor_configuracao FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admin write fornecedor_configuracao"
  ON public.fornecedor_configuracao FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service role full access fornecedor_configuracao"
  ON public.fornecedor_configuracao FOR ALL
  USING (true)
  WITH CHECK (true);

-- Trigger updated_at
CREATE TRIGGER update_fornecedor_configuracao_updated_at
  BEFORE UPDATE ON public.fornecedor_configuracao
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Pré-popular com Hoya usando os valores atuais (secrets como referência)
INSERT INTO public.fornecedor_configuracao (fornecedor, ambiente, base_url_staging, base_url_production)
VALUES ('HOYA', 'staging', 'https://hoyalab.com.br/api/customer', 'https://hoyalab.com.br/api/customer')
ON CONFLICT (fornecedor) DO NOTHING;
