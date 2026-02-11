

# Ajuste no trigger `protect_cod_empresa` -- Migracao 2

Unica mudanca: adicionar guard contra `auth.uid() IS NULL` antes de checar role.

## Trigger atualizado (Migracao 2, apos `has_role`)

```sql
CREATE OR REPLACE FUNCTION public.protect_cod_empresa()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.cod_empresa IS DISTINCT FROM OLD.cod_empresa THEN
    -- Bloquear update fora de sessao autenticada
    IF auth.uid() IS NULL THEN
      RAISE EXCEPTION 'Unauthenticated';
    END IF;
    -- Apenas admin pode alterar cod_empresa
    IF NOT public.has_role(auth.uid(), 'admin') THEN
      RAISE EXCEPTION 'Only admins can change cod_empresa';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER protect_cod_empresa_trigger
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_cod_empresa();
```

## O que muda vs v3

| Item | Antes | Agora |
|------|-------|-------|
| Guard `auth.uid() IS NULL` | Nao existia | Adicionado -- bloqueia update sem sessao |

Nenhuma outra parte do plano muda.

