-- Motivo de encerramento do borderô.
--
-- Existe um estado que o sistema não sabia registrar: o borderô montado e
-- liberado cujos títulos acabaram pagos por fora — débito automático, ou alguém
-- pagando direto no aplicativo do banco. O sync do ERP baixa os títulos, e o
-- borderô fica APROVADO com tudo pago, sem nunca ter ido ao BTG.
--
-- Ele não pode ser cancelado (cancelar devolveria títulos que já estão pagos)
-- nem continuar aberto (o painel pedia envio, e enviar pagaria os mesmos boletos
-- de novo). Encerrar é o terceiro caminho, e sem registrar por quê ele vira um
-- PROCESSADO indistinguível dos que passaram pelo banco.

ALTER TABLE public.borderos
  ADD COLUMN IF NOT EXISTS observacao TEXT,
  ADD COLUMN IF NOT EXISTS encerrado_por UUID,
  ADD COLUMN IF NOT EXISTS encerrado_em TIMESTAMPTZ;

COMMENT ON COLUMN public.borderos.observacao IS
  'Por que o bordero foi encerrado sem passar pelo banco. Distingue o PROCESSADO que liquidou no BTG do que foi encerrado porque os titulos ja constavam pagos no ERP.';

NOTIFY pgrst, 'reload schema';
