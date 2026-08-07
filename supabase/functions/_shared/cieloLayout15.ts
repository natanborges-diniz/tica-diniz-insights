// Parser do Extrato Eletronico Cielo — Layout versao 15 (manual 15.15, fev/2026).
//
// Modulo puro, sem I/O e sem dependencia de Deno, para poder ser exercitado
// pelos testes do vitest em src/lib/financeiro/__tests__/.
//
// Arquivos suportados nesta entrega:
//   CIELO03 — Captura/Previsao   (registros 0, E, R, 9)
//   CIELO04 — Liquidacao/Pagto   (registros 0, D, E, 9)
//   CIELO16 — Pix                (registros 0, 8, 9)
//
// Todas as posicoes citadas nos comentarios sao 1-based e inclusivas, exatamente
// como o manual as descreve. O helper `campo()` faz a conversao para slice().

// ---------------------------------------------------------------------------
// Helpers de extracao
// ---------------------------------------------------------------------------

/** Recorta [ini, fim] 1-based inclusivo e remove espacos das pontas. */
export function campo(linha: string, ini: number, fim: number): string {
  return linha.slice(ini - 1, fim).trim();
}

/** Inteiro. Campos numericos vem zero-padded; brancos viram 0. */
export function campoNum(linha: string, ini: number, fim: number): number {
  const raw = campo(linha, ini, fim);
  if (!raw) return 0;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : 0;
}

/** Valor monetario/percentual com N casas decimais implicitas (padrao 2). */
export function campoDecimal(linha: string, ini: number, fim: number, casas = 2): number {
  const raw = campo(linha, ini, fim);
  if (!raw) return 0;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return 0;
  return n / Math.pow(10, casas);
}

/**
 * Valor com sinal: o manual sempre coloca o caractere de sinal na posicao
 * imediatamente anterior ao valor. "+" credito, "-" debito.
 */
export function campoValorComSinal(
  linha: string,
  posSinal: number,
  ini: number,
  fim: number,
  casas = 2,
): number {
  const valor = campoDecimal(linha, ini, fim, casas);
  const sinal = linha.slice(posSinal - 1, posSinal);
  return sinal === "-" ? -valor : valor;
}

const p2 = (n: number, w = 2) => String(n).padStart(w, "0");

/**
 * Monta uma data ISO validando o calendario de verdade.
 *
 * Campo corrompido nao pode virar data invalida: "2026-02-31" passa por
 * qualquer checagem ingenua de faixa e so estoura la na frente, no INSERT,
 * derrubando o lote inteiro. Aqui vira null e o registro segue sem a data.
 */
function isoDate(ano: number, mes: number, dia: number): string | null {
  if (!ano || !mes || !dia) return null;
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  if (
    d.getUTCFullYear() !== ano ||
    d.getUTCMonth() !== mes - 1 ||
    d.getUTCDate() !== dia
  ) {
    return null;
  }
  return `${p2(ano, 4)}-${p2(mes)}-${p2(dia)}`;
}

/** AAAAMMDD -> YYYY-MM-DD (header). */
export function campoDataAAAAMMDD(linha: string, ini: number, fim: number): string | null {
  const raw = campo(linha, ini, fim);
  if (raw.length !== 8 || /^0+$/.test(raw)) return null;
  return isoDate(Number(raw.slice(0, 4)), Number(raw.slice(4, 6)), Number(raw.slice(6, 8)));
}

/**
 * DDMMAAAA -> YYYY-MM-DD (registros D e E).
 * "01011001" e a sentinela do manual para "credito ainda nao enviado ao banco".
 */
export function campoDataDDMMAAAA(linha: string, ini: number, fim: number): string | null {
  const raw = campo(linha, ini, fim);
  if (raw.length !== 8 || /^0+$/.test(raw) || raw === "01011001") return null;
  return isoDate(Number(raw.slice(4, 8)), Number(raw.slice(2, 4)), Number(raw.slice(0, 2)));
}

/** AAMMDD -> YYYY-MM-DD (registros 8 e A). Pivot de seculo em 2000. */
export function campoDataAAMMDD(linha: string, ini: number, fim: number): string | null {
  const raw = campo(linha, ini, fim);
  if (raw.length !== 6 || /^0+$/.test(raw)) return null;
  return isoDate(2000 + Number(raw.slice(0, 2)), Number(raw.slice(2, 4)), Number(raw.slice(4, 6)));
}

/** HHMMSS -> HH:MM:SS. Fora de faixa vira null, e nao um `time` invalido. */
export function campoHora(linha: string, ini: number, fim: number): string | null {
  const raw = campo(linha, ini, fim);
  if (raw.length !== 6 || !/^\d{6}$/.test(raw)) return null;
  const h = Number(raw.slice(0, 2));
  const m = Number(raw.slice(2, 4));
  const s = Number(raw.slice(4, 6));
  if (h > 23 || m > 59 || s > 59) return null;
  return `${p2(h)}:${p2(m)}:${p2(s)}`;
}

// ---------------------------------------------------------------------------
// Tabelas de dominio (secao "TABELAS" do manual)
// ---------------------------------------------------------------------------

/** Tabela I — Tipos de arquivo (header, posicao 48-49). */
export const TIPOS_ARQUIVO: Record<string, string> = {
  "03": "CIELO03",
  "04": "CIELO04",
  "09": "CIELO09",
  "15": "CIELO15",
  "16": "CIELO16",
};

/** Tabela II — Tipos de lancamento. */
export const TIPOS_LANCAMENTO: Record<string, string> = {
  "01": "Venda debito",
  "02": "Venda credito",
  "03": "Venda parcelada",
  "04": "Ajuste a debito",
  "05": "Ajuste a credito",
  "06": "Cancelamento de venda",
  "07": "Reversao de cancelamento de venda",
  "08": "Contestacao do portador do cartao",
  "09": "Reversao de contestacao do portador do cartao",
  "10": "Aluguel de maquina",
  "11": "Valor cedido em negociacao",
  "13": "Debito de recebiveis dados como garantia (gravame)",
  "14": "Credito de recebiveis dados como garantia (gravame)",
  "15": "Debito de compensacao de valores em agenda financeira",
  "16": "Credito de compensacao de valores em agenda financeira",
  "17": "Devolucao de credito de valor cedido em negociacao",
  "18": "Devolucao de debito de valor cedido em negociacao",
  "19": "Devolucao de credito de recebiveis dados como garantia (gravame)",
  "20": "Devolucao de debito de recebiveis dados como garantia (gravame)",
  "23": "Debito de penhora por decisao judicial",
  "26": "Devolucao de debito de penhora por decisao judicial",
  "27": "Debito de cancelamento/contestacao sobre negociacao cancelada",
  "28": "Credito de cancelamento/contestacao sobre negociacao cancelada",
  "35": "Compensacao a debito devido lancamento em garantia (gravame)",
  "36": "Compensacao a credito devido lancamento em garantia (gravame)",
  "37": "Compensacao a debito devido lancamento de penhora",
  "38": "Compensacao a credito devido lancamento de penhora",
  "39": "Compensacao a debito devido lancamento de cessao",
  "40": "Compensacao a credito devido lancamento de cessao",
  "42": "Venda Voucher",
  "49": "Debito de negociacao ARV Credenciadora",
  "50": "Credito de negociacao ARV Credenciadora",
  "51": "Estorno de credito de negociacao ARV Credenciadora",
  "52": "Estorno de debito de negociacao ARV Credenciadora",
  "53": "Debito compensacao de cancelamento em negociacao ARV Credenciadora",
  "54": "Credito compensacao de cancelamento em negociacao ARV Credenciadora",
};

/** Lancamentos que representam uma venda (alimentam vendas_cartao). */
export const LANCAMENTOS_VENDA = new Set(["01", "02", "03", "42"]);

/** Lancamentos que representam estorno/cancelamento/contestacao de venda. */
export const LANCAMENTOS_AJUSTE_VENDA = new Set(["06", "07", "08", "09"]);

/** Tabela III — Codigos de bandeira. */
export const BANDEIRAS: Record<string, string> = {
  "001": "VISA",
  "002": "MASTERCARD",
  "003": "AMEX",
  "004": "TICKETLOG",
  "006": "SOROCRED",
  "007": "ELO",
  "009": "DINERS",
  "011": "AGIPLAN",
  "015": "BANESCARD",
  "023": "CABAL",
  "027": "CHINA UNIONPAY",
  "029": "CREDSYSTEM",
  "035": "EXPLANADA",
  "038": "GOOD CARD",
  "040": "HIPERCARD",
  "057": "VERDECARD",
  "060": "JCB",
  "064": "CREDZ",
  "069": "AVISTA",
  "072": "HIPER",
  "075": "OUROCARD",
  "888": "PIX",
};

/** Tabela IV — Status de pagamento (registro D, posicao 70-71). */
export const STATUS_PAGAMENTO: Record<string, string> = {};
for (const c of ["00", "0P"]) STATUS_PAGAMENTO[c] = "AGENDADO";
for (const c of ["03", "45", "54", "0O"]) STATUS_PAGAMENTO[c] = "ENVIADO_AO_BANCO";
for (const c of ["04", "05", "10", "11", "31", "32", "98", "99", "0B", "0C", "0M", "0N", "0W", "0Z"]) {
  STATUS_PAGAMENTO[c] = "PAGO";
}
for (const c of ["06", "0R"]) STATUS_PAGAMENTO[c] = "REJEITADO_PELO_BANCO";
for (const c of ["07", "0X", "0Y"]) STATUS_PAGAMENTO[c] = "REENVIADO_AO_BANCO";
for (const c of ["46", "47"]) STATUS_PAGAMENTO[c] = "DEBITADO_EM_CONTA";
STATUS_PAGAMENTO["58"] = "PAGO_VIA_NEGOCIACAO";
for (const c of ["42", "48"]) STATUS_PAGAMENTO[c] = "DEBITO_PENDENTE";
STATUS_PAGAMENTO["02"] = "BLOQUEADO";
// "0A" aparece na tabela IV tanto em Pago quanto em Suspenso (erro conhecido do
// manual 15.14.1). Mantemos SUSPENSO, que e o dominio mais recente.
for (const c of ["0A", "08", "15", "37", "38", "53"]) STATUS_PAGAMENTO[c] = "SUSPENSO";

/** Status de pagamento (registro D) que significam dinheiro efetivamente na conta. */
export const STATUS_PAGAMENTO_LIQUIDADO = new Set([
  "PAGO",
  "PAGO_VIA_NEGOCIACAO",
  "DEBITADO_EM_CONTA",
]);

/** Tipo de liquidacao (registros D e E). */
export const TIPOS_LIQUIDACAO: Record<string, string> = {
  "000": "NAO_IDENTIFICADO",
  "001": "DEBITO",
  "002": "CREDITO",
  "004": "VOUCHER",
};

/** Tipo de transacao (registro E, posicao 554-556). */
export const TIPOS_TRANSACAO: Record<string, string> = {
  "001": "DEBITO",
  "002": "CREDITO",
  "003": "PARCELADO",
};

/** Tabela VII — Canal da venda. */
export const CANAIS_VENDA: Record<string, string> = {
  "000": "Cielo Lio",
  "001": "POS",
  "002": "Mobile",
  "003": "Manual",
  "004": "URA/CVA",
  "005": "EDI/Remessa",
  "006": "GDS/IATA",
  "007": "E-commerce",
  "008": "TEF/PDV",
  "009": "Pedagio",
  "010": "Central de atendimento (BackOffice)",
  "011": "Central de atendimento",
  "012": "Chargeback",
  "013": "Ouvidoria",
  "014": "Massivo",
  "015": "Digitado",
  "099": "Nao identificado",
  "998": "Nao se aplica",
};

/** Tabela VIII — Tipo de captura. */
export const TIPOS_CAPTURA: Record<string, string> = {};
TIPOS_CAPTURA["00"] = "Reentrada manual";
for (const c of ["01", "10", "81"]) TIPOS_CAPTURA[c] = "Venda digitada";
for (const c of ["02", "06", "90"]) TIPOS_CAPTURA[c] = "Leitura de trilha";
TIPOS_CAPTURA["03"] = "Leitura de codigo de barra";
TIPOS_CAPTURA["04"] = "Leitura otica";
for (const c of ["05", "09", "80", "82", "83", "95"]) TIPOS_CAPTURA[c] = "Leitura de chip";
for (const c of ["07", "91"]) TIPOS_CAPTURA[c] = "Contactless";
TIPOS_CAPTURA["08"] = "QR Code";
TIPOS_CAPTURA["99"] = "Tap on Phone";

/** Tabela VI — Grupo de cartoes. */
export const GRUPOS_CARTAO: Record<string, string> = {
  "00": "Servico nao atribuido",
  "01": "Cartao emitido no Brasil",
  "02": "Cartao emitido no exterior",
  "03": "MDR por tipo de cartao - Inicial",
  "04": "MDR por tipo de cartao - Intermediario",
  "05": "MDR por tipo de cartao - Superior",
};

/** Registro 8 — Status de transferencia para conta de pagamento (pos. 223-224). */
export const STATUS_TRANSFERENCIA_PIX: Record<string, string> = {
  "01": "PAGO_CONTA_CIELO",
  "02": "EM_TRANSFERENCIA_DOMICILIO",
  "03": "TRANSFERENCIA_NEGADA",
  "04": "TRANSFERENCIA_NAO_REALIZADA",
  "05": "PAGO_CONTA_DOMICILIO",
  "06": "BLOQUEADO",
  "07": "DESBLOQUEADO",
  "08": "LIQUIDACAO_JUDICIAL",
  "09": "COMPENSADO",
};

/** Manual, registro 8: "considerar liquidadas as transacoes com status 01 ou 05". */
export const STATUS_TRANSFERENCIA_PIX_LIQUIDADO = new Set(["01", "05"]);

/** Registro 8 — Origem do ajuste (pos. 220-221). */
export const ORIGEM_AJUSTE_PIX: Record<string, string> = {
  "12": "Acerto de taxa Pix",
  "17": "Estorno/Devolucao de transacao Pix",
  "23": "Bloqueio de valor",
  "24": "Desbloqueio de valor",
  "25": "Liquidacao judicial",
  "26": "Compensado por med",
};

export function descreveBandeira(codigo: string): string {
  return BANDEIRAS[codigo] || (codigo ? `BANDEIRA_${codigo}` : "NAO_IDENTIFICADA");
}

/**
 * Normaliza os codigos de rastreio para que possam ser comparados entre si.
 *
 * "Codigo da transacao recebida" (pos. 130-151) e declarado Alpha/Num e o
 * "Numero da transacao processada" (pos. 605-626) e declarado Num — o mesmo
 * codigo chega alinhado a esquerda em um campo e zero-padded a esquerda no
 * outro. Sem normalizar, o vinculo ajuste -> venda de origem nunca casa.
 *
 * Zeros a esquerda so sao removidos quando o campo e inteiramente numerico,
 * para nao corromper codigos de fato alfanumericos. Um campo todo zerado vira
 * string vazia: o manual usa zeros como "nao informado".
 */
export function normalizaCodigoRastreio(codigo: string): string {
  const v = codigo.trim();
  if (!v || !/^\d+$/.test(v)) return v;
  return v.replace(/^0+/, "");
}

// ---------------------------------------------------------------------------
// Tipos dos registros
// ---------------------------------------------------------------------------

export interface CieloHeader {
  tipoRegistro: "0";
  estabelecimentoMatriz: string;
  dataProcessamento: string | null;
  periodoInicial: string | null;
  periodoFinal: string | null;
  sequencia: number;
  /** Reprocessamento e sinalizado pela Cielo com sequencia 9999999. */
  reprocessamento: boolean;
  empresaAdquirente: string;
  /** Tabela I: "03" | "04" | "09" | "15" | "16". */
  opcaoExtrato: string;
  tipoArquivo: string;
  transmissao: string;
  caixaPostal: string;
  versaoLayout: string;
  hierarquiaCadastro: string;
  cadastroCompleto: boolean;
}

export interface CieloRegistroD {
  tipoRegistro: "D";
  estabelecimentoSubmissor: string;
  cpfCnpjTitular: string;
  cpfCnpjTitularMovimento: string;
  cpfCnpjRecebedor: string;
  bandeiraCodigo: string;
  bandeira: string;
  tipoLiquidacao: string;
  matrizPagamento: string;
  statusPagamentoCodigo: string;
  statusPagamento: string;
  liquidado: boolean;
  valorBruto: number;
  valorTaxaAdministrativa: number;
  valorLiquido: number;
  banco: string;
  agencia: string;
  conta: string;
  digitoConta: string;
  qtdLancamentos: number;
  tipoLancamento: string;
  chaveUr: string;
  tipoLancamentoOriginal: string;
  dataPagamento: string | null;
  dataEnvioBanco: string | null;
  dataVencimentoOriginal: string | null;
  estabelecimentoPagamento: string;
  lancamentoPendente: boolean;
  reenvioPagamento: boolean;
  negociacaoGravame: boolean;
  cpfCnpjNegociador: string;
}

export interface CieloRegistroE {
  tipoRegistro: "E";
  estabelecimentoSubmissor: string;
  bandeiraLiquidacaoCodigo: string;
  bandeiraLiquidacao: string;
  tipoLiquidacao: string;
  parcela: number;
  totalParcelas: number;
  codigoAutorizacao: string;
  tipoLancamento: string;
  tipoLancamentoDescricao: string;
  chaveUr: string;
  /** Chave primaria de rastreio da venda no ciclo de vida (pos. 130-151). */
  codigoTransacaoRecebida: string;
  codigoAjuste: string;
  formaPagamento: string;
  cieloPromo: boolean;
  dcc: boolean;
  comissaoMinima: boolean;
  indicativoRaTc: string;
  taxaZero: boolean;
  rejeitada: boolean;
  vendaTardia: boolean;
  binCartao: string;
  finalCartao: string;
  nsu: string;
  numeroNotaFiscal: string;
  tid: string;
  codigoPedido: string;
  taxaMdrPercentual: number;
  taxaRaPercentual: number;
  taxaVendaPercentual: number;
  valorTotalVenda: number;
  valorBruto: number;
  valorLiquido: number;
  valorComissao: number;
  valorComissaoMinima: number;
  valorTarifaMdr: number;
  valorRecebimentoAutomatico: number;
  valorTarifaAdministrativa: number;
  valorCieloPromo: number;
  valorDcc: number;
  horaTransacao: string | null;
  grupoCartoes: string;
  cpfCnpjRecebedor: string;
  bandeiraAutorizacaoCodigo: string;
  bandeiraAutorizacao: string;
  codigoUnicoVenda: string;
  codigoOriginalVenda: string;
  identificadorEfeitoNegociacao: string;
  canalVendaCodigo: string;
  canalVenda: string;
  numeroTerminal: string;
  tipoLancamentoOriginal: string;
  tipoTransacaoCodigo: string;
  tipoTransacao: string;
  codigoModeloPrecificacao: string;
  dataAutorizacao: string | null;
  dataCaptura: string | null;
  dataLancamento: string | null;
  dataOriginalLancamento: string | null;
  numeroLote: string;
  /** Aponta para o "Codigo da transacao recebida" da venda que sofreu o ajuste. */
  numeroTransacaoProcessada: string;
  motivoRejeicao: string;
  dataVencimentoOriginal: string | null;
  matrizPagamento: string;
  tipoCartao: string;
  cartaoEstrangeiro: boolean;
  mdrPorTipoCartao: boolean;
  parceladoCliente: boolean;
  banco: string;
  agencia: string;
  conta: string;
  digitoConta: string;
  arn: string;
  negociacaoComCielo: boolean;
  tipoCapturaCodigo: string;
  tipoCaptura: string;
  cpfCnpjNegociador: string;
}

export interface CieloRegistro8 {
  tipoRegistro: "8";
  estabelecimentoSubmissor: string;
  /** "01" transacao Pix, "02" ajuste a credito, "03" ajuste a debito. */
  tipoTransacao: string;
  dataTransacao: string | null;
  horaTransacao: string | null;
  idPix: string;
  nsu: string;
  dataPagamento: string | null;
  valorBruto: number;
  valorTaxaAdministrativa: number;
  valorLiquido: number;
  banco: string;
  agencia: string;
  conta: string;
  dataCaptura: string | null;
  taxaAdministrativaPercentual: number;
  tarifaAdministrativa: number;
  canalVendaCodigo: string;
  numeroTerminal: string;
  dataTransacaoOriginal: string | null;
  horaTransacaoOriginal: string | null;
  idPixOriginal: string;
  indicativoTrocoSaque: string;
  origemAjusteCodigo: string;
  origemAjuste: string;
  transferenciaAutomatica: boolean;
  statusTransferenciaCodigo: string;
  statusTransferencia: string;
  liquidado: boolean;
  dataPagamentoContaCielo: string | null;
  nsuLongo: string;
  transferenciaProgramada: boolean;
  txId: string;
  idRecorrencia: string;
  idPagamentoPix: string;
}

export interface CieloTrailer {
  tipoRegistro: "9";
  totalRegistros: number;
  valorLiquido: number;
  qtdRegistrosE: number;
  valorBruto: number;
  valorCedidoNegociacao: number;
  valorGravame: number;
}

export interface CieloExtratoParsed {
  header: CieloHeader;
  registrosD: CieloRegistroD[];
  registrosE: CieloRegistroE[];
  registros8: CieloRegistro8[];
  trailer: CieloTrailer | null;
  /** Linhas cujo tipo de registro nao e tratado nesta entrega (R, A, B, C). */
  registrosIgnorados: Record<string, number>;
  validacao: CieloValidacao;
}

export interface CieloValidacao {
  ok: boolean;
  erros: string[];
  avisos: string[];
}

// ---------------------------------------------------------------------------
// Parsers por tipo de registro
// ---------------------------------------------------------------------------

export function parseHeader(linha: string): CieloHeader {
  const opcaoExtrato = campo(linha, 48, 49);
  const sequencia = campoNum(linha, 36, 42);
  return {
    tipoRegistro: "0",
    estabelecimentoMatriz: String(campoNum(linha, 2, 11)),
    dataProcessamento: campoDataAAAAMMDD(linha, 12, 19),
    periodoInicial: campoDataAAAAMMDD(linha, 20, 27),
    periodoFinal: campoDataAAAAMMDD(linha, 28, 35),
    sequencia,
    reprocessamento: sequencia === 9999999,
    empresaAdquirente: campo(linha, 43, 47),
    opcaoExtrato,
    tipoArquivo: TIPOS_ARQUIVO[opcaoExtrato] || `DESCONHECIDO_${opcaoExtrato}`,
    transmissao: campo(linha, 50, 50),
    caixaPostal: campo(linha, 51, 70),
    versaoLayout: campo(linha, 71, 73),
    hierarquiaCadastro: campo(linha, 74, 75),
    cadastroCompleto: campo(linha, 76, 76) === "S",
  };
}

export function parseRegistroD(linha: string): CieloRegistroD {
  const bandeiraCodigo = campo(linha, 54, 56);
  const statusCodigo = campo(linha, 70, 71);
  const status = STATUS_PAGAMENTO[statusCodigo] || `DESCONHECIDO_${statusCodigo}`;
  return {
    tipoRegistro: "D",
    estabelecimentoSubmissor: String(campoNum(linha, 2, 11)),
    cpfCnpjTitular: campo(linha, 12, 25),
    cpfCnpjTitularMovimento: campo(linha, 26, 39),
    cpfCnpjRecebedor: campo(linha, 40, 53),
    bandeiraCodigo,
    bandeira: descreveBandeira(bandeiraCodigo),
    tipoLiquidacao: TIPOS_LIQUIDACAO[campo(linha, 57, 59)] || "NAO_IDENTIFICADO",
    matrizPagamento: String(campoNum(linha, 60, 69)),
    statusPagamentoCodigo: statusCodigo,
    statusPagamento: status,
    liquidado: STATUS_PAGAMENTO_LIQUIDADO.has(status),
    valorBruto: campoValorComSinal(linha, 72, 73, 85),
    // O manual inverte o sinal da taxa: "+" identifica valor a debito.
    valorTaxaAdministrativa: -campoValorComSinal(linha, 86, 87, 99),
    valorLiquido: campoValorComSinal(linha, 100, 101, 113),
    banco: campo(linha, 114, 117),
    agencia: campo(linha, 118, 122),
    conta: campo(linha, 123, 142),
    digitoConta: campo(linha, 143, 143),
    qtdLancamentos: campoNum(linha, 144, 149),
    tipoLancamento: campo(linha, 150, 151),
    chaveUr: campo(linha, 152, 251),
    tipoLancamentoOriginal: campo(linha, 252, 253),
    dataPagamento: campoDataDDMMAAAA(linha, 268, 275),
    dataEnvioBanco: campoDataDDMMAAAA(linha, 276, 283),
    dataVencimentoOriginal: campoDataDDMMAAAA(linha, 284, 291),
    estabelecimentoPagamento: String(campoNum(linha, 292, 301)),
    lancamentoPendente: campo(linha, 302, 302) === "S",
    reenvioPagamento: campo(linha, 303, 303) === "S",
    negociacaoGravame: campo(linha, 304, 304) === "S",
    cpfCnpjNegociador: campo(linha, 305, 318),
  };
}

export function parseRegistroE(linha: string): CieloRegistroE {
  const tipoLancamento = campo(linha, 28, 29);
  const bandeiraLiqCodigo = campo(linha, 12, 14);
  const bandeiraAutCodigo = campo(linha, 493, 495);
  const canalCodigo = campo(linha, 541, 543);
  const capturaCodigo = campo(linha, 707, 708);
  const tipoTransacaoCodigo = campo(linha, 554, 556);

  return {
    tipoRegistro: "E",
    estabelecimentoSubmissor: String(campoNum(linha, 2, 11)),
    bandeiraLiquidacaoCodigo: bandeiraLiqCodigo,
    bandeiraLiquidacao: descreveBandeira(bandeiraLiqCodigo),
    tipoLiquidacao: TIPOS_LIQUIDACAO[campo(linha, 15, 17)] || "NAO_IDENTIFICADO",
    parcela: campoNum(linha, 18, 19),
    totalParcelas: campoNum(linha, 20, 21),
    codigoAutorizacao: campo(linha, 22, 27),
    tipoLancamento,
    tipoLancamentoDescricao: TIPOS_LANCAMENTO[tipoLancamento] || `DESCONHECIDO_${tipoLancamento}`,
    chaveUr: campo(linha, 30, 129),
    codigoTransacaoRecebida: normalizaCodigoRastreio(campo(linha, 130, 151)),
    codigoAjuste: campo(linha, 152, 155),
    formaPagamento: campo(linha, 156, 158),
    cieloPromo: campo(linha, 159, 159) === "S",
    dcc: campo(linha, 160, 160) === "S",
    comissaoMinima: campo(linha, 161, 161) === "S",
    indicativoRaTc: campo(linha, 162, 162),
    taxaZero: campo(linha, 163, 163) === "S",
    rejeitada: campo(linha, 164, 164) === "S",
    vendaTardia: campo(linha, 165, 165) === "S",
    binCartao: campo(linha, 166, 171),
    finalCartao: campo(linha, 172, 175),
    nsu: campo(linha, 176, 181),
    numeroNotaFiscal: campo(linha, 182, 191),
    tid: campo(linha, 192, 211),
    codigoPedido: campo(linha, 212, 231),
    taxaMdrPercentual: campoDecimal(linha, 232, 236),
    taxaRaPercentual: campoDecimal(linha, 237, 241),
    taxaVendaPercentual: campoDecimal(linha, 242, 246),
    valorTotalVenda: campoValorComSinal(linha, 247, 248, 260),
    valorBruto: campoValorComSinal(linha, 261, 262, 274),
    valorLiquido: campoValorComSinal(linha, 275, 276, 288),
    valorComissao: campoValorComSinal(linha, 289, 290, 302),
    valorComissaoMinima: campoValorComSinal(linha, 303, 304, 316),
    valorTarifaMdr: campoValorComSinal(linha, 331, 332, 344),
    valorRecebimentoAutomatico: campoValorComSinal(linha, 345, 346, 358),
    valorTarifaAdministrativa: campoValorComSinal(linha, 429, 430, 442),
    valorCieloPromo: campoValorComSinal(linha, 443, 444, 456),
    valorDcc: campoValorComSinal(linha, 457, 458, 470),
    horaTransacao: campoHora(linha, 471, 476),
    grupoCartoes: campo(linha, 477, 478),
    cpfCnpjRecebedor: campo(linha, 479, 492),
    bandeiraAutorizacaoCodigo: bandeiraAutCodigo,
    bandeiraAutorizacao: descreveBandeira(bandeiraAutCodigo),
    codigoUnicoVenda: campo(linha, 496, 510),
    codigoOriginalVenda: campo(linha, 511, 525),
    identificadorEfeitoNegociacao: campo(linha, 526, 540),
    canalVendaCodigo: canalCodigo,
    canalVenda: CANAIS_VENDA[canalCodigo] || "Nao identificado",
    numeroTerminal: campo(linha, 544, 551),
    tipoLancamentoOriginal: campo(linha, 552, 553),
    tipoTransacaoCodigo,
    tipoTransacao: TIPOS_TRANSACAO[tipoTransacaoCodigo] || "",
    codigoModeloPrecificacao: campo(linha, 561, 565),
    dataAutorizacao: campoDataDDMMAAAA(linha, 566, 573),
    dataCaptura: campoDataDDMMAAAA(linha, 574, 581),
    dataLancamento: campoDataDDMMAAAA(linha, 582, 589),
    dataOriginalLancamento: campoDataDDMMAAAA(linha, 590, 597),
    numeroLote: campo(linha, 598, 604),
    numeroTransacaoProcessada: normalizaCodigoRastreio(campo(linha, 605, 626)),
    motivoRejeicao: campo(linha, 627, 629),
    dataVencimentoOriginal: campoDataDDMMAAAA(linha, 630, 637),
    matrizPagamento: String(campoNum(linha, 638, 647)),
    tipoCartao: campo(linha, 648, 649),
    cartaoEstrangeiro: campo(linha, 650, 650) === "S",
    mdrPorTipoCartao: campo(linha, 651, 651) === "S",
    parceladoCliente: campo(linha, 652, 652) === "S",
    banco: campo(linha, 653, 656),
    agencia: campo(linha, 657, 661),
    conta: campo(linha, 662, 681),
    digitoConta: campo(linha, 682, 682),
    arn: campo(linha, 683, 705),
    negociacaoComCielo: campo(linha, 706, 706) === "S",
    tipoCapturaCodigo: capturaCodigo,
    tipoCaptura: TIPOS_CAPTURA[capturaCodigo] || "",
    cpfCnpjNegociador: campo(linha, 709, 722),
  };
}

export function parseRegistro8(linha: string): CieloRegistro8 {
  const statusCodigo = campo(linha, 223, 224);
  const origemAjusteCodigo = campo(linha, 220, 221);
  return {
    tipoRegistro: "8",
    estabelecimentoSubmissor: String(campoNum(linha, 2, 11)),
    tipoTransacao: campo(linha, 12, 13),
    dataTransacao: campoDataAAMMDD(linha, 14, 19),
    horaTransacao: campoHora(linha, 20, 25),
    idPix: campo(linha, 26, 61),
    nsu: campo(linha, 62, 67),
    dataPagamento: campoDataAAMMDD(linha, 68, 73),
    valorBruto: campoValorComSinal(linha, 74, 75, 87),
    valorTaxaAdministrativa: campoValorComSinal(linha, 88, 89, 101),
    valorLiquido: campoValorComSinal(linha, 102, 103, 115),
    banco: campo(linha, 116, 119),
    agencia: campo(linha, 120, 124),
    conta: campo(linha, 125, 144),
    dataCaptura: campoDataAAMMDD(linha, 145, 150),
    taxaAdministrativaPercentual: campoDecimal(linha, 151, 155),
    tarifaAdministrativa: campoDecimal(linha, 156, 159),
    canalVendaCodigo: campo(linha, 160, 161),
    numeroTerminal: campo(linha, 162, 169),
    dataTransacaoOriginal: campoDataAAMMDD(linha, 170, 175),
    horaTransacaoOriginal: campoHora(linha, 176, 181),
    idPixOriginal: campo(linha, 182, 217),
    indicativoTrocoSaque: campo(linha, 218, 219),
    origemAjusteCodigo,
    origemAjuste: ORIGEM_AJUSTE_PIX[origemAjusteCodigo] || "",
    transferenciaAutomatica: campo(linha, 222, 222) === "S",
    statusTransferenciaCodigo: statusCodigo,
    statusTransferencia: STATUS_TRANSFERENCIA_PIX[statusCodigo] || "",
    liquidado: STATUS_TRANSFERENCIA_PIX_LIQUIDADO.has(statusCodigo),
    dataPagamentoContaCielo: campoDataAAMMDD(linha, 225, 230),
    nsuLongo: campo(linha, 231, 238),
    transferenciaProgramada: campo(linha, 239, 239) === "S",
    txId: campo(linha, 240, 275),
    idRecorrencia: campo(linha, 276, 311),
    idPagamentoPix: campo(linha, 312, 347),
  };
}

export function parseTrailer(linha: string): CieloTrailer {
  return {
    tipoRegistro: "9",
    totalRegistros: campoNum(linha, 2, 12),
    valorLiquido: campoValorComSinal(linha, 13, 14, 30),
    qtdRegistrosE: campoNum(linha, 31, 41),
    valorBruto: campoValorComSinal(linha, 42, 43, 59),
    valorCedidoNegociacao: campoValorComSinal(linha, 60, 61, 77),
    valorGravame: campoValorComSinal(linha, 78, 79, 95),
  };
}

// ---------------------------------------------------------------------------
// Parser do arquivo
// ---------------------------------------------------------------------------

/** Tolerancia de centavos na conferencia do trailer (arredondamento por UR). */
const TOLERANCIA_TRAILER = 0.05;

function arredonda(v: number): number {
  return Math.round(v * 100) / 100;
}

/**
 * Parseia um arquivo completo do Extrato Eletronico v15.
 *
 * Lanca se o arquivo estiver vazio ou se a primeira linha nao for um header "0".
 * Divergencias de totalizacao viram avisos/erros em `validacao`, nunca excecao —
 * a decisao de descartar o arquivo cabe a quem chama.
 */
export function parseExtratoCielo(conteudo: string): CieloExtratoParsed {
  const linhas = conteudo
    .split(/\r\n|\r|\n/)
    .filter((l) => l.trim().length > 0);

  if (linhas.length === 0) {
    throw new Error("Arquivo de extrato Cielo vazio.");
  }
  if (linhas[0][0] !== "0") {
    throw new Error(
      `Primeira linha nao e um header (esperado tipo de registro "0", encontrado "${linhas[0][0]}").`,
    );
  }

  const header = parseHeader(linhas[0]);
  const registrosD: CieloRegistroD[] = [];
  const registrosE: CieloRegistroE[] = [];
  const registros8: CieloRegistro8[] = [];
  const registrosIgnorados: Record<string, number> = {};
  let trailer: CieloTrailer | null = null;

  const erros: string[] = [];
  const avisos: string[] = [];

  for (let i = 1; i < linhas.length; i++) {
    const linha = linhas[i];
    switch (linha[0]) {
      case "D":
        registrosD.push(parseRegistroD(linha));
        break;
      case "E":
        registrosE.push(parseRegistroE(linha));
        break;
      case "8":
        registros8.push(parseRegistro8(linha));
        break;
      case "9":
        trailer = parseTrailer(linha);
        break;
      case "0":
        erros.push(`Header duplicado na linha ${i + 1}.`);
        break;
      default: {
        const tipo = linha[0];
        registrosIgnorados[tipo] = (registrosIgnorados[tipo] || 0) + 1;
      }
    }
  }

  if (header.versaoLayout !== "015") {
    erros.push(
      `Versao de layout "${header.versaoLayout}" nao suportada (este parser implementa a 015).`,
    );
  }

  if (!trailer) {
    erros.push("Arquivo sem registro trailer (tipo 9).");
  } else {
    const totalDetalhe =
      registrosD.length +
      registrosE.length +
      registros8.length +
      Object.values(registrosIgnorados).reduce((a, b) => a + b, 0);

    if (trailer.totalRegistros !== totalDetalhe) {
      erros.push(
        `Trailer declara ${trailer.totalRegistros} registros, arquivo tem ${totalDetalhe}.`,
      );
    }
    if (trailer.qtdRegistrosE !== registrosE.length) {
      erros.push(
        `Trailer declara ${trailer.qtdRegistrosE} registros "E", arquivo tem ${registrosE.length}.`,
      );
    }

    // O trailer soma registros diferentes conforme o tipo de arquivo (manual,
    // registro 9): CIELO03 soma "E", CIELO04/09 somam "D", CIELO16 soma "8".
    let somaLiquido: number | null = null;
    let somaBruto: number | null = null;
    if (header.opcaoExtrato === "03") {
      somaLiquido = registrosE.reduce((a, r) => a + r.valorLiquido, 0);
      somaBruto = registrosE.reduce((a, r) => a + r.valorBruto, 0);
    } else if (header.opcaoExtrato === "04" || header.opcaoExtrato === "09") {
      somaLiquido = registrosD.reduce((a, r) => a + r.valorLiquido, 0);
      somaBruto = registrosD.reduce((a, r) => a + r.valorBruto, 0);
    } else if (header.opcaoExtrato === "16") {
      somaLiquido = registros8.reduce((a, r) => a + r.valorLiquido, 0);
      somaBruto = registros8.reduce((a, r) => a + r.valorBruto, 0);
    }

    if (somaLiquido !== null && Math.abs(arredonda(somaLiquido) - trailer.valorLiquido) > TOLERANCIA_TRAILER) {
      erros.push(
        `Valor liquido do trailer (${trailer.valorLiquido.toFixed(2)}) diverge da soma dos registros (${arredonda(somaLiquido).toFixed(2)}).`,
      );
    }
    if (somaBruto !== null && Math.abs(arredonda(somaBruto) - trailer.valorBruto) > TOLERANCIA_TRAILER) {
      erros.push(
        `Valor bruto do trailer (${trailer.valorBruto.toFixed(2)}) diverge da soma dos registros (${arredonda(somaBruto).toFixed(2)}).`,
      );
    }
  }

  if (header.reprocessamento) {
    avisos.push(
      "Arquivo marcado como reprocessamento (sequencia 9999999): sobrepoe registros ja importados.",
    );
  }
  if (!header.cadastroCompleto) {
    // Manual, registro 0, posicao 76: indica se TODOS os estabelecimentos da
    // hierarquia estao contemplados nesta matriz de extrato. Com "N", pode
    // haver loja cujas vendas nao entram neste arquivo — e a falta so
    // apareceria como dinheiro sumido na conciliacao, sem nada apontando a
    // causa.
    avisos.push(
      "Cadastro incompleto (posicao 76 = N): nem todos os estabelecimentos da hierarquia estao nesta matriz de extrato. Confirme com a Cielo quais ficaram de fora.",
    );
  }
  if (Object.keys(registrosIgnorados).length > 0) {
    const detalhe = Object.entries(registrosIgnorados)
      .map(([t, n]) => `${t}=${n}`)
      .join(", ");
    avisos.push(`Registros nao tratados nesta versao ignorados: ${detalhe}.`);
  }

  return {
    header,
    registrosD,
    registrosE,
    registros8,
    trailer,
    registrosIgnorados,
    validacao: { ok: erros.length === 0, erros, avisos },
  };
}

// ---------------------------------------------------------------------------
// Derivacoes de negocio
// ---------------------------------------------------------------------------

/**
 * Chave de rastreio do ciclo de vida da venda (manual, "Chaves de conciliacao e
 * rastreio para vendas e pagamentos"): o "Codigo da transacao recebida" segue a
 * transacao do CIELO03 ate o CIELO04. Para parcelado, todas as parcelas
 * compartilham o mesmo codigo, entao a parcela entra na chave.
 */
export function chaveRastreioVenda(r: CieloRegistroE): string {
  // O fallback so entra quando a Cielo manda o codigo zerado. Ele precisa
  // discriminar duas linhas distintas da mesma UR, entao carrega tudo que
  // varia entre transacoes: NSU, autorizacao, data e valor.
  const base = r.codigoTransacaoRecebida
    || [
      r.chaveUr,
      r.nsu,
      r.codigoAutorizacao,
      r.dataAutorizacao ?? r.dataCaptura ?? "",
      r.horaTransacao ?? "",
      r.valorBruto.toFixed(2),
    ].join("|");
  return r.tipoLancamento === "03" ? `${base}#${String(r.parcela).padStart(2, "0")}` : base;
}

/**
 * Chave de vinculo entre registros "D" e "E" nos arquivos de liquidacao.
 * Manual: "A Chave UR mais o Tipo de lancamento sao os campos que associam
 * registros tipo E a linhas tipo D".
 */
export function chaveUrLancamento(chaveUr: string, tipoLancamento: string): string {
  return `${chaveUr}|${tipoLancamento}`;
}

/**
 * Chave de conciliacao de negociacoes de recebiveis, conforme o campo
 * "Identificador do efeito da negociacao de recebiveis" (registro E, 526-540).
 */
export function chaveNegociacao(r: CieloRegistroE): string {
  return [
    r.chaveUr,
    r.codigoTransacaoRecebida,
    r.bandeiraLiquidacaoCodigo,
    r.dataVencimentoOriginal ?? "",
    r.identificadorEfeitoNegociacao,
  ].join("|");
}

/** Modalidade normalizada, no mesmo vocabulario ja usado por vendas_cartao. */
export function modalidadeVenda(r: CieloRegistroE): "DEBITO" | "CREDITO" | "VOUCHER" {
  if (r.tipoLancamento === "01") return "DEBITO";
  if (r.tipoLancamento === "42") return "VOUCHER";
  return "CREDITO";
}

/** Status normalizado da venda, no mesmo vocabulario ja usado por vendas_cartao. */
export function statusVenda(r: CieloRegistroE): "APROVADA" | "CANCELADA" | "ESTORNADA" {
  if (r.rejeitada) return "CANCELADA";
  if (r.tipoLancamento === "06") return "CANCELADA";
  if (r.tipoLancamento === "08") return "ESTORNADA";
  return "APROVADA";
}

/**
 * Agrupa os registros "E" de um CIELO04 sob a UR ("D") correspondente.
 * Registros "E" sem "D" par voltam em `orfaos` — isso acontece quando o arquivo
 * foi truncado ou quando ha reenvio parcial, e precisa ser visivel.
 */
export function agruparUrs(parsed: CieloExtratoParsed): {
  urs: Array<{ ur: CieloRegistroD; lancamentos: CieloRegistroE[] }>;
  orfaos: CieloRegistroE[];
} {
  const index = new Map<string, { ur: CieloRegistroD; lancamentos: CieloRegistroE[] }>();
  for (const d of parsed.registrosD) {
    index.set(chaveUrLancamento(d.chaveUr, d.tipoLancamento), { ur: d, lancamentos: [] });
  }

  const orfaos: CieloRegistroE[] = [];
  for (const e of parsed.registrosE) {
    const grupo = index.get(chaveUrLancamento(e.chaveUr, e.tipoLancamento));
    if (grupo) grupo.lancamentos.push(e);
    else orfaos.push(e);
  }

  return { urs: [...index.values()], orfaos };
}
