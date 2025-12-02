-- Habilita RLS na tabela empresa
ALTER TABLE public.empresa ENABLE ROW LEVEL SECURITY;

-- Política para service role ter acesso total
CREATE POLICY "Service role full access empresa" ON public.empresa
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Política para leitura pública (dados de empresa não são sensíveis)
CREATE POLICY "Public read empresa" ON public.empresa
FOR SELECT
TO anon, authenticated
USING (true);