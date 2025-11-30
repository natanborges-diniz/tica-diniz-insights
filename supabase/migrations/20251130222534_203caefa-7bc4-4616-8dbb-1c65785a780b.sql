-- Corrigir search_path da função para segurança
alter function dw.processar_transformacao_dw() set search_path = dw, stg, dq, public;