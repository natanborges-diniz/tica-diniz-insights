INSERT INTO public.adquirentes_config
  (cod_empresa, adquirente, ambiente, ativo, cielo_pvs)
SELECT DISTINCT r.cod_empresa, 'CIELO', 'production', true, '{}'::text[]
  FROM public.adquirentes_config r
 WHERE r.adquirente = 'REDE'
   AND r.ativo = true
   AND NOT EXISTS (
     SELECT 1 FROM public.adquirentes_config c
      WHERE c.adquirente = 'CIELO' AND c.cod_empresa = r.cod_empresa
   );

UPDATE public.adquirentes_config ac
   SET cielo_documento = COALESCE(
         nullif(regexp_replace(coalesce(e.cnpj, ''), '\D', '', 'g'), ''),
         nullif(regexp_replace(coalesce(b.cnpj, ''), '\D', '', 'g'), '')
       )
  FROM public.empresa e
  LEFT JOIN public.btg_contas_bancarias b ON b.cod_empresa = e.cod_empresa
 WHERE ac.adquirente = 'CIELO'
   AND ac.cod_empresa = e.cod_empresa
   AND (ac.cielo_documento IS NULL OR btrim(ac.cielo_documento) = '')
   AND COALESCE(
         nullif(regexp_replace(coalesce(e.cnpj, ''), '\D', '', 'g'), ''),
         nullif(regexp_replace(coalesce(b.cnpj, ''), '\D', '', 'g'), '')
       ) IS NOT NULL;

UPDATE public.adquirentes_config
   SET cielo_pvs = '{}'::text[]
 WHERE adquirente = 'CIELO'
   AND coalesce(array_length(cielo_pvs, 1), 0) > 0;

DROP TABLE IF EXISTS public.cielo_pvs_planilha;

CREATE TABLE public.cielo_pvs_planilha (
  estabelecimento text PRIMARY KEY,
  cnpj text NOT NULL,
  razao_social text NOT NULL,
  em_operacao boolean NOT NULL DEFAULT true,
  cod_empresa integer,
  observacao text
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cielo_pvs_planilha TO authenticated;
GRANT ALL ON public.cielo_pvs_planilha TO service_role;

COMMENT ON TABLE public.cielo_pvs_planilha IS
  'Planilha "Mapeamento Cielo 2026" como referencia. Preencha cod_empresa conforme for distribuindo os PVs pelas lojas em Admin > Adquirentes.';

INSERT INTO public.cielo_pvs_planilha (estabelecimento, cnpj, razao_social, em_operacao, observacao) VALUES
  ('2838722713', '12107885000101', 'MILZETE M G BORGES OPTICA LTDA', true,  NULL),
  ('1028427902', '12107885000101', 'MILZETE M G BORGES OPTICA LTDA', true,  NULL),
  ('1033439069', '12107885000101', 'MILZETE M G BORGES OPTICA LTDA', true,  NULL),
  ('2809988395', '12107885000101', 'MILZETE M G BORGES OPTICA LTDA', true,  NULL),
  ('2809988433', '13844111000126', 'M DE M GOMES OPTICA',            true,  NULL),
  ('1032636880', '13844111000126', 'M DE M GOMES OPTICA',            true,  NULL),
  ('2837060040', '13844111000126', 'M DE M GOMES OPTICA',            true,  NULL),
  ('1072478584', '13844111000207', 'M DE M GOMES OPTICA',            true,  'CNPJ filial 0002-07'),
  ('1048250935', '19280952000134', 'A B BORGES OPTICA',              true,  'CNPJ matriz 0001-34'),
  ('2809988409', '19280952000215', 'A B BORGES OPTICA',              true,  NULL),
  ('2838722330', '19280952000215', 'A B BORGES OPTICA',              true,  NULL),
  ('1055799637', '19280952000215', 'A B BORGES OPTICA',              true,  NULL),
  ('2809657925', '19938491000144', 'J. M. GOMES MELO OPTICA LTDA',   true,  NULL),
  ('1050240283', '19938491000144', 'J. M. GOMES MELO OPTICA LTDA',   true,  NULL),
  ('2839970010', '19938491000144', 'J. M. GOMES MELO OPTICA LTDA',   true,  NULL),
  ('2838656800', '20118761000150', 'NAM OPTICAL BUSINESS LTDA',      false, 'Natan: nao utiliza mais'),
  ('2837031318', '35385887000168', 'SP CASTRO OPTICA LTDA',          true,  NULL),
  ('2809988441', '35385887000168', 'SP CASTRO OPTICA LTDA',          true,  NULL),
  ('2895579967', '35385887000249', 'SP CASTRO OPTICA LTDA',          true,  NULL),
  ('2815123066', '41743168000174', 'A M BORGES OPTICA LTDA',         false, 'Natan: nao utiliza mais'),
  ('2809658220', '41743168000174', 'A M BORGES OPTICA LTDA',         false, 'Natan: nao utiliza mais'),
  ('2898942388', '59068194000100', 'MOUBOR OPTICA LTDA',             true,  NULL);

ALTER TABLE public.cielo_pvs_planilha ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin full access cielo_pvs_planilha"
  ON public.cielo_pvs_planilha FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Service role full access cielo_pvs_planilha"
  ON public.cielo_pvs_planilha FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DELETE FROM public.cielo_vinculo_diagnostico WHERE secao IN ('ESPELHO', 'PENDENTE');

INSERT INTO public.cielo_vinculo_diagnostico
  (secao, cod_empresa, nome_fantasia, cnpj_empresa, adquirentes, cielo_cnpj, cielo_qtd_pvs, status, detalhe)
SELECT
  'ESPELHO',
  e.cod_empresa,
  coalesce(e.nome_fantasia, e.razao_social, '?'),
  nullif(regexp_replace(coalesce(e.cnpj, ''), '\D', '', 'g'), ''),
  (SELECT string_agg(a.adquirente, ', ' ORDER BY a.adquirente)
     FROM public.adquirentes_config a
    WHERE a.cod_empresa = e.cod_empresa AND a.ativo),
  c.cielo_documento,
  coalesce(array_length(c.cielo_pvs, 1), 0),
  CASE WHEN c.id IS NULL THEN 'SEM CIELO'
       WHEN coalesce(array_length(c.cielo_pvs, 1), 0) = 0 THEN 'AGUARDANDO PVs'
       ELSE 'OK' END,
  'Preencha os PVs em Admin > Adquirentes, aba Cielo. Referencia: SELECT * FROM cielo_pvs_planilha WHERE em_operacao;'
FROM public.empresa e
LEFT JOIN public.adquirentes_config c
       ON c.cod_empresa = e.cod_empresa AND c.adquirente = 'CIELO'
ORDER BY e.cod_empresa;

INSERT INTO public.cielo_vinculo_diagnostico (secao, status, detalhe)
SELECT 'PENDENTE',
       format('%s PV(s) em operacao para distribuir', count(*)),
       'Nenhum esta vinculado a loja ainda. Distribua em Admin > Adquirentes.'
  FROM public.cielo_pvs_planilha WHERE em_operacao;