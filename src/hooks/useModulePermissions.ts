import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type { ModuleKey } from "@/components/layout/AppLayout";
import { PAGES_BY_MODULE } from "@/lib/pageCatalog";

export type AccessLevel = "nenhum" | "consulta" | "edita" | "total";

const ALL_MODULES: ModuleKey[] = ["vendas", "compras", "estoque", "monitor", "financeiro", "ia", "config", "comunicacao"];

const LEVEL_HIERARCHY: Record<AccessLevel, number> = {
  nenhum: 0,
  consulta: 1,
  edita: 2,
  total: 3,
};

interface ModulePermissions {
  allowedModules: ModuleKey[];
  allowedPages: Set<string>;
  isLoading: boolean;
  hasAccess: (module: ModuleKey) => boolean;
  hasPageAccess: (pageKey: string, module: ModuleKey) => boolean;
  hasAnyPageInModule: (module: ModuleKey) => boolean;
  getAccessLevel: (module: ModuleKey) => AccessLevel;
  canEdit: (module: ModuleKey) => boolean;
  canInsert: (module: ModuleKey) => boolean;
  refetch: () => void;
}

export function useModulePermissions(): ModulePermissions {
  const { user, isAdmin, isLoading: authLoading } = useAuth();
  const [permissions, setPermissions] = useState<Record<string, AccessLevel>>({});
  const [pagePerms, setPagePerms] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);

  const fetchPermissions = useCallback(async () => {
    if (!user) {
      setPermissions({});
      setPagePerms(new Set());
      setIsLoading(false);
      return;
    }

    if (isAdmin) {
      const all: Record<string, AccessLevel> = {};
      ALL_MODULES.forEach(m => { all[m] = "total"; });
      setPermissions(all);
      setPagePerms(new Set());
      setIsLoading(false);
      return;
    }

    const [modRes, pageRes] = await Promise.all([
      supabase.from("user_module_permissions").select("module, access_level").eq("user_id", user.id),
      supabase.from("user_page_permissions" as any).select("page_key").eq("user_id", user.id),
    ]);

    const perms: Record<string, AccessLevel> = {};
    modRes.data?.forEach((row: any) => {
      perms[row.module] = row.access_level as AccessLevel;
    });
    const pageSet = new Set<string>((pageRes.data as any[] | null)?.map((r: any) => r.page_key) ?? []);
    setPermissions(perms);
    setPagePerms(pageSet);
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

  const hasPageAccess = useCallback(
    (pageKey: string, module: ModuleKey) => {
      if (isAdmin) return true;
      if (hasAccess(module)) return true;
      return pagePerms.has(pageKey);
    },
    [isAdmin, hasAccess, pagePerms]
  );

  const hasAnyPageInModule = useCallback(
    (module: ModuleKey) => {
      if (isAdmin) return true;
      if (hasAccess(module)) return true;
      const pages = PAGES_BY_MODULE[module] || [];
      return pages.some((p) => pagePerms.has(p.key));
    },
    [isAdmin, hasAccess, pagePerms]
  );

  const canEdit = useCallback(
    (module: ModuleKey) => LEVEL_HIERARCHY[getAccessLevel(module)] >= LEVEL_HIERARCHY["edita"],
    [getAccessLevel]
  );

  const canInsert = useCallback(
    (module: ModuleKey) => getAccessLevel(module) === "total",
    [getAccessLevel]
  );

  const allowedModules = ALL_MODULES.filter(m => hasAccess(m) || hasAnyPageInModule(m));

  return {
    allowedModules,
    allowedPages: pagePerms,
    isLoading: isLoading || authLoading,
    hasAccess,
    hasPageAccess,
    hasAnyPageInModule,
    getAccessLevel,
    canEdit,
    canInsert,
    refetch: fetchPermissions,
  };
}
