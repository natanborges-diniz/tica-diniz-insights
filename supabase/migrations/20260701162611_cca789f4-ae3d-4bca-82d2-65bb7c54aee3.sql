
-- FASE 2: voucher_cliente — adicionar filtro tenant (multi-empresa) + preservar service_role

-- Remover policies antigas permissivas (qual=true)
DROP POLICY IF EXISTS "Authenticated users can read vouchers" ON public.voucher_cliente;
DROP POLICY IF EXISTS "Authenticated users can insert vouchers" ON public.voucher_cliente;
DROP POLICY IF EXISTS "Authenticated users can update vouchers" ON public.voucher_cliente;

-- SELECT: admin vê tudo; usuário vê apenas empresas permitidas (user_empresa_permissions ou profile.cod_empresa)
CREATE POLICY "Tenant read vouchers"
ON public.voucher_cliente
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR cod_empresa IN (
    SELECT uep.cod_empresa FROM public.user_empresa_permissions uep WHERE uep.user_id = auth.uid()
  )
  OR cod_empresa = public.get_user_empresa(auth.uid())
);

-- INSERT: apenas em empresas permitidas
CREATE POLICY "Tenant insert vouchers"
ON public.voucher_cliente
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  OR cod_empresa IN (
    SELECT uep.cod_empresa FROM public.user_empresa_permissions uep WHERE uep.user_id = auth.uid()
  )
  OR cod_empresa = public.get_user_empresa(auth.uid())
);

-- UPDATE: apenas em empresas permitidas
CREATE POLICY "Tenant update vouchers"
ON public.voucher_cliente
FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR cod_empresa IN (
    SELECT uep.cod_empresa FROM public.user_empresa_permissions uep WHERE uep.user_id = auth.uid()
  )
  OR cod_empresa = public.get_user_empresa(auth.uid())
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  OR cod_empresa IN (
    SELECT uep.cod_empresa FROM public.user_empresa_permissions uep WHERE uep.user_id = auth.uid()
  )
  OR cod_empresa = public.get_user_empresa(auth.uid())
);

-- Service role (edge functions) — acesso total explícito
CREATE POLICY "Service role full access vouchers"
ON public.voucher_cliente
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);
