import { Navigate, Outlet } from "react-router-dom";
import { useModulePermissions } from "@/hooks/useModulePermissions";
import { Loader2 } from "lucide-react";
import type { ModuleKey } from "@/components/layout/AppLayout";

interface ModuleGuardProps {
  module: ModuleKey;
}

export default function ModuleGuard({ module }: ModuleGuardProps) {
  const { hasAccess, isLoading } = useModulePermissions();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!hasAccess(module)) {
    return <Navigate to="/home" replace />;
  }

  return <Outlet />;
}
