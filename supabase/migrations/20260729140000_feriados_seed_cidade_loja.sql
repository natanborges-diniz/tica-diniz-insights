-- Ajustes pós-teste (Natan, 2026-07-28):
-- 1) loja ganha CIDADE/UF — feriado MUNICIPAL só fecha lojas da própria cidade
--    e ESTADUAL só do próprio estado;
-- 2) seed de feriados NÃO facultativos: nacionais (recorrentes), estadual SP
--    (09/07) e aniversários municipais das cidades da rede (Osasco, Itapevi,
--    Carapicuíba, Barueri). Carnaval e Corpus Christi NÃO entram (facultativos)
--    — se algum município os decretar, cadastrar na aba Feriados.

ALTER TABLE public.lojas_configuracao
  ADD COLUMN IF NOT EXISTS cidade TEXT,
  ADD COLUMN IF NOT EXISTS uf TEXT NOT NULL DEFAULT 'SP';

-- ============ seed idempotente (unique tem NULLs → usar NOT EXISTS) ============
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

-- Nacionais fixos (recorrentes todo ano)
SELECT pg_temp.seed_feriado('2026-01-01', 'Confraternização Universal', 'NACIONAL', NULL, NULL, true);
SELECT pg_temp.seed_feriado('2026-04-21', 'Tiradentes', 'NACIONAL', NULL, NULL, true);
SELECT pg_temp.seed_feriado('2026-05-01', 'Dia do Trabalho', 'NACIONAL', NULL, NULL, true);
SELECT pg_temp.seed_feriado('2026-09-07', 'Independência do Brasil', 'NACIONAL', NULL, NULL, true);
SELECT pg_temp.seed_feriado('2026-10-12', 'Nossa Senhora Aparecida', 'NACIONAL', NULL, NULL, true);
SELECT pg_temp.seed_feriado('2026-11-02', 'Finados', 'NACIONAL', NULL, NULL, true);
SELECT pg_temp.seed_feriado('2026-11-15', 'Proclamação da República', 'NACIONAL', NULL, NULL, true);
SELECT pg_temp.seed_feriado('2026-11-20', 'Consciência Negra', 'NACIONAL', NULL, NULL, true);
SELECT pg_temp.seed_feriado('2026-12-25', 'Natal', 'NACIONAL', NULL, NULL, true);

-- Nacionais móveis (por ano — Sexta-feira Santa)
SELECT pg_temp.seed_feriado('2026-04-03', 'Sexta-feira Santa', 'NACIONAL', NULL, NULL, false);
SELECT pg_temp.seed_feriado('2027-03-26', 'Sexta-feira Santa', 'NACIONAL', NULL, NULL, false);

-- Estadual SP (recorrente)
SELECT pg_temp.seed_feriado('2026-07-09', 'Revolução Constitucionalista', 'ESTADUAL', 'SP', NULL, true);

-- Municipais (aniversários das cidades da rede — recorrentes)
SELECT pg_temp.seed_feriado('2026-02-19', 'Aniversário de Osasco', 'MUNICIPAL', 'SP', 'Osasco', true);
SELECT pg_temp.seed_feriado('2026-02-18', 'Aniversário de Itapevi', 'MUNICIPAL', 'SP', 'Itapevi', true);
SELECT pg_temp.seed_feriado('2026-03-26', 'Aniversário de Carapicuíba', 'MUNICIPAL', 'SP', 'Carapicuíba', true);
SELECT pg_temp.seed_feriado('2026-03-26', 'Aniversário de Barueri', 'MUNICIPAL', 'SP', 'Barueri', true);
