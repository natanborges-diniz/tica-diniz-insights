
-- Tabela de configuração Hoya por empresa
CREATE TABLE public.hoya_empresa_config (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cod_empresa integer NOT NULL UNIQUE,
  cnpj text,
  cod_cliente_hoya integer,
  alias text,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.hoya_empresa_config ENABLE ROW LEVEL SECURITY;

-- Apenas admins podem ler e escrever
CREATE POLICY "Admin read hoya_empresa_config"
  ON public.hoya_empresa_config FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admin write hoya_empresa_config"
  ON public.hoya_empresa_config FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service role full access hoya_empresa_config"
  ON public.hoya_empresa_config FOR ALL
  USING (true)
  WITH CHECK (true);

-- Trigger updated_at
CREATE TRIGGER update_hoya_empresa_config_updated_at
  BEFORE UPDATE ON public.hoya_empresa_config
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Pré-popular com as empresas ativas (sem CNPJ/codCliente ainda)
INSERT INTO public.hoya_empresa_config (cod_empresa, alias)
SELECT cod_empresa, nome_fantasia FROM public.empresa WHERE ativa = true
ON CONFLICT (cod_empresa) DO NOTHING;
