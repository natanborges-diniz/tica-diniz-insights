-- Protege a configuracao Cielo preenchida a mao.
--
-- Contexto: as migracoes 20260805182000, 190000 e 210000 destruiram dados que o
-- Natan tinha preenchido na tela — a 210000 zerou cielo_pvs achando que eram os
-- PVs distribuidos errado pelo algoritmo, e as outras duas usaram DELETE+INSERT
-- sem repor cielo_estabelecimento_matriz e cielo_hmac_key.
--
-- Duas defesas, porque a primeira sozinha nao teria evitado o problema:
--
--   1. Historico automatico: toda alteracao nas colunas cielo_* fica gravada em
--      cielo_config_historico. Se algo apagar de novo, o valor anterior existe
--      e da para restaurar com um UPDATE.
--
--   2. Trigger que recusa apagar o que esta preenchido, a menos que o autor
--      diga explicitamente que quer. Migracao nenhuma deveria conseguir zerar
--      um campo preenchido a mao por acidente.

-- ---------------------------------------------------------------------------
-- 1. Historico
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.cielo_config_historico (
  id bigserial PRIMARY KEY,
  config_id uuid,
  cod_empresa integer,
  momento timestamptz NOT NULL DEFAULT now(),
  operacao text NOT NULL,
  autor text,
  matriz_anterior text,
  matriz_nova text,
  pvs_anterior text[],
  pvs_novo text[],
  documento_anterior text,
  documento_novo text,
  hmac_anterior_preenchida boolean,
  hmac_nova_preenchida boolean
);

CREATE INDEX IF NOT EXISTS idx_cielo_hist_empresa
  ON public.cielo_config_historico (cod_empresa, momento DESC);

COMMENT ON TABLE public.cielo_config_historico IS
  'Historico das colunas cielo_* de adquirentes_config. A chave HMAC e registrada apenas como "estava preenchida ou nao", nunca em texto.';

ALTER TABLE public.cielo_config_historico ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin read cielo_config_historico"
  ON public.cielo_config_historico FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Service role full access cielo_config_historico"
  ON public.cielo_config_historico FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.cielo_registrar_historico()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.adquirente = 'CIELO' THEN
      INSERT INTO public.cielo_config_historico
        (config_id, cod_empresa, operacao, autor, matriz_anterior, pvs_anterior,
         documento_anterior, hmac_anterior_preenchida)
      VALUES (OLD.id, OLD.cod_empresa, 'DELETE', current_user,
              OLD.cielo_estabelecimento_matriz, OLD.cielo_pvs,
              OLD.cielo_documento, OLD.cielo_hmac_key IS NOT NULL);
    END IF;
    RETURN OLD;
  END IF;

  IF NEW.adquirente <> 'CIELO' THEN RETURN NEW; END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.cielo_estabelecimento_matriz IS NOT DISTINCT FROM OLD.cielo_estabelecimento_matriz
     AND NEW.cielo_pvs IS NOT DISTINCT FROM OLD.cielo_pvs
     AND NEW.cielo_documento IS NOT DISTINCT FROM OLD.cielo_documento
     AND NEW.cielo_hmac_key IS NOT DISTINCT FROM OLD.cielo_hmac_key
  THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.cielo_config_historico
    (config_id, cod_empresa, operacao, autor,
     matriz_anterior, matriz_nova, pvs_anterior, pvs_novo,
     documento_anterior, documento_novo,
     hmac_anterior_preenchida, hmac_nova_preenchida)
  VALUES (NEW.id, NEW.cod_empresa, TG_OP, current_user,
          CASE WHEN TG_OP = 'UPDATE' THEN OLD.cielo_estabelecimento_matriz END,
          NEW.cielo_estabelecimento_matriz,
          CASE WHEN TG_OP = 'UPDATE' THEN OLD.cielo_pvs END,
          NEW.cielo_pvs,
          CASE WHEN TG_OP = 'UPDATE' THEN OLD.cielo_documento END,
          NEW.cielo_documento,
          CASE WHEN TG_OP = 'UPDATE' THEN OLD.cielo_hmac_key IS NOT NULL END,
          NEW.cielo_hmac_key IS NOT NULL);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cielo_historico ON public.adquirentes_config;
CREATE TRIGGER trg_cielo_historico
  AFTER INSERT OR UPDATE OR DELETE ON public.adquirentes_config
  FOR EACH ROW EXECUTE FUNCTION public.cielo_registrar_historico();

-- ---------------------------------------------------------------------------
-- 2. Guarda contra apagar o que esta preenchido
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.cielo_protege_preenchimento()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.adquirente <> 'CIELO' THEN RETURN NEW; END IF;

  -- Escotilha de emergencia: SET LOCAL cielo.permitir_limpeza = 'on' dentro da
  -- transacao. Exigir o gesto explicito e o ponto — impede o acidente, nao a
  -- limpeza intencional.
  IF coalesce(current_setting('cielo.permitir_limpeza', true), 'off') = 'on' THEN
    RETURN NEW;
  END IF;

  IF coalesce(array_length(OLD.cielo_pvs, 1), 0) > 0
     AND coalesce(array_length(NEW.cielo_pvs, 1), 0) = 0 THEN
    RAISE EXCEPTION
      'Recusado: apagar % PV(s) da loja %. Para limpar de proposito: SET LOCAL cielo.permitir_limpeza = ''on'';',
      array_length(OLD.cielo_pvs, 1), OLD.cod_empresa;
  END IF;

  IF OLD.cielo_estabelecimento_matriz IS NOT NULL
     AND btrim(coalesce(NEW.cielo_estabelecimento_matriz, '')) = '' THEN
    RAISE EXCEPTION
      'Recusado: apagar a matriz de extrato (%) da loja %. Para limpar de proposito: SET LOCAL cielo.permitir_limpeza = ''on'';',
      OLD.cielo_estabelecimento_matriz, OLD.cod_empresa;
  END IF;

  IF OLD.cielo_hmac_key IS NOT NULL AND NEW.cielo_hmac_key IS NULL THEN
    RAISE EXCEPTION
      'Recusado: apagar a chave HMAC da loja %. Para limpar de proposito: SET LOCAL cielo.permitir_limpeza = ''on'';',
      OLD.cod_empresa;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cielo_protege ON public.adquirentes_config;
CREATE TRIGGER trg_cielo_protege
  BEFORE UPDATE ON public.adquirentes_config
  FOR EACH ROW EXECUTE FUNCTION public.cielo_protege_preenchimento();

-- ---------------------------------------------------------------------------
-- 3. Ponto de partida do historico
-- ---------------------------------------------------------------------------

INSERT INTO public.cielo_config_historico
  (config_id, cod_empresa, operacao, autor, matriz_nova, pvs_novo, documento_novo,
   hmac_nova_preenchida)
SELECT id, cod_empresa, 'SNAPSHOT_INICIAL', current_user,
       cielo_estabelecimento_matriz, cielo_pvs, cielo_documento,
       cielo_hmac_key IS NOT NULL
  FROM public.adquirentes_config
 WHERE adquirente = 'CIELO';
