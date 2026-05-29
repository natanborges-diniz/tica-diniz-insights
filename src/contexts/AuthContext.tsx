import { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
type AppRole = "admin";

interface Profile {
  id: string;
  email: string | null;
  nome: string | null;
  cod_empresa: number;
}

interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  roles: AppRole[];
  isLoading: boolean;
  isAdmin: boolean;
  codEmpresa: number | null;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  updateUserEmpresa: (userId: string, codEmpresa: number) => Promise<{ error: Error | null }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Deduplica carregamento de dados do usuário: INITIAL_SESSION + SIGNED_IN +
  // TOKEN_REFRESHED chegam em rajada após o login, todos com o mesmo user.id.
  // Sem este ref, cada evento dispararia novos fetches de profile/roles e o
  // re-render abortaria fetches em voo de outros hooks (sintoma: toast
  // "Fetch is aborted" no Safari logo após o login).
  const loadedUserIdRef = useRef<string | null>(null);
  const loadingUserIdRef = useRef<string | null>(null);

  const fetchProfile = useCallback(async (userId: string) => {
    const { data } = await supabase
      .from("profiles")
      .select("id, email, nome, cod_empresa")
      .eq("id", userId)
      .single();
    if (data) setProfile(data);
  }, []);

  const fetchRoles = useCallback(async (userId: string) => {
    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    if (data) setRoles(data.map((r) => r.role as AppRole));
  }, []);

  const loadUserData = useCallback(
    async (userId: string) => {
      if (loadedUserIdRef.current === userId || loadingUserIdRef.current === userId) {
        return;
      }
      loadingUserIdRef.current = userId;
      try {
        await Promise.all([fetchProfile(userId), fetchRoles(userId)]);
        loadedUserIdRef.current = userId;
      } finally {
        loadingUserIdRef.current = null;
        setIsLoading(false);
      }
    },
    [fetchProfile, fetchRoles],
  );

  useEffect(() => {
    // 1) Registrar listener primeiro — fazendo APENAS updates síncronos aqui
    //    e deferindo qualquer chamada Supabase (recomendação oficial) para
    //    evitar deadlock dentro do callback do auth state.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "TOKEN_REFRESHED" && !session) {
        toast.error("Sua sessão expirou. Faça login novamente.", { duration: 6000 });
        loadedUserIdRef.current = null;
        setUser(null);
        setProfile(null);
        setRoles([]);
        setIsLoading(false);
        return;
      }
      if (event === "SIGNED_OUT") {
        loadedUserIdRef.current = null;
        setUser(null);
        setProfile(null);
        setRoles([]);
        setIsLoading(false);
        return;
      }
      if (session?.user) {
        setUser(session.user);
        // Defer chamadas Supabase e deduplica por userId
        setTimeout(() => {
          loadUserData(session.user.id);
        }, 0);
      } else {
        loadedUserIdRef.current = null;
        setUser(null);
        setProfile(null);
        setRoles([]);
        setIsLoading(false);
      }
    });

    // 2) Seed inicial: apenas detecta se há sessão e marca loading=false caso
    //    não haja. Quando houver sessão, o evento INITIAL_SESSION do listener
    //    acima já cuida de carregar profile+roles (não duplicar aqui).
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.user) {
        setIsLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, [loadUserData]);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error ? new Error(error.message) : null };
  };

  const signOut = async () => {
    loadedUserIdRef.current = null;
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
    setRoles([]);
  };

  const updateUserEmpresa = async (userId: string, codEmpresa: number) => {
    const { error } = await supabase
      .from("profiles")
      .update({ cod_empresa: codEmpresa })
      .eq("id", userId);
    return { error: error ? new Error(error.message) : null };
  };

  const isAdmin = roles.includes("admin");
  const codEmpresa = profile?.cod_empresa ?? null;

  return (
    <AuthContext.Provider
      value={{ user, profile, roles, isLoading, isAdmin, codEmpresa, signIn, signOut, updateUserEmpresa }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
