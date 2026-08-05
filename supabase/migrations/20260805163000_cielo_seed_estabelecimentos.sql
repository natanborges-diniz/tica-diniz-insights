-- Cadastro dos estabelecimentos Cielo por CNPJ (planilha "Mapeamento Cielo 2026").
--
-- 22 estabelecimentos submissores distribuidos em 11 CNPJs. O vinculo com a loja
-- e feito pelo CNPJ contra public.empresa, e nao por cod_empresa fixo: os
-- codigos vem do ERP e nao existem no repositorio, entao chuta-los aqui seria
-- atribuir venda a loja errada em silencio.
--
-- A comparacao normaliza os dois lados para digitos, porque o CNPJ pode estar
-- gravado com ou sem mascara.
--
-- O campo cielo_estabelecimento_matriz fica NULO de proposito: a matriz de
-- extrato e o numero do header do arquivo (posicoes 2 a 11), que so se confirma
-- ao ver o primeiro extrato. Ela nao e necessaria para a importacao manual —
-- o vinculo venda -> loja acontece pelo PV, que este seed preenche.

DO $$
DECLARE
  r record;
  v_cod_empresa integer;
  v_qtd_lojas integer;
  v_inseridos integer := 0;
  v_atualizados integer := 0;
  v_sem_loja text[] := '{}';
  v_ambiguos text[] := '{}';
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
    SELECT count(*), min(e.cod_empresa)
      INTO v_qtd_lojas, v_cod_empresa
      FROM public.empresa e
     WHERE regexp_replace(coalesce(e.cnpj, ''), '\D', '', 'g') = r.cnpj;

    IF v_qtd_lojas = 0 THEN
      v_sem_loja := v_sem_loja || format('%s (%s)', r.cnpj, r.razao_social);
      CONTINUE;
    END IF;

    IF v_qtd_lojas > 1 THEN
      -- Um PV so pode pertencer a uma loja. Espalhar os mesmos PVs por varias
      -- empresas faria a importacao atribuir a venda a primeira que encontrar.
      v_ambiguos := v_ambiguos || format('%s (%s): %s lojas', r.cnpj, r.razao_social, v_qtd_lojas);
      CONTINUE;
    END IF;

    UPDATE public.adquirentes_config
       SET cielo_pvs = r.pvs,
           cielo_documento = r.cnpj,
           ativo = true
     WHERE cod_empresa = v_cod_empresa
       AND adquirente = 'CIELO';

    IF FOUND THEN
      v_atualizados := v_atualizados + 1;
    ELSE
      INSERT INTO public.adquirentes_config
        (cod_empresa, adquirente, ambiente, ativo, cielo_pvs, cielo_documento)
      VALUES
        (v_cod_empresa, 'CIELO', 'production', true, r.pvs, r.cnpj);
      v_inseridos := v_inseridos + 1;
    END IF;
  END LOOP;

  RAISE NOTICE 'Cielo: % configuracao(oes) criada(s), % atualizada(s).', v_inseridos, v_atualizados;

  IF array_length(v_sem_loja, 1) > 0 THEN
    RAISE WARNING 'Cielo: CNPJ sem loja correspondente em public.empresa — cadastre manualmente em Admin > Adquirentes: %',
      array_to_string(v_sem_loja, ' | ');
  END IF;

  IF array_length(v_ambiguos, 1) > 0 THEN
    RAISE WARNING 'Cielo: CNPJ com mais de uma loja em public.empresa — escolha a loja certa manualmente em Admin > Adquirentes: %',
      array_to_string(v_ambiguos, ' | ');
  END IF;
END $$;

-- Conferencia: lista o que ficou cadastrado, para bater contra a planilha.
DO $$
DECLARE r record;
BEGIN
  RAISE NOTICE '--- Estabelecimentos Cielo cadastrados ---';
  FOR r IN
    SELECT ac.cod_empresa, e.nome_fantasia, ac.cielo_documento,
           coalesce(array_length(ac.cielo_pvs, 1), 0) AS qtd_pvs
      FROM public.adquirentes_config ac
      LEFT JOIN public.empresa e ON e.cod_empresa = ac.cod_empresa
     WHERE ac.adquirente = 'CIELO'
     ORDER BY ac.cod_empresa
  LOOP
    RAISE NOTICE 'loja % (%) — CNPJ % — % PV(s)',
      r.cod_empresa, coalesce(r.nome_fantasia, '?'), r.cielo_documento, r.qtd_pvs;
  END LOOP;
END $$;
