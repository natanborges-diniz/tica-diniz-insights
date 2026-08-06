UPDATE public.lancamentos_financeiros
   SET status = 'AUTORIZADO',
       autorizado_em = COALESCE(autorizado_em, now()),
       observacao = 'Título autorizado no borderô; envio anterior saiu vazio por divergência de status — pronto para reenvio ao banco.',
       updated_at = now()
 WHERE bordero_id = '9ca8e630-2555-497c-a5bd-63ad61e73237'
   AND status = 'BORDERO'
   AND data_baixa IS NULL
   AND COALESCE(valor_pago, 0) = 0;