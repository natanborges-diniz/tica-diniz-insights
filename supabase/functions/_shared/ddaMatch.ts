// Match entre título do DDA e lançamento/parcela do ERP.
//
// Por que existia falha: as duas rotas de conciliação exigiam data de
// vencimento IDÊNTICA, e uma delas exigia valor idêntico até o centavo. Na
// prática os dois campos derivam:
//   - valor: Johnson & Johnson, ERP R$ 213,08 vs boleto registrado R$ 213,06;
//   - data:  HOYA, ERP 06/08 vs registro na CIP 04/08 (o emissor pode
//            prorrogar ou antecipar depois de imprimir o boleto).
// Resultado: boleto legítimo ficava órfão e o lançamento aparecia "sem boleto".
//
// A regra agora é hierárquica: CNPJ do emissor é o sinal forte; valor e data
// entram com tolerância. Ambiguidade nunca casa — melhor deixar para o humano
// do que amarrar o boleto errado a uma despesa.
//
// Módulo puro — testado em src/lib/financeiro/__tests__/ddaMatch.ts.

/** Diferença de valor aceita: cobre juros/multa/desconto de arredondamento. */
export const TOLERANCIA_VALOR = 0.10;
/** Janela de vencimento, em dias, para os dois lados. */
export const JANELA_DIAS = 5;

export interface TituloDda {
  valor: number;
  data_vencimento: string;
  documento_emissor?: string | null;
}

export interface CandidatoErp {
  id: string;
  valor: number;
  data_vencimento: string;
  pessoa_documento?: string | null;
}

export interface ResultadoMatch {
  /** Candidato escolhido, ou null quando não dá para afirmar. */
  candidato: CandidatoErp | null;
  motivo: string;
  /** Quantos candidatos ficaram empatados no melhor critério. */
  empatados: number;
}

const soDigitos = (s: unknown) => String(s ?? "").replace(/\D/g, "");

/** Distância em dias entre duas datas yyyy-MM-dd. */
export function distanciaDias(a: string, b: string): number {
  const d1 = Date.parse(`${String(a).slice(0, 10)}T12:00:00Z`);
  const d2 = Date.parse(`${String(b).slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(d1) || Number.isNaN(d2)) return Infinity;
  return Math.abs(Math.round((d1 - d2) / 86_400_000));
}

/**
 * Escolhe o lançamento do ERP que corresponde ao título do DDA.
 *
 * Ordem de decisão:
 *   1. CNPJ do emissor bate e valor está na tolerância → o mais próximo em data
 *      vence. É o sinal mais forte: mesmo fornecedor, mesmo valor.
 *   2. Sem CNPJ dos dois lados: valor na tolerância dentro da janela de dias.
 *      Só casa se sobrar UM — dois títulos parecidos do mesmo dia ficam para
 *      conferência manual.
 */
export function casarTitulo(titulo: TituloDda, candidatos: CandidatoErp[]): ResultadoMatch {
  const docDda = soDigitos(titulo.documento_emissor);

  const naTolerancia = candidatos.filter((c) =>
    Math.abs(Number(c.valor) - Number(titulo.valor)) <= TOLERANCIA_VALOR
  );

  if (naTolerancia.length === 0) {
    return { candidato: null, motivo: "Nenhum lançamento com valor compatível", empatados: 0 };
  }

  // 1. CNPJ do emissor — sinal forte
  if (docDda) {
    const porDoc = naTolerancia.filter((c) => soDigitos(c.pessoa_documento) === docDda);
    if (porDoc.length === 1) {
      return { candidato: porDoc[0], motivo: "CNPJ do emissor e valor conferem", empatados: 1 };
    }
    if (porDoc.length > 1) {
      // Mesmo fornecedor, mesmo valor, várias parcelas: a data desempata.
      const ordenado = [...porDoc].sort(
        (a, b) =>
          distanciaDias(a.data_vencimento, titulo.data_vencimento) -
          distanciaDias(b.data_vencimento, titulo.data_vencimento),
      );
      const melhor = distanciaDias(ordenado[0].data_vencimento, titulo.data_vencimento);
      const segundo = distanciaDias(ordenado[1].data_vencimento, titulo.data_vencimento);
      if (melhor <= JANELA_DIAS && melhor < segundo) {
        return { candidato: ordenado[0], motivo: "CNPJ e valor conferem; vencimento mais próximo", empatados: 1 };
      }
      return {
        candidato: null,
        motivo: `${porDoc.length} lançamentos do mesmo fornecedor com o mesmo valor — conferir manualmente`,
        empatados: porDoc.length,
      };
    }
    // CNPJ conhecido e nenhum candidato bate: não force por valor.
    return { candidato: null, motivo: "Nenhum lançamento do mesmo fornecedor com valor compatível", empatados: 0 };
  }

  // 2. Sem CNPJ: valor + janela de vencimento, e só se for inequívoco
  const naJanela = naTolerancia.filter(
    (c) => distanciaDias(c.data_vencimento, titulo.data_vencimento) <= JANELA_DIAS,
  );
  if (naJanela.length === 1) {
    return { candidato: naJanela[0], motivo: "Valor e vencimento compatíveis", empatados: 1 };
  }
  if (naJanela.length === 0) {
    return { candidato: null, motivo: `Nenhum lançamento com vencimento em ±${JANELA_DIAS} dias`, empatados: 0 };
  }
  return {
    candidato: null,
    motivo: `${naJanela.length} lançamentos igualmente plausíveis — conferir manualmente`,
    empatados: naJanela.length,
  };
}
