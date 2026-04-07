import { Outlet } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { LoadingState, NoPermissionState } from "@/components/system/states";

export default function AdminGuard() {
  const { isAdmin, isLoading } = useAuth();

  if (isLoading) {
    return <LoadingState variant="page" message="Verificando permissões..." />;
  }

  if (!isAdmin) {
    return <NoPermissionState />;
  }

  return <Outlet />;
}
