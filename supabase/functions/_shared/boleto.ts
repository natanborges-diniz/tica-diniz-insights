// Códigos de boleto — padrão FEBRABAN.
//
// Docs BTG (developers.empresas.btgpactual.com/docs/pagamentos):
// - BANKSLIP exige `digitableLine` (linha digitável de cobrança, 47 dígitos)
//   e NÃO aceita linhas iniciadas em 8;
// - UTILITIES (arrecadação: água/luz/tributos, inicia em 8) aceita
//   `digitableLine` (48) ou `barcode` (44).
// Bug real coberto: enviar o campo `barcode` num BANKSLIP → 500 genérico
// (boleto Luxottica R$ 15,96, 31/07/2026).
//
// Módulo puro — testado em src/lib/financeiro/__tests__/boleto.test.ts.

export function somenteDigitos(s: unknown): string {
  return String(s ?? "").replace(/\D/g, "");
}

/** DV módulo 10 FEBRABAN (pesos 2,1,2,... da direita para a esquerda). */
export function mod10(bloco: string): number {
  let soma = 0;
  let peso = 2;
  for (let i = bloco.length - 1; i >= 0; i--) {
    let p = Number(bloco[i]) * peso;
    if (p > 9) p = Math.floor(p / 10) + (p % 10);
    soma += p;
    peso = peso === 2 ? 1 : 2;
  }
  const resto = soma % 10;
  return resto === 0 ? 0 : 10 - resto;
}

/**
 * Normaliza qualquer código de boleto para o código de barras de 44 dígitos.
 *
 * - 44 dígitos → já é código de barras, retorna como está;
 * - 47 dígitos → linha digitável de cobrança: valida DV mod10 dos 3 campos e
 *   rearranja (banco+moeda, DV geral, fator+valor, campo livre);
 * - 48 dígitos → linha digitável de arrecadação (concessionárias/tributos):
 *   remove o DV de cada um dos 4 blocos de 12;
 * - outro tamanho → erro (linha corrompida/truncada — melhor barrar aqui do que
 *   receber 500 opaco do banco).
 */
export function paraCodigoBarras(entrada: unknown): string {
  const d = somenteDigitos(entrada);

  if (d.length === 44) return d;

  if (d.length === 47) {
    const campo1 = d.slice(0, 10);  // AAABC.CCCCX  (banco 3 + moeda 1 + livre 1-5 + DV)
    const campo2 = d.slice(10, 21); // DDDDD.DDDDDY (livre 6-15 + DV)
    const campo3 = d.slice(21, 32); // EEEEE.EEEEEZ (livre 16-25 + DV)
    const dvGeral = d[32];          // K
    const campo5 = d.slice(33, 47); // fator vencimento (4) + valor (10)

    for (const campo of [campo1, campo2, campo3]) {
      const corpo = campo.slice(0, -1);
      const dv = Number(campo.slice(-1));
      if (mod10(corpo) !== dv) {
        throw new Error(
          `Linha digitável inválida — DV do campo "${campo}" não confere (linha corrompida?)`,
        );
      }
    }

    return (
      campo1.slice(0, 4) + // banco + moeda
      dvGeral +
      campo5 +
      campo1.slice(4, 9) + // campo livre posições 1-5
      campo2.slice(0, 10) + // campo livre posições 6-15
      campo3.slice(0, 10) // campo livre posições 16-25
    );
  }

  if (d.length === 48) {
    // Arrecadação: 4 blocos de 12 dígitos (11 úteis + 1 DV cada)
    let barcode = "";
    for (let i = 0; i < 4; i++) barcode += d.slice(i * 12, i * 12 + 11);
    return barcode;
  }

  throw new Error(
    `Código de boleto com ${d.length} dígitos — esperado 44 (barras), 47 (cobrança) ou 48 (arrecadação)`,
  );
}

/**
 * Normaliza para a LINHA DIGITÁVEL — formato que a API de pagamentos do BTG
 * espera no `digitableLine`.
 *
 * - 47 dígitos → valida os DVs (via conversão) e retorna;
 * - 48 dígitos → arrecadação, retorna como está;
 * - 44 dígitos (código de barras de cobrança) → monta a linha digitável
 *   calculando os DVs mod10 dos 3 campos; se iniciar em 8 (arrecadação em
 *   barras), retorna os 44 (a API aceita `barcode` nesse caso);
 * - outro tamanho → erro.
 */
/**
 * Valor do título, lido do próprio código. Retorna null quando não dá para
 * afirmar (código inválido, ou arrecadação — que tem layout de valor distinto).
 *
 * Serve para confrontar o valor vindo do ERP com o do boleto antes do envio:
 * divergir, ainda que em centavos, dispara `amount-doesnt-match` no BTG.
 *
 * No código de barras de cobrança (44), o valor ocupa as posições 9–18.
 */
export function valorDoCodigoBarras(entrada: unknown): number | null {
  let barras: string;
  try {
    barras = paraCodigoBarras(entrada);
  } catch {
    return null;
  }
  if (barras[0] === "8") return null; // arrecadação: outro layout
  const centavos = Number(barras.slice(9, 19));
  if (!Number.isFinite(centavos) || centavos <= 0) return null;
  return centavos / 100;
}

export function paraLinhaDigitavel(entrada: unknown): string {
  const d = somenteDigitos(entrada);

  if (d.length === 47) {
    paraCodigoBarras(d); // valida DVs — lança se a linha veio corrompida
    return d;
  }
  if (d.length === 48) return d;
  if (d.length === 44) {
    if (d[0] === "8") return d; // arrecadação em barras: enviar como barcode
    const livre = d.slice(19); // campo livre (25)
    const c1 = d.slice(0, 4) + livre.slice(0, 5); // banco+moeda+livre 1-5
    const c2 = livre.slice(5, 15);
    const c3 = livre.slice(15, 25);
    return (
      c1 + String(mod10(c1)) +
      c2 + String(mod10(c2)) +
      c3 + String(mod10(c3)) +
      d[4] + // DV geral
      d.slice(5, 19) // fator vencimento + valor
    );
  }

  throw new Error(
    `Código de boleto com ${d.length} dígitos — esperado 44 (barras), 47 (cobrança) ou 48 (arrecadação)`,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Apoio à digitação na tela. O operador cola a linha do papel — com pontos,
// espaços e barras — e precisa saber NA HORA se ela está certa. Antes, o campo
// aceitava qualquer coisa e o erro só aparecia quando o borderô ia ao banco.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Máscara FEBRABAN, do jeito que está impressa no boleto — serve para o
 * operador conferir o que colou contra o papel.
 *
 * Formatação parcial é intencional: o campo mostra progresso enquanto digita.
 */
export function formatarLinhaDigitavel(entrada: unknown): string {
  const d = somenteDigitos(entrada);
  if (!d) return "";

  // Arrecadação (inicia em 8): 4 blocos de 12.
  if (d[0] === "8") {
    return (d.match(/.{1,12}/g) ?? []).join(" ");
  }

  // Cobrança: 5-5 . 5-6 . 5-6 . 1 . 14
  const blocos = [
    [0, 5],
    [5, 10],
    [10, 15],
    [15, 21],
    [21, 26],
    [26, 32],
    [32, 33],
    [33, 47],
  ] as const;
  const separadores = [".", " ", ".", " ", ".", " ", " "];

  let saida = "";
  for (let i = 0; i < blocos.length; i++) {
    const [ini, fim] = blocos[i];
    if (d.length <= ini) break;
    if (i > 0) saida += separadores[i - 1];
    saida += d.slice(ini, fim);
  }
  return saida;
}

/** Base do fator de vencimento FEBRABAN. */
const BASE_FATOR = Date.UTC(1997, 9, 7);

/** 22/02/2025 — primeiro dia do ciclo reiniciado (fator 1000). */
const VIRADA_FATOR = Date.UTC(2025, 1, 22);

/**
 * Vencimento lido do fator (posições 5–8 do código de barras).
 *
 * Fator 0000 significa "sem vencimento". Acima de 9999 a FEBRABAN reiniciou a
 * contagem em 1000 (regra de 2025), então fatores baixos são interpretados no
 * ciclo novo. Arrecadação usa outro layout e devolve null.
 */
export function vencimentoDoCodigoBarras(entrada: unknown): string | null {
  let barras: string;
  try {
    barras = paraCodigoBarras(entrada);
  } catch {
    return null;
  }
  if (barras[0] === "8") return null;

  const fator = Number(barras.slice(5, 9));
  if (!Number.isFinite(fator) || fator === 0) return null;

  // A FEBRABAN esgotou o contador em 21/02/2025 (fator 9999) e reiniciou em
  // 1000. Um fator cuja data cai antes dessa virada é do ciclo novo — sem isso,
  // um boleto de 07/08/2026 (fator 1531) era lido como 16/12/2001.
  let ms = BASE_FATOR + fator * 86400000;
  if (ms < VIRADA_FATOR) ms += 9000 * 86400000;
  return new Date(ms).toISOString().slice(0, 10);
}

export type TipoBoleto = "COBRANCA" | "ARRECADACAO";

export interface DiagnosticoBoleto {
  status: "vazio" | "incompleto" | "invalido" | "ok";
  digitos: number;
  tipo: TipoBoleto | null;
  valor: number | null;
  vencimento: string | null;
  mensagem: string;
}

/**
 * Diagnóstico para exibir embaixo do campo.
 *
 * "incompleto" existe para não acusar erro a cada tecla: enquanto a linha não
 * alcança um tamanho válido, o retorno é de progresso, não de falha.
 */
export function diagnosticarBoleto(entrada: unknown): DiagnosticoBoleto {
  const d = somenteDigitos(entrada);
  const arrecadacao = d[0] === "8";
  const tipo: TipoBoleto | null = d ? (arrecadacao ? "ARRECADACAO" : "COBRANCA") : null;

  if (!d) {
    return { status: "vazio", digitos: 0, tipo: null, valor: null, vencimento: null, mensagem: "" };
  }

  const alvo = arrecadacao ? 48 : 47;
  if (d.length !== 44 && d.length !== 47 && d.length !== 48) {
    if (d.length < alvo) {
      return {
        status: "incompleto",
        digitos: d.length,
        tipo,
        valor: null,
        vencimento: null,
        mensagem: `${d.length} de ${alvo} dígitos — faltam ${alvo - d.length}`,
      };
    }
    return {
      status: "invalido",
      digitos: d.length,
      tipo,
      valor: null,
      vencimento: null,
      mensagem: `${d.length} dígitos — esperado 47 (boleto), 48 (concessionária) ou 44 (código de barras)`,
    };
  }

  try {
    paraCodigoBarras(d);
  } catch (e) {
    return {
      status: "invalido",
      digitos: d.length,
      tipo,
      valor: null,
      vencimento: null,
      mensagem: e instanceof Error
        ? e.message
        : "Linha inválida — confira os dígitos contra o boleto",
    };
  }

  const valor = valorDoCodigoBarras(d);
  const vencimento = vencimentoDoCodigoBarras(d);
  const partes: string[] = [
    arrecadacao ? "Conta de concessionária ou tributo" : "Boleto de cobrança",
  ];
  if (valor !== null) {
    partes.push(
      `valor ${valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`,
    );
  }
  if (vencimento) {
    const [a, m, dia] = vencimento.split("-");
    partes.push(`vence ${dia}/${m}/${a}`);
  }

  return {
    status: "ok",
    digitos: d.length,
    tipo,
    valor,
    vencimento,
    mensagem: partes.join(" · "),
  };
}
