import { Outlet } from "react-router-dom";
import { useModulePermissions } from "@/hooks/useModulePermissions";
import { LoadingState, NoPermissionState } from "@/components/system/states";
import type { ModuleKey } from "@/components/layout/AppLayout";

interface ModuleGuardProps {
  module: ModuleKey;
}

export default function ModuleGuard({ module }: ModuleGuardProps) {
  const { hasAccess, isLoading } = useModulePermissions();

  if (isLoading) {
    return <LoadingState variant="page" message="Verificando permissões..." />;
  }

  if (!hasAccess(module)) {
    return <NoPermissionState />;
  }

  return <Outlet />;
}
