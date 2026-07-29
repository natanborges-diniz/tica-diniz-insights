-- FIX: lojas_excecoes ficou só com policy de LEITURA (migration 20260212164408
-- dropou a "Public read" antiga e não recriou escrita) — nem admin conseguia
-- salvar exceção pelo calendário. Escrita = admin/gestor, padrão das demais
-- tabelas de calendário.

CREATE POLICY "Admin gestor write lojas_excecoes"
  ON public.lojas_excecoes FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gestor'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gestor'));
