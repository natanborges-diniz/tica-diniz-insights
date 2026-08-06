// Devolução / estorno no extrato — o dinheiro saiu e voltou.
//
// O caso que originou este módulo: um salário de R$ 499,53 (Pix, loja 9) saiu da
// conta, o BTG marcou o pagamento como FAILED e devolveu o valor no mesmo dia
// com o MESMO endToEndId ("Devolução do pix enviado para ..."). O extrato tinha
// as duas linhas; o motor de conciliação viu só o débito, casou por valor exato
// com o lançamento — que já estava marcado como recusado — e deu baixa. Para o
// operador o pagamento ficou "Baixado" enquanto o fornecedor/colaborador nunca
// recebeu.
//
// Aqui a devolução é tratada como o que é: o par débito+crédito se anula. O
// débito perde a conciliação, o lançamento volta a exigir correção e reenvio, e
// as duas linhas do extrato ficam marcadas como par de estorno — nenhuma delas
// deve procurar candidato por valor, porque não representam despesa nem receita.
//
// Módulo puro (sem Deno/Supabase), testado por Vitest.

/** Linha do extrato, no mínimo necessário para pareamento. */
export interface LinhaExtrato {
  id: string;
  data_lancamento: string;
  descricao: string | null;
  valor: number;
  tipo: "CREDITO" | "DEBITO";
  /** endToEndId, paymentId, txId… já extraídos do payload bruto. */
  referencias?: string[];
}

const semAcento = (s: unknown) =>
  String(s ?? "").normalize("NFD").replace(/\p{Diacritic}/gu, "").toUpperCase();

/**
 * A linha é uma devolução de pagamento nosso?
 *
 * Só crédito: devolução é dinheiro voltando. O texto do BTG observado em
 * produção é "Devolução do pix enviado para <nome>"; aceitamos também as
 * variações de estorno/ressarcimento que aparecem em TED e boleto.
 */
export function ehDevolucao(linha: Pick<LinhaExtrato, "descricao" | "tipo">): boolean {
  if (linha.tipo !== "CREDITO") return false;
  const t = semAcento(linha.descricao);
  return /\b(DEVOLUCAO|DEVOLVIDO|DEVOLVIDA|ESTORNO|ESTORNADO|RESSARCIMENTO|REVERSAO)\b/.test(t);
}

/** Nome do favorecido, quando o texto do BTG traz "... para <nome>". */
export function nomeDoTexto(descricao: string | null): string | null {
  const m = semAcento(descricao).match(/\bPARA\s+(.{3,})$/);
  return m ? m[1].replace(/\s+/g, " ").trim() : null;
}

function refsComuns(a?: string[] | null, b?: string[] | null): boolean {
  if (!a?.length || !b?.length) return false;
  const set = new Set(b);
  return a.some((r) => set.has(r));
}

function diasEntre(a: string, b: string): number {
  const t = (d: string) => {
    const [y, m, dia] = d.slice(0, 10).split("-").map(Number);
    return Date.UTC(y, m - 1, dia);
  };
  return Math.abs(Math.round((t(a) - t(b)) / 86400000));
}

export interface ParEstorno {
  debito_id: string;
  /** Por que confiamos no par — vai para a auditoria da linha. */
  motivo: "IDENTIDADE" | "VALOR_NOME" | "VALOR_DATA";
}

/**
 * Acha o débito que esta devolução anula.
 *
 * Identidade primeiro: mesmo endToEndId nas duas linhas é prova, não indício —
 * é assim que o Pix devolvido chega. Sem identificador comum, exigimos valor
 * idêntico e proximidade de data; o nome do favorecido, quando aparece nos dois
 * textos, dispensa a janela curta de dias.
 *
 * Ambiguidade não casa: dois débitos plausíveis viram decisão humana, porque
 * desfazer a baixa do pagamento errado é pior do que deixar a linha pendente.
 */
export function acharDebitoEstornado(
  devolucao: LinhaExtrato,
  debitos: LinhaExtrato[],
  opcoes: { janelaDias?: number } = {},
): ParEstorno | null {
  const janela = opcoes.janelaDias ?? 7;
  const valor = Number(devolucao.valor).toFixed(2);

  const porIdentidade = debitos.filter((d) => refsComuns(devolucao.referencias, d.referencias));
  if (porIdentidade.length === 1) return { debito_id: porIdentidade[0].id, motivo: "IDENTIDADE" };
  if (porIdentidade.length > 1) {
    // Mesmo E2E em mais de um débito não acontece no Pix; se acontecer,
    // desempata pelo valor.
    const exatos = porIdentidade.filter((d) => Number(d.valor).toFixed(2) === valor);
    if (exatos.length === 1) return { debito_id: exatos[0].id, motivo: "IDENTIDADE" };
    return null;
  }

  const mesmoValor = debitos.filter(
    (d) => Number(d.valor).toFixed(2) === valor &&
      diasEntre(d.data_lancamento, devolucao.data_lancamento) <= janela,
  );
  if (mesmoValor.length === 0) return null;
  if (mesmoValor.length === 1) return { debito_id: mesmoValor[0].id, motivo: "VALOR_DATA" };

  const nome = nomeDoTexto(devolucao.descricao);
  if (nome) {
    const porNome = mesmoValor.filter((d) => semAcento(d.descricao).includes(nome));
    if (porNome.length === 1) return { debito_id: porNome[0].id, motivo: "VALOR_NOME" };
  }
  return null;
}

/**
 * O banco deu resposta final de falha para este pagamento?
 *
 * Usado para tirar o lançamento do pool de candidatos: um pagamento recusado não
 * pode ser baixado por coincidência de valor com uma linha do extrato — foi
 * exatamente assim que o salário devolvido apareceu como "Baixado".
 */
const FALHA_FINAL = [
  "FAILED", "REJECTED", "REFUSED", "CANCELLED", "CANCELED", "ERROR",
  "RETURNED", "REVERTED", "INVALIDATED", "EXPIRED", "NOT_AUTHORIZED",
];

export function falhaFinalDoBanco(dadosExtras: Record<string, unknown> | null | undefined): boolean {
  const st = String(dadosExtras?.btg_payment_status ?? "").toUpperCase();
  if (!st) return false;
  return FALHA_FINAL.some((w) => st.includes(w));
}
