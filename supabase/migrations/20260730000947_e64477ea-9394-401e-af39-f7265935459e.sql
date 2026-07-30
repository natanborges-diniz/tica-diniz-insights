INSERT INTO public.comissao_taxas (forma_categoria, percentual)
VALUES ('GERENTE', 0), ('SUPERVISOR', 0)
ON CONFLICT (forma_categoria) DO NOTHING;