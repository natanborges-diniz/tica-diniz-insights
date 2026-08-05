-- Exceção aprovada volta ao trilho do borderô (decisão 05/08/2026).
-- O aprovar_excecao antigo levava o lançamento direto a AUTORIZADO sem borderô
-- = limbo invisível no Hub (caso real: operador recadastrou o mesmo lançamento).
-- Resgata os que ficaram presos: voltam a CLASSIFICADO com a flag de aprovação
-- (dados_extras.excecao_aprovada_por, já gravada), prontos para entrar em borderô.
UPDATE public.lancamentos_financeiros
SET status = 'CLASSIFICADO'
WHERE lastro = 'EXCECAO'
  AND status = 'AUTORIZADO'
  AND bordero_id IS NULL;

NOTIFY pgrst, 'reload schema';
