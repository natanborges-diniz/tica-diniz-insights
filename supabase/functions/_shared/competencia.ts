// Competência — o mês a que a despesa pertence, que é como o DRE enxerga.
//
// Três origens, em ordem de autoridade:
//
//   1. Decidida. Folha e provisão de rubrica têm um mês escolhido: julho é
//      fechado e pago em agosto, e os encargos de julho vencem no dia 7 e 20 de
//      agosto — tudo é competência JULHO. Nenhuma data do registro revela isso.
//   2. Emissão. Para título do ERP (boleto, nota), a data de emissão é o que a
//      casa usa como competência na prática.
//   3. Vencimento. Última saída, quando não há emissão nem decisão. É palpite,
//      mas um lançamento sem competência nenhuma some do DRE, o que é pior.
//
// A mesma regra vive na trigger `fn_lancamento_competencia`. Aqui ela existe
// para o código poder calcular antes de gravar e para ser testável.

/** yyyy-MM a partir de yyyy-MM-dd, sem passar por Date (fuso trocaria o mês). */
export function mesDe(data: unknown): string | null {
  const s = String(data ?? "").slice(0, 7);
  return /^\d{4}-\d{2}$/.test(s) ? s : null;
}

export interface FontesCompetencia {
  /** Mês decidido — folha. */
  competencia?: string | null;
  /** Mês da provisão de rubrica. */
  competencia_rubrica?: string | null;
  data_emissao?: string | null;
  data_vencimento?: string | null;
}

export function competenciaDoLancamento(f: FontesCompetencia): string | null {
  return mesDe(f.competencia)
    ?? mesDe(f.competencia_rubrica)
    ?? mesDe(f.data_emissao)
    ?? mesDe(f.data_vencimento);
}

/**
 * Meses cobertos por um intervalo de datas, inclusive nas pontas.
 *
 * O DRE recebe datas, mas raciocina em meses: pedir 15/07 a 20/08 significa
 * querer as competências de julho e agosto inteiras. Recortar por dia dentro do
 * mês daria um "julho" que não é julho, e a soma não bateria com o fechamento.
 */
export function mesesNoIntervalo(dataInicio: string, dataFim: string): string[] {
  const ini = mesDe(dataInicio);
  const fim = mesDe(dataFim);
  if (!ini || !fim || ini > fim) return [];

  const meses: string[] = [];
  let [ano, mes] = ini.split("-").map(Number);
  // Teto de 120 meses: intervalo absurdo é erro de digitação, não consulta.
  for (let i = 0; i < 120; i++) {
    const atual = `${ano}-${String(mes).padStart(2, "0")}`;
    meses.push(atual);
    if (atual >= fim) break;
    mes++;
    if (mes > 12) { mes = 1; ano++; }
  }
  return meses;
}
