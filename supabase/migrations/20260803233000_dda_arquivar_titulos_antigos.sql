-- Arquiva de uma vez o passivo histórico do DDA.
--
-- Diagnóstico de 03/08/2026, depois de limpar as duplicatas: dos 215 títulos
-- ainda sem vínculo, ~150 tinham como lançamento mais próximo algo a 466 dias
-- de distância. Não é falha de conciliação — o DDA do BTG devolve tudo que já
-- passou pela conta, e as lojas 1, 2 e 4 têm título desde fevereiro de 2018.
-- Essa dívida nunca esteve neste sistema, então não existe par e nunca haverá.
--
-- Sem arquivar, ela infla para sempre a contagem de "boleto sem lançamento" e
-- esconde os casos que realmente pedem atenção.
--
-- Só toca no que está sem vínculo: título ligado a um lançamento guarda o
-- histórico do pagamento e permanece, por mais antigo que seja.

UPDATE public.btg_dda_titulos t
SET status = 'ARQUIVADO'
WHERE t.data_vencimento < current_date - 90
  AND t.status NOT IN ('ARQUIVADO', 'PAGO', 'IGNORADO')
  AND NOT EXISTS (
    SELECT 1 FROM public.lancamentos_financeiros l WHERE l.btg_dda_id = t.id
  );

COMMENT ON COLUMN public.btg_dda_titulos.status IS
  'PENDENTE · CONCILIADO · PAGAMENTO_PENDENTE · PAGO · IGNORADO (decisao humana) · ARQUIVADO (envelhecido sem par, automatico).';

NOTIFY pgrst, 'reload schema';
