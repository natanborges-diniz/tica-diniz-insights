// src/hooks/useFiltrosPersistentes.ts
// Guarda o último estado de filtros de uma tela (loja, campo de data, período)
// no localStorage e reaplica na volta — evita que a consulta volte em branco
// sempre que o usuário sai e retorna à tela.
//
// Apenas estado de UI: nenhuma regra de negócio depende disto.

import { useCallback, useEffect, useState } from "react";

const PREFIX = "infoco:filtros:";

function ler<T extends Record<string, unknown>>(chave: string, padrao: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + chave);
    if (!raw) return padrao;
    const parsed = JSON.parse(raw) as Partial<T>;
    return { ...padrao, ...parsed };
  } catch {
    return padrao;
  }
}

export function useFiltrosPersistentes<T extends Record<string, unknown>>(
  chave: string,
  padrao: T,
): [T, (patch: Partial<T>) => void, () => void] {
  const [filtros, setFiltros] = useState<T>(() => ler(chave, padrao));

  useEffect(() => {
    try {
      localStorage.setItem(PREFIX + chave, JSON.stringify(filtros));
    } catch {
      // storage cheio ou bloqueado — segue sem persistir
    }
  }, [chave, filtros]);

  const atualizar = useCallback((patch: Partial<T>) => {
    setFiltros((prev) => ({ ...prev, ...patch }));
  }, []);

  const limpar = useCallback(() => {
    setFiltros(padrao);
    try {
      localStorage.removeItem(PREFIX + chave);
    } catch {
      // no-op
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave]);

  return [filtros, atualizar, limpar];
}
