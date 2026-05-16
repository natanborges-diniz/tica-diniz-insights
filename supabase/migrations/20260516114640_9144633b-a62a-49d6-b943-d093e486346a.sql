DROP TABLE IF EXISTS public.capacidade_expositor;

CREATE TABLE public.capacidade_expositor (
  id                uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  cod_empresa       integer     NOT NULL UNIQUE,
  capacidade_total  integer     NOT NULL CHECK (capacidade_total >= 0),
  percentual_solar  integer     NOT NULL CHECK (percentual_solar BETWEEN 0 AND 100),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.capacidade_expositor ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow_all_authenticated" ON public.capacidade_expositor
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE TRIGGER capacidade_expositor_updated_at
  BEFORE UPDATE ON public.capacidade_expositor
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.capacidade_expositor (cod_empresa, capacidade_total, percentual_solar) VALUES
  (1,  800,  25),
  (2,  800,  25),
  (4,  800,  25),
  (6,  1000, 30),
  (9,  1000, 25),
  (13, 1100, 30),
  (14, 800,  25),
  (15, 800,  25),
  (16, 800,  25),
  (17, 600,  20),
  (18, 1100, 30);