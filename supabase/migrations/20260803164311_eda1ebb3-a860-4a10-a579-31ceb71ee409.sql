CREATE INDEX IF NOT EXISTS idx_lancamentos_btg_dda_id
  ON public.lancamentos_financeiros (btg_dda_id)
  WHERE btg_dda_id IS NOT NULL;

CREATE UNLOGGED TABLE _dda_keeper AS
WITH linked AS (
  SELECT DISTINCT btg_dda_id AS id
  FROM public.lancamentos_financeiros
  WHERE btg_dda_id IS NOT NULL
),
ranked AS (
  SELECT
    t.id,
    t.cod_empresa,
    t.linha_digitavel,
    ROW_NUMBER() OVER (
      PARTITION BY t.cod_empresa, t.linha_digitavel
      ORDER BY
        (l.id IS NOT NULL) DESC,
        t.created_at ASC,
        t.id ASC
    ) AS rn
  FROM public.btg_dda_titulos t
  LEFT JOIN linked l ON l.id = t.id
  WHERE t.linha_digitavel IS NOT NULL AND t.linha_digitavel <> ''
)
SELECT id, cod_empresa, linha_digitavel, rn FROM ranked;

CREATE INDEX ON _dda_keeper (id);
CREATE INDEX ON _dda_keeper (cod_empresa, linha_digitavel, rn);

UPDATE public.lancamentos_financeiros l
SET btg_dda_id = k.id
FROM _dda_keeper d
JOIN _dda_keeper k
  ON k.cod_empresa = d.cod_empresa
 AND k.linha_digitavel = d.linha_digitavel
 AND k.rn = 1
WHERE l.btg_dda_id = d.id
  AND d.rn > 1;

DELETE FROM public.btg_dda_titulos t
USING _dda_keeper k
WHERE t.id = k.id AND k.rn > 1;

DROP TABLE _dda_keeper;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_dda_titulo_linha
  ON public.btg_dda_titulos (cod_empresa, linha_digitavel)
  WHERE linha_digitavel IS NOT NULL AND linha_digitavel <> '';

COMMENT ON INDEX public.uniq_dda_titulo_linha IS
  'Linha digitavel e a chave natural do boleto. Garante que reimportar nao duplique, mesmo que o BTG omita o id.';

NOTIFY pgrst, 'reload schema';