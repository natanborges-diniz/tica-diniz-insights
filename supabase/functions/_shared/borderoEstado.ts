// Estado de um borderô do ponto de vista de quem olha a lista.
//
// A coluna mostrava o status gravado na tabela, e "ENVIADO" cobria situações
// muito diferentes: nove itens já pagos e dois rejeitados; tudo agendado para a
// semana que vem; nada tendo saído ainda. O operador só descobria abrindo, um
// por um, inclusive os que não precisavam de nada.
//
// O estado real não está no borderô — está na composição dos itens. Só a
// contagem responde "isto exige alguma coisa de mim?".
//
// Módulo puro: usado pela tela (lista e detalhe) e testado por Vitest.

export interface ItemBordero {
  status: string;
  /** Marcado quando o BTG recusou o pagamento e o título voltou para revisão. */
  requer_validacao?: boolean | null;
  /** Data combinada com o banco (dados_extras.btg_payment_date) ou o vencimento. */
  data_prevista?: string | null;
  /** Por que o banco recusou, já traduzido (dados_extras.btg_motivo_recusa). */
  motivo_recusa?: string | null;
  /**
   * Último status do pagamento no BTG (dados_extras.btg_payment_status).
   *
   * Existe porque `requer_validacao` só é gravado quando o retorno da recusa é
   * processado por inteiro. Havia item com FAILED no banco que continuava
   * PROCESSANDO aqui — e o painel o contava como "aguardando autorização",
   * mandando o operador cobrar uma autorização que o banco nunca vai pedir. O
   * que o banco disse manda: falhou é falhou.
   */
  btg_status?: string | null;
  /**
   * Valor do título, para somar o que o banco não pagou.
   *
   * Existe porque "1 pagamento devolvido" não diz quanto voltou — e quem cobra
   * o fornecedor precisa do valor, não da contagem.
   */
  valor?: number | null;
  /**
   * O envio foi recusado na validação: o pagamento NÃO entrou no banco.
   *
   * Existe porque "o banco não processou o pagamento" fazia entender que o
   * pagamento chegou ao BTG, foi autorizado pelo master e falhou depois. Não é
   * o caso: aqui o BTG recusou a inclusão no lote (ex.: 400 tipo de chave Pix
   * não suportado). Nada foi criado no banco, nada foi autorizado, nada foi
   * debitado — a correção é no cadastro do título, e só depois reenviar.
   */
  envio_rejeitado?: boolean | null;
  /** O que o banco respondeu ao recusar o envio (dados_extras.btg_motivo_envio). */
  motivo_envio?: string | null;
}

/**
 * Status do BTG que significam "o dinheiro não saiu e não vai sair sozinho".
 *
 * Separar isto de "em trânsito" é o ponto: pagamento não processado precisa de
 * correção e novo borderô; pagamento em trânsito precisa apenas da autorização
 * do master. Tratar os dois igual foi o que gerou pendência falsa.
 */
const FALHA_BTG = new Set([
  "FAILED", "FAILURE", "REJECTED", "REFUSED", "DENIED", "ERROR",
  "CANCELLED", "CANCELED", "INVALIDATED", "INVALID", "EXPIRED",
  "REVERSED", "RETURNED", "NOT_AUTHORIZED", "UNAUTHORIZED",
]);

export function falhouNoBanco(status?: string | null): boolean {
  const v = String(status ?? "").trim().toUpperCase().replace(/[\s-]+/g, "_");
  return v.length > 0 && FALHA_BTG.has(v);
}

export interface ComposicaoBordero {
  total: number;
  pagos: number;
  rejeitados: number;
  pendentes: number;
  /**
   * Recusas detectadas pelo status do banco, sem retorno tratado aqui dentro.
   *
   * É a fatia dos rejeitados que estava invisível: o banco não processou e o
   * sistema ainda mostrava o título como em trânsito.
   */
  nao_processados?: number;
  /**
   * Itens que o banco nem recebeu: recusa na validação do envio.
   *
   * Fatia distinta dos rejeitados. Sem ela a tela dizia "o banco não processou",
   * e o operador entendia que o lote existia no BTG e faltava autorização.
   */
  nao_enviados?: number;
  /** Soma dos títulos que o banco não pagou — o valor que o credor não recebeu. */
  valor_rejeitado?: number;
  /** Menor data prevista entre os itens ainda pendentes (yyyy-MM-dd). */
  proxima_data: string | null;
  /**
   * Motivos distintos das recusas, na ordem em que aparecem.
   *
   * Sem isto o borderô dizia "2 recusados" e o operador tinha de abrir o app do
   * BTG para descobrir o quê — que era justamente a informação que o banco já
   * havia mandado.
   */
  motivos_recusa?: string[];
}


export type ChaveEstado =
  | "MONTAGEM" | "APROVADO" | "CANCELADO"
  | "PROCESSADO" | "PARCIAL" | "REJEITADO" | "NAO_ENVIADO"
  | "AGENDADO" | "PROCESSANDO" | "ENVIADO";

export interface EstadoBordero {
  chave: ChaveEstado;
  label: string;
  variant: "default" | "secondary" | "destructive" | "outline";
  /** Frase completa para tooltip — a contagem por extenso. */
  titulo: string;
  /** true quando alguém precisa fazer alguma coisa. */
  exigeAtencao: boolean;
}

export function resumirComposicao(itens: ItemBordero[]): ComposicaoBordero {
  let pagos = 0, rejeitados = 0, pendentes = 0, naoProcessados = 0, naoEnviados = 0;
  let valorRejeitado = 0;
  let proxima: string | null = null;
  const motivos: string[] = [];

  for (const i of itens) {
    const st = String(i.status ?? "").toUpperCase();
    if (st === "BAIXADO") { pagos++; continue; }
    if (st === "CANCELADO") continue; // saiu do borderô, não conta como nada

    // Recusa do banco devolve o título para AUTORIZADO com requer_validacao —
    // mas o status do próprio BTG também basta. Quando o banco diz FAILED e o
    // título ficou PROCESSANDO, o pagamento não aconteceu: contar como pendente
    // virava "aguardando autorização", pedindo ao operador uma ação que não
    // existe no app do banco.
    const falhou = falhouNoBanco(i.btg_status);
    const naoEntrou = Boolean(i.envio_rejeitado);
    if (i.requer_validacao || falhou || naoEntrou) {
      rejeitados++;
      valorRejeitado += Number(i.valor ?? 0);
      // O envio recusado manda na classificação: o pagamento nunca existiu no
      // banco, então não é "não processado" nem "recusado depois de autorizado".
      if (naoEntrou) naoEnviados++;
      else if (falhou && !i.requer_validacao) naoProcessados++;
      const mEnvio = String(i.motivo_envio ?? "").trim();
      const m = String(i.motivo_recusa ?? "").trim();
      const texto = naoEntrou
        ? `O banco não recebeu este pagamento — recusa na validação do envio${mEnvio ? `: ${mEnvio}` : ""}`
        : m || (falhou
          ? `O pagamento chegou ao banco e não foi processado (${String(i.btg_status).toUpperCase()})`
          : "");
      if (texto && !motivos.includes(texto)) motivos.push(texto);
      continue;
    }

    pendentes++;
    const d = i.data_prevista ? String(i.data_prevista).slice(0, 10) : null;
    if (d && (proxima === null || d < proxima)) proxima = d;
  }

  return {
    total: pagos + rejeitados + pendentes,
    pagos, rejeitados, pendentes,
    nao_processados: naoProcessados,
    nao_enviados: naoEnviados,
    valor_rejeitado: Math.round(valorRejeitado * 100) / 100,
    proxima_data: proxima,
    motivos_recusa: motivos,
  };
}


/** dd/MM a partir de yyyy-MM-dd, sem passar por Date (fuso trocaria o dia). */
function ddMM(iso: string): string {
  const [, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}`;
}

/** Os motivos do banco no tooltip — é onde o operador olha primeiro. */
function motivosSufixo(c: ComposicaoBordero): string {
  const m = (c.motivos_recusa ?? []).filter(Boolean);
  if (m.length === 0) return "";
  return `\nMotivo do banco: ${m.join(" · ")}`;
}

/**
 * O rótulo do badge.
 *
 * `hoje` entra como parâmetro para o teste não depender do relógio, e a
 * comparação é entre strings yyyy-MM-dd — `new Date("yyyy-MM-dd")` é UTC e
 * marcaria como atrasado o pagamento que sai hoje.
 */
export function estadoBordero(
  statusGravado: string,
  composicao: ComposicaoBordero | null | undefined,
  hoje: string,
): EstadoBordero {
  const st = String(statusGravado ?? "").toUpperCase();

  if (st === "MONTAGEM") {
    return { chave: "MONTAGEM", label: "Em montagem", variant: "secondary", titulo: "Ainda sendo montado — não foi ao banco", exigeAtencao: false };
  }
  if (st === "APROVADO") {
    return { chave: "APROVADO", label: "Aprovado", variant: "default", titulo: "Aprovado, aguardando envio ao banco", exigeAtencao: true };
  }
  if (st === "CANCELADO") {
    return { chave: "CANCELADO", label: "Cancelado", variant: "destructive", titulo: "Borderô cancelado — os títulos voltaram para Em Preparo", exigeAtencao: false };
  }

  const c = composicao;
  if (!c || c.total === 0) {
    return { chave: "ENVIADO", label: "Enviado ao BTG", variant: "outline", titulo: "Enviado ao banco — sem itens para contar", exigeAtencao: false };
  }

  if (c.pagos === c.total) {
    return {
      chave: "PROCESSADO",
      label: "Processado",
      variant: "default",
      titulo: `Todos os ${c.total} pagamentos foram processados`,
      exigeAtencao: false,
    };
  }

  // Nada mais em trânsito: o borderô fechou, com ou sem recusa.
  if (c.pendentes === 0) {
    if (c.pagos === 0) {
      return {
        chave: "REJEITADO",
        label: "Rejeitado",
        variant: "destructive",
        titulo: `Nenhum dos ${c.total} pagamentos foi aceito pelo banco`
          + motivosSufixo(c),
        exigeAtencao: true,
      };
    }
    return {
      chave: "PARCIAL",
      label: `Parcial ${c.pagos}/${c.total}`,
      variant: "destructive",
      titulo: `${c.pagos} pago(s), ${c.rejeitados} recusado(s) pelo banco — abra para ver quais`
        + motivosSufixo(c),
      exigeAtencao: true,
    };
  }

  // Ainda há itens em trânsito. Se todos são de data futura, não é demora: é
  // agendamento. Chamar isso de "em processamento" fazia o operador procurar
  // problema onde não havia.
  const soFuturo = c.proxima_data != null && c.proxima_data > hoje;
  if (soFuturo) {
    return {
      chave: "AGENDADO",
      label: `Agendado ${ddMM(c.proxima_data!)}`,
      variant: "outline",
      titulo: `${c.pendentes} pagamento(s) programado(s) a partir de ${ddMM(c.proxima_data!)}`
        + (c.pagos > 0 ? ` · ${c.pagos} já pago(s)` : "")
        + (c.rejeitados > 0 ? ` · ${c.rejeitados} recusado(s)` : ""),
      exigeAtencao: c.rejeitados > 0,
    };
  }

  return {
    chave: "PROCESSANDO",
    label: `Em processamento ${c.pagos}/${c.total}`,
    variant: "outline",
    titulo: `${c.pagos} de ${c.total} processado(s), ${c.pendentes} aguardando retorno do banco`
      + (c.rejeitados > 0 ? ` · ${c.rejeitados} recusado(s)` : ""),
    exigeAtencao: c.rejeitados > 0,
  };
}
