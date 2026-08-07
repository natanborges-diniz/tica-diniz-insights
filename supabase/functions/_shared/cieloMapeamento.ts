// Mapeamento estabelecimento submissor -> loja, para o Extrato Eletronico Cielo.
//
// Vive separado da edge function para poder ser testado: e a peca onde um erro
// nao aparece como erro. Um PV atribuido a loja errada nao quebra nada — a
// venda simplesmente entra no relatorio de outra loja, e ninguem percebe ate
// alguem estranhar o faturamento.
//
// A estrutura da Cielo nao espelha a estrutura de lojas: uma matriz de extrato
// pode cobrir varias lojas (matriz + filiais sob a mesma raiz de CNPJ). O
// arquivo vem por matriz, e quem separa as lojas dentro dele e o campo
// "Estabelecimento submissor" de cada registro.

export interface CieloConfigLoja {
  cod_empresa: number;
  cielo_estabelecimento_matriz: string | null;
  cielo_pvs: string[] | null;
}

export interface MapaPv {
  /** PV normalizado -> cod_empresa. E a via principal. */
  porPv: Record<string, number>;
  /** Matriz normalizada -> lojas sob ela. Só resolve quando há exatamente uma. */
  porMatriz: Record<string, number[]>;
  /** PVs cadastrados em mais de uma loja — erro de cadastro, não deve calar. */
  colisoes: string[];
}

/** Normaliza numero de estabelecimento para comparacao (zeros a esquerda). */
export function normalizaPv(pv: string | null | undefined): string {
  const v = String(pv ?? "").trim();
  return v.replace(/^0+/, "") || v;
}

export function montarMapaPv(configs: CieloConfigLoja[]): MapaPv {
  const porPv: Record<string, number> = {};
  const porMatriz: Record<string, number[]> = {};
  const colisoes: string[] = [];

  for (const c of configs) {
    for (const pv of c.cielo_pvs || []) {
      if (!pv) continue;
      const k = normalizaPv(pv);
      if (porPv[k] !== undefined && porPv[k] !== c.cod_empresa) {
        // Um PV so pode pertencer a uma loja. Se aparecer em duas
        // configuracoes e erro de cadastro, e silenciar isso significa
        // atribuir venda a loja errada sem deixar rastro.
        colisoes.push(`PV ${k}: empresas ${porPv[k]} e ${c.cod_empresa}`);
        continue;
      }
      porPv[k] = c.cod_empresa;
    }

    if (c.cielo_estabelecimento_matriz) {
      const k = normalizaPv(c.cielo_estabelecimento_matriz);
      (porMatriz[k] ||= []).push(c.cod_empresa);
    }
  }

  return { porPv, porMatriz, colisoes };
}

/**
 * Descobre a loja de um registro do extrato.
 *
 * O PV do proprio registro manda. A matriz so entra como fallback quando ela
 * cobre uma unica loja — com duas ou mais, adivinhar seria pior que devolver
 * nulo: nulo vira "estabelecimento sem loja associada" na tela de importacao,
 * que e um problema visivel e corrigivel.
 */
export function resolverEmpresa(
  estabelecimento: string,
  matrizArquivo: string,
  mapa: MapaPv,
): number | null {
  const direto = mapa.porPv[normalizaPv(estabelecimento)];
  if (direto) return direto;

  const lojas = mapa.porMatriz[normalizaPv(matrizArquivo)];
  return lojas && lojas.length === 1 ? lojas[0] : null;
}

/**
 * Matrizes distintas a consultar na API.
 *
 * Lojas que compartilham matriz geram UMA chamada, nao uma por loja: o arquivo
 * e o mesmo, e baixar duas vezes so duplicaria trabalho e gastaria link
 * temporario a toa.
 */
export function matrizesDistintas<T extends CieloConfigLoja>(configs: T[]): T[] {
  return [
    ...new Map(
      configs
        .filter((c) => c.cielo_estabelecimento_matriz)
        .map((c) => [normalizaPv(c.cielo_estabelecimento_matriz!), c]),
    ).values(),
  ];
}
