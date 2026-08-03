-- Destrava os 3 titulos da loja Uniao presos em PROCESSANDO.
-- O borderô 57c6d847 nunca teve btg_batch_id: o lote não fechou no BTG, então
-- nada foi executado nem debitado. Voltam para Em Preparo mantendo a
-- classificação e os dados de pagamento.
UPDATE public.lancamentos_financeiros l
   SET status = 'PREVISTO',
       bordero_id = NULL,
       autorizado_por = NULL,
       autorizado_em = NULL,
       observacao = 'Destravado de PROCESSANDO: lote BTG nunca fechou, pagamento não foi executado.',
       updated_at = now()
  FROM public.borderos b
 WHERE b.id = l.bordero_id
   AND b.status = 'CANCELADO'
   AND b.btg_batch_id IS NULL
   AND l.status = 'PROCESSANDO'
   AND l.data_baixa IS NULL;