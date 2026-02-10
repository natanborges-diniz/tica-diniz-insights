ALTER TABLE public.os_hub_receitas
  ADD COLUMN IF NOT EXISTS lente_od_descricao text,
  ADD COLUMN IF NOT EXISTS lente_oe_descricao text;