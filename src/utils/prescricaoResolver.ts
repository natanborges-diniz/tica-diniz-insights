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
  const temLonge = input.longeEsf != null || input.longeCil != null;
  const temPerto = input.pertoEsf != null || input.pertoCil != null;
  const temAdicao = input.adicao != null && input.adicao !== 0;

  // Regra 1: Só perto preenchido → usar perto como esférico/cilíndrico para Hoya
  if (!temLonge && temPerto) {
    return {
      esferico: input.pertoEsf,
      cilindrico: input.pertoCil,
      eixo: input.pertoEixo ?? input.longeEixo,
      adicao: input.adicao,
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

  // Regra 3: Longe + perto SEM adição → calcular adição algebraicamente
  if (temLonge && temPerto && !temAdicao) {
    const longeEsf = input.longeEsf ?? 0;
    const pertoEsf = input.pertoEsf ?? 0;
    const adicaoCalculada = +(pertoEsf - longeEsf).toFixed(2);

    return {
      esferico: input.longeEsf,
      cilindrico: input.longeCil,
      eixo: input.longeEixo,
      adicao: adicaoCalculada > 0 ? adicaoCalculada : null,
      origem: "calculado",
    };
  }

  // Padrão: Só longe (sem perto)
  return {
    esferico: input.longeEsf,
    cilindrico: input.longeCil,
    eixo: input.longeEixo,
    adicao: input.adicao,
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
