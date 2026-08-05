// Cruzamento da planilha de dados bancários com os colaboradores da folha.
//
// O relatório da contabilidade traz nome, CPF e líquido — nunca banco, agência
// e conta. Esses dados existem, mas noutra planilha, mantida por outra pessoa, e
// digitá-los de novo a cada competência é convite a errar um dígito e o salário
// não chegar.
//
// O casamento é por CPF: é o único campo que não muda de grafia. Nome entra só
// como rede de segurança, e mesmo assim normalizado — "JOSE" e "José" são a
// mesma pessoa, "J. SILVA" e "JOAO SILVA" não são, e na dúvida não casamos.
//
// Módulo puro, testado por Vitest.

export interface LinhaBancaria {
  nome?: string | null;
  cpf?: string | null;
  banco?: string | null;
  agencia?: string | null;
  conta?: string | null;
  tipo_conta?: string | null;
  chave_pix?: string | null;
}

export interface ColaboradorAlvo {
  id: string;
  nome: string;
  cpf: string;
}

export type MotivoCasamento = "CPF" | "NOME";

export interface Casamento {
  alvo: ColaboradorAlvo;
  dados: LinhaBancaria;
  por: MotivoCasamento;
}

export type MotivoRecusa = "SEM_DADOS_DE_PAGAMENTO" | "NAO_ESTA_NA_FOLHA";

export interface ResultadoCruzamento {
  casados: Casamento[];
  /** Linha da planilha que não corresponde a ninguém na folha (com o motivo). */
  sem_correspondente: Array<LinhaBancaria & { motivo: MotivoRecusa }>;
  /** Colaborador da folha que a planilha não cobriu. */
  nao_cobertos: ColaboradorAlvo[];
  /** Nome que bate com mais de uma pessoa — nunca casa sozinho. */
  ambiguos: Array<{ nome: string; quantidade: number }>;
}


export function soDigitos(v: unknown): string {
  return String(v ?? "").replace(/\D/g, "");
}

// ─── Leitura do cabeçalho da planilha ────────────────────────
//
// Cada loja monta a planilha do seu jeito: "Chave PIX", "chave_pix", "PIX",
// "Conta c/ dígito", "Nº da conta". Exigir nome exato faria a importação
// devolver "0 conta(s) preenchida(s)" sem dizer por quê — e o operador não tem
// como adivinhar qual grafia o sistema espera.

/** "Conta c/ Dígito" → "contacdigito". Acento, espaço e pontuação somem. */
export function normalizarCabecalho(v: unknown): string {
  return String(v ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Nomes aceitos por campo, em ordem de prioridade.
 *
 * A ordem importa: "contacomdigito" tem de ser testado antes de "conta", senão
 * uma planilha com as duas colunas pegaria a errada.
 */
const ALIASES: Record<keyof LinhaBancaria, string[]> = {
  nome: ["nome", "colaborador", "funcionario", "nomedocolaborador", "nomecompleto"],
  cpf: ["cpf", "documento", "cpfdocolaborador"],
  banco: ["banco", "codigobanco", "codigodobanco", "codbanco", "numerobanco"],
  agencia: ["agencia", "numeroagencia", "agenciasemdigito"],
  conta: ["contacomdigito", "contacdigito", "conta", "numeroconta", "numerodaconta", "contacorrente"],
  tipo_conta: ["tipoconta", "tipodeconta", "tipo"],
  chave_pix: ["chavepix", "pix", "chave", "pixkey", "chavepixcpf", "chavedopix"],
};

/**
 * Uma linha da planilha, com as colunas reconhecidas por nome.
 *
 * Depois dos nomes exatos, cai para "começa com" — assim "Chave PIX do
 * colaborador" e "Nº da Conta (com dígito)" entram sem cadastro prévio. O
 * prefixo só vale para o que sobrou: campo já resolvido não é reescrito.
 */
/**
 * Tira o ruído da frente do cabeçalho: "Nº da Conta" → "conta".
 *
 * Sem isto, "Nº da Conta (com dígito)" vira "ndacontacomdigito" e não bate com
 * alias nenhum — nem por prefixo, porque começa em "n". Preferimos limpar a
 * frente a sair procurando o alias em qualquer posição: "Chave do contrato" não
 * pode virar chave Pix, e uma busca por conteúdo faria isso.
 */
function nucleo(cabecalho: string): string {
  return cabecalho.replace(/^(numero|num|nro|nr|no|n)?(da|de|do)?/, "");
}

export function mapearLinhaBancaria(linha: Record<string, unknown>): LinhaBancaria {
  const colunas = Object.entries(linha).map(([k, v]) => {
    const chave = normalizarCabecalho(k);
    return { chave, nucleo: nucleo(chave), valor: v };
  });
  const out: LinhaBancaria = {};

  const preencher = (
    campo: keyof LinhaBancaria,
    casa: (c: { chave: string; nucleo: string }, nome: string) => boolean,
    nomes: string[],
  ) => {
    for (const nome of nomes) {
      const achado = colunas.find((c) => casa(c, nome));
      if (achado && achado.valor != null && String(achado.valor).trim() !== "") {
        out[campo] = String(achado.valor).trim();
        return true;
      }
    }
    return false;
  };

  for (const [campo, nomes] of Object.entries(ALIASES) as Array<[keyof LinhaBancaria, string[]]>) {
    // Nome exato primeiro; depois sem o ruído da frente; por último, prefixo.
    preencher(campo, (c, n) => c.chave === n, nomes) ||
      preencher(campo, (c, n) => c.nucleo === n, nomes) ||
      preencher(campo, (c, n) => c.chave.startsWith(n) || c.nucleo.startsWith(n), nomes);
  }

  return out;
}

/**
 * Nome comparável: sem acento, sem pontuação, sem espaço duplo, em caixa alta.
 *
 * Não removemos partículas ("DE", "DA", "DOS"): elas distinguem pessoas de
 * verdade em cadastro brasileiro, e tirá-las aumentaria a chance de casar duas
 * pessoas diferentes — o erro caro aqui.
 */
export function normalizarNome(v: unknown): string {
  return String(v ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

/**
 * Serve para pagar: banco + agência + conta juntos, OU chave Pix.
 *
 * A planilha de algumas lojas só traz o Pix — recusá-la deixava o operador com
 * "0 conta(s) preenchida(s)" e nenhuma pista do motivo. O pagamento por chave
 * já existe no caminho manual (PIX_MANUAL), então aceitar aqui é coerente.
 */
export function temDadosDePagamento(l: LinhaBancaria): boolean {
  const contaCompleta = !!(soDigitos(l.banco) && soDigitos(l.agencia) && soDigitos(l.conta));
  return contaCompleta || !!String(l.chave_pix ?? "").trim();
}

/** CC/PP/PG a partir do que o RH escreve na planilha. */
export function normalizarTipoConta(v: unknown): string {
  const s = String(v ?? "").trim().toUpperCase();
  if (!s) return "CC";
  if (/POUP/.test(s) || s === "PP") return "PP";
  if (/PAGAMENTO|SALARIO|SALÁRIO/.test(s) || s === "PG") return "PG";
  return "CC";
}

export function cruzarDadosBancarios(
  linhas: LinhaBancaria[],
  alvos: ColaboradorAlvo[],
): ResultadoCruzamento {
  const porCpf = new Map<string, ColaboradorAlvo>();
  const porNome = new Map<string, ColaboradorAlvo[]>();
  for (const a of alvos) {
    const cpf = soDigitos(a.cpf);
    if (cpf) porCpf.set(cpf, a);
    const nome = normalizarNome(a.nome);
    if (nome) porNome.set(nome, [...(porNome.get(nome) ?? []), a]);
  }

  const casados: Casamento[] = [];
  const semCorrespondente: ResultadoCruzamento["sem_correspondente"] = [];
  const ambiguos: Array<{ nome: string; quantidade: number }> = [];
  const usados = new Set<string>();

  for (const l of linhas) {
    if (!temDadosDePagamento(l)) {
      semCorrespondente.push({ ...l, motivo: "SEM_DADOS_DE_PAGAMENTO" });
      continue;
    }

    const cpf = soDigitos(l.cpf);
    let alvo = cpf ? porCpf.get(cpf) : undefined;
    let por: MotivoCasamento = "CPF";

    if (!alvo) {
      const nome = normalizarNome(l.nome);
      const candidatos = nome ? porNome.get(nome) ?? [] : [];
      if (candidatos.length > 1) {
        // Dois homônimos na mesma folha: escolher um seria apostar o salário
        // de alguém numa moeda.
        ambiguos.push({ nome, quantidade: candidatos.length });
        continue;
      }
      if (candidatos.length === 1) {
        alvo = candidatos[0];
        por = "NOME";
      }
    }

    if (!alvo) { semCorrespondente.push({ ...l, motivo: "NAO_ESTA_NA_FOLHA" }); continue; }
    if (usados.has(alvo.id)) continue; // primeira linha vence; duplicata é ruído

    const banco = soDigitos(l.banco);
    usados.add(alvo.id);
    casados.push({
      alvo,
      por,
      dados: {
        ...l,
        banco: banco ? banco.padStart(3, "0") : null,
        agencia: soDigitos(l.agencia) || null,
        conta: soDigitos(l.conta) || null,
        tipo_conta: normalizarTipoConta(l.tipo_conta),
        chave_pix: l.chave_pix ? String(l.chave_pix).trim() : null,
      },
    });
  }

  return {
    casados,
    sem_correspondente: semCorrespondente,
    nao_cobertos: alvos.filter((a) => !usados.has(a.id)),
    ambiguos,
  };

}
