CREATE POLICY "Admins manage lojas_configuracao"
ON public.lojas_configuracao
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));