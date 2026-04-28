-- 1. Adicionar coluna de auditoria para indicar quando o Opt-in é espelhado de outra loja
ALTER TABLE public.adquirentes_config
ADD COLUMN IF NOT EXISTS gv_optin_mirrored_from integer;

COMMENT ON COLUMN public.adquirentes_config.gv_optin_mirrored_from IS 
'cod_empresa da loja origem do Opt-in. Quando preenchido, indica que o status de Opt-in foi espelhado porque compartilha o mesmo PV Matriz Comercial.';

-- 2. Índice para acelerar busca por PV Matriz compartilhado (GIN em array)
CREATE INDEX IF NOT EXISTS idx_adquirentes_pvs_matriz_gin 
ON public.adquirentes_config USING GIN (pvs_matriz_production);