DROP TABLE IF EXISTS public.cielo_vinculo_diagnostico;

CREATE TABLE public.cielo_vinculo_diagnostico (
  id serial PRIMARY KEY,
  secao text NOT NULL,
  cod_empresa integer,
  nome_fantasia text,
  razao_social text,
  cnpj_empresa text,
  cnpj_btg text,
  adquirentes text,
  cielo_cnpj text,
  cielo_rotulo text,
  cielo_qtd_pvs integer,
  status text,
  detalhe text
);

GRANT SELECT ON public.cielo_vinculo_diagnostico TO authenticated;
GRANT ALL ON public.cielo_vinculo_diagnostico TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.cielo_vinculo_diagnostico_id_seq TO service_role;

ALTER TABLE public.cielo_vinculo_diagnostico ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin read cielo_vinculo_diagnostico"
  ON public.cielo_vinculo_diagnostico FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Service role full access cielo_vinculo_diagnostico"
  ON public.cielo_vinculo_diagnostico FOR ALL TO service_role
  USING (true) WITH CHECK (true);

COMMENT ON TABLE public.cielo_vinculo_diagnostico IS
  'Resultado do vinculo dos estabelecimentos Cielo. Consulte: SELECT * FROM cielo_vinculo_diagnostico ORDER BY secao, id;';

DO $$
DECLARE
  r record;
  v_cod integer;
  v_qtd integer;
  v_fonte text;
  v_ok integer := 0;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('MILZETE',        'MILZETE M G BORGES OPTICA LTDA', '12107885000101',
        ARRAY['2838722713','1028427902','1033439069','2809988395']),
      ('PRIMITIVA',      'M DE M GOMES OPTICA / Primitiva 2', '13844111000126',
        ARRAY['2809988433','1032636880','2837060040','1072478584']),
      ('UNIAO',          'A B BORGES OPTICA / Diniz Uniao', '19280952000215',
        ARRAY['2809988409','2838722330','1055799637','1048250935']),
      ('GOMES MELO',     'J. M. GOMES MELO OPTICA LTDA', '19938491000144',
        ARRAY['2809657925','1050240283','2839970010']),
      ('NAM',            'NAM OPTICAL BUSINESS LTDA', '20118761000150',
        ARRAY['2838656800']),
      ('ANTONIO AGU',    'SP CASTRO OPTICA / Antonio Agu', '35385887000168',
        ARRAY['2837031318','2809988441']),
      ('SANTO',          'SP CASTRO OPTICA / Santo Antonio', '35385887000249',
        ARRAY['2895579967']),
      ('A M BORGES',     'A M BORGES OPTICA LTDA', '41743168000174',
        ARRAY['2815123066','2809658220']),
      ('MOUBOR',         'MOUBOR OPTICA LTDA', '59068194000100',
        ARRAY['2898942388'])
    ) AS t(padrao, rotulo, cnpj, pvs)
  LOOP
    v_cod := NULL;
    v_fonte := NULL;

    SELECT count(*), min(b.cod_empresa) INTO v_qtd, v_cod
      FROM public.btg_contas_bancarias b
     WHERE regexp_replace(coalesce(b.cnpj, ''), '\D', '', 'g') = r.cnpj;
    IF v_qtd = 1 THEN v_fonte := 'btg_contas_bancarias.cnpj'; ELSE v_cod := NULL; END IF;

    IF v_cod IS NULL THEN
      SELECT count(*), min(e.cod_empresa) INTO v_qtd, v_cod
        FROM public.empresa e
       WHERE regexp_replace(coalesce(e.cnpj, ''), '\D', '', 'g') = r.cnpj;
      IF v_qtd = 1 THEN v_fonte := 'empresa.cnpj'; ELSE v_cod := NULL; END IF;
    END IF;

    IF v_cod IS NULL THEN
      SELECT count(*), min(e.cod_empresa) INTO v_qtd, v_cod
        FROM public.empresa e
       WHERE public.cielo_norm_razao(coalesce(e.nome_fantasia, '')) LIKE '%' || r.padrao || '%'
          OR public.cielo_norm_razao(coalesce(e.razao_social, ''))  LIKE '%' || r.padrao || '%';
      IF v_qtd = 1 THEN v_fonte := 'nome da loja'; ELSE v_cod := NULL; END IF;
    END IF;

    IF v_cod IS NULL THEN
      INSERT INTO public.cielo_vinculo_diagnostico
        (secao, cielo_cnpj, cielo_rotulo, cielo_qtd_pvs, status, detalhe)
      VALUES ('CIELO', r.cnpj, r.rotulo, array_length(r.pvs, 1), 'SEM VINCULO',
              format('nao encontrei loja unica por CNPJ nem pelo padrao de nome "%s"', r.padrao));
      CONTINUE;
    END IF;

    DELETE FROM public.adquirentes_config
     WHERE adquirente = 'CIELO' AND (cod_empresa = v_cod OR cielo_documento = r.cnpj);

    INSERT INTO public.adquirentes_config
      (cod_empresa, adquirente, ambiente, ativo, cielo_pvs, cielo_documento)
    VALUES (v_cod, 'CIELO', 'production', true, r.pvs, r.cnpj);

    UPDATE public.empresa
       SET cnpj = r.cnpj
     WHERE cod_empresa = v_cod AND (cnpj IS NULL OR btrim(cnpj) = '');

    INSERT INTO public.cielo_vinculo_diagnostico
      (secao, cod_empresa, cielo_cnpj, cielo_rotulo, cielo_qtd_pvs, status, detalhe)
    VALUES ('CIELO', v_cod, r.cnpj, r.rotulo, array_length(r.pvs, 1), 'VINCULADO',
            format('via %s', v_fonte));

    v_ok := v_ok + 1;
  END LOOP;

  RAISE NOTICE 'Cielo: % de 9 configuracoes vinculadas.', v_ok;
END $$;

INSERT INTO public.cielo_vinculo_diagnostico
  (secao, cod_empresa, nome_fantasia, razao_social, cnpj_empresa, cnpj_btg,
   adquirentes, cielo_cnpj, cielo_qtd_pvs, status)
SELECT
  'LOJA',
  e.cod_empresa,
  e.nome_fantasia,
  e.razao_social,
  nullif(regexp_replace(coalesce(e.cnpj, ''), '\D', '', 'g'), ''),
  nullif(regexp_replace(coalesce(b.cnpj, ''), '\D', '', 'g'), ''),
  (SELECT string_agg(ac.adquirente, ', ' ORDER BY ac.adquirente)
     FROM public.adquirentes_config ac
    WHERE ac.cod_empresa = e.cod_empresa AND ac.ativo),
  cl.cielo_documento,
  coalesce(array_length(cl.cielo_pvs, 1), 0),
  CASE WHEN cl.id IS NOT NULL THEN 'COM CIELO' ELSE 'SEM CIELO' END
FROM public.empresa e
LEFT JOIN public.btg_contas_bancarias b ON b.cod_empresa = e.cod_empresa
LEFT JOIN public.adquirentes_config cl
       ON cl.cod_empresa = e.cod_empresa AND cl.adquirente = 'CIELO'
ORDER BY e.cod_empresa;

INSERT INTO public.cielo_vinculo_diagnostico (secao, status, detalhe)
SELECT 'TOTAL',
       format('%s loja(s) com Cielo, %s PV(s) de 22',
              count(*), coalesce(sum(coalesce(array_length(cielo_pvs, 1), 0)), 0)),
       CASE WHEN coalesce(sum(coalesce(array_length(cielo_pvs, 1), 0)), 0) = 22
            THEN 'OK — bate com a planilha'
            ELSE 'INCOMPLETO — veja as linhas com status SEM VINCULO' END
  FROM public.adquirentes_config WHERE adquirente = 'CIELO';