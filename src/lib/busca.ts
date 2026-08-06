// src/lib/busca.ts
// Busca textual leve para listas já carregadas na tela.
//
// A pergunta do operador raramente é "qual coluna" — é "onde está aquele boleto
// da Sabesp de 1.234,56?". Então o termo é comparado contra todos os campos
// declarados, sem acento e sem caixa, e valores numéricos aceitam tanto
// "1234,56" quanto "1234.56" quanto "1234".
//
// Só apresentação: nenhuma regra de negócio depende disto.

/** Remove acento, baixa a caixa e colapsa espaços. */
export function normalizarTexto(v: unknown): string {
  return String(v ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Formas em que um número pode ser digitado por quem procura. */
function variacoesNumero(v: number): string[] {
  if (!Number.isFinite(v)) return [];
  const abs = Math.abs(v);
  return [
    String(v),
    abs.toFixed(2),
    abs.toFixed(2).replace(".", ","),
    abs.toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, "."),
    new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2 }).format(abs),
  ];
}

/** Texto pesquisável de um valor qualquer (string, número, data, null). */
export function textoPesquisavel(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "number") return variacoesNumero(v).join(" ");
  return String(v);
}

/**
 * Filtra uma lista pelo termo, olhando os campos devolvidos por `campos`.
 * Termo vazio devolve a lista intacta (mesma referência).
 */
export function filtrarPorBusca<T>(
  itens: T[],
  termo: string,
  campos: (item: T) => Array<unknown>,
): T[] {
  const t = normalizarTexto(termo);
  if (!t) return itens;
  // Cada palavra precisa aparecer em algum campo: "sabesp 1234" funciona.
  const palavras = t.split(" ");
  return itens.filter((item) => {
    const alvo = normalizarTexto(campos(item).map(textoPesquisavel).join(" | "));
    return palavras.every((p) => alvo.includes(p));
  });
}
