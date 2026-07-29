-- Fase 3 — escopo do acompanhamento por perfil (docs/REVISAO_VENDAS_METAS.md
-- §5.4 item 2 e decisão §7.6):
--   * vendedor: vê SÓ a própria meta/posição  → profiles.cod_vendedor
--   * gerente:  vê a loja inteira             → role 'gestor' + profiles.cod_empresa
--   * supervisor: vê um grupo de lojas        → profiles.cod_grupo_supervisor
--   * admin (master): vê tudo
-- Não alteramos o enum app_role (ALTER TYPE ADD VALUE não roda em transação de
-- migration); o papel de supervisor é inferido pela coluna de grupo.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS cod_vendedor INTEGER,
  ADD COLUMN IF NOT EXISTS cod_grupo_supervisor INTEGER;

COMMENT ON COLUMN public.profiles.cod_vendedor IS
  'Se preenchido, o usuário é VENDEDOR (PESSOA.cod_pessoa) e o acompanhamento mostra só a própria posição';
COMMENT ON COLUMN public.profiles.cod_grupo_supervisor IS
  'Se preenchido, o usuário é SUPERVISOR do grupo (grupos_lojas.cod_grupo) e vê o consolidado do grupo';
