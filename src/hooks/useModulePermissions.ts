import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type { ModuleKey } from "@/components/layout/AppLayout";

const ALL_MODULES: ModuleKey[] = ["vendas", "estoque", "monitor", "financeiro", "ia", "config"];

interface ModulePermissions {
  allowedModules: ModuleKey[];
  isLoading: boolean;
  /** Admin sempre tem acesso total */
  hasAccess: (module: ModuleKey) => boolean;
  refetch: () => void;
}

export function useModulePermissions(): ModulePermissions {
  const { user, isAdmin, isLoading: authLoading } = useAuth();
  const [permissions, setPermissions] = useState<Record<string, boolean>>({});
  const [isLoading, setIsLoading] = useState(true);

  const fetchPermissions = useCallback(async () => {
    if (!user) {
      setPermissions({});
      setIsLoading(false);
      return;
    }

    // Admins têm acesso a tudo
    if (isAdmin) {
      const all: Record<string, boolean> = {};
      ALL_MODULES.forEach(m => { all[m] = true; });
      setPermissions(all);
      setIsLoading(false);
      return;
    }

    const { data } = await supabase
      .from("user_module_permissions")
      .select("module, enabled")
      .eq("user_id", user.id);

    const perms: Record<string, boolean> = {};
    if (data) {
      data.forEach(row => {
        perms[row.module] = row.enabled;
      });
    }
    setPermissions(perms);
    setIsLoading(false);
  }, [user, isAdmin]);

  useEffect(() => {
    if (!authLoading) fetchPermissions();
  }, [authLoading, fetchPermissions]);

  const hasAccess = useCallback(
    (module: ModuleKey) => {
      if (isAdmin) return true;
      return permissions[module] === true;
    },
    [isAdmin, permissions]
  );

  const allowedModules = ALL_MODULES.filter(m => hasAccess(m));

  return { allowedModules, isLoading: isLoading || authLoading, hasAccess, refetch: fetchPermissions };
}
