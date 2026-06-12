DROP POLICY IF EXISTS "Module edit write fornecedor_marca" ON public.fornecedor_marca;

CREATE POLICY "Estoque edit write fornecedor_marca"
ON public.fornecedor_marca
FOR ALL
TO authenticated
USING (public.has_module_edit_access(auth.uid(), 'estoque'))
WITH CHECK (public.has_module_edit_access(auth.uid(), 'estoque'));