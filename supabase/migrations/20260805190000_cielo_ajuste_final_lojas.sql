-- Ajuste final do mapa Cielo, conforme conferencia do Natan.
--
--   NAM OPTICAL (20118761000150) e A M BORGES (41743168000174) nao operam mais
--   -> ficam de fora. Sao 3 PVs que deixam de ser esperados: o alvo passa de
--      22 para 19 PVs em 7 lojas.
--
--   MOUBOR (59068194000100) e a loja Super Shopping. O vinculo automatico caiu
--   na loja 18, mas o cadastro tem uma loja chamada "Super" (13) sem Cielo —
--   entao a busca passa a ser pelo NOME que o Natan deu, e nao pelo que o
--   algoritmo inferiu.
--
--   J. M. GOMES MELO (19938491000144) e Carapicuiba. Confirmado pelo nome, para
--   o caso de o vinculo automatico ter acertado por acaso.
--
-- Nada e movido no escuro: se o nome apontar para mais de uma loja, ou para
-- nenhuma, a migracao registra o motivo em cielo_vinculo_diagnostico e deixa o
-- vinculo como esta.

-- ---------------------------------------------------------------------------
-- 1. Estabelecimentos que sairam de operacao
-- ---------------------------------------------------------------------------

DELETE FROM public.adquirentes_config
 WHERE adquirente = 'CIELO'
   AND cielo_documento IN ('20118761000150', '41743168000174');

INSERT INTO public.cielo_vinculo_diagnostico (secao, cielo_cnpj, cielo_rotulo, status, detalhe)
VALUES
  ('AJUSTE', '20118761000150', 'NAM OPTICAL BUSINESS', 'FORA DE OPERACAO',
   'Natan: nao utiliza mais. 1 PV (2838656800) sem vinculo de proposito.'),
  ('AJUSTE', '41743168000174', 'A M BORGES OPTICA', 'FORA DE OPERACAO',
   'Natan: nao utiliza mais. 2 PVs (2815123066, 2809658220) sem vinculo de proposito.');

-- ---------------------------------------------------------------------------
-- 2. Correcao de loja por nome informado
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  r record;
  v_cod integer;
  v_qtd integer;
  v_atual integer;
  v_nome text;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('59068194000100', 'MOUBOR / Super Shopping', 'SUPER',
        ARRAY['2898942388']),
      ('19938491000144', 'J. M. GOMES MELO / Carapicuiba', 'CARAPICUIBA',
        ARRAY['2809657925','1050240283','2839970010'])
    ) AS t(cnpj, rotulo, padrao, pvs)
  LOOP
    SELECT cod_empresa INTO v_atual
      FROM public.adquirentes_config
     WHERE adquirente = 'CIELO' AND cielo_documento = r.cnpj;

    SELECT count(*), min(e.cod_empresa) INTO v_qtd, v_cod
      FROM public.empresa e
     WHERE public.cielo_norm_razao(coalesce(e.nome_fantasia, '')) LIKE '%' || r.padrao || '%'
        OR public.cielo_norm_razao(coalesce(e.razao_social, ''))  LIKE '%' || r.padrao || '%';

    IF v_qtd <> 1 THEN
      INSERT INTO public.cielo_vinculo_diagnostico
        (secao, cod_empresa, cielo_cnpj, cielo_rotulo, status, detalhe)
      VALUES ('AJUSTE', v_atual, r.cnpj, r.rotulo, 'NAO CONFERIDO',
              format('o nome "%s" achou %s loja(s); vinculo mantido em %s',
                     r.padrao, v_qtd, coalesce(v_atual::text, 'nenhuma')));
      CONTINUE;
    END IF;

    SELECT coalesce(nome_fantasia, razao_social, '?') INTO v_nome
      FROM public.empresa WHERE cod_empresa = v_cod;

    IF v_atual IS NOT DISTINCT FROM v_cod THEN
      INSERT INTO public.cielo_vinculo_diagnostico
        (secao, cod_empresa, nome_fantasia, cielo_cnpj, cielo_rotulo, cielo_qtd_pvs, status, detalhe)
      VALUES ('AJUSTE', v_cod, v_nome, r.cnpj, r.rotulo, array_length(r.pvs, 1), 'CONFIRMADO',
              format('ja estava na loja certa (%s)', v_nome));
      CONTINUE;
    END IF;

    -- Uma loja so pode ter uma configuracao Cielo.
    DELETE FROM public.adquirentes_config
     WHERE adquirente = 'CIELO' AND (cielo_documento = r.cnpj OR cod_empresa = v_cod);

    INSERT INTO public.adquirentes_config
      (cod_empresa, adquirente, ambiente, ativo, cielo_pvs, cielo_documento)
    VALUES (v_cod, 'CIELO', 'production', true, r.pvs, r.cnpj);

    UPDATE public.empresa
       SET cnpj = r.cnpj
     WHERE cod_empresa = v_cod AND (cnpj IS NULL OR btrim(cnpj) = '');

    INSERT INTO public.cielo_vinculo_diagnostico
      (secao, cod_empresa, nome_fantasia, cielo_cnpj, cielo_rotulo, cielo_qtd_pvs, status, detalhe)
    VALUES ('AJUSTE', v_cod, v_nome, r.cnpj, r.rotulo, array_length(r.pvs, 1), 'MOVIDO',
            format('estava na loja %s, passou para %s (%s)',
                   coalesce(v_atual::text, 'nenhuma'), v_cod, v_nome));
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 3. Situacao final — alvo agora e 19 PVs em 7 lojas
-- ---------------------------------------------------------------------------

INSERT INTO public.cielo_vinculo_diagnostico (secao, status, detalhe)
SELECT 'TOTAL FINAL',
       format('%s loja(s) com Cielo, %s PV(s) de 19',
              count(*), coalesce(sum(coalesce(array_length(cielo_pvs, 1), 0)), 0)),
       CASE WHEN coalesce(sum(coalesce(array_length(cielo_pvs, 1), 0)), 0) = 19
            THEN 'OK — 3 PVs de fora sao NAM e A M BORGES, que nao operam mais'
            ELSE 'INCOMPLETO — veja as linhas de secao AJUSTE' END
  FROM public.adquirentes_config WHERE adquirente = 'CIELO';

INSERT INTO public.cielo_vinculo_diagnostico
  (secao, cod_empresa, nome_fantasia, cielo_cnpj, cielo_qtd_pvs, status)
SELECT 'LOJA FINAL', e.cod_empresa,
       coalesce(e.nome_fantasia, e.razao_social, '?'),
       ac.cielo_documento,
       coalesce(array_length(ac.cielo_pvs, 1), 0),
       CASE WHEN ac.id IS NOT NULL THEN 'COM CIELO' ELSE 'SEM CIELO' END
  FROM public.empresa e
  LEFT JOIN public.adquirentes_config ac
         ON ac.cod_empresa = e.cod_empresa AND ac.adquirente = 'CIELO'
 ORDER BY e.cod_empresa;
