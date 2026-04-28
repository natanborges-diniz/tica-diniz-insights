-- Adicionar coluna array para múltiplos PVs Matriz Comerciais por loja
ALTER TABLE public.adquirentes_config
  ADD COLUMN IF NOT EXISTS pvs_matriz_production text[] NOT NULL DEFAULT '{}';

-- Popular com PVs Matriz Comerciais reais
UPDATE public.adquirentes_config SET pvs_matriz_production = ARRAY['31974325']  WHERE adquirente='REDE' AND ambiente='production' AND cod_empresa=1;
UPDATE public.adquirentes_config SET pvs_matriz_production = ARRAY['37324330']  WHERE adquirente='REDE' AND ambiente='production' AND cod_empresa=2;
UPDATE public.adquirentes_config SET pvs_matriz_production = ARRAY['49347756']  WHERE adquirente='REDE' AND ambiente='production' AND cod_empresa=4;
UPDATE public.adquirentes_config SET pvs_matriz_production = ARRAY['47586940']  WHERE adquirente='REDE' AND ambiente='production' AND cod_empresa=6;
UPDATE public.adquirentes_config SET pvs_matriz_production = ARRAY['90059441']  WHERE adquirente='REDE' AND ambiente='production' AND cod_empresa=9;
UPDATE public.adquirentes_config SET pvs_matriz_production = ARRAY['94555958']  WHERE adquirente='REDE' AND ambiente='production' AND cod_empresa=15;
UPDATE public.adquirentes_config SET pvs_matriz_production = ARRAY['97679429']  WHERE adquirente='REDE' AND ambiente='production' AND cod_empresa=16;
UPDATE public.adquirentes_config SET pvs_matriz_production = ARRAY['90059441']  WHERE adquirente='REDE' AND ambiente='production' AND cod_empresa=17;
UPDATE public.adquirentes_config SET pvs_matriz_production = ARRAY['90058844','100711383'] WHERE adquirente='REDE' AND ambiente='production' AND cod_empresa=18;

-- Limpar o PV técnico antigo (13381369) da coluna legada para evitar uso indevido
UPDATE public.adquirentes_config SET pv_matriz_production = NULL WHERE adquirente='REDE' AND ambiente='production';