-- Comissões de GESTÃO (Natan, 2026-07-28): além da comissão por forma de
-- pagamento dos vendedores, o gerente ganha % sobre a base recebida da LOJA e
-- o supervisor % sobre a base das lojas do GRUPO. Taxas configuráveis pelo
-- master em Comissões & Prêmios (categorias especiais, 0% até configurar).

INSERT INTO public.comissao_taxas (forma_categoria, percentual)
VALUES ('GERENTE', 0), ('SUPERVISOR', 0)
ON CONFLICT (forma_categoria) DO NOTHING;
