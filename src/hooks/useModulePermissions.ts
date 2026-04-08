import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type { ModuleKey } from "@/components/layout/AppLayout";

export type AccessLevel = "nenhum" | "consulta" | "edita" | "total";

const ALL_MODULES: ModuleKey[] = ["vendas", "estoque", "monitor", "financeiro", "ia", "config", "comunicacao"];

const LEVEL_HIERARCHY: Record<AccessLevel, number> = {
  nenhum: 0,
  consulta: 1,
  edita: 2,
  total: 3,
};

interface ModulePermissions {
  allowedModules: ModuleKey[];
  isLoading: boolean;
  hasAccess: (module: ModuleKey) => boolean;
  getAccessLevel: (module: ModuleKey) => AccessLevel;
  canEdit: (module: ModuleKey) => boolean;
  canInsert: (module: ModuleKey) => boolean;
  refetch: () => void;
}

export function useModulePermissions(): ModulePermissions {
  const { user, isAdmin, isLoading: authLoading } = useAuth();
  const [permissions, setPermissions] = useState<Record<string, AccessLevel>>({});
  const [isLoading, setIsLoading] = useState(true);

  const fetchPermissions = useCallback(async () => {
    if (!user) {
      setPermissions({});
      setIsLoading(false);
      return;
    }

    if (isAdmin) {
      const all: Record<string, AccessLevel> = {};
      ALL_MODULES.forEach(m => { all[m] = "total"; });
      setPermissions(all);
      setIsLoading(false);
      return;
    }

    const { data } = await supabase
      .from("user_module_permissions")
      .select("module, access_level")
      .eq("user_id", user.id);

    const perms: Record<string, AccessLevel> = {};
    if (data) {
      data.forEach((row: any) => {
        perms[row.module] = row.access_level as AccessLevel;
      });
    }
    setPermissions(perms);
    setIsLoading(false);
  }, [user, isAdmin]);

  useEffect(() => {
    if (!authLoading) fetchPermissions();
  }, [authLoading, fetchPermissions]);

  const getAccessLevel = useCallback(
    (module: ModuleKey): AccessLevel => {
      if (isAdmin) return "total";
      return permissions[module] || "nenhum";
    },
    [isAdmin, permissions]
  );

  const hasAccess = useCallback(
    (module: ModuleKey) => getAccessLevel(module) !== "nenhum",
    [getAccessLevel]
  );

  const canEdit = useCallback(
    (module: ModuleKey) => LEVEL_HIERARCHY[getAccessLevel(module)] >= LEVEL_HIERARCHY["edita"],
    [getAccessLevel]
  );

  const canInsert = useCallback(
    (module: ModuleKey) => getAccessLevel(module) === "total",
    [getAccessLevel]
  );

  const allowedModules = ALL_MODULES.filter(m => hasAccess(m));

  return { allowedModules, isLoading: isLoading || authLoading, hasAccess, getAccessLevel, canEdit, canInsert, refetch: fetchPermissions };
}
