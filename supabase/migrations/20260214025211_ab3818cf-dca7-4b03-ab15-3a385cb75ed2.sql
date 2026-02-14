
-- Add 'ativa' column to empresa table (default true for existing records)
ALTER TABLE public.empresa ADD COLUMN ativa boolean NOT NULL DEFAULT true;

-- Mark Loja 10 as inactive
UPDATE public.empresa SET ativa = false WHERE cod_empresa = 10;
