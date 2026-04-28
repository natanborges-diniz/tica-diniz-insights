-- One-shot: espelhar Opt-in da AGU (cod 9) para STO ANTONIO (cod 17)
UPDATE public.adquirentes_config 
SET 
  gv_optin_external_id = '049d2a00-6e64-4d29-8815-26fe23079df9',
  gv_optin_status = 'AGUARDANDO_ACEITE',
  gv_optin_requested_at = '2026-04-28 13:04:43.728+00'::timestamptz,
  gv_optin_request_payload = '{"permissions":"R","requestCompanyNumber":90059441,"requestType":"T"}'::jsonb,
  gv_optin_response = '{"companyNumbers":[104169559,97734748,104172207],"createdDate":"2026-04-28 10:04:43","requestCompanyNumber":90059441,"requestId":"049d2a00-6e64-4d29-8815-26fe23079df9","status":"PENDENTE"}'::jsonb,
  gv_optin_mirrored_from = 9,
  updated_at = now()
WHERE cod_empresa = 17 AND adquirente = 'REDE';