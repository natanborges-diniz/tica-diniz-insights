CREATE OR REPLACE FUNCTION public.unaccent_simples(txt text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT translate(
    coalesce(txt, ''),
    'ÁÀÃÂÄÉÈÊËÍÌÎÏÓÒÕÔÖÚÙÛÜÇÑáàãâäéèêëíìîïóòõôöúùûüçñ',
    'AAAAAEEEEIIIIOOOOOUUUUCNaaaaaeeeeiiiiooooouuuucn'
  );
$$;

CREATE OR REPLACE FUNCTION public.cielo_norm_razao(txt text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT btrim(regexp_replace(
    regexp_replace(
      regexp_replace(
        upper(public.unaccent_simples(coalesce(txt, ''))),
        '[^A-Z0-9 ]', ' ', 'g'
      ),
      '\y(LTDA|ME|EPP|EIRELI|SA|MEI)\y', ' ', 'g'
    ),
    '\s+', ' ', 'g'
  ));
$$;

DO $$
DECLARE
  r record;
  v_cod_empresa integer;
  v_qtd integer;
  v_vinculados integer := 0;
  v_ambiguos text[] := '{}';
  v_nao_achados text[] := '{}';
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('12107885000101', 'MILZETE M G BORGES OPTICA LTDA',  ARRAY['2838722713','1028427902','1033439069','2809988395']),
      ('13844111000126', 'M DE M GOMES OPTICA',             ARRAY['2809988433','1032636880','2837060040']),
      ('13844111000207', 'M DE M GOMES OPTICA',             ARRAY['1072478584']),
      ('19280952000134', 'A B BORGES OPTICA',               ARRAY['1048250935']),
      ('19280952000215', 'A B BORGES OPTICA',               ARRAY['2809988409','2838722330','1055799637']),
      ('19938491000144', 'J. M. GOMES MELO OPTICA LTDA',    ARRAY['2809657925','1050240283','2839970010']),
      ('20118761000150', 'NAM OPTICAL BUSINESS LTDA',       ARRAY['2838656800']),
      ('35385887000168', 'SP CASTRO OPTICA LTDA',           ARRAY['2837031318','2809988441']),
      ('35385887000249', 'SP CASTRO OPTICA LTDA',           ARRAY['2895579967']),
      ('41743168000174', 'A M BORGES OPTICA LTDA',          ARRAY['2815123066','2809658220']),
      ('59068194000100', 'MOUBOR OPTICA LTDA',              ARRAY['2898942388'])
    ) AS t(cnpj, razao_social, pvs)
  LOOP
    IF EXISTS (
      SELECT 1 FROM public.adquirentes_config
       WHERE adquirente = 'CIELO' AND cielo_documento = r.cnpj
    ) THEN
      CONTINUE;
    END IF;

    SELECT count(*), min(e.cod_empresa)
      INTO v_qtd, v_cod_empresa
      FROM public.empresa e
     WHERE public.cielo_norm_razao(e.razao_social) = public.cielo_norm_razao(r.razao_social)
        OR public.cielo_norm_razao(e.nome_fantasia) = public.cielo_norm_razao(r.razao_social);

    IF v_qtd = 0 THEN
      v_nao_achados := v_nao_achados || format('%s / %s', r.razao_social, r.cnpj);
      CONTINUE;
    END IF;

    IF v_qtd > 1 THEN
      v_ambiguos := v_ambiguos || format('%s (%s lojas com esta razao social) / CNPJ %s',
                                         r.razao_social, v_qtd, r.cnpj);
      CONTINUE;
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.adquirentes_config
       WHERE adquirente = 'CIELO' AND cod_empresa = v_cod_empresa
         AND cielo_documento IS NOT NULL AND cielo_documento <> r.cnpj
    ) THEN
      v_ambiguos := v_ambiguos || format('%s: loja %s ja vinculada a outro CNPJ (este: %s)',
                                         r.razao_social, v_cod_empresa, r.cnpj);
      CONTINUE;
    END IF;

    INSERT INTO public.adquirentes_config
      (cod_empresa, adquirente, ambiente, ativo, cielo_pvs, cielo_documento)
    VALUES
      (v_cod_empresa, 'CIELO', 'production', true, r.pvs, r.cnpj);

    UPDATE public.empresa
       SET cnpj = r.cnpj
     WHERE cod_empresa = v_cod_empresa
       AND (cnpj IS NULL OR btrim(cnpj) = '');

    v_vinculados := v_vinculados + 1;
  END LOOP;

  RAISE NOTICE 'Cielo: % loja(s) vinculada(s) por razao social.', v_vinculados;

  IF array_length(v_ambiguos, 1) > 0 THEN
    RAISE WARNING 'Cielo: vinculo ambiguo, resolver manualmente em Admin > Adquirentes: %',
      array_to_string(v_ambiguos, ' | ');
  END IF;

  IF array_length(v_nao_achados, 1) > 0 THEN
    RAISE WARNING 'Cielo: razao social sem loja correspondente em public.empresa: %',
      array_to_string(v_nao_achados, ' | ');
  END IF;
END $$;

DO $$
DECLARE r record; v_total integer;
BEGIN
  SELECT count(*) INTO v_total FROM public.adquirentes_config WHERE adquirente = 'CIELO';
  RAISE NOTICE '--- % configuracao(oes) Cielo ---', v_total;
  FOR r IN
    SELECT ac.cod_empresa, e.nome_fantasia, e.razao_social, ac.cielo_documento,
           coalesce(array_length(ac.cielo_pvs, 1), 0) AS qtd_pvs
      FROM public.adquirentes_config ac
      LEFT JOIN public.empresa e ON e.cod_empresa = ac.cod_empresa
     WHERE ac.adquirente = 'CIELO'
     ORDER BY ac.cod_empresa
  LOOP
    RAISE NOTICE 'loja % — % — CNPJ % — % PV(s)',
      r.cod_empresa, coalesce(r.nome_fantasia, r.razao_social, '?'), r.cielo_documento, r.qtd_pvs;
  END LOOP;
END $$;