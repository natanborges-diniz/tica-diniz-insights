import { useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { TopNavigation } from "./TopNavigation";
import { AppSidebar } from "./AppSidebar";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";

export type ModuleKey = "vendas" | "estoque" | "monitor" | "financeiro" | "ia" | "config";

const moduleFromPath = (pathname: string): ModuleKey => {
  if (pathname.startsWith("/vendas") || pathname.startsWith("/ranking")) return "vendas";
  if (pathname.startsWith("/estoque")) return "estoque";
  if (pathname.startsWith("/os")) return "monitor";
  if (pathname.startsWith("/financeiro")) return "financeiro";
  if (pathname.startsWith("/ia")) return "ia";
  if (pathname.startsWith("/config")) return "config";
  return "vendas"; // default
};

export function AppLayout() {
  const location = useLocation();
  const [activeModule, setActiveModule] = useState<ModuleKey>(moduleFromPath(location.pathname));

  const handleModuleChange = (module: ModuleKey) => {
    setActiveModule(module);
  };

  return (
    <SidebarProvider>
      <div className="min-h-screen flex flex-col w-full">
        <TopNavigation activeModule={activeModule} onModuleChange={handleModuleChange} />
        <div className="flex flex-1 w-full">
          <AppSidebar activeModule={activeModule} />
          <main className="flex-1 overflow-auto">
            <div className="p-4 md:p-6">
              <div className="md:hidden mb-4">
                <SidebarTrigger />
              </div>
              <Outlet />
            </div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
