// Match entre título do DDA (boleto registrado) e lançamento do ERP.
//
// Histórico dos erros que esta regra corrige:
//   1. Exigia valor idêntico ao centavo E vencimento idêntico. Os dois derivam:
//      Johnson & Johnson (ERP 213,08 × boleto 213,06) e HOYA (ERP 06/08 ×
//      registro na CIP 04/08, porque o emissor prorroga depois de imprimir).
//   2. A primeira correção passou a exigir CNPJ do emissor batendo — mas o
//      import do ERP nunca gravava `pessoa_documento`. Resultado: o ramo do
//      CNPJ recusava tudo e o match parou de acontecer de vez.
//
// Daí a regra atual: o CNPJ só DECIDE quando o lado do ERP realmente tem CNPJ.
// Ausência de dado nunca é motivo para recusar — só divergência é.
//
// Hierarquia, do mais forte para o mais fraco:
//   1. número do documento (a nota) + valor na tolerância  → certeza
//   2. CNPJ do emissor + valor na tolerância               → alta confiança
//   3. valor na tolerância + vencimento na janela          → aceita se único
//   4. ambiguidade                                          → não casa
//
// Módulo puro — testado em src/lib/financeiro/__tests__/ddaMatch.test.ts.

/** Diferença de valor aceita: cobre juros/multa/desconto de arredondamento. */
export const TOLERANCIA_VALOR = 0.10;
/** Janela de vencimento, em dias, para os dois lados. */
export const JANELA_DIAS = 5;

export interface TituloDda {
  valor: number;
  data_vencimento: string;
  documento_emissor?: string | null;
  /** Número da nota/documento no boleto. */
  numero_documento?: string | null;
}

export interface CandidatoErp {
  id: string;
  valor: number;
  data_vencimento: string;
  pessoa_documento?: string | null;
  /** Número do documento da parcela no ERP. */
  documento?: string | null;
  /**
   * Tolerância de valor própria deste candidato, em reais.
   *
   * Existe para lançamento provisionado por rubrica: aluguel e condomínio SEMPRE
   * vêm com boleto reajustado, e o provisionado carrega o valor esperado, não o
   * cobrado. Com a tolerância fixa de R$ 0,10 o boleto legítimo nunca casaria —
   * a faixa da rubrica é justamente a medida de quanto o desvio é aceitável.
   */
  tolerancia_valor?: number | null;
}

export interface ResultadoMatch {
  candidato: CandidatoErp | null;
  motivo: string;
  /** Quantos candidatos ficaram empatados no melhor critério. */
  empatados: number;
  /** Critério que decidiu — útil no log e na auditoria da conciliação. */
  criterio?: "DOCUMENTO" | "CNPJ" | "VALOR_DATA";
}

const soDigitos = (s: unknown) => String(s ?? "").replace(/\D/g, "");

/**
 * Normaliza número de documento para comparação.
 *
 * O ERP escreve "106544/2", "0010655-44", "106544 2" para a mesma nota; o
 * boleto costuma trazer só os dígitos. Comparamos apenas os dígitos, e
 * ignoramos zeros à esquerda.
 */
export function normalizarDocumento(s: unknown): string {
  const d = soDigitos(s).replace(/^0+/, "");
  return d.length >= 3 ? d : ""; // muito curto não identifica nada
}

/**
 * Formas equivalentes de um número de documento.
 *
 * O ERP costuma escrever "106544/2" (nota 106544, parcela 2) enquanto o boleto
 * traz só "106544". Comparar dígito a dígito daria '1065442' × '106544' e não
 * casaria. Então geramos as duas leituras: todos os dígitos, e a base antes do
 * primeiro separador. Casa se qualquer uma coincidir.
 */
export function formasDocumento(s: unknown): string[] {
  const bruto = String(s ?? "").trim();
  if (!bruto) return [];
  const formas = new Set<string>();

  const todos = normalizarDocumento(bruto);
  if (todos) formas.add(todos);

  const base = normalizarDocumento(bruto.split(/[\/\-.\s]/)[0]);
  if (base) formas.add(base);

  return [...formas];
}

function documentosCasam(a: unknown, b: unknown): boolean {
  const fa = formasDocumento(a);
  const fb = formasDocumento(b);
  return fa.length > 0 && fb.length > 0 && fa.some((x) => fb.includes(x));
}

/** Distância em dias entre duas datas yyyy-MM-dd. */
export function distanciaDias(a: string, b: string): number {
  const d1 = Date.parse(`${String(a).slice(0, 10)}T12:00:00Z`);
  const d2 = Date.parse(`${String(b).slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(d1) || Number.isNaN(d2)) return Infinity;
  return Math.abs(Math.round((d1 - d2) / 86_400_000));
}

/** Ordena por proximidade de vencimento ao título. */
function porProximidade(lista: CandidatoErp[], venc: string): CandidatoErp[] {
  return [...lista].sort(
    (a, b) => distanciaDias(a.data_vencimento, venc) - distanciaDias(b.data_vencimento, venc),
  );
}

/**
 * Escolhe, entre candidatos empatados, o de vencimento mais próximo — desde que
 * a vantagem seja inequívoca. Empate real devolve null: amarrar o boleto errado
 * a uma despesa é pior do que deixar para conferência humana.
 */
function desempatarPorData(lista: CandidatoErp[], venc: string): CandidatoErp | null {
  const ord = porProximidade(lista, venc);
  const d0 = distanciaDias(ord[0].data_vencimento, venc);
  const d1 = distanciaDias(ord[1].data_vencimento, venc);
  return d0 <= JANELA_DIAS && d0 < d1 ? ord[0] : null;
}

export function casarTitulo(titulo: TituloDda, candidatos: CandidatoErp[]): ResultadoMatch {
  const venc = String(titulo.data_vencimento).slice(0, 10);

  // Tolerância por candidato quando ele declara uma (rubrica com faixa própria);
  // senão, a fixa de centavos.
  const naTolerancia = candidatos.filter((c) => {
    const limite = Number(c.tolerancia_valor ?? 0) > 0
      ? Number(c.tolerancia_valor)
      : TOLERANCIA_VALOR;
    return Math.abs(Number(c.valor) - Number(titulo.valor)) <= limite;
  });
  if (naTolerancia.length === 0) {
    return { candidato: null, motivo: "Nenhum lançamento com valor compatível", empatados: 0 };
  }

  // ── 1. Número do documento: a nota é a mesma, não há o que discutir ──
  const numDda = normalizarDocumento(titulo.numero_documento);
  if (numDda) {
    const porNumero = naTolerancia.filter((c) => documentosCasam(titulo.numero_documento, c.documento));
    if (porNumero.length === 1) {
      return { candidato: porNumero[0], motivo: "Número do documento e valor conferem", empatados: 1, criterio: "DOCUMENTO" };
    }
    if (porNumero.length > 1) {
      const escolhido = desempatarPorData(porNumero, venc);
      if (escolhido) {
        return { candidato: escolhido, motivo: "Documento e valor conferem; vencimento mais próximo", empatados: 1, criterio: "DOCUMENTO" };
      }
    }
  }

  // ── 2. CNPJ do emissor — só decide se o lado do ERP tiver CNPJ ──
  //
  // Este é o ponto que quebrou antes: quando `pessoa_documento` é nulo em todos
  // os candidatos, a ausência de dado não pode ser lida como divergência.
  const docDda = soDigitos(titulo.documento_emissor);
  const comDoc = naTolerancia.filter((c) => soDigitos(c.pessoa_documento).length > 0);

  if (docDda && comDoc.length > 0) {
    const porDoc = comDoc.filter((c) => soDigitos(c.pessoa_documento) === docDda);

    if (porDoc.length === 1) {
      return { candidato: porDoc[0], motivo: "CNPJ do emissor e valor conferem", empatados: 1, criterio: "CNPJ" };
    }
    if (porDoc.length > 1) {
      const escolhido = desempatarPorData(porDoc, venc);
      if (escolhido) {
        return { candidato: escolhido, motivo: "CNPJ e valor conferem; vencimento mais próximo", empatados: 1, criterio: "CNPJ" };
      }
      return {
        candidato: null,
        motivo: `${porDoc.length} lançamentos do mesmo fornecedor com o mesmo valor e datas equidistantes — conferir manualmente`,
        empatados: porDoc.length,
      };
    }
    // Nenhum do mesmo CNPJ. Só é divergência se TODOS tinham CNPJ para comparar;
    // havendo candidatos sem CNPJ, eles seguem para a regra 3.
    if (comDoc.length === naTolerancia.length) {
      return { candidato: null, motivo: "Todos os lançamentos de valor compatível são de outro fornecedor", empatados: 0 };
    }
  }

  // ── 3. Valor + janela de vencimento, entre os que não têm CNPJ para comparar ──
  const restantes = docDda && comDoc.length > 0
    ? naTolerancia.filter((c) => soDigitos(c.pessoa_documento).length === 0)
    : naTolerancia;

  const naJanela = restantes.filter((c) => distanciaDias(c.data_vencimento, venc) <= JANELA_DIAS);

  if (naJanela.length === 1) {
    return { candidato: naJanela[0], motivo: "Valor e vencimento compatíveis", empatados: 1, criterio: "VALOR_DATA" };
  }
  if (naJanela.length === 0) {
    return { candidato: null, motivo: `Nenhum lançamento com vencimento em ±${JANELA_DIAS} dias`, empatados: 0 };
  }

  // Vários plausíveis: só aceita se um for claramente o mais próximo.
  const escolhido = desempatarPorData(naJanela, venc);
  if (escolhido) {
    return { candidato: escolhido, motivo: "Valor compatível e vencimento mais próximo", empatados: 1, criterio: "VALOR_DATA" };
  }
  return {
    candidato: null,
    motivo: `${naJanela.length} lançamentos igualmente plausíveis — conferir manualmente`,
    empatados: naJanela.length,
  };
}
