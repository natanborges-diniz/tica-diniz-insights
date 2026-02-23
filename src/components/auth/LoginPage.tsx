import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Check, BarChart3, Brain, ShieldCheck } from "lucide-react";

export default function LoginPage() {
  const { user, isLoading, signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-app-bg">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (user) return <Navigate to="/" replace />;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const { error } = await signIn(email, password);
    if (error) setError(error.message);
    setSubmitting(false);
  };

  const features = [
    { icon: BarChart3, text: "Monitoramento operacional centralizado" },
    { icon: Brain, text: "Insights acionáveis com IA integrada" },
    { icon: ShieldCheck, text: "Controle completo de vendas, estoque e financeiro" },
  ];

  return (
    <div className="min-h-screen grid grid-cols-1 md:grid-cols-2">
      {/* ── Brand Section ──────────────────────────────── */}
      <div className="relative flex flex-col items-center justify-center bg-app-bg px-8 py-12 md:px-16">
        {/* Decorative vertical brand line */}
        <div className="hidden md:block absolute left-0 top-1/4 bottom-1/4 w-[3px] bg-primary rounded-full" />

        <div className="max-w-md w-full space-y-8 text-center md:text-left">
          {/* Logo / Brand mark */}
          <div className="space-y-1">
            <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-foreground leading-tight">
              <span className="text-primary">In</span>Foco
            </h1>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-muted-foreground">
              Optical Business
            </p>
          </div>

          {/* Slogan */}
          <div className="space-y-3">
            <h2 className="text-xl md:text-2xl font-bold text-foreground leading-snug">
              Tecnologia e inteligência para o seu negócio óptico
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Plataforma completa de gestão com dados em tempo real, automação de processos e decisões orientadas por inteligência artificial.
            </p>
          </div>

          {/* Feature bullets */}
          <ul className="space-y-3 text-left">
            {features.map((feature, i) => {
              const Icon = feature.icon;
              return (
                <li key={i} className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-brand-soft text-primary">
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <span className="text-sm text-foreground font-medium">{feature.text}</span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      {/* ── Login Form Section ─────────────────────────── */}
      <div className="flex items-center justify-center bg-surface px-6 py-12 md:px-16">
        <Card className="w-full max-w-sm border-border shadow-card">
          <CardContent className="p-8">
            <div className="space-y-6">
              {/* Header */}
              <div className="space-y-1">
                <div className="flex items-center gap-2 mb-4">
                  <div className="h-8 w-1 rounded-full bg-primary" />
                  <h2 className="text-xl font-bold text-foreground">Entrar na plataforma</h2>
                </div>
                <p className="text-sm text-muted-foreground">
                  Informe suas credenciais para acessar o sistema.
                </p>
              </div>

              {/* Form */}
              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="email">E-mail</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="seu@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    aria-invalid={!!error}
                    className="h-11"
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password">Senha</Label>
                    <button
                      type="button"
                      className="text-xs text-primary hover:underline underline-offset-4 transition-colors duration-150"
                      tabIndex={-1}
                    >
                      Esqueci minha senha
                    </button>
                  </div>
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                    aria-invalid={!!error}
                    className="h-11"
                  />
                </div>

                {/* Error message */}
                {error && (
                  <div className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger font-medium">
                    {error}
                  </div>
                )}

                <Button
                  type="submit"
                  className="w-full h-11"
                  disabled={submitting}
                  aria-busy={submitting}
                >
                  {submitting ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : null}
                  Entrar
                </Button>
              </form>
            </div>
          </CardContent>
        </Card>

        {/* Footer credit */}
        <p className="absolute bottom-4 text-xs text-muted-foreground">
          © {new Date().getFullYear()} InFoco Optical Business
        </p>
      </div>
    </div>
  );
}
