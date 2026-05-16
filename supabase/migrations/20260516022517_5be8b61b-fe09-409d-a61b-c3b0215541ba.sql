CREATE TABLE IF NOT EXISTS public.capacidade_expositor (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  cod_empresa integer     NOT NULL,
  categoria   text        NOT NULL DEFAULT 'TODOS',
  capacidade  integer     NOT NULL DEFAULT 0,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now(),
  UNIQUE (cod_empresa, categoria)
);

ALTER TABLE public.capacidade_expositor ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow_all_authenticated" ON public.capacidade_expositor
  AS PERMISSIVE FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE TRIGGER capacidade_expositor_updated_at
  BEFORE UPDATE ON public.capacidade_expositor
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.capacidade_expositor (cod_empresa, categoria, capacidade)
SELECT
  cod_empresa,
  categoria,
  SUM(quantidade_minima) AS capacidade
FROM public.estoque_minimo_loja
GROUP BY cod_empresa, categoria
ON CONFLICT (cod_empresa, categoria) DO NOTHING;