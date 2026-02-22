import { toast } from "@/hooks/use-toast";

/** Standardized toast patterns using semantic tokens */
export const toastPatterns = {
  success: (title: string, description?: string) =>
    toast({
      title: `✓ ${title}`,
      description,
      className: "border-success bg-success-soft text-success-foreground",
    }),

  error: (title: string, description?: string) =>
    toast({
      title: `✗ ${title}`,
      description: description || "Tente novamente ou entre em contato com o suporte.",
      variant: "destructive",
    }),

  warning: (title: string, description?: string) =>
    toast({
      title: `⚠ ${title}`,
      description,
      className: "border-warning bg-warning-soft text-warning-foreground",
    }),

  info: (title: string, description?: string) =>
    toast({
      title,
      description,
      className: "border-info bg-info-soft text-info-foreground",
    }),

  /** Convenience: saved successfully */
  saved: (entity?: string) =>
    toastPatterns.success(entity ? `${entity} salvo` : "Salvo com sucesso"),

  /** Convenience: deleted successfully */
  deleted: (entity?: string) =>
    toastPatterns.success(entity ? `${entity} removido` : "Removido com sucesso"),

  /** Convenience: generic API error */
  apiError: (description?: string) =>
    toastPatterns.error("Erro de comunicação", description || "Não foi possível conectar ao servidor."),
};
