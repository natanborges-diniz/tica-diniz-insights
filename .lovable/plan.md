

## Plano: Alertas pendentes visíveis e "Ciente" acessível para todos os fornecedores

### Problemas

1. **Hoya**: O botão "Ciente" só aparece dentro do card do pedido (linha 582). Se o pedido não aparece na lista (filtro, paginação, lista vazia), não há como reconhecer o alerta
2. **Zeiss e Haytek**: O backend já gera alertas na tabela `pedido_alertas` (zeiss-proxy e haytek-proxy fazem `upsert`), mas as páginas de tracking não consomem o hook `usePedidoAlertas` — sem banner, sem botão "Ciente"
3. **Sidebar**: O badge só aparece no "Tracking Hoya" (`item.url === "/os/tracking"`), ignorando alertas de Zeiss e Haytek

### Solução

| # | Arquivo | Mudança |
|---|---|---|
| 1 | `src/hooks/usePedidoAlertas.ts` | Enriquecer a query com join em `pedidos_fornecedor` para trazer `numero_pedido`, `cod_os` e `fornecedor`. Adicionar filtro opcional por fornecedor. Exportar tipo atualizado |
| 2 | `src/pages/HoyaTrackingPage.tsx` | Adicionar seção "Alertas Pendentes" acima da lista de pedidos com botão "Ciente" direto — visível sempre que houver alertas Hoya não reconhecidos. Manter banner inline existente |
| 3 | `src/pages/ZeissTrackingPage.tsx` | Importar `usePedidoAlertas`, adicionar mesma seção de alertas pendentes com botão "Ciente" e banner inline nos cards expandidos |
| 4 | `src/pages/HaytekTrackingPage.tsx` | Idem Zeiss |
| 5 | `src/components/layout/AppSidebar.tsx` | Mostrar badge em cada tracking page separadamente: contar alertas por fornecedor. Tracking Hoya mostra count Hoya, Zeiss mostra count Zeiss, Haytek mostra count Haytek |

### Detalhes do hook atualizado

```typescript
// usePedidoAlertas(fornecedor?: string)
// Query: select("*, pedidos_fornecedor!inner(numero_pedido, cod_os, fornecedor)")
// Se fornecedor passado, filtra .eq("pedidos_fornecedor.fornecedor", fornecedor)
// Retorna { alertas, countByFornecedor: { HOYA: 1, ZEISS: 1 }, ... }
```

### Seção visual de alertas (igual nos 3 trackings)

```text
┌─ ⚠️ 2 ALERTAS PENDENTES ──────────────────────────┐
│ Pedido #12345 · OS 8899 · Cancelado · 14/04  [Ciente] │
│ Pedido #12346 · OS 9001 · Erro      · 13/04  [Ciente] │
└────────────────────────────────────────────────────────┘
```

### Sidebar com badges por fornecedor

No `AppSidebar`, ao invés de um único `unacknowledgedCount`, usar `countByFornecedor` do hook para mostrar o badge correto em cada URL:
- `/os/tracking` → count HOYA
- `/os/tracking-zeiss` → count ZEISS  
- `/os/tracking-haytek` → count HAYTEK

5 arquivos, mudanças focadas e consistentes entre os 3 fornecedores.

