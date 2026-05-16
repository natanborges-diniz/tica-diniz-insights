-- Remove tabela estoque_minimo_loja, substituída por capacidade_expositor.
-- A tabela esteve vazia durante toda a Fase 1.5; a lógica de mínimo OTB
-- foi migrada para capacidade_expositor (Entrega 3 da Fase 1.5).
-- Aplicar coordenadamente com o deploy do bridge (fase-1.5-sql-faixas-alinhadas).
DROP TABLE IF EXISTS public.estoque_minimo_loja;
