-- Prêmios podem ser PERCENTUAL (% sobre a base da semana do vendedor) ou
-- VALOR FIXO em R$ (Natan, 2026-07-28). Vale para faixas e sequência.

ALTER TABLE public.premios_config
  ADD COLUMN IF NOT EXISTS tipo_valor TEXT NOT NULL DEFAULT 'PERCENTUAL'
    CHECK (tipo_valor IN ('PERCENTUAL', 'FIXO')),
  ADD COLUMN IF NOT EXISTS valor_fixo NUMERIC(14,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.premios_config.tipo_valor IS
  'PERCENTUAL = percentual_premio % sobre a base da semana; FIXO = valor_fixo em R$';
