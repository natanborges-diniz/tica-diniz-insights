
-- 1. Add sinal column (was rolled back from failed migration)
ALTER TABLE public.dre_plano_contas ADD COLUMN IF NOT EXISTS sinal text NOT NULL DEFAULT '-';

-- 2. Set correct signs
UPDATE public.dre_plano_contas SET sinal = '+' WHERE grupo_dre IN ('RECEITA_BRUTA', 'OUTRAS_RECEITAS');

-- 3. Uppercase all descriptions
UPDATE public.dre_plano_contas SET conta_descricao = UPPER(conta_descricao);

-- 4. Deactivate duplicates
UPDATE public.dre_plano_contas SET ativo = false WHERE conta_numero IN ('3.1.11', '3.10.10', '3.3.5', '3.3.6', '3.4.16');

-- 5. Deactivate separate taxes (Simples Nacional)
UPDATE public.dre_plano_contas SET ativo = false WHERE conta_numero IN ('3.1.2', '3.1.4', '3.1.5', '3.1.6');

-- 6. Deactivate non-DRE items
UPDATE public.dre_plano_contas SET ativo = false WHERE conta_numero = '3.7.18';

-- 7. Reclassify financial accounts to RESULTADO_FINANCEIRO
UPDATE public.dre_plano_contas SET grupo_dre = 'RESULTADO_FINANCEIRO', categoria = 'FINANCEIRO', sinal = '-' WHERE conta_numero IN ('3.6.1', '3.6.2');

-- 8. Reclassify maintenance
UPDATE public.dre_plano_contas SET categoria = 'MANUTENCAO' WHERE conta_numero = '3.7.13';

-- 9. Update existing accounts 4.x to RESULTADO_FINANCEIRO
UPDATE public.dre_plano_contas SET grupo_dre = 'RESULTADO_FINANCEIRO', categoria = 'FINANCEIRO', sinal = '-' WHERE conta_numero IN ('4.1', '4.2', '4.3');
-- 4.1 EMPRESTIMOS gets + sign (receita financeira)
UPDATE public.dre_plano_contas SET sinal = '+', conta_descricao = 'RECEITAS FINANCEIRAS' WHERE conta_numero = '4.1';
UPDATE public.dre_plano_contas SET conta_descricao = 'DESPESAS FINANCEIRAS' WHERE conta_numero = '4.2';
UPDATE public.dre_plano_contas SET conta_descricao = 'JUROS PAGOS' WHERE conta_numero = '4.3';

-- 10. Update 6.1 to OUTRAS_RECEITAS_DESPESAS
UPDATE public.dre_plano_contas SET grupo_dre = 'OUTRAS_RECEITAS_DESPESAS', categoria = 'NAO_OPERACIONAL', sinal = '+', conta_descricao = 'RECEITAS NAO OPERACIONAIS' WHERE conta_numero = '6.1';

-- 11. Insert only truly missing accounts
INSERT INTO public.dre_plano_contas (conta_numero, conta_descricao, grupo_dre, categoria, sinal) VALUES
  ('6.2', 'DESPESAS NAO OPERACIONAIS', 'OUTRAS_RECEITAS_DESPESAS', 'NAO_OPERACIONAL', '-'),
  ('2.4', 'DEVOLUCOES', 'DEDUCOES', 'DEVOLUCOES', '-');
