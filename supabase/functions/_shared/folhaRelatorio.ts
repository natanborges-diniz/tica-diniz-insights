// Leitura da "Relação de Totais Líquidos" — o relatório que a contabilidade
// emite por loja e que hoje é a fonte da folha.
//
// O caminho de entrada era planilha (TSV/CSV). Mas o que existe de fato é este
// PDF, um por CNPJ, e pedir para alguém redigitar em planilha é convidar erro de
// centavo num pagamento. O operador seleciona o texto no leitor de PDF e cola;
// daqui sai a competência, a loja e a lista de colaboradores.
//
// Módulo puro — sem Deno, sem Supabase — testado por Vitest.

export interface ColaboradorRelatorio {
  codigo: string | null;
  nome: string;
  cpf: string;
  data_pagamento: string | null; // yyyy-MM-dd
  valor_liquido: number;
}

export interface RelatorioFolha {
  /** CNPJ da loja, só dígitos — usado para achar o cod_empresa. */
  cnpj: string | null;
  razao_social: string | null;
  /** yyyy-MM derivado do período. */
  competencia: string | null;
  /** Data de pagamento predominante entre os colaboradores. */
  data_pagamento: string | null;
  colaboradores: ColaboradorRelatorio[];
  /** "Total:" impresso no rodapé — confere com a soma das linhas. */
  total_informado: number | null;
  /** Diferença entre o total impresso e a soma lida. 0 = leitura íntegra. */
  divergencia: number | null;
}

/** "1.234,56" → 1234.56 */
function valorBr(s: string): number {
  // Espaços aparecem quando o PDF quebra "3.290,14" em dois pedaços de texto.
  return Number(s.replace(/\s/g, "").replace(/\./g, "").replace(",", ".")) || 0;
}

/** "30/07/2026" → "2026-07-30" */
function dataBr(s: string): string | null {
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

// Nome, CPF e valor na mesma linha. Código, pontuação do CPF e data de
// pagamento são opcionais: cada escritório de contabilidade emite o relatório
// com um recorte de colunas diferente, e recusar o arquivo inteiro por causa
// de uma coluna ausente deixava o operador sem caminho nenhum.
const LINHA = /^(?:(\d{1,6})\s+)?(.+?)\s+(\d{3}\.?\s?\d{3}\.?\s?\d{3}\s?-?\s?\d{2})\s+(?:(\d{2}\/\d{2}\/\d{4})\s+)?(\d{1,3}(?:\.\d{3})*,\s?\d{2}|\d+,\s?\d{2})\s*$/;

/**
 * O texto colado é a Relação de Totais Líquidos?
 *
 * Checado pelo cabeçalho E por ao menos uma linha de colaborador: só o título
 * não basta, porque uma cópia truncada (o operador selecionou meia página)
 * passaria na validação e importaria folha vazia.
 */
export function ehRelatorioTotaisLiquidos(texto: string): boolean {
  const linhas = texto.split(/\r?\n/);
  const temLinhas = linhas.filter((l) => LINHA.test(l.trim())).length;
  // O título é a pista principal, mas o relatório de alguns escritórios sai sem
  // ele. Duas linhas de colaborador já não são coincidência de planilha.
  if (/Totais\s*L[íi]quidos|Rela[çc][ãa]o\s+de\s+Total/i.test(texto)) return temLinhas > 0;
  return temLinhas >= 2;
}

export function parseRelatorioFolha(texto: string): RelatorioFolha {
  const linhas = String(texto ?? "").split(/\r?\n/);

  let cnpj: string | null = null;
  let razao: string | null = null;
  let competencia: string | null = null;
  let totalInformado: number | null = null;
  const colaboradores: ColaboradorRelatorio[] = [];

  for (const bruta of linhas) {
    const l = bruta.trim();
    if (!l) continue;

    const item = l.match(LINHA);
    if (item) {
      colaboradores.push({
        codigo: item[1] ?? null,
        nome: item[2].replace(/\s+/g, " ").trim(),
        cpf: item[3].replace(/\D/g, ""),
        data_pagamento: dataBr(item[4]),
        valor_liquido: valorBr(item[5]),
      });
      continue;
    }

    // Cabeçalho. Os rótulos vêm colados no valor ("Razão Social:M DE M ..."),
    // e a mesma linha carrega dois campos — daí a captura preguiçosa antes do
    // rótulo seguinte.
    if (cnpj === null) {
      const m = l.match(/C\.?N\.?P\.?J\.?[^:]*:\s*([\d./-]{14,20})/i);
      if (m) cnpj = m[1].replace(/\D/g, "");
    }
    if (razao === null) {
      const m = l.match(/Raz[ãa]o\s+Social\s*:\s*(.+?)(?:\s+C\.?N\.?P\.?J|$)/i);
      if (m) razao = m[1].trim();
    }
    if (competencia === null) {
      // "Período de:01/07/2026 à 31/07/2026" — a competência é o mês inicial.
      const m = l.match(/Per[íi]odo[^:]*:\s*(\d{2})\/(\d{2})\/(\d{4})/i);
      if (m) competencia = `${m[3]}-${m[2]}`;
    }
    if (totalInformado === null) {
      const m = l.match(/^Total\s*:\s*([\d.]*\d,\d{2})$/i);
      if (m) totalInformado = valorBr(m[1]);
    }
  }

  // Data de pagamento: a que mais aparece. Rescisão no meio do mês faz uma
  // linha divergir, e a folha inteira não pode andar atrás da exceção.
  const contagem = new Map<string, number>();
  for (const c of colaboradores) {
    if (c.data_pagamento) contagem.set(c.data_pagamento, (contagem.get(c.data_pagamento) ?? 0) + 1);
  }
  let dataPagamento: string | null = null;
  let maior = 0;
  for (const [d, n] of contagem) {
    if (n > maior) { maior = n; dataPagamento = d; }
  }

  const somaLida = Math.round(colaboradores.reduce((s, c) => s + c.valor_liquido, 0) * 100) / 100;
  const divergencia = totalInformado === null
    ? null
    : Math.round((totalInformado - somaLida) * 100) / 100;

  return {
    cnpj,
    razao_social: razao,
    competencia,
    data_pagamento: dataPagamento,
    colaboradores,
    total_informado: totalInformado,
    divergencia,
  };
}
