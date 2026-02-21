import { createContext, useContext, useEffect, useState, useCallback } from "react";
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

  const loadUserData = useCallback(async (currentUser: User) => {
    await Promise.all([fetchProfile(currentUser.id), fetchRoles(currentUser.id)]);
  }, [fetchProfile, fetchRoles]);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === "TOKEN_REFRESHED" && !session) {
          toast.error("Sua sessão expirou. Faça login novamente.", { duration: 6000 });
          setUser(null);
          setProfile(null);
          setRoles([]);
          setIsLoading(false);
          return;
        }
        if (event === "SIGNED_OUT") {
          setUser(null);
          setProfile(null);
          setRoles([]);
          setIsLoading(false);
          return;
        }
        if (session?.user) {
          setUser(session.user);
          // Load user data and ONLY set isLoading=false after it completes
          loadUserData(session.user).finally(() => setIsLoading(false));
        } else {
          setUser(null);
          setProfile(null);
          setRoles([]);
          setIsLoading(false);
        }
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser(session.user);
        loadUserData(session.user).finally(() => setIsLoading(false));
      } else {
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
