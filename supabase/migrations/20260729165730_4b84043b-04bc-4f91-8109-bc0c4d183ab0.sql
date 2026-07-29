-- 20260729130000_premios_valor_fixo.sql
ALTER TABLE public.premios_config
  ADD COLUMN IF NOT EXISTS tipo_valor TEXT NOT NULL DEFAULT 'PERCENTUAL'
    CHECK (tipo_valor IN ('PERCENTUAL', 'FIXO')),
  ADD COLUMN IF NOT EXISTS valor_fixo NUMERIC(14,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.premios_config.tipo_valor IS
  'PERCENTUAL = percentual_premio % sobre a base da semana; FIXO = valor_fixo em R$';

-- 20260729140000_feriados_seed_cidade_loja.sql
ALTER TABLE public.lojas_configuracao
  ADD COLUMN IF NOT EXISTS cidade TEXT,
  ADD COLUMN IF NOT EXISTS uf TEXT NOT NULL DEFAULT 'SP';

CREATE OR REPLACE FUNCTION pg_temp.seed_feriado(
  _data DATE, _descricao TEXT, _tipo TEXT, _uf TEXT, _cidade TEXT, _recorrente BOOLEAN
) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.calendario_feriados f
     WHERE f.descricao = _descricao
       AND f.tipo = _tipo
       AND COALESCE(f.cidade, '') = COALESCE(_cidade, '')
       AND (f.recorrente = _recorrente)
       AND (_recorrente OR f.data = _data)
  ) THEN
    INSERT INTO public.calendario_feriados (data, descricao, tipo, uf, cidade, recorrente)
    VALUES (_data, _descricao, _tipo, _uf, _cidade, _recorrente);
  END IF;
END;
$$;

SELECT pg_temp.seed_feriado('2026-01-01', 'Confraternização Universal', 'NACIONAL', NULL, NULL, true);
SELECT pg_temp.seed_feriado('2026-04-21', 'Tiradentes', 'NACIONAL', NULL, NULL, true);
SELECT pg_temp.seed_feriado('2026-05-01', 'Dia do Trabalho', 'NACIONAL', NULL, NULL, true);
SELECT pg_temp.seed_feriado('2026-09-07', 'Independência do Brasil', 'NACIONAL', NULL, NULL, true);
SELECT pg_temp.seed_feriado('2026-10-12', 'Nossa Senhora Aparecida', 'NACIONAL', NULL, NULL, true);
SELECT pg_temp.seed_feriado('2026-11-02', 'Finados', 'NACIONAL', NULL, NULL, true);
SELECT pg_temp.seed_feriado('2026-11-15', 'Proclamação da República', 'NACIONAL', NULL, NULL, true);
SELECT pg_temp.seed_feriado('2026-11-20', 'Consciência Negra', 'NACIONAL', NULL, NULL, true);
SELECT pg_temp.seed_feriado('2026-12-25', 'Natal', 'NACIONAL', NULL, NULL, true);

SELECT pg_temp.seed_feriado('2026-04-03', 'Sexta-feira Santa', 'NACIONAL', NULL, NULL, false);
SELECT pg_temp.seed_feriado('2027-03-26', 'Sexta-feira Santa', 'NACIONAL', NULL, NULL, false);

SELECT pg_temp.seed_feriado('2026-07-09', 'Revolução Constitucionalista', 'ESTADUAL', 'SP', NULL, true);

SELECT pg_temp.seed_feriado('2026-02-19', 'Aniversário de Osasco', 'MUNICIPAL', 'SP', 'Osasco', true);
SELECT pg_temp.seed_feriado('2026-02-18', 'Aniversário de Itapevi', 'MUNICIPAL', 'SP', 'Itapevi', true);
SELECT pg_temp.seed_feriado('2026-03-26', 'Aniversário de Carapicuíba', 'MUNICIPAL', 'SP', 'Carapicuíba', true);
SELECT pg_temp.seed_feriado('2026-03-26', 'Aniversário de Barueri', 'MUNICIPAL', 'SP', 'Barueri', true);