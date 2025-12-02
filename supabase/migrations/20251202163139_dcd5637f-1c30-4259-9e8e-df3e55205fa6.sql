-- Adiciona constraint unique na coluna entidade para suportar upsert
ALTER TABLE public.etl_controle ADD CONSTRAINT etl_controle_entidade_unique UNIQUE (entidade);