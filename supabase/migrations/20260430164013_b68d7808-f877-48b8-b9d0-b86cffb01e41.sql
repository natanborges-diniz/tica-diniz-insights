CREATE OR REPLACE VIEW public.v_conciliacao_loja_resumo AS
WITH vc AS (
  SELECT cod_empresa, COUNT(*) AS qtd_vendas, COALESCE(SUM(valor_bruto),0) AS total_bruto,
         COALESCE(SUM(valor_liquido),0) AS total_liquido, COALESCE(SUM(taxa_valor),0) AS total_taxas,
         MAX(data_venda) AS ultima_venda, MAX(updated_at) AS ultima_sync
  FROM public.vendas_cartao WHERE data_venda >= CURRENT_DATE - INTERVAL '90 days' GROUP BY cod_empresa
),
cn AS (
  SELECT v.cod_empresa,
    COUNT(*) FILTER (WHERE c.status = 'CONCILIADO') AS qtd_conciliado,
    COUNT(*) FILTER (WHERE c.status = 'DIVERGENTE') AS qtd_divergente,
    COUNT(*) FILTER (WHERE c.status IN ('PENDENTE_ERP','PENDENTE_ADQ')) AS qtd_pendente
  FROM public.vendas_cartao v
  LEFT JOIN public.conciliacao_vendas c ON c.venda_cartao_id = v.id
  WHERE v.data_venda >= CURRENT_DATE - INTERVAL '90 days' GROUP BY v.cod_empresa
)
SELECT e.cod_empresa, e.nome_fantasia, ac.ambiente, ac.gv_optin_status, ac.gv_last_healthcheck_status,
  COALESCE(array_length(ac.pvs_matriz_production, 1), 0) AS qtd_pvs,
  COALESCE(vc.qtd_vendas, 0) AS qtd_vendas, COALESCE(vc.total_bruto, 0) AS total_bruto,
  COALESCE(vc.total_liquido, 0) AS total_liquido, COALESCE(vc.total_taxas, 0) AS total_taxas,
  vc.ultima_venda, vc.ultima_sync,
  COALESCE(cn.qtd_conciliado, 0) AS qtd_conciliado, COALESCE(cn.qtd_divergente, 0) AS qtd_divergente,
  COALESCE(cn.qtd_pendente, 0) AS qtd_pendente
FROM public.empresa e
LEFT JOIN public.adquirentes_config ac ON ac.cod_empresa = e.cod_empresa AND ac.adquirente = 'REDE' AND ac.ativo = true
LEFT JOIN vc ON vc.cod_empresa = e.cod_empresa
LEFT JOIN cn ON cn.cod_empresa = e.cod_empresa
WHERE ac.id IS NOT NULL
ORDER BY e.cod_empresa;

GRANT SELECT ON public.v_conciliacao_loja_resumo TO authenticated, service_role;