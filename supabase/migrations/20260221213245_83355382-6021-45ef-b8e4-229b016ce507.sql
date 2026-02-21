
-- 1. Adicionar coluna access_level
ALTER TABLE public.user_module_permissions 
  ADD COLUMN access_level text NOT NULL DEFAULT 'nenhum';

-- 2. Migrar dados existentes: enabled=true -> 'total', enabled=false -> 'nenhum'
UPDATE public.user_module_permissions 
  SET access_level = CASE WHEN enabled THEN 'total' ELSE 'nenhum' END;

-- 3. Remover coluna antiga
ALTER TABLE public.user_module_permissions DROP COLUMN enabled;

-- 4. Atualizar função has_module_access para usar access_level
CREATE OR REPLACE FUNCTION public.has_module_access(_user_id uuid, _module text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT access_level != 'nenhum' FROM public.user_module_permissions WHERE user_id = _user_id AND module = _module),
    false
  )
$$;
