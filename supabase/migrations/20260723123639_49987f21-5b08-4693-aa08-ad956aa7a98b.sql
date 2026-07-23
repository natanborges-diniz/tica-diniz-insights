ALTER TABLE public.capacidade_expositor ADD COLUMN mix_minimo integer NULL CHECK (mix_minimo >= 0);
COMMENT ON COLUMN public.capacidade_expositor.mix_minimo IS 'Mínimo padrão de peças por marca para a loja. NULL = usa o padrão do sistema (25).';

ALTER TABLE public.marca_config ADD COLUMN minimo_proprio integer NULL CHECK (minimo_proprio >= 0);
COMMENT ON COLUMN public.marca_config.minimo_proprio IS 'Mínimo específico daquela marca naquela loja (exceção). NULL = herda o mix_minimo da loja.';