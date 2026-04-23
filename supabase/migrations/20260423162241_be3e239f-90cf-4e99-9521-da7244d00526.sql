CREATE TABLE public.optview_empresa_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cod_empresa INTEGER NOT NULL,
  alias TEXT,
  cnpj TEXT,
  codigo_cadastral_optview TEXT,
  login_site TEXT,
  senha_site TEXT,
  login_restrito TEXT,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT optview_empresa_config_cod_empresa_key UNIQUE (cod_empresa)
);

ALTER TABLE public.optview_empresa_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin read optview_empresa_config"
ON public.optview_empresa_config
FOR SELECT
TO public
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admin write optview_empresa_config"
ON public.optview_empresa_config
FOR ALL
TO public
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Service role full access optview_empresa_config"
ON public.optview_empresa_config
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE TABLE public.optview_produtos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  codigo_produto TEXT NOT NULL,
  nome_produto TEXT NOT NULL,
  material TEXT,
  desenho TEXT,
  observacao TEXT,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT optview_produtos_codigo_produto_key UNIQUE (codigo_produto)
);

ALTER TABLE public.optview_produtos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read optview_produtos"
ON public.optview_produtos
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Admin write optview_produtos"
ON public.optview_produtos
FOR ALL
TO public
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Service role full access optview_produtos"
ON public.optview_produtos
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE TABLE public.optview_servicos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  codigo_servico TEXT NOT NULL,
  nome_servico TEXT NOT NULL,
  categoria_servico TEXT,
  observacao TEXT,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT optview_servicos_codigo_servico_key UNIQUE (codigo_servico)
);

ALTER TABLE public.optview_servicos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read optview_servicos"
ON public.optview_servicos
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Admin write optview_servicos"
ON public.optview_servicos
FOR ALL
TO public
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Service role full access optview_servicos"
ON public.optview_servicos
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE TABLE public.optview_tipos_armacao (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  codigo_tipo_armacao TEXT NOT NULL,
  nome_tipo_armacao TEXT NOT NULL,
  observacao TEXT,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT optview_tipos_armacao_codigo_tipo_armacao_key UNIQUE (codigo_tipo_armacao)
);

ALTER TABLE public.optview_tipos_armacao ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read optview_tipos_armacao"
ON public.optview_tipos_armacao
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Admin write optview_tipos_armacao"
ON public.optview_tipos_armacao
FOR ALL
TO public
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Service role full access optview_tipos_armacao"
ON public.optview_tipos_armacao
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE TABLE public.optview_modelos_aro (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  codigo_modelo_aro TEXT NOT NULL,
  nome_modelo_aro TEXT NOT NULL,
  observacao TEXT,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT optview_modelos_aro_codigo_modelo_aro_key UNIQUE (codigo_modelo_aro)
);

ALTER TABLE public.optview_modelos_aro ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read optview_modelos_aro"
ON public.optview_modelos_aro
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Admin write optview_modelos_aro"
ON public.optview_modelos_aro
FOR ALL
TO public
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Service role full access optview_modelos_aro"
ON public.optview_modelos_aro
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE TRIGGER update_optview_empresa_config_updated_at
BEFORE UPDATE ON public.optview_empresa_config
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_optview_produtos_updated_at
BEFORE UPDATE ON public.optview_produtos
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_optview_servicos_updated_at
BEFORE UPDATE ON public.optview_servicos
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_optview_tipos_armacao_updated_at
BEFORE UPDATE ON public.optview_tipos_armacao
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_optview_modelos_aro_updated_at
BEFORE UPDATE ON public.optview_modelos_aro
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_optview_produtos_nome_produto ON public.optview_produtos (nome_produto);
CREATE INDEX idx_optview_servicos_nome_servico ON public.optview_servicos (nome_servico);
CREATE INDEX idx_optview_tipos_armacao_nome ON public.optview_tipos_armacao (nome_tipo_armacao);
CREATE INDEX idx_optview_modelos_aro_nome ON public.optview_modelos_aro (nome_modelo_aro);