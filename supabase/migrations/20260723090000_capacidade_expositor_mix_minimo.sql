-- Fase 2.0b — Passo 2: mínimo padrão do mix por loja
--
-- capacidade_expositor.mix_minimo é o mínimo default (em peças) que uma marca
-- precisa ter no mix daquela loja para NÃO ser sugerida como descontinuação.
-- NULL → herda o fallback global em código (MIX_MINIMO_MARCA = 25).
--
-- Cascata no motor V2:
--   minimoEfetivo = marca_config.minimo_proprio
--                ?? capacidade_expositor.mix_minimo
--                ?? MIX_MINIMO_MARCA (25, fallback em código)

ALTER TABLE public.capacidade_expositor
  ADD COLUMN mix_minimo int NULL
    CHECK (mix_minimo IS NULL OR mix_minimo >= 0);

COMMENT ON COLUMN public.capacidade_expositor.mix_minimo IS
  'Mínimo padrão de peças por marca no mix desta loja. NULL herda MIX_MINIMO_MARCA (25) em código. Override por marca em marca_config.minimo_proprio.';
