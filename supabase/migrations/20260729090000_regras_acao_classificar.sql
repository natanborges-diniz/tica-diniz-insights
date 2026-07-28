-- Diferencia os dois tipos de regra em extrato_regras_classificacao:
--   TARIFA      → motor cria lançamento BAIXADO (dialog "Regras de tarifas",
--                 com categoria e valor_max como guarda-corpos)
--   CLASSIFICAR → regra permanente do fluxo de classificação (Lovable 28/07):
--                 motor só classifica a natureza e concilia a linha — nunca
--                 cria lançamento, e o padrão é descrição normalizada literal
--                 (igualdade), não regex.
ALTER TABLE public.extrato_regras_classificacao
  ADD COLUMN IF NOT EXISTS acao TEXT NOT NULL DEFAULT 'TARIFA';

-- Regras já criadas pelo fluxo de classificação: sem categoria e sem teto
-- (as tarifas seed/dialog sempre têm categoria).
UPDATE public.extrato_regras_classificacao
SET acao = 'CLASSIFICAR'
WHERE categoria IS NULL AND valor_max IS NULL;
