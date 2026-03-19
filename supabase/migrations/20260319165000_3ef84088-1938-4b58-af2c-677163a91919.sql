
-- RLS policies for recebiveis_cartao: tenant insert/update
CREATE POLICY "Tenant insert recebiveis_cartao"
  ON public.recebiveis_cartao FOR INSERT TO authenticated
  WITH CHECK (cod_empresa IN (
    SELECT uep.cod_empresa FROM user_empresa_permissions uep WHERE uep.user_id = auth.uid()
  ) OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Tenant update recebiveis_cartao"
  ON public.recebiveis_cartao FOR UPDATE TO authenticated
  USING (cod_empresa IN (
    SELECT uep.cod_empresa FROM user_empresa_permissions uep WHERE uep.user_id = auth.uid()
  ) OR public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (cod_empresa IN (
    SELECT uep.cod_empresa FROM user_empresa_permissions uep WHERE uep.user_id = auth.uid()
  ) OR public.has_role(auth.uid(), 'admin'::app_role));

-- Tenant read for recebiveis_cartao (if missing)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'recebiveis_cartao' AND policyname = 'Tenant read recebiveis_cartao'
  ) THEN
    EXECUTE 'CREATE POLICY "Tenant read recebiveis_cartao" ON public.recebiveis_cartao FOR SELECT TO authenticated USING (cod_empresa IN (SELECT uep.cod_empresa FROM user_empresa_permissions uep WHERE uep.user_id = auth.uid()) OR public.has_role(auth.uid(), ''admin''::app_role))';
  END IF;
END $$;

-- RLS policies for recebiveis_cartao_parcelas
CREATE POLICY "Service role full access recebiveis_cartao_parcelas"
  ON public.recebiveis_cartao_parcelas FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated read recebiveis_cartao_parcelas"
  ON public.recebiveis_cartao_parcelas FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Authenticated insert recebiveis_cartao_parcelas"
  ON public.recebiveis_cartao_parcelas FOR INSERT TO authenticated
  WITH CHECK (true);

-- Tenant insert/update for lancamentos_financeiros (if missing)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'lancamentos_financeiros' AND policyname = 'Tenant insert lancamentos'
  ) THEN
    EXECUTE 'CREATE POLICY "Tenant insert lancamentos" ON public.lancamentos_financeiros FOR INSERT TO authenticated WITH CHECK (cod_empresa IN (SELECT uep.cod_empresa FROM user_empresa_permissions uep WHERE uep.user_id = auth.uid()) OR public.has_role(auth.uid(), ''admin''::app_role))';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'lancamentos_financeiros' AND policyname = 'Tenant update lancamentos'
  ) THEN
    EXECUTE 'CREATE POLICY "Tenant update lancamentos" ON public.lancamentos_financeiros FOR UPDATE TO authenticated USING (cod_empresa IN (SELECT uep.cod_empresa FROM user_empresa_permissions uep WHERE uep.user_id = auth.uid()) OR public.has_role(auth.uid(), ''admin''::app_role)) WITH CHECK (cod_empresa IN (SELECT uep.cod_empresa FROM user_empresa_permissions uep WHERE uep.user_id = auth.uid()) OR public.has_role(auth.uid(), ''admin''::app_role))';
  END IF;
END $$;

-- Add updated_at trigger for recebiveis_cartao
CREATE TRIGGER update_recebiveis_cartao_updated_at
  BEFORE UPDATE ON public.recebiveis_cartao
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Add btg-recebiveis-cartao to config (verify_jwt = false)
-- (handled via config.toml)
