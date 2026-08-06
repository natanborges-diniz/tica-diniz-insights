-- Chave HMAC por estabelecimento matriz.
--
-- A implementacao inicial assumia uma chave HMAC unica para o grupo, guardada
-- no secret CIELO_HMAC_KEY. Mas o portal da Cielo expoe a "chave da API" por
-- estabelecimento master — e pode haver uma por matriz de extrato.
--
-- Em vez de escolher um dos dois modelos, a coluna abaixo e opcional: quando
-- preenchida, vale para aquela matriz; quando vazia, a funcao cai no secret
-- global. Assim o mesmo codigo atende as duas formas de organizacao, e migrar
-- de uma para outra e so preencher (ou limpar) o campo.
--
-- A chave fica em adquirentes_config, que ja e admin-only por RLS — mesmo
-- tratamento que integration_key_encrypted, usada pela REDE.

ALTER TABLE public.adquirentes_config
  ADD COLUMN IF NOT EXISTS cielo_hmac_key text;

COMMENT ON COLUMN public.adquirentes_config.cielo_hmac_key IS
  'Chave HMAC (X-Signature) do estabelecimento matriz na API EXTC. Se nula, usa o secret CIELO_HMAC_KEY.';

-- Lojas que compartilham a mesma matriz de extrato compartilham a mesma chave:
-- preencher em uma e propagar evita divergencia silenciosa entre elas.
CREATE OR REPLACE FUNCTION public.cielo_propagar_hmac_por_matriz()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.adquirente = 'CIELO'
     AND NEW.cielo_hmac_key IS NOT NULL
     AND NEW.cielo_estabelecimento_matriz IS NOT NULL
     AND NEW.cielo_hmac_key IS DISTINCT FROM OLD.cielo_hmac_key
  THEN
    UPDATE public.adquirentes_config
       SET cielo_hmac_key = NEW.cielo_hmac_key
     WHERE adquirente = 'CIELO'
       AND id <> NEW.id
       AND cielo_estabelecimento_matriz = NEW.cielo_estabelecimento_matriz
       AND cielo_hmac_key IS DISTINCT FROM NEW.cielo_hmac_key;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cielo_propagar_hmac ON public.adquirentes_config;
CREATE TRIGGER trg_cielo_propagar_hmac
  AFTER UPDATE OF cielo_hmac_key ON public.adquirentes_config
  FOR EACH ROW EXECUTE FUNCTION public.cielo_propagar_hmac_por_matriz();
