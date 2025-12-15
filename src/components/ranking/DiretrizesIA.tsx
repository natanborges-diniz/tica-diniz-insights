import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Brain, Sparkles, AlertCircle, RefreshCw } from "lucide-react";
import ReactMarkdown from "react-markdown";

interface DiretrizesIAProps {
  diretrizes: string | null;
  loading: boolean;
  error: string | null;
  onGerar: () => void;
  disabled?: boolean;
}

export function DiretrizesIA({ diretrizes, loading, error, onGerar, disabled }: DiretrizesIAProps) {
  return (
    <Card className="border-primary/20">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-primary" />
            <CardTitle>Análise Inteligente</CardTitle>
          </div>
          <Button 
            onClick={onGerar} 
            disabled={loading || disabled}
            variant="outline"
            size="sm"
          >
            {loading ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                Analisando...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 mr-2" />
                {diretrizes ? 'Atualizar Análise' : 'Gerar Análise com IA'}
              </>
            )}
          </Button>
        </div>
        <CardDescription>
          Diretrizes estratégicas geradas por inteligência artificial
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading && (
          <div className="space-y-3">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-[90%]" />
            <Skeleton className="h-4 w-[80%]" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-4 w-[85%]" />
            <Skeleton className="h-4 w-[75%]" />
          </div>
        )}

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {!loading && !error && diretrizes && (
          <div className="prose prose-sm max-w-none dark:prose-invert">
            <ReactMarkdown>{diretrizes}</ReactMarkdown>
          </div>
        )}

        {!loading && !error && !diretrizes && (
          <div className="text-center py-8 text-muted-foreground">
            <Brain className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>Clique em "Gerar Análise com IA" para obter diretrizes estratégicas</p>
            <p className="text-sm mt-2">A IA analisará os dados do ranking e fornecerá recomendações personalizadas</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
