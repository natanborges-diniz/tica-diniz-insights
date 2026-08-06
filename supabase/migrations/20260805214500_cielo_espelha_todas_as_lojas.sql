-- Garante uma linha CIELO para TODA loja ativa.
--
-- A migracao anterior espelhava a partir de adquirentes_config da REDE, o que
-- deixa de fora qualquer loja sem REDE ativa — Diniz Barueri e Diniz Itapevi
-- continuaram sem aparecer na aba Cielo. Aqui a origem passa a ser a propria
-- tabela de lojas, entao nenhuma fica para tras.
--
-- Idempotente: pode rodar depois da 20260805210000 ou no lugar dela. Nada e
-- sobrescrito — matriz de extrato, chave HMAC e PVs ja preenchidos a mao
-- continuam como estao.

-- ---------------------------------------------------------------------------
-- 1. Uma linha CIELO por loja ativa
-- ---------------------------------------------------------------------------

INSERT INTO public.adquirentes_config
  (cod_empresa, adquirente, ambiente, ativo, cielo_pvs)
SELECT e.cod_empresa, 'CIELO', 'production', true, '{}'::text[]
  FROM public.empresa e
 WHERE coalesce(e.ativa, true) = true
   AND NOT EXISTS (
     SELECT 1 FROM public.adquirentes_config c
      WHERE c.adquirente = 'CIELO' AND c.cod_empresa = e.cod_empresa
   );

-- ---------------------------------------------------------------------------
-- 2. CNPJ no formato que a API da Cielo espera
-- ---------------------------------------------------------------------------

-- Somente digitos: e assim que o campo viaja nas chamadas e e assim que a
-- comparacao com o extrato funciona. Mascara aqui vira divergencia depois.
UPDATE public.adquirentes_config ac
   SET cielo_documento = fonte.cnpj
  FROM (
    SELECT e.cod_empresa,
           COALESCE(
             nullif(regexp_replace(coalesce(e.cnpj, ''), '\D', '', 'g'), ''),
             nullif(regexp_replace(coalesce(b.cnpj, ''), '\D', '', 'g'), '')
           ) AS cnpj
      FROM public.empresa e
      LEFT JOIN public.btg_contas_bancarias b ON b.cod_empresa = e.cod_empresa
  ) AS fonte
 WHERE ac.adquirente = 'CIELO'
   AND ac.cod_empresa = fonte.cod_empresa
   AND fonte.cnpj IS NOT NULL
   AND ac.cielo_documento IS DISTINCT FROM fonte.cnpj;

-- Normaliza tambem o que ja estava gravado com mascara.
UPDATE public.adquirentes_config
   SET cielo_documento = regexp_replace(cielo_documento, '\D', '', 'g')
 WHERE adquirente = 'CIELO'
   AND cielo_documento IS NOT NULL
   AND cielo_documento <> regexp_replace(cielo_documento, '\D', '', 'g');

-- ---------------------------------------------------------------------------
-- 3. Conferencia — o que aparece na aba Cielo e o que falta preencher
-- ---------------------------------------------------------------------------

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
  CASE
    WHEN c.id IS NULL THEN 'SEM LINHA CIELO'
    WHEN c.cielo_documento IS NULL THEN 'SEM CNPJ — preencha na tela'
    WHEN coalesce(array_length(c.cielo_pvs, 1), 0) = 0 THEN 'AGUARDANDO PVs'
    ELSE 'OK'
  END,
  coalesce(c.cielo_estabelecimento_matriz, '(matriz nao preenchida)')
FROM public.empresa e
LEFT JOIN public.adquirentes_config c
       ON c.cod_empresa = e.cod_empresa AND c.adquirente = 'CIELO'
WHERE coalesce(e.ativa, true) = true
ORDER BY e.cod_empresa;

INSERT INTO public.cielo_vinculo_diagnostico (secao, status, detalhe)
SELECT 'PENDENTE',
       format('%s loja(s) na aba Cielo, %s ainda sem PV',
              count(*), count(*) FILTER (WHERE coalesce(array_length(cielo_pvs, 1), 0) = 0)),
       'PVs em operacao para distribuir: SELECT * FROM cielo_pvs_planilha WHERE em_operacao ORDER BY cnpj;'
  FROM public.adquirentes_config WHERE adquirente = 'CIELO';
