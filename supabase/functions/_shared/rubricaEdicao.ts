// Regras de edição e cancelamento de rubrica.
//
// Rubrica é autorização de pagamento: define quem recebe, quanto se espera e até
// onde o valor pode variar sem parar na Mesa. Editar sem regra transformaria a
// edição na porta dos fundos da aprovação — bastaria aprovar uma rubrica de
// R$ 100 e depois trocar o teto para R$ 100.000.
//
// A regra é: mexeu no que define o risco (favorecido, valor, faixa, teto,
// destino do dinheiro), a rubrica volta para rascunho e precisa ser aprovada de
// novo. Mexeu em descrição ou dia de vencimento, segue ativa.
//
// Módulo puro — testado por Vitest.

export type StatusRubrica = "RASCUNHO" | "ATIVA" | "SUSPENSA" | "CANCELADA";

export interface RubricaEditavel {
  id: string;
  status: string;
  favorecido_nome?: string | null;
  favorecido_documento?: string | null;
  favorecido_chave?: string | null;
  favorecido_banco?: string | null;
  favorecido_agencia?: string | null;
  favorecido_conta?: string | null;
  favorecido_tipo_conta?: string | null;
  forma_pagamento?: string | null;
  valor_esperado?: number | null;
  tolerancia_pct?: number | null;
  valor_teto?: number | null;
  dia_vencimento?: number | null;
  descricao?: string | null;
  conta_numero?: string | null;
  vigencia_fim?: string | null;
}

/** Campos que o operador pode alterar. Qualquer outro é ignorado. */
export const CAMPOS_EDITAVEIS = [
  "descricao", "conta_numero", "dia_vencimento", "periodicidade",
  "favorecido_nome", "favorecido_documento", "favorecido_chave",
  "favorecido_banco", "favorecido_agencia", "favorecido_conta", "favorecido_tipo_conta",
  "forma_pagamento", "valor_esperado", "tolerancia_pct", "valor_teto", "vigencia_fim",
] as const;

/**
 * Campos que mudam o risco do pagamento.
 *
 * Alterar qualquer um exige aprovação nova. `dia_vencimento` e `descricao`
 * ficam de fora de propósito: mudar a data em que a conta chega, ou o texto que
 * o operador lê, não altera para quem nem quanto vai.
 */
export const CAMPOS_SENSIVEIS = [
  "favorecido_nome", "favorecido_documento", "favorecido_chave",
  "favorecido_banco", "favorecido_agencia", "favorecido_conta", "favorecido_tipo_conta",
  "forma_pagamento", "valor_esperado", "tolerancia_pct", "valor_teto",
] as const;

export interface ResultadoValidacao {
  erros: string[];
  /** Campos que de fato mudaram (ignora reenvio do mesmo valor). */
  alterados: string[];
  /** Rubrica ATIVA que mexeu em campo sensível volta a RASCUNHO. */
  exigeReaprovacao: boolean;
}

const soDigitos = (v: unknown) => String(v ?? "").replace(/\D/g, "");

/** Zero à esquerda é preenchimento do banco, não conteúdo: "0050" = "50". */
const semZeroAEsquerda = (v: unknown) => soDigitos(v).replace(/^0+/, "");

/**
 * Comparação tolerante: "0050" e "50" são a mesma agência; null e "" o mesmo
 * vazio.
 *
 * Importa porque uma diferença falsa aqui derruba uma rubrica ATIVA para
 * rascunho — o operador reabre o cadastro, salva sem mexer em nada relevante, e
 * o pagamento do mês trava esperando aprovação que ninguém sabia ser
 * necessária.
 */
function mudou(campo: string, antes: unknown, depois: unknown): boolean {
  if (campo.startsWith("favorecido_") && campo !== "favorecido_nome" && campo !== "favorecido_chave") {
    return semZeroAEsquerda(antes) !== semZeroAEsquerda(depois);
  }
  if (typeof antes === "number" || typeof depois === "number") {
    const a = antes == null || antes === "" ? null : Number(antes);
    const b = depois == null || depois === "" ? null : Number(depois);
    return a !== b;
  }
  const a = antes == null ? "" : String(antes).trim();
  const b = depois == null ? "" : String(depois).trim();
  return a !== b;
}

export function validarEdicao(
  atual: RubricaEditavel,
  mudancas: Record<string, unknown>,
): ResultadoValidacao {
  const erros: string[] = [];

  if (String(atual.status).toUpperCase() === "CANCELADA") {
    erros.push("Rubrica cancelada não pode ser editada — crie uma nova");
    return { erros, alterados: [], exigeReaprovacao: false };
  }

  const antes = atual as unknown as Record<string, unknown>;
  const alterados = (CAMPOS_EDITAVEIS as readonly string[])
    .filter((c) => c in mudancas)
    .filter((c) => mudou(c, antes[c], mudancas[c]));

  if (alterados.length === 0) erros.push("Nada foi alterado");

  // Teto é o limite do dano quando tudo mais falha: sem ele a rubrica autoriza
  // qualquer valor.
  const teto = "valor_teto" in mudancas ? Number(mudancas.valor_teto) : Number(atual.valor_teto);
  if (!(teto > 0)) erros.push("Teto deve ser maior que zero");

  const esperado = "valor_esperado" in mudancas
    ? (mudancas.valor_esperado == null || mudancas.valor_esperado === "" ? null : Number(mudancas.valor_esperado))
    : (atual.valor_esperado ?? null);
  if (esperado != null && !(esperado > 0)) erros.push("Valor esperado deve ser maior que zero");
  if (esperado != null && teto > 0 && esperado > teto) {
    // Esperado acima do teto significa que o pagamento normal já nasce barrado.
    erros.push(`Valor esperado (${esperado.toFixed(2)}) não pode ser maior que o teto (${teto.toFixed(2)})`);
  }

  const tol = "tolerancia_pct" in mudancas ? Number(mudancas.tolerancia_pct) : Number(atual.tolerancia_pct ?? 0);
  if (!Number.isFinite(tol) || tol < 0 || tol > 100) erros.push("Tolerância deve estar entre 0 e 100%");

  if ("dia_vencimento" in mudancas && mudancas.dia_vencimento != null && mudancas.dia_vencimento !== "") {
    const dia = Number(mudancas.dia_vencimento);
    // 28 é o teto: dia 30 não existe em fevereiro e viraria vencimento inválido.
    if (!Number.isInteger(dia) || dia < 1 || dia > 28) erros.push("Dia de vencimento deve estar entre 1 e 28");
  }

  const doc = "favorecido_documento" in mudancas ? soDigitos(mudancas.favorecido_documento) : null;
  if (doc && doc.length !== 11 && doc.length !== 14) {
    erros.push("Documento do favorecido deve ser CPF (11) ou CNPJ (14 dígitos)");
  }

  if ("favorecido_nome" in mudancas && !String(mudancas.favorecido_nome ?? "").trim()) {
    erros.push("Favorecido não pode ficar sem nome");
  }

  const sensivelMudou = alterados.some((c) => (CAMPOS_SENSIVEIS as readonly string[]).includes(c));

  return {
    erros,
    alterados,
    exigeReaprovacao: sensivelMudou && String(atual.status).toUpperCase() === "ATIVA",
  };
}

export interface ResultadoCancelamento {
  erros: string[];
}

/**
 * Cancelar é terminal: a rubrica sai de circulação e não volta.
 *
 * Não apagamos — o histórico de pagamentos aponta para ela, e um DRE que perde
 * a referência do que autorizou a despesa deixa de ser auditável. Também não
 * cancelamos com lançamento em aberto pendurado: o título ficaria órfão de
 * lastro no meio do caminho, entre a criação e o borderô.
 */
export function validarCancelamento(
  atual: RubricaEditavel,
  lancamentosEmAberto: number,
  motivo: unknown,
): ResultadoCancelamento {
  const erros: string[] = [];

  if (String(atual.status).toUpperCase() === "CANCELADA") {
    erros.push("Rubrica já está cancelada");
  }
  if (String(motivo ?? "").trim().length < 10) {
    erros.push("Informe o motivo do cancelamento (mínimo 10 caracteres)");
  }
  if (lancamentosEmAberto > 0) {
    erros.push(
      `Há ${lancamentosEmAberto} lançamento(s) em aberto usando esta rubrica. ` +
      `Pague ou cancele esses títulos antes — suspender a rubrica impede novos usos sem deixá-los sem lastro.`,
    );
  }

  return { erros };
}
