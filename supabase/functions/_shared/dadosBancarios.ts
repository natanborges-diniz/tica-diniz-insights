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
