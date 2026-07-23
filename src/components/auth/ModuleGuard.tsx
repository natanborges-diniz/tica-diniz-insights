import { Outlet, useLocation } from "react-router-dom";
import { useModulePermissions } from "@/hooks/useModulePermissions";
import { LoadingState, NoPermissionState } from "@/components/system/states";
import type { ModuleKey } from "@/components/layout/AppLayout";
import { findPageByPath } from "@/lib/pageCatalog";

interface ModuleGuardProps {
  module: ModuleKey;
}

export default function ModuleGuard({ module }: ModuleGuardProps) {
  const { hasAccess, hasPageAccess, hasAnyPageInModule, isLoading } = useModulePermissions();
  const location = useLocation();

  if (isLoading) {
    return <LoadingState variant="page" message="Verificando permissões..." />;
  }

  // Se módulo liberado, libera tudo (comportamento clássico)
  if (hasAccess(module)) return <Outlet />;

  // Aditivo: se rota atual está no catálogo e usuário tem permissão específica → libera
  const page = findPageByPath(location.pathname);
  if (page && page.module === module && hasPageAccess(page.key, module)) {
    return <Outlet />;
  }

  // Se não há match de página mas ele tem alguma página do módulo, deixa passar
  // (evita bloquear rotas fora do catálogo dentro do mesmo módulo — cenário raro).
  if (!page && hasAnyPageInModule(module)) return <Outlet />;

  return <NoPermissionState />;
}
