// src/hooks/useDefaultEmpresa.ts
// Hook centralizado para determinar a empresa padrão do usuário logado.
// Regra: default = cod_empresa do profile. Admin pode usar 'ALL', mas nunca auto-carrega com ALL.

import { useAuth } from "@/contexts/AuthContext";
import { EmpresaParam } from "@/services/firebirdBridge";

/**
 * Retorna a empresa padrão para filtros.
 * - Usuário normal: sempre seu cod_empresa
 * - Admin: cod_empresa do profile (nunca 'ALL' por default)
 * 
 * Use `isAdmin` para decidir se mostra a opção "Todas" nos dropdowns.
 */
export function useDefaultEmpresa(): {
  defaultEmpresa: EmpresaParam;
  isAdmin: boolean;
  codEmpresa: number | null;
} {
  const { codEmpresa, isAdmin } = useAuth();

  // Admin com cod_empresa=0 → ALL; usuário normal → sua empresa
  const defaultEmpresa: EmpresaParam = isAdmin && (!codEmpresa || codEmpresa === 0)
    ? 'ALL'
    : codEmpresa ? String(codEmpresa) : '';

  return { defaultEmpresa, isAdmin, codEmpresa };
}
