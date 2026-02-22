import { cn } from "@/lib/utils";
import { ShieldOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

interface NoPermissionStateProps {
  title?: string;
  description?: string;
  className?: string;
}

export function NoPermissionState({
  title = "Acesso não autorizado",
  description = "Você não tem permissão para acessar este módulo. Entre em contato com o administrador.",
  className,
}: NoPermissionStateProps) {
  const navigate = useNavigate();

  return (
    <div className={cn("flex flex-col items-center justify-center min-h-[50vh] px-4 text-center", className)}>
      <div className="rounded-full bg-warning-soft p-4 mb-4">
        <ShieldOff className="h-8 w-8 text-warning" />
      </div>
      <h2 className="text-lg font-semibold text-foreground mb-2">{title}</h2>
      <p className="text-sm text-muted-foreground max-w-md mb-6">{description}</p>
      <Button variant="outline" onClick={() => navigate("/home")}>
        Voltar para o início
      </Button>
    </div>
  );
}
