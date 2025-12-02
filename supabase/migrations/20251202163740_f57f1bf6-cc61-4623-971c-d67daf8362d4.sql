-- Adiciona coluna para controle de paginação
ALTER TABLE public.etl_controle ADD COLUMN pagina_atual integer DEFAULT 1;