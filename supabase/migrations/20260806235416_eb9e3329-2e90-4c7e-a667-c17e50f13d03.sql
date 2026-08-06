-- Lojas que compartilham raiz de CNPJ precisam casar pelo CNPJ completo.
WITH pvs AS (
  SELECT ac.id,
         array_agg(p.estabelecimento ORDER BY p.estabelecimento) AS lista
    FROM public.adquirentes_config ac
    JOIN public.cielo_pvs_planilha p
      ON regexp_replace(p.cnpj, '\D', '', 'g')
       = regexp_replace(coalesce(ac.cielo_documento, ''), '\D', '', 'g')
   WHERE ac.adquirente = 'CIELO'
     AND ac.cod_empresa IN (9, 17)
   GROUP BY ac.id
)
UPDATE public.adquirentes_config ac
   SET cielo_pvs = pvs.lista
  FROM pvs
 WHERE ac.id = pvs.id;

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