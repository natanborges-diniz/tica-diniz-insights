// src/stores/useEstoqueStore.ts
// Store global compartilhado entre as páginas de Estoque (Visão, Plano de Compra, O que Fazer).
// Garante que a empresa selecionada e os dados carregados persistam ao trocar de página.

import { create } from "zustand";
import type { EmpresaParam } from "@/services/firebirdBridge";
import type { EstoqueCompleto } from "@/services/estoqueCompletoService";
import type { AnaliseSku } from "@/services/vendasService";

export interface EstoqueFilters {
  empresa: EmpresaParam;
  categoria: "TODOS" | "ARMACOES" | "LENTES" | "ACESSORIOS" | "OUTROS";
  curvaABC: "A" | "B" | "C" | null;
  fornecedor: string;
  marca: string;
  acao: string;
  busca: string;
}

interface EstoqueState {
  filters: EstoqueFilters;
  setFilters: (updater: EstoqueFilters | ((prev: EstoqueFilters) => EstoqueFilters)) => void;

  loading: boolean;
  setLoading: (v: boolean) => void;

  error: string | null;
  setError: (v: string | null) => void;

  dadosEstoqueCompleto: EstoqueCompleto[];
  dadosVendasSku: AnaliseSku[];
  setDados: (estoque: EstoqueCompleto[], vendas: AnaliseSku[]) => void;

  // Quando os dados foram carregados (para mostrar "carregado há Xmin")
  carregadoEm: number | null;
  // Para qual empresa os dados atuais foram carregados
  empresaCarregada: EmpresaParam;
}

const defaultFilters: EstoqueFilters = {
  empresa: null,
  categoria: "TODOS",
  curvaABC: null,
  fornecedor: "TODOS",
  marca: "TODAS",
  acao: "TODAS",
  busca: "",
};

export const useEstoqueStore = create<EstoqueState>((set) => ({
  filters: defaultFilters,
  setFilters: (updater) =>
    set((state) => ({
      filters: typeof updater === "function" ? (updater as (p: EstoqueFilters) => EstoqueFilters)(state.filters) : updater,
    })),

  loading: false,
  setLoading: (v) => set({ loading: v }),

  error: null,
  setError: (v) => set({ error: v }),

  dadosEstoqueCompleto: [],
  dadosVendasSku: [],
  carregadoEm: null,
  empresaCarregada: null,
  setDados: (estoque, vendas) =>
    set((state) => ({
      dadosEstoqueCompleto: estoque,
      dadosVendasSku: vendas,
      carregadoEm: Date.now(),
      empresaCarregada: state.filters.empresa,
    })),
}));
