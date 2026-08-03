-- O DDA precisa ser espelho exato do banco — e estava virando um acumulador.
--
-- Causa: a checagem de duplicado no import só rodava quando o BTG devolvia um
-- `id` no título. Sem `id`, cada importação inseria tudo de novo. Como a tela
-- de DDA importa sozinha ao abrir e ao trocar de loja, cada visita multiplicava
-- a base. Em 03/08/2026 havia dezenas de linhas identicas do mesmo boleto
-- (Johnson & Johnson, 05/08, R$ 183,00, repetido dez vezes).
--
-- Efeito colateral que travou a conciliacao: N titulos identicos disputam o
-- mesmo lancamento, e a regra recusa vinculo em caso de disputa. Base suja
-- fazia o match legitimo parecer impossivel.
--
-- A linha digitavel e a chave natural do boleto: dois titulos com a mesma linha
-- sao o mesmo documento, venha o `id` que vier.

-- ── 1. Escolhe um sobrevivente por boleto ──
-- Prefere o que ja tem lancamento vinculado (preserva o trabalho feito);
-- na falta dele, o mais antigo.
CREATE TEMP TABLE _dda_keeper ON COMMIT DROP AS
WITH ranked AS (
  SELECT
    t.id,
    t.cod_empresa,
    t.linha_digitavel,
    ROW_NUMBER() OVER (
      PARTITION BY t.cod_empresa, t.linha_digitavel
      ORDER BY
        (EXISTS (SELECT 1 FROM public.lancamentos_financeiros l WHERE l.btg_dda_id = t.id)) DESC,
        t.created_at ASC,
        t.id ASC
    ) AS rn
  FROM public.btg_dda_titulos t
  WHERE t.linha_digitavel IS NOT NULL AND t.linha_digitavel <> ''
)
SELECT id, cod_empresa, linha_digitavel, rn FROM ranked;

-- ── 2. Repõe os vínculos que apontavam para uma cópia ──
UPDATE public.lancamentos_financeiros l
SET btg_dda_id = k.id
FROM _dda_keeper d
JOIN _dda_keeper k
  ON k.cod_empresa = d.cod_empresa
 AND k.linha_digitavel = d.linha_digitavel
 AND k.rn = 1
WHERE l.btg_dda_id = d.id
  AND d.rn > 1;

-- ── 3. Remove as cópias ──
DELETE FROM public.btg_dda_titulos t
USING _dda_keeper k
WHERE t.id = k.id AND k.rn > 1;

-- ── 4. Impede a reincidência no banco, não só no código ──
CREATE UNIQUE INDEX IF NOT EXISTS uniq_dda_titulo_linha
  ON public.btg_dda_titulos (cod_empresa, linha_digitavel)
  WHERE linha_digitavel IS NOT NULL AND linha_digitavel <> '';

COMMENT ON INDEX public.uniq_dda_titulo_linha IS
  'Linha digitavel e a chave natural do boleto. Garante que reimportar nao duplique, mesmo que o BTG omita o id.';

NOTIFY pgrst, 'reload schema';
