ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS cod_vendedor INTEGER,
  ADD COLUMN IF NOT EXISTS cod_grupo_supervisor INTEGER;

COMMENT ON COLUMN public.profiles.cod_vendedor IS
  'Se preenchido, o usuário é VENDEDOR (PESSOA.cod_pessoa) e o acompanhamento mostra só a própria posição';
COMMENT ON COLUMN public.profiles.cod_grupo_supervisor IS
  'Se preenchido, o usuário é SUPERVISOR do grupo (grupos_lojas.cod_grupo) e vê o consolidado do grupo';