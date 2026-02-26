-- Drop restrictive policies and recreate as permissive (matching hoya pattern)
DROP POLICY IF EXISTS "Admin read zeiss_empresa_config" ON public.zeiss_empresa_config;
DROP POLICY IF EXISTS "Admin write zeiss_empresa_config" ON public.zeiss_empresa_config;
DROP POLICY IF EXISTS "Service role full access zeiss_empresa_config" ON public.zeiss_empresa_config;

CREATE POLICY "Admin read zeiss_empresa_config" ON public.zeiss_empresa_config
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admin write zeiss_empresa_config" ON public.zeiss_empresa_config
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Service role full access zeiss_empresa_config" ON public.zeiss_empresa_config
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);