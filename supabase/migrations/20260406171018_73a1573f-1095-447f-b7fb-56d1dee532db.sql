
UPDATE lancamentos_financeiros lf
SET 
  subcategoria = pc.conta_descricao,
  dados_extras = COALESCE(lf.dados_extras, '{}'::jsonb) || 
    jsonb_build_object('conta_numero', pc.conta_numero, 'conta_descricao', pc.conta_descricao)
FROM parcelas_cache pc
WHERE lf.origem = 'ERP'
  AND lf.origem_id = CONCAT('ERP-', lf.cod_empresa, '-', COALESCE(pc.documento, pc.id::text))
  AND lf.cod_empresa = pc.cod_empresa
  AND lf.subcategoria IS NULL
  AND pc.conta_descricao IS NOT NULL;
