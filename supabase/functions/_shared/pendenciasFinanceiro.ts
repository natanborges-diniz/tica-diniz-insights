// O que está parado e precisa de alguém — de todas as lojas, num lugar só.
//
// O caso que originou isto: um fornecedor cobrou porque não tinha recebido. O
// sistema sabia — o borderô estava enviado e o item nunca voltou processado —
// mas essa informação só aparecia dentro do borderô, numa loja específica, para
// quem fosse olhar. Dez lojas, ninguém olha uma por uma todo dia.
//
// A pergunta que este módulo responde é "o que exige ação agora?". Borderô
// agendado para semana que vem não exige nada e não entra. Borderô enviado cuja
// data já passou e não voltou pago exige — provavelmente está esperando o master
// autorizar no aplicativo do BTG, que é uma etapa fora deste sistema.
//
// Módulo puro, testado por Vitest.

import type { ComposicaoBordero } from "./borderoEstado.ts";

export type TipoPendencia =
  /** Enviado ao banco e sem autorização do master no app do BTG. */
  | "AGUARDANDO_BANCO"
  /** Liberado internamente e ninguém clicou em enviar. */
  | "AGUARDANDO_ENVIO"
  /** Tem item fora da faixa esperando decisão na Mesa. */
  | "MESA_PENDENTE"
  /** Montagem começada e não finalizada, sem pendência de Mesa. */
  | "MONTAGEM_PARADA"
  /** O banco recusou itens — o fornecedor não recebeu. */
  | "RECUSADO"
  /**
   * O banco não processou o pagamento (FAILED e afins), sem recusa tratada.
   *
   * Distinto de AGUARDANDO_BANCO: aqui não existe autorização pendente no app
   * do BTG, e cobrar o master só faz o operador procurar um botão que não há.
   */
  | "NAO_PROCESSADO"
  /** Os títulos foram pagos por fora e o borderô ficou aberto. */
  | "PAGO_FORA"
  /**
   * Recusado pelo banco, já devolvido ao preparo e sem borderô novo.
   *
   * Nasceu de um caso real: um salário recusado foi corrigido e voltou para o
   * preparo, o borderô novo foi cancelado por engano e o título ficou solto —
   * sem borderô, ele deixava de existir para qualquer alerta. Continua sendo
   * dinheiro que o fornecedor/colaborador não recebeu, e agora aparece aqui
   * até entrar num borderô de novo.
   */
  | "REABERTO_SEM_BORDERO";


export type Severidade = "ALTA" | "MEDIA" | "BAIXA";

/**
 * Quem resolve.
 *
 * "Master" aqui é o do BTG — a pessoa que autoriza o lote no aplicativo do
 * banco. Não é papel deste sistema, e confundir os dois faz o operador ficar
 * procurando um botão que não existe.
 */
export type Responsavel = "OPERADOR" | "ADMIN" | "MASTER_BTG";

/** Onde a operação acontece. */
export type Local = "SISTEMA" | "BANCO";

/**
 * Ação executável a partir do painel. Ausente quando a saída é fora daqui.
 *
 * `ATUALIZAR_RETORNO` aparece mesmo quando o local é BANCO: antes de cobrar o
 * master, vale perguntar ao BTG se ele já autorizou — a resposta pode estar
 * pronta e ninguém ter olhado.
 */
export type AcaoSistema =
  | "REFAZER_BORDERO"
  | "ENCERRAR_BORDERO"
  | "AJUSTAR_DATA"
  | "ENVIAR_BORDERO"
  | "APROVAR_BORDERO"
  | "DEVOLVER_PREPARO"
  | "ATUALIZAR_RETORNO"
  | "ABRIR_BORDERO"
  /** Levar ao Contas a Pagar (Em preparo), onde o título solto é editável. */
  | "ABRIR_PREPARO";

export interface BorderoParaPainel {
  id: string;
  /**
   * Itens que não passam no lastro e travam o envio (selo fora de verde/azul).
   *
   * É o que separa "borderô começado e esquecido" de "borderô pronto, mas com
   * exceção esperando alguém decidir" — duas situações com donos diferentes.
   */
  bloqueios_mesa?: number;
  cod_empresa: number;
  descricao: string | null;
  status: string;
  tipo?: string | null;
  data_pagamento: string | null;
  total_valor: number;
  composicao?: ComposicaoBordero | null;
}

export interface Pendencia {
  /** Null quando a pendência é de um título solto, fora de qualquer borderô. */
  bordero_id: string | null;
  /** Preenchido no lugar de `bordero_id` para título solto. */
  lancamento_id?: string;
  cod_empresa: number;
  descricao: string;
  tipo: TipoPendencia;
  severidade: Severidade;
  /** Dias desde a data em que o dinheiro deveria ter saído. */
  dias_parado: number;
  /** Valor que ainda não saiu (não o total do borderô). */
  valor_pendente: number;
  qtd_pendente: number;
  mensagem: string;
  acao: string;
  /** Quem tem de agir — evita a pendência circular entre as pessoas. */
  responsavel: Responsavel;
  /** SISTEMA resolve por aqui; BANCO exige o app do BTG. */
  local: Local;
  /** O que o botão do painel dispara, quando há o que disparar. */
  acao_sistema?: AcaoSistema;
  /** Rótulo do botão. */
  acao_rotulo?: string;
  /**
   * Segunda saída, quando a primeira não resolve.
   *
   * Existe por um caso concreto: lote enviado que o master não autorizou e cuja
   * data venceu. Consultar o banco é o primeiro passo, mas se o lote morreu lá,
   * é preciso refazer — e sem esse segundo botão o operador chegava ao borderô
   * e não encontrava nada para clicar.
   */
  acao_secundaria?: AcaoSistema;
  acao_secundaria_rotulo?: string;
  /**
   * Motivos da recusa, já em português, como o banco explicou.
   *
   * Existe porque "2 pagamentos recusados" não diz o que corrigir — e o BTG
   * manda o motivo no retorno (`errors[].code`) desde sempre.
   */
  motivos?: string[];
}

/** Diferença em dias entre duas datas yyyy-MM-dd, sem passar por fuso. */
export function diasEntre(de: string, ate: string): number {
  const emUtc = (d: string) => {
    const [a, m, dia] = d.slice(0, 10).split("-").map(Number);
    return Date.UTC(a, m - 1, dia);
  };
  return Math.round((emUtc(ate) - emUtc(de)) / 86400000);
}

/**
 * Severidade pelo tempo parado.
 *
 * Um dia é o banco processando; três dias já é alguém esquecendo de autorizar;
 * uma semana é o fornecedor ligando — que foi exatamente como descobrimos.
 */
export function severidadePorDias(dias: number): Severidade {
  if (dias >= 5) return "ALTA";
  if (dias >= 2) return "MEDIA";
  return "BAIXA";
}

const rotulo = (b: BorderoParaPainel) =>
  b.descricao || `Borderô ${b.id.slice(0, 8).toUpperCase()}`;

/**
 * Classifica um borderô. Devolve null quando não há nada a fazer — processado,
 * cancelado, ou agendado para uma data que ainda não chegou.
 */
export function pendenciaDoBordero(b: BorderoParaPainel, hoje: string): Pendencia | null {
  const st = String(b.status ?? "").toUpperCase();
  if (["PROCESSADO", "CANCELADO"].includes(st)) return null;

  const c = b.composicao;
  const base = {
    bordero_id: b.id,
    cod_empresa: b.cod_empresa,
    descricao: rotulo(b),
  };

  // Recusa do banco vem primeiro: é o único caso em que o dinheiro definitivamente
  // não saiu e ninguém vai tentar de novo sozinho.
  //
  // "Não processado" e "não autorizado" viraram coisas distintas aqui de
  // propósito: o borderô de Carapicuíba tinha um boleto que o BTG marcou como
  // FAILED e aparecia como "sem autorização no BTG" — o operador entrava no app
  // do banco e não achava nada para autorizar. Se o banco recusou ou não
  // processou, a saída é corrigir e refazer, não cobrar o master.
  if (c && c.rejeitados > 0) {
    const motivos = (c.motivos_recusa ?? []).filter(Boolean);
    const dias = b.data_pagamento ? Math.max(0, diasEntre(b.data_pagamento, hoje)) : 0;
    const naoProcessados = c.nao_processados ?? 0;
    const soNaoProcessado = naoProcessados > 0 && naoProcessados === c.rejeitados;
    return {
      ...base,
      tipo: soNaoProcessado ? "NAO_PROCESSADO" : "RECUSADO",
      severidade: "ALTA",
      dias_parado: dias,
      valor_pendente: 0, // o valor recusado está no detalhe do borderô
      qtd_pendente: c.rejeitados,
      mensagem: soNaoProcessado
        ? `${naoProcessados} pagamento(s) que o banco não processou — não há nada para autorizar${c.pagos > 0 ? ` · ${c.pagos} pago(s)` : ""}`
        : `${c.rejeitados} pagamento(s) recusado(s) pelo banco${c.pagos > 0 ? ` · ${c.pagos} pago(s)` : ""}`,
      // O motivo do banco vem no lugar do "veja no app do BTG": o retorno traz o
      // código (ex.: payment-amount-changed), então mandar o operador procurar
      // fora do sistema era descartar o que já sabíamos.
      motivos: motivos.length > 0 ? motivos : undefined,
      acao: motivos.length > 0
        ? `Motivo do banco: ${motivos.join(" · ")}. Devolva ao preparo, corrija e monte um novo borderô`
        : "Veja no app do BTG o motivo (horário-limite ou saldo), devolva ao preparo, "
          + "corrija o que for preciso e monte um novo borderô — depois avise o master para autorizar",
      responsavel: "OPERADOR",
      local: "SISTEMA",
      acao_sistema: "DEVOLVER_PREPARO",
      acao_rotulo: "Devolver ao preparo",
    };
  }


  // Nada a pagar num borderô que ainda não foi ao banco significa que o
  // pagamento aconteceu por fora — débito automático, ou alguém pagou no app do
  // banco — e o sync do ERP baixou os títulos.
  //
  // Precisa vir antes de tudo que sugira envio: o botão "Enviar ao BTG" nesse
  // estado pagaria os mesmos boletos uma segunda vez.
  if (c && c.pendentes === 0 && c.pagos > 0 && ["MONTAGEM", "APROVADO"].includes(st)) {
    return {
      ...base,
      tipo: "PAGO_FORA",
      severidade: "MEDIA",
      dias_parado: b.data_pagamento ? Math.max(0, diasEntre(b.data_pagamento, hoje)) : 0,
      valor_pendente: 0,
      qtd_pendente: 0,
      mensagem: `Os ${c.pagos} título(s) já constam pagos — o borderô nunca foi ao banco`,
      acao: "Confira se o pagamento saiu por fora (débito automático ou pago no app) e encerre o borderô. "
        + "NÃO envie ao BTG: os mesmos boletos seriam pagos de novo",
      responsavel: "OPERADOR",
      local: "SISTEMA",
      acao_sistema: "ENCERRAR_BORDERO",
      acao_rotulo: "Encerrar borderô",
    };
  }

  if (st === "ENVIADO") {
    if (!c || c.pendentes === 0) return null;

    // Data futura é agendamento, não demora.
    const previsto = c.proxima_data ?? b.data_pagamento;
    if (previsto && previsto > hoje) return null;

    const dias = previsto ? Math.max(0, diasEntre(previsto, hoje)) : 0;
    return {
      ...base,
      tipo: "AGUARDANDO_BANCO",
      severidade: severidadePorDias(dias),
      dias_parado: dias,
      valor_pendente: Number(b.total_valor),
      qtd_pendente: c.pendentes,
      mensagem: dias === 0
        ? `${c.pendentes} pagamento(s) enviados hoje, ainda sem retorno do banco`
        : `${c.pendentes} pagamento(s) sem retorno há ${dias} dia(s)`,
      acao: "Confira no app do BTG se o lote está aguardando autorização e lembre o master",
      // O operador é quem age: entra no banco, confirma que o lote está parado
      // esperando autorização e cobra o master. Marcar o master como responsável
      // deixava a pendência sem dono dentro da equipe — ele nem abre este painel.
      responsavel: "OPERADOR",
      local: "BANCO",
      // Antes de cobrar o master, perguntar ao banco: a autorização pode já ter
      // acontecido e o sistema ainda não ter buscado o retorno.
      acao_sistema: "ATUALIZAR_RETORNO",
      acao_rotulo: "Consultar o banco agora",
      ...(dias > 0
        ? {
          acao_secundaria: "REFAZER_BORDERO" as const,
          acao_secundaria_rotulo: "Não foi autorizado? Refazer com nova data",
        }
        : {}),
    };
  }

  if (st === "APROVADO") {
    const dias = b.data_pagamento ? Math.max(0, diasEntre(b.data_pagamento, hoje)) : 0;
    // Data combinada já passou: o envio agenda para hoje, porque o banco recusa
    // data no passado. Dizer isso evita a surpresa de ver o pagamento sair num
    // dia diferente do que está escrito no borderô.
    const dataVencida = !!b.data_pagamento && b.data_pagamento < hoje;
    if (dataVencida) {
      return {
        ...base,
        tipo: "AGUARDANDO_ENVIO",
        severidade: severidadePorDias(dias),
        dias_parado: dias,
        valor_pendente: Number(b.total_valor),
        qtd_pendente: c?.total ?? 0,
        mensagem: `Liberado internamente, não enviado, e a data de pagamento venceu há ${dias} dia(s)`,
        acao: "Ajuste a data para hoje ou para o próximo dia útil antes de enviar — "
          + "o banco recusa data no passado, e o envio sem ajuste agenda tudo para hoje",
        responsavel: "OPERADOR",
        local: "SISTEMA",
        acao_sistema: "AJUSTAR_DATA",
        acao_rotulo: "Ajustar data e enviar",
      };
    }
    return {
      ...base,
      tipo: "AGUARDANDO_ENVIO",
      severidade: b.data_pagamento && b.data_pagamento <= hoje ? severidadePorDias(dias) : "BAIXA",
      dias_parado: dias,
      valor_pendente: Number(b.total_valor),
      qtd_pendente: c?.total ?? 0,
      // "Aprovado" sozinho confundia com a autorização do master no banco. Aqui
      // é liberação interna: o lote nem chegou ao BTG.
      mensagem: "Liberado internamente e ainda não enviado ao banco",
      acao: "Envie ao BTG e avise o master para autorizar no aplicativo",
      responsavel: "OPERADOR",
      local: "SISTEMA",
      acao_sistema: "ENVIAR_BORDERO",
      acao_rotulo: "Enviar ao BTG",
    };
  }

  if (st === "MONTAGEM") {
    if (!c || c.total === 0) return null;

    const dias = b.data_pagamento ? Math.max(0, diasEntre(b.data_pagamento, hoje)) : 0;
    const bloqueios = b.bloqueios_mesa ?? 0;

    // Exceção esperando decisão é pendência mesmo antes da data: o item não vai
    // ao banco enquanto ninguém liberar, e descobrir isso na véspera do
    // pagamento é tarde. Já a montagem sem bloqueio é trabalho em andamento —
    // só vira pendência quando a data passa.
    if (bloqueios > 0) {
      return {
        ...base,
        tipo: "MESA_PENDENTE",
        severidade: b.data_pagamento && b.data_pagamento <= hoje
          ? severidadePorDias(dias)
          : "MEDIA",
        dias_parado: dias,
        valor_pendente: Number(b.total_valor),
        qtd_pendente: bloqueios,
        mensagem: `${bloqueios} de ${c.total} item(ns) fora da faixa autorizada — o borderô não vai ao banco assim`,
        acao: "Decida na Mesa: libere o valor fora da faixa, ajuste o item ou registre exceção com justificativa",
        // Liberar valor fora da faixa é a decisão que a rubrica existe para
        // exigir; por isso é do admin, e quem montou não decide sobre o próprio
        // borderô.
        responsavel: "ADMIN",
        local: "SISTEMA",
        acao_sistema: "APROVAR_BORDERO",
        acao_rotulo: "Abrir a Mesa",
      };
    }

    if (!b.data_pagamento || b.data_pagamento > hoje) return null;

    return {
      ...base,
      tipo: "MONTAGEM_PARADA",
      severidade: severidadePorDias(dias),
      dias_parado: dias,
      valor_pendente: Number(b.total_valor),
      qtd_pendente: c.total,
      mensagem: `Montagem começada e não finalizada — data de pagamento venceu há ${dias} dia(s)`,
      // Sem bloqueio de Mesa, o próprio envio libera o borderô: todos os itens
      // têm lastro. Falta alguém clicar.
      acao: "Envie ao BTG (o borderô se libera sozinho, pois todos os itens têm lastro) ou ajuste a data",
      responsavel: "OPERADOR",
      local: "SISTEMA",
      acao_sistema: "ENVIAR_BORDERO",
      acao_rotulo: "Enviar ao BTG",
    };
  }

  return null;
}

/**
 * Título que o banco não pagou, já corrigido e ainda sem borderô.
 *
 * O painel varria só borderôs, e por isso um título recusado que voltou ao
 * preparo saía do radar exatamente no momento mais frágil: o dinheiro não saiu,
 * o borderô antigo já está resolvido, e o novo ainda não existe. Foi assim que
 * um salário ficou dias sem ninguém saber.
 */
export interface LancamentoReaberto {
  id: string;
  cod_empresa: number;
  descricao: string | null;
  pessoa_nome?: string | null;
  valor: number;
  data_vencimento: string | null;
  /** Motivo traduzido da última recusa, quando o banco explicou. */
  motivo_recusa?: string | null;
}

export function pendenciaDeLancamentoReaberto(
  l: LancamentoReaberto,
  hoje: string,
): Pendencia {
  const dias = l.data_vencimento ? Math.max(0, diasEntre(l.data_vencimento, hoje)) : 0;
  const quem = l.pessoa_nome ? ` — ${l.pessoa_nome}` : "";
  return {
    bordero_id: null,
    lancamento_id: l.id,
    cod_empresa: l.cod_empresa,
    descricao: `${l.descricao || "Lançamento"}${quem}`,
    tipo: "REABERTO_SEM_BORDERO",
    // Alta a partir de dois dias: é pagamento que já falhou uma vez, e o
    // credor está esperando desde a data original.
    severidade: dias >= 2 ? "ALTA" : "MEDIA",
    dias_parado: dias,
    valor_pendente: Number(l.valor ?? 0),
    qtd_pendente: 1,
    mensagem: l.motivo_recusa
      ? `Recusado pelo banco (${l.motivo_recusa}) e devolvido ao preparo — ainda sem borderô novo`
      : "O banco não pagou e o título voltou ao preparo — ainda sem borderô novo",
    acao: "Confira os dados de pagamento em Contas a Pagar (Em preparo) e monte um novo borderô",
    responsavel: "OPERADOR",
    local: "SISTEMA",
    acao_sistema: "ABRIR_PREPARO",
    acao_rotulo: "Abrir em Contas a Pagar",
  };
}

/** Mais grave primeiro; empate desempata por tempo parado e valor. */
const PESO: Record<Severidade, number> = { ALTA: 0, MEDIA: 1, BAIXA: 2 };

export function ordenarPendencias(itens: Pendencia[]): Pendencia[] {
  return [...itens].sort((a, b) =>
    PESO[a.severidade] - PESO[b.severidade] ||
    b.dias_parado - a.dias_parado ||
    b.valor_pendente - a.valor_pendente
  );
}

export interface ResumoPainel {
  total: number;
  alta: number;
  valor_total: number;
  por_tipo: Record<string, number>;
  /** Lojas com alguma pendência — o operador precisa saber onde olhar. */
  lojas: number[];
}

export function resumirPendencias(itens: Pendencia[]): ResumoPainel {
  const porTipo: Record<string, number> = {};
  const lojas = new Set<number>();
  let alta = 0;
  let valor = 0;

  for (const p of itens) {
    porTipo[p.tipo] = (porTipo[p.tipo] ?? 0) + 1;
    lojas.add(p.cod_empresa);
    if (p.severidade === "ALTA") alta++;
    valor += p.valor_pendente;
  }

  return {
    total: itens.length,
    alta,
    valor_total: Math.round(valor * 100) / 100,
    por_tipo: porTipo,
    lojas: [...lojas].sort((a, b) => a - b),
  };
}
