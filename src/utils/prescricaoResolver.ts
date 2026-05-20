// src/utils/prescricaoResolver.ts
// Regras de resolução de prescrição para pedido Hoya
//
// Regra 1: Se longe vazio e perto preenchido → usar perto como esférico/cilíndrico
// Regra 2: Se longe + perto + adição preenchidos → usar longe + adição (ignorar perto)  
// Regra 3: Se longe + perto preenchidos mas SEM adição → calcular adição = perto_esf - longe_esf, usar longe

export interface PrescricaoOlhoInput {
  longeEsf: number | null;
  longeCil: number | null;
  longeEixo: number | null;
  pertoEsf: number | null;
  pertoCil: number | null;
  pertoEixo: number | null;
  adicao: number | null;
  dnp: number | null;
  altura: number | null;
}

export interface PrescricaoOlhoResolved {
  esferico: number | null;
  cilindrico: number | null;
  eixo: number | null;
  adicao: number | null;
  origem: "longe" | "perto" | "calculado";
}

/**
 * Resolve a prescrição de UM olho para o formato Hoya.
 */
export function resolverPrescricaoOlho(input: PrescricaoOlhoInput): PrescricaoOlhoResolved {
  // Tratar 0 como "não preenchido" — o ERP costuma devolver zeros em vez de NULL
  // quando o operador não digitou nada. Sem isso a Regra 3 inventava
  // adição = 0 − longe_esf (bug OS 96999).
  const isFilled = (v: number | null | undefined) => v != null && v !== 0;

  const temLonge = isFilled(input.longeEsf) || isFilled(input.longeCil);
  const temPerto = isFilled(input.pertoEsf) || isFilled(input.pertoCil);
  const temAdicao = isFilled(input.adicao);

  // Regra 1: Só perto preenchido → usar perto como esférico/cilíndrico para Hoya
  if (!temLonge && temPerto) {
    return {
      esferico: input.pertoEsf,
      cilindrico: input.pertoCil,
      eixo: input.pertoEixo ?? input.longeEixo,
      adicao: temAdicao ? input.adicao : null,
      origem: "perto",
    };
  }

  // Regra 2: Longe + adição → usar longe + adição (ignorar perto)
  if (temLonge && temAdicao) {
    return {
      esferico: input.longeEsf,
      cilindrico: input.longeCil,
      eixo: input.longeEixo,
      adicao: input.adicao,
      origem: "longe",
    };
  }

  // Regra 3: Longe + perto SEM adição → só calcula adição se AMBOS esféricos
  // estiverem efetivamente preenchidos (não-zero) E a diferença for clinicamente
  // válida (≥ 0.5). Caso contrário cai no padrão "só longe" sem adição.
  if (
    temLonge &&
    temPerto &&
    !temAdicao &&
    isFilled(input.longeEsf) &&
    isFilled(input.pertoEsf)
  ) {
    const adicaoCalculada = +(input.pertoEsf! - input.longeEsf!).toFixed(2);

    return {
      esferico: input.longeEsf,
      cilindrico: input.longeCil,
      eixo: input.longeEixo,
      adicao: adicaoCalculada >= 0.5 ? adicaoCalculada : null,
      origem: "calculado",
    };
  }

  // Padrão: Só longe (sem perto válido)
  return {
    esferico: input.longeEsf,
    cilindrico: input.longeCil,
    eixo: input.longeEixo,
    adicao: temAdicao ? input.adicao : null,
    origem: "longe",
  };
}

/**
 * Resolve prescrição de ambos os olhos a partir de um OsHubRecord.
 */
export function resolverPrescricaoCompleta(os: {
  odLongeEsf: number | null; odLongeCil: number | null; odLongeEixo: number | null;
  odPertoEsf: number | null; odPertoCil: number | null; odPertoEixo: number | null;
  odAdicao: number | null; odDnp: number | null; odAltura: number | null;
  oeLongeEsf: number | null; oeLongeCil: number | null; oeLongeEixo: number | null;
  oePertoEsf: number | null; oePertoCil: number | null; oePertoEixo: number | null;
  oeAdicao: number | null; oeDnp: number | null; oeAltura: number | null;
}) {
  const od = resolverPrescricaoOlho({
    longeEsf: os.odLongeEsf, longeCil: os.odLongeCil, longeEixo: os.odLongeEixo,
    pertoEsf: os.odPertoEsf, pertoCil: os.odPertoCil, pertoEixo: os.odPertoEixo,
    adicao: os.odAdicao, dnp: os.odDnp, altura: os.odAltura,
  });

  const oe = resolverPrescricaoOlho({
    longeEsf: os.oeLongeEsf, longeCil: os.oeLongeCil, longeEixo: os.oeLongeEixo,
    pertoEsf: os.oePertoEsf, pertoCil: os.oePertoCil, pertoEixo: os.oePertoEixo,
    adicao: os.oeAdicao, dnp: os.oeDnp, altura: os.oeAltura,
  });

  return { od, oe };
}
