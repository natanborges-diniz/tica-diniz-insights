
-- Tabela de configuração por empresa Haytek
CREATE TABLE public.haytek_empresa_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cod_empresa integer NOT NULL,
  alias text,
  cnpj text,
  store_id text,
  address_id text,
  ativo boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.haytek_empresa_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin read haytek_empresa_config" ON public.haytek_empresa_config
  FOR SELECT TO public USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admin write haytek_empresa_config" ON public.haytek_empresa_config
  FOR ALL TO public
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service role full access haytek_empresa_config" ON public.haytek_empresa_config
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TRIGGER set_updated_at_haytek_empresa_config
  BEFORE UPDATE ON public.haytek_empresa_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Tabela de catálogo de produtos Haytek
CREATE TABLE public.haytek_produtos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id text NOT NULL,
  design text,
  linha text,
  material text,
  nome_comercial text,
  esferico_maximo numeric,
  esferico_minimo numeric,
  cilindrico_maximo numeric,
  adicao_minima numeric,
  adicao_maxima numeric,
  diametro text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.haytek_produtos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read haytek_produtos" ON public.haytek_produtos
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin write haytek_produtos" ON public.haytek_produtos
  FOR ALL TO public
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service role full access haytek_produtos" ON public.haytek_produtos
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Inserir registro do fornecedor HAYTEK
INSERT INTO public.fornecedor_configuracao (fornecedor, ambiente, base_url_staging, ativo)
VALUES ('HAYTEK', 'staging', 'https://dev.haytek.com.br', true);
