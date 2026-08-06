-- Recuperacao do estado de cielo_pvs / cielo_hmac_key anterior a 20260805210000.
-- Nao houve PITR: a reconstrucao e deterministica a partir de cielo_pvs_planilha
-- (mesma fonte usada pelas migracoes 163000..190000) casando por raiz de CNPJ.

-- 1. Coluna cielo_hmac_key (migracao 20260805200000 nunca chegou ao banco)
ALTER TABLE public.adquirentes_config
  ADD COLUMN IF NOT EXISTS cielo_hmac_key text;

COMMENT ON COLUMN public.adquirentes_config.cielo_hmac_key IS
  'Chave HMAC (X-Signature) do estabelecimento matriz na API EXTC. Se nula, usa o secret CIELO_HMAC_KEY.';

CREATE OR REPLACE FUNCTION public.cielo_propagar_hmac_por_matriz()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.adquirente = 'CIELO'
     AND NEW.cielo_hmac_key IS NOT NULL
     AND NEW.cielo_estabelecimento_matriz IS NOT NULL
     AND NEW.cielo_hmac_key IS DISTINCT FROM OLD.cielo_hmac_key
  THEN
    UPDATE public.adquirentes_config
       SET cielo_hmac_key = NEW.cielo_hmac_key
     WHERE adquirente = 'CIELO'
       AND id <> NEW.id
       AND cielo_estabelecimento_matriz = NEW.cielo_estabelecimento_matriz
       AND cielo_hmac_key IS DISTINCT FROM NEW.cielo_hmac_key;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cielo_propagar_hmac ON public.adquirentes_config;
CREATE TRIGGER trg_cielo_propagar_hmac
  AFTER UPDATE OF cielo_hmac_key ON public.adquirentes_config
  FOR EACH ROW EXECUTE FUNCTION public.cielo_propagar_hmac_por_matriz();

-- 2. Repor cielo_pvs conforme o vinculo por CNPJ vigente antes do espelhamento
WITH pvs AS (
  SELECT ac.id,
         array_agg(p.estabelecimento ORDER BY p.estabelecimento) AS lista
    FROM public.adquirentes_config ac
    JOIN public.cielo_pvs_planilha p
      ON left(regexp_replace(p.cnpj, '\D', '', 'g'), 8)
       = left(regexp_replace(coalesce(ac.cielo_documento, ''), '\D', '', 'g'), 8)
   WHERE ac.adquirente = 'CIELO'
     AND coalesce(ac.cielo_documento, '') <> ''
     AND coalesce(array_length(ac.cielo_pvs, 1), 0) = 0
   GROUP BY ac.id
)
UPDATE public.adquirentes_config ac
   SET cielo_pvs = pvs.lista
  FROM pvs
 WHERE ac.id = pvs.id;

-- 3. Registrar o resultado para conferencia na tela
DELETE FROM public.cielo_vinculo_diagnostico WHERE secao = 'RESTAURACAO';

INSERT INTO public.cielo_vinculo_diagnostico
  (secao, cod_empresa, nome_fantasia, cielo_cnpj, cielo_qtd_pvs, status, detalhe)
SELECT 'RESTAURACAO',
       ac.cod_empresa,
       coalesce(e.nome_fantasia, e.razao_social, '?'),
       ac.cielo_documento,
       coalesce(array_length(ac.cielo_pvs, 1), 0),
       CASE WHEN coalesce(array_length(ac.cielo_pvs, 1), 0) > 0
            THEN 'PVs RESTAURADOS' ELSE 'SEM PV NA PLANILHA' END,
       coalesce(array_to_string(ac.cielo_pvs, ', '), '')
  FROM public.adquirentes_config ac
  LEFT JOIN public.empresa e ON e.cod_empresa = ac.cod_empresa
 WHERE ac.adquirente = 'CIELO'
 ORDER BY ac.cod_empresa;