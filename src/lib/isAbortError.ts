// src/lib/isAbortError.ts
// Helper unificado para detectar erros de requisição cancelada/abortada.
// Esses erros aparecem naturalmente quando o React re-renderiza enquanto há
// fetch em voo (ex.: AuthContext aplica setUser duas vezes seguidas após login),
// e não devem virar toast para o usuário.

export function isAbortError(err: unknown): boolean {
  if (!err) return false;

  // DOMException / AbortError padrão do fetch
  if (err instanceof DOMException && err.name === "AbortError") return true;

  if (err instanceof Error) {
    if (err.name === "AbortError") return true;

    const code = (err as Error & { code?: string }).code;
    if (code === "REQUEST_CANCELLED" || code === "ABORT_ERR") return true;

    const msg = err.message?.toLowerCase() ?? "";
    if (
      msg.includes("aborted") ||
      msg.includes("load failed") ||
      msg.includes("fetch is abort") ||
      msg.includes("cancelled") ||
      msg.includes("canceled") ||
      msg.includes("requisição cancelada")
    ) {
      return true;
    }
  }

  // Objetos plain de erro com .code (ex.: Supabase PostgrestError)
  if (typeof err === "object") {
    const obj = err as { code?: string; message?: string };
    if (obj.code === "REQUEST_CANCELLED") return true;
    const msg = obj.message?.toLowerCase() ?? "";
    if (msg.includes("load failed") || msg.includes("aborted")) return true;
  }

  return false;
}
