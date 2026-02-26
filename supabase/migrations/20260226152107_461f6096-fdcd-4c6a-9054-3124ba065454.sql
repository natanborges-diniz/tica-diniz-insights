-- Create zeiss_empresa_config table (mirrors hoya_empresa_config structure)
CREATE TABLE public.zeiss_empresa_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cod_empresa INTEGER NOT NULL,
  alias TEXT,
  cnpj TEXT,
  cod_cliente_sao TEXT,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.zeiss_empresa_config ENABLE ROW LEVEL SECURITY;

-- RLS Policies (same pattern as hoya_empresa_config)
CREATE POLICY "Admin read zeiss_empresa_config" ON public.zeiss_empresa_config
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admin write zeiss_empresa_config" ON public.zeiss_empresa_config
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Service role full access zeiss_empresa_config" ON public.zeiss_empresa_config
  AS RESTRICTIVE FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- Insert company mappings with SAO codes
INSERT INTO public.zeiss_empresa_config (cod_empresa, alias, cod_cliente_sao) VALUES
  (1,  'Primitiva I',     '2699'),
  (2,  'Primitiva II',    '4050'),
  (9,  'Antonio Agu',     '23556'),
  (18, 'Super Shopping',  '39710'),
  (6,  'Uniao',           '9751'),
  (17, 'Santo Antonio',   '38981'),
  (4,  'Carapicuiba',     '8518'),
  (16, 'Barueri',         '38980'),
  (14, 'Jandira',         '34680'),
  (15, 'Itapevi',         '34994');

-- Insert ZEISS into fornecedor_configuracao
INSERT INTO public.fornecedor_configuracao (fornecedor, ambiente, ativo)
VALUES ('ZEISS', 'staging', true)
ON CONFLICT DO NOTHING;