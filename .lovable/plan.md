## Problema
RLS de `fornecedor_marca` exige `has_module_edit_access(uid, 'config')`. Operadora de estoque tem `config=nenhum` → insert bloqueado.

## Mudança
Substituir as policies de escrita de `fornecedor_marca` para checar `'estoque'` (edita) ao invés de `'config'`. Manter SELECT para authenticated e full access para service_role.

### SQL (migration)
```sql
DROP POLICY "Module edit write fornecedor_marca" ON public.fornecedor_marca;

CREATE POLICY "Estoque edit write fornecedor_marca"
ON public.fornecedor_marca
FOR ALL
TO authenticated
USING (public.has_module_edit_access(auth.uid(), 'estoque'))
WITH CHECK (public.has_module_edit_access(auth.uid(), 'estoque'));
```

Sem alteração de UI, sem mudança em outras tabelas.