// Conversão de código de boleto — padrão FEBRABAN.
//
// O DDA do BTG entrega a LINHA DIGITÁVEL (47 dígitos, cobrança; 48, arrecadação),
// mas a API de pagamentos espera o CÓDIGO DE BARRAS (44 dígitos). Enviar a linha
// digitável no campo `barcode` causa erro 500 genérico no BTG (bug real: boleto
// Luxottica R$ 15,96, 31/07/2026).
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
