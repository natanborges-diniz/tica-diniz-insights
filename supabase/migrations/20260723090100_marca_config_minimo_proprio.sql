-- Fase 2.0b — Passo 2: exceção de mínimo por marca dentro da loja
--
-- marca_config.minimo_proprio permite sobrescrever, para uma marca específica,
-- o mínimo padrão da loja (capacidade_expositor.mix_minimo). Usado quando o
-- gestor decide manter uma presença mínima maior (ou menor) que o padrão.
-- NULL → herda capacidade_expositor.mix_minimo, e este por sua vez pode ser
-- NULL para herdar o fallback global em código (MIX_MINIMO_MARCA = 25).

ALTER TABLE public.marca_config
  ADD COLUMN minimo_proprio int NULL
    CHECK (minimo_proprio IS NULL OR minimo_proprio >= 0);

COMMENT ON COLUMN public.marca_config.minimo_proprio IS
  'Mínimo por marca nesta loja. Sobrescreve capacidade_expositor.mix_minimo. NULL herda o mínimo da loja.';
