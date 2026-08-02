CREATE POLICY "Vendedor le proprios itens de fechamento"
  ON public.fechamentos_comissao_itens FOR SELECT TO authenticated
  USING (cod_vendedor = public.get_user_cod_vendedor(auth.uid()));

CREATE POLICY "Vendedor le cabecalhos dos proprios fechamentos"
  ON public.fechamentos_comissao FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.fechamentos_comissao_itens i
       WHERE i.fechamento_id = fechamentos_comissao.id
         AND i.cod_vendedor = public.get_user_cod_vendedor(auth.uid())
    )
  );