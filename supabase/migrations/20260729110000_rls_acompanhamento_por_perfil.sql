-- Fase 3 — ACESSO RESTRITO por perfil no acompanhamento de metas.
-- 1) Vendedor NÃO pode alterar o próprio vínculo (cod_vendedor/grupo) — só
--    admin (senão trocaria o vínculo e leria números de outro vendedor).
-- 2) recebimentos_agregado_diario deixa de ser leitura pública: cada um lê só
--    o próprio recorte — vendedor: só as próprias linhas; gerente/gestor: as
--    lojas permitidas (profile + user_empresa_permissions); supervisor: as
--    lojas do grupo; admin: tudo. Escrita continua só service role (sync).

-- ============================================================
-- 1) proteger vínculos no profiles (mesmo padrão do protect_cod_empresa)
-- ============================================================
CREATE OR REPLACE FUNCTION public.protect_vinculos_metas()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF (NEW.cod_vendedor IS DISTINCT FROM OLD.cod_vendedor)
     OR (NEW.cod_grupo_supervisor IS DISTINCT FROM OLD.cod_grupo_supervisor) THEN
    IF auth.uid() IS NULL THEN
      RAISE EXCEPTION 'Unauthenticated';
    END IF;
    IF NOT public.has_role(auth.uid(), 'admin') THEN
      RAISE EXCEPTION 'Only admins can change metas bindings (cod_vendedor / cod_grupo_supervisor)';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_vinculos_metas_trigger ON public.profiles;
CREATE TRIGGER protect_vinculos_metas_trigger
  BEFORE UPDATE ON public.profiles FOR EACH ROW
  EXECUTE FUNCTION public.protect_vinculos_metas();

-- ============================================================
-- 2) helpers de escopo (SECURITY DEFINER, padrão do get_user_empresa)
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_user_cod_vendedor(_user_id UUID)
RETURNS INTEGER LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT cod_vendedor FROM public.profiles WHERE id = _user_id LIMIT 1 $$;

CREATE OR REPLACE FUNCTION public.get_user_grupo_supervisor(_user_id UUID)
RETURNS INTEGER LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT cod_grupo_supervisor FROM public.profiles WHERE id = _user_id LIMIT 1 $$;

-- ============================================================
-- 3) RLS do recebimentos_agregado_diario por perfil
-- ============================================================
DROP POLICY IF EXISTS "Public read recebimentos_agregado_diario"
  ON public.recebimentos_agregado_diario;

CREATE POLICY "Scoped read recebimentos_agregado_diario"
  ON public.recebimentos_agregado_diario FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR (
      -- VENDEDOR vinculado: só as próprias linhas
      public.get_user_cod_vendedor(auth.uid()) IS NOT NULL
      AND cod_vendedor = public.get_user_cod_vendedor(auth.uid())
    )
    OR (
      -- demais perfis: lojas permitidas (profile, permissões extras ou grupo)
      public.get_user_cod_vendedor(auth.uid()) IS NULL
      AND (
        cod_empresa = public.get_user_empresa(auth.uid())
        OR cod_empresa IN (
          SELECT uep.cod_empresa FROM public.user_empresa_permissions uep
           WHERE uep.user_id = auth.uid()
        )
        OR cod_empresa IN (
          SELECT glm.cod_empresa FROM public.grupos_lojas_membros glm
           WHERE glm.cod_grupo = public.get_user_grupo_supervisor(auth.uid())
        )
      )
    )
  );

CREATE POLICY "Service role full access recebimentos_agregado_diario"
  ON public.recebimentos_agregado_diario FOR ALL TO service_role
  USING (true) WITH CHECK (true);
