-- Add percentual_aceitavel column to metas_vendas table
ALTER TABLE public.metas_vendas 
ADD COLUMN IF NOT EXISTS percentual_aceitavel numeric DEFAULT 100;

COMMENT ON COLUMN public.metas_vendas.percentual_aceitavel IS 'Percentual mínimo aceitável da meta (ex: 90 = meta atingida a partir de 90%)';