

## Plano: Corrigir erro "Fetch is aborted" no módulo Estoque

### Problema

O endpoint `/estoque/completo` retorna o inventário físico inteiro da loja, que pode ser um volume grande de dados. O timeout padrão do `firebirdBridge` é **15 segundos**, insuficiente para essa carga. O fetch é abortado antes da resposta chegar.

### Solução

Aumentar o timeout para as chamadas de estoque completo e vendas/analise-sku, que são endpoints pesados.

### Alterações

| # | Arquivo | Mudança |
|---|---|---|
| 1 | `src/services/estoqueCompletoService.ts` | Passar `timeoutMs: 60000` (60s) na chamada `apiGet` |
| 2 | `src/services/vendasService.ts` | Verificar se `getAnaliseSku` também precisa de timeout maior — se sim, aplicar `timeoutMs: 60000` |

Apenas 1-2 linhas alteradas em cada arquivo. Sem mudança visual, apenas garantir que a requisição não seja cortada prematuramente.

