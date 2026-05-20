import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class EstoqueErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null, errorInfo: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[EstoqueErrorBoundary] Erro capturado no módulo estoque:", error, info);
    this.setState({ errorInfo: info });
  }

  reset = () => this.setState({ hasError: false, error: null, errorInfo: null });

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
        <div className="rounded-full bg-danger-soft p-3 mb-4">
          <AlertCircle className="h-6 w-6 text-danger" />
        </div>
        <h3 className="text-sm font-semibold text-foreground mb-1">
          Algo deu errado ao carregar o estoque
        </h3>
        <p className="text-sm text-muted-foreground max-w-sm mb-4">
          {this.state.error?.message ?? "Erro inesperado. Recarregue a página ou tente novamente."}
        </p>
        <Button variant="outline" size="sm" onClick={this.reset}>
          Tentar novamente
        </Button>
        {(this.state.error || this.state.errorInfo) && (
          <details className="mt-6 text-left max-w-xl w-full">
            <summary className="text-xs text-muted-foreground cursor-pointer select-none">
              Detalhes técnicos
            </summary>
            <pre className="mt-2 text-xs bg-muted rounded p-3 overflow-auto whitespace-pre-wrap break-all">
              {this.state.error?.stack ?? this.state.error?.message}
              {this.state.errorInfo?.componentStack}
            </pre>
          </details>
        )}
      </div>
    );
  }
}
