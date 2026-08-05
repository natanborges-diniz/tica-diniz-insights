-- Desempate dos tres CNPJs que a razao social nao resolvia (matriz x filial).
--
-- Definicao do Natan:
--   M DE M GOMES OPTICA   -> so opera o CNPJ 0001-26, loja "Primitiva 2"
--   A B BORGES OPTICA     -> so opera o CNPJ 0002-15, loja "Diniz Uniao"
--   SP CASTRO OPTICA      -> 0001-68 e "Antonio Agu...", 0002-49 e "Santo Antonio"
--
-- Decisao sobre os CNPJs nao operados (13844111000207 e 19280952000134): os PVs
-- deles ficam na mesma loja da raiz de CNPJ, em vez de sem dono. Se de fato nao
-- tiverem movimento, nada muda; se aparecer venda, ela cai na loja do mesmo
-- negocio em vez de sumir da conciliacao.
--
-- A loja e localizada por nome, exigindo correspondencia unica. Nada e gravado
-- no escuro: o que nao casar sai como WARNING e a lista completa das lojas e
-- impressa no fim, para resolver na mao em Admin > Adquirentes.

-- A migracao anterior vincula por razao social e, nestas tres empresas, ela
-- decide pela ORDEM em que os CNPJs aparecem — o que pode prender a loja ao
-- CNPJ errado (o que o Natan disse que nao e operado). Esta migracao e a fonte
-- da verdade para essas raizes, entao limpa o que veio antes em vez de pular.
DELETE FROM public.adquirentes_config
 WHERE adquirente = 'CIELO'
   AND left(coalesce(cielo_documento, ''), 8) IN ('13844111', '19280952', '35385887');

DO $$
DECLARE
  r record;
  v_cod integer;
  v_qtd integer;
  v_ok integer := 0;
  v_pendentes text[] := '{}';
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      -- rotulo,            padrao de busca no nome,   cnpj,             PVs
      ('Primitiva 2',       'PRIMITIVA',               '13844111000126',
        ARRAY['2809988433','1032636880','2837060040','1072478584']),
      ('Diniz Uniao',       'UNIAO',                   '19280952000215',
        ARRAY['2809988409','2838722330','1055799637','1048250935']),
      -- "Antonio Agu..." — nao e Aguiar. O padrao fica no prefixo, que ja
      -- distingue de "Santo Antonio" sem depender do resto do nome.
      ('Antonio Agu',       'ANTONIO AGU',             '35385887000168',
        ARRAY['2837031318','2809988441']),
      ('Santo Antonio',     'SANTO',                   '35385887000249',
        ARRAY['2895579967'])
    ) AS t(rotulo, padrao, cnpj, pvs)
  LOOP
    -- "SANTO ANTONIO" tambem contem "ANTONIO"; por isso um procura por
    -- "ANTONIO AGU" e o outro por "SANTO" — padroes que nao se cruzam.
    SELECT count(*), min(e.cod_empresa)
      INTO v_qtd, v_cod
      FROM public.empresa e
     WHERE public.cielo_norm_razao(coalesce(e.nome_fantasia, '')) LIKE '%' || r.padrao || '%'
        OR public.cielo_norm_razao(coalesce(e.razao_social, '')) LIKE '%' || r.padrao || '%';

    IF v_qtd <> 1 THEN
      v_pendentes := v_pendentes || format('%s (CNPJ %s): %s loja(s) para o padrao "%s"',
                                           r.rotulo, r.cnpj, v_qtd, r.padrao);
      CONTINUE;
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.adquirentes_config
       WHERE adquirente = 'CIELO' AND cod_empresa = v_cod
    ) THEN
      UPDATE public.adquirentes_config
         SET cielo_pvs = r.pvs, cielo_documento = r.cnpj, ativo = true
       WHERE adquirente = 'CIELO' AND cod_empresa = v_cod;
    ELSE
      INSERT INTO public.adquirentes_config
        (cod_empresa, adquirente, ambiente, ativo, cielo_pvs, cielo_documento)
      VALUES (v_cod, 'CIELO', 'production', true, r.pvs, r.cnpj);
    END IF;

    UPDATE public.empresa
       SET cnpj = r.cnpj
     WHERE cod_empresa = v_cod AND (cnpj IS NULL OR btrim(cnpj) = '');

    v_ok := v_ok + 1;
    RAISE NOTICE 'Cielo: % -> loja % (% PVs)', r.rotulo, v_cod, array_length(r.pvs, 1);
  END LOOP;

  RAISE NOTICE 'Cielo: % desempate(s) aplicado(s).', v_ok;

  IF array_length(v_pendentes, 1) > 0 THEN
    RAISE WARNING 'Cielo: nao consegui identificar a loja — resolva em Admin > Adquirentes: %',
      array_to_string(v_pendentes, ' | ');
  END IF;
END $$;

-- Situacao final: todas as lojas e o que cada uma tem de Cielo.
DO $$
DECLARE
  r record;
  v_lojas integer;
  v_pvs integer;
BEGIN
  RAISE NOTICE '--- Lojas cadastradas x Cielo ---';
  FOR r IN
    SELECT e.cod_empresa,
           coalesce(e.nome_fantasia, e.razao_social, '?') AS nome,
           e.cnpj,
           ac.cielo_documento,
           coalesce(array_length(ac.cielo_pvs, 1), 0) AS qtd_pvs
      FROM public.empresa e
      LEFT JOIN public.adquirentes_config ac
        ON ac.cod_empresa = e.cod_empresa AND ac.adquirente = 'CIELO'
     ORDER BY e.cod_empresa
  LOOP
    RAISE NOTICE 'loja % | % | CNPJ empresa: % | CNPJ Cielo: % | % PV(s)',
      r.cod_empresa, r.nome, coalesce(r.cnpj, '(vazio)'),
      coalesce(r.cielo_documento, '(sem Cielo)'), r.qtd_pvs;
  END LOOP;

  SELECT count(*), coalesce(sum(coalesce(array_length(cielo_pvs, 1), 0)), 0)
    INTO v_lojas, v_pvs
    FROM public.adquirentes_config WHERE adquirente = 'CIELO';

  RAISE NOTICE 'TOTAL: % loja(s) com Cielo, % PV(s) de 22 esperados.', v_lojas, v_pvs;

  IF v_pvs <> 22 THEN
    RAISE WARNING 'Faltam % PV(s) para fechar os 22 da planilha.', 22 - v_pvs;
  END IF;
END $$;
