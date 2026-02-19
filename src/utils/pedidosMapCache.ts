// src/utils/pedidosMapCache.ts
// Cache singleton compartilhado entre OsDashboard e PedidoFornecedorPage
// para atualizar o badge imediatamente após envio, sem reload.

import type { PedidoFornecedorInfo } from "@/components/os-dashboard/OsDashboardLayout";

export let pedidosMapCache: Record<number, PedidoFornecedorInfo> = {};
export let pedidosMapDataKey = "";

export function setPedidosMapCache(map: Record<number, PedidoFornecedorInfo>) {
  pedidosMapCache = map;
}

export function setPedidosMapDataKey(key: string) {
  pedidosMapDataKey = key;
}

export function registrarPedidoNoCache(
  codOs: number,
  numeroPedido: string,
  fornecedor: string,
  status: string
) {
  pedidosMapCache = {
    ...pedidosMapCache,
    [codOs]: { numero_pedido: numeroPedido, fornecedor, status },
  };
}
