// Por que o banco recusou — em português, com o que fazer.
//
// O primeiro caso real: um boleto da Johnson voltou INVALIDATED e a tela dizia
// apenas "revisar dados e reenviar". A causa estava no payload do BTG desde o
// começo:
//
//   "errors": [{ "code": "payment-amount-changed",
//                "arguments": { "totalAmount": "217.46" } }]
//
// Ou seja: o boleto acumulou juros e multa entre a montagem do borderô e o
// envio, e o banco recusou porque o valor não era mais aquele. Com o motivo na
// tela o operador corrige o valor e reenvia; sem ele, abre o app do BTG — ou
// repete o mesmo erro.
//
// Módulo puro (sem Deno, sem rede): usado pelas functions e pela tela, testado
// por Vitest.

export interface RecusaBtg {
  /** Código cru do banco — vale guardar, é o que aparece no suporte do BTG. */
  codigo: string | null;
  /** Frase curta, em português, para estampar no badge. */
  motivo: string;
  /** O que o operador faz a seguir. Ausente quando não sabemos. */
  como_resolver?: string;
}

/**
 * Catálogo dos códigos que o BTG devolve em `data.errors[].code`.
 *
 * `{arg}` é substituído pelos `arguments` do próprio erro. Código desconhecido
 * não some: cai no humanizador abaixo, que ao menos mostra o texto legível.
 */
const CATALOGO: Record<string, { motivo: string; como_resolver: string }> = {
  "payment-amount-changed": {
    motivo: "O valor do boleto mudou para {totalAmount} (juros/multa até o pagamento)",
    como_resolver:
      "Volte o título ao preparo, atualize o valor para o total atualizado do boleto e monte um borderô novo",
  },
  "payment-due-date-expired": {
    motivo: "Boleto vencido — o banco não aceita pagamento nesta data",
    como_resolver: "Peça a segunda via ao fornecedor e substitua a linha digitável antes de reenviar",
  },
  "bank-slip-expired": {
    motivo: "Boleto fora do prazo de pagamento",
    como_resolver: "Solicite a segunda via ao fornecedor e reenvie com a nova linha digitável",
  },
  "bank-slip-already-paid": {
    motivo: "Boleto já estava pago",
    como_resolver: "Confirme no extrato e dê baixa manual — não reenvie, seria pagamento em duplicidade",
  },
  "insufficient-funds": {
    motivo: "Saldo insuficiente na conta no momento do pagamento",
    como_resolver: "Confirme o saldo da conta e reenvie o borderô com a nova data",
  },
  "invalid-account": {
    motivo: "Conta do favorecido inválida",
    como_resolver: "Corrija banco, agência e conta no preparo do pagamento e monte um borderô novo",
  },
  "invalid-digitable-line": {
    motivo: "Linha digitável inválida",
    como_resolver: "Confira a linha digitável (ou o código de barras) e reenvie",
  },
  "invalid-pix-key": {
    motivo: "Chave Pix inválida ou não encontrada",
    como_resolver: "Confirme a chave Pix com o favorecido e corrija no preparo do pagamento",
  },
  "payment-out-of-time-limit": {
    motivo: "Fora do horário-limite do banco para este tipo de pagamento",
    como_resolver: "Reenvie o borderô com data do próximo dia útil, dentro do horário",
  },
  "out-of-time-limit": {
    motivo: "Fora do horário-limite do banco",
    como_resolver: "Reenvie com data do próximo dia útil, respeitando o horário-limite",
  },
  "payment-not-authorized": {
    motivo: "O master não autorizou o lote no aplicativo do BTG",
    como_resolver: "Peça ao master para autorizar no app do BTG, ou refaça o borderô se o lote expirou",
  },
  "taxid-mismatch": {
    motivo: "CNPJ/CPF do favorecido não corresponde ao do boleto",
    como_resolver: "Confira o documento do favorecido no cadastro e no boleto antes de reenviar",
  },
  "duplicated-payment": {
    motivo: "Pagamento duplicado — o banco já tinha este mesmo pagamento",
    como_resolver: "Verifique no extrato se já saiu; se saiu, dê baixa manual em vez de reenviar",
  },
};

/** "payment-amount-changed" → "Payment amount changed". Último recurso. */
function humanizar(codigo: string): string {
  const texto = codigo.replace(/[_.-]+/g, " ").trim().toLowerCase();
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

const moeda = (v: string) => {
  const n = Number(String(v).replace(",", "."));
  if (!Number.isFinite(n)) return v;
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);
};

/** Substitui {chave} pelos arguments do erro, formatando valores como moeda. */
function interpolar(texto: string, args: Record<string, unknown>): string {
  return texto.replace(/\{(\w+)\}/g, (_m, chave) => {
    const bruto = args[chave];
    if (bruto == null) return "";
    return /amount|value|valor/i.test(chave) ? moeda(String(bruto)) : String(bruto);
  }).replace(/\s{2,}/g, " ").trim();
}

/** Um erro do array `errors` do BTG traduzido. */
export function traduzirErroBtg(erro: Record<string, unknown>): RecusaBtg | null {
  const codigo = String(erro.code ?? erro.codigo ?? "").trim();
  const args = (erro.arguments ?? erro.args ?? {}) as Record<string, unknown>;
  const livre = String(erro.message ?? erro.description ?? "").trim();

  if (!codigo) return livre ? { codigo: null, motivo: livre.slice(0, 300) } : null;

  const conhecido = CATALOGO[codigo.toLowerCase()];
  if (conhecido) {
    return {
      codigo,
      motivo: interpolar(conhecido.motivo, args),
      como_resolver: conhecido.como_resolver,
    };
  }

  // Desconhecido: mostra o que dá para mostrar, sem inventar solução.
  const extras = Object.entries(args)
    .map(([k, v]) => `${k}: ${/amount|value|valor/i.test(k) ? moeda(String(v)) : String(v)}`)
    .join(", ");
  return {
    codigo,
    motivo: livre || (extras ? `${humanizar(codigo)} (${extras})` : humanizar(codigo)),
  };
}

/**
 * Lê a recusa do payload do pagamento, na ordem em que o BTG é confiável:
 * `errors[]` (estruturado, é o que ele realmente manda) e só depois os campos
 * de texto livre.
 *
 * `description` NÃO entra na varredura de texto livre: no BTG ele é a descrição
 * do próprio pagamento. Estava lá antes e produzia motivos absurdos — um salário
 * recusado aparecia com motivo "Salario 2026 07".
 */
export function lerRecusaBtg(pay: Record<string, unknown> | null | undefined): RecusaBtg | null {
  if (!pay) return null;

  const brutos = (pay.errors ?? pay.error ?? pay.validationErrors ?? null) as unknown;
  const lista: Record<string, unknown>[] = Array.isArray(brutos)
    ? brutos as Record<string, unknown>[]
    : brutos && typeof brutos === "object" ? [brutos as Record<string, unknown>] : [];

  const traduzidos = lista.map(traduzirErroBtg).filter(Boolean) as RecusaBtg[];
  if (traduzidos.length > 0) {
    const primeiro = traduzidos[0];
    if (traduzidos.length === 1) return primeiro;
    return {
      codigo: traduzidos.map((t) => t.codigo).filter(Boolean).join(", ") || null,
      motivo: traduzidos.map((t) => t.motivo).join(" · ").slice(0, 300),
      como_resolver: primeiro.como_resolver,
    };
  }

  const status = String(pay.status ?? "").toUpperCase();
  const candidatos = [
    pay.errorMessage, pay.error_message, pay.reason, pay.statusReason,
    pay.rejectionReason, pay.failureReason, pay.statusDescription, pay.detailMessage,
    pay.message,
  ];
  for (const c of candidatos) {
    const s = String(c ?? "").trim();
    if (s.length > 2 && s.toUpperCase() !== status) {
      return { codigo: null, motivo: s.slice(0, 300) };
    }
  }
  return null;
}
