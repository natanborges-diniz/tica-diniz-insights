INSERT INTO public.fornecedor_configuracao (fornecedor, ambiente, ativo)
VALUES ('btg', 'production', true)
ON CONFLICT DO NOTHING;