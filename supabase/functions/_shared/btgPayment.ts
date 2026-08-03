// Construtor único de payloads da API de Pagamentos do BTG Empresas.
//
// Fonte: developers.empresas.btgpactual.com
//   - reference/post_companyid-banking-payments  (schema BankSlipPaymentBatch)
//   - reference/pagamentos-1                     (ficha técnica: idempotência,
//                                                 erros, máquina de estados)
//
// Pontos do contrato que já nos custaram 500 genérico (`unmapped-error`):
//   1. O corpo é `{ items: [ ... ] }` — 1 item por requisição.
//   2. O campo é `detail`, no SINGULAR (usávamos `details`).
//   3. `amount`, `debitParty` e `paymentDate` são obrigatórios em todo item.
//   4. `scheduledDate` NÃO existe na entrada — só nos webhooks de saída.
//      O agendamento vai em `paymentDate`.
//   5. Itens de um lote entram por POST /banking/payments com `batchId` no
//      corpo do item. Não existe rota .../batch-payments/{id}/payments.
//
// Módulo puro — testado em src/lib/financeiro/__tests__/btgPayment.test.ts.

import { paraLinhaDigitavel } from "./boleto.ts";

export type BtgPaymentType =
  | "PIX_KEY"
  | "PIX_QR_CODE"
  | "PIX_MANUAL"
  | "TED"
  | "BANKSLIP"
  | "UTILITIES"
  | "DARF"
  | "PIX_REVERSAL";

export const TIPOS_BTG: BtgPaymentType[] = [
  "PIX_KEY",
  "PIX_QR_CODE",
  "PIX_MANUAL",
  "TED",
  "BANKSLIP",
  "UTILITIES",
  "DARF",
  "PIX_REVERSAL",
];

export interface DebitParty {
  /** Agência da conta debitada. A doc do BTG instrui usar "50". */
  branchCode: string;
  /** Número da conta debitada. */
  number: string;
}

export interface MontarItemArgs {
  tipo: string;
  /** Valor da transação. Deve ser numérico e > 0. */
  valor: number;
  /** Campos crus do nosso banco (dados_extras / dados_pagamento). */
  dados: Record<string, unknown>;
  debitParty: DebitParty;
  /** yyyy-MM-dd. Obrigatório pela API. */
  paymentDate: string;
  /** Id do lote, quando o item faz parte de um borderô. */
  batchId?: string | null;
  /** Nosso id do lançamento — volta em todos os webhooks. */
  externalId?: string | null;
  /** Visível ao favorecido, no comprovante. Máx. 140 alfanuméricos. */
  descricao?: string | null;
  /** Só nos eventos internos, não sai no comprovante. */
  descricaoInterna?: string | null;
}

// ─── Helpers ─────────────────────────────────────────────────

export function somenteDigitos(s: unknown): string {
  return String(s ?? "").replace(/\D/g, "");
}

function primeiro(dados: Record<string, unknown>, ...chaves: string[]): string {
  for (const k of chaves) {
    const v = dados[k];
    if (v !== undefined && v !== null && String(v).trim() !== "") return String(v).trim();
  }
  return "";
}

/**
 * `invalid-json-schema-field-description`: máximo 140 caracteres, apenas
 * letras, números e espaços. Acento, hífen ou barra derrubam o item inteiro.
 */
export function sanitizarDescricao(raw: unknown, max = 140): string {
  return String(raw ?? "")
    .normalize("NFD")
    // deno-lint-ignore no-misleading-character-class
    .replace(/[\u0300-\u036f]/g, "") // remove diacríticos: "Borderô" → "Bordero"
    .replace(/[^A-Za-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

/**
 * `invalid-json-schema-field-tax-id`: numérico, 11 dígitos (CPF) ou 14 (CNPJ).
 */
export function normalizarTaxId(raw: unknown, campo = "taxId"): string {
  const d = somenteDigitos(raw);
  if (d.length !== 11 && d.length !== 14) {
    throw new Error(`${campo} inválido — esperado CPF (11) ou CNPJ (14 dígitos), recebido ${d.length}`);
  }
  return d;
}

/** Tipos de conta aceitos: CC (corrente), PG (pagamento), PP (poupança). */
export function normalizarTipoConta(raw: unknown): "CC" | "PG" | "PP" {
  const v = String(raw ?? "").trim().toUpperCase();
  if (v === "CC" || v === "PG" || v === "PP") return v;
  if (["CHECKING", "CORRENTE", "CONTA_CORRENTE", "C"].includes(v)) return "CC";
  if (["SAVINGS", "POUPANCA", "POUPANÇA", "P"].includes(v)) return "PP";
  if (["PAYMENT", "PAGAMENTO"].includes(v)) return "PG";
  if (v === "") return "CC";
  throw new Error(`Tipo de conta "${raw}" não suportado — use CC, PG ou PP`);
}

/** Dígitos verificadores de CPF — usado para desambiguar chave de 11 dígitos. */
function cpfValido(d: string): boolean {
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const dv = (base: string, peso: number) => {
    let soma = 0;
    for (let i = 0; i < base.length; i++) soma += Number(base[i]) * (peso - i);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(d.slice(0, 9), 10) === Number(d[9]) && dv(d.slice(0, 10), 11) === Number(d[10]);
}

/**
 * Chave pix de celular precisa vir como "+5511911112222" (regra explícita na
 * doc). As demais (CPF/CNPJ, e-mail, EVP) passam como estão.
 *
 * `pix-key-type-not-supported` (03/08/2026): celular de 11 dígitos cadastrado
 * sem DDI ("11956079224") era enviado cru e o BTG tentava lê-lo como CPF.
 * Desambiguamos pelos dígitos verificadores: 11 dígitos que não formam CPF
 * válido e casam com celular BR (DDD 11-99 + nono dígito 9) vão como telefone.
 */
export function normalizarChavePix(raw: unknown): string {
  const v = String(raw ?? "").trim();
  if (v === "") throw new Error("Chave pix vazia");
  if (v.includes("@")) return v; // e-mail
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(v)) return v; // EVP (uuid)
  const d = somenteDigitos(v);
  if (v.startsWith("+")) return `+${d.length === 11 ? `55${d}` : d}`;
  if (d.length === 11) {
    if (cpfValido(d)) return d;
    if (/^[1-9][1-9]9\d{8}$/.test(d)) return `+55${d}`;
    throw new Error(
      `Chave pix "${v}" não reconhecida — 11 dígitos que não são CPF válido nem celular; ` +
      `cadastre com DDI (+55) se for telefone`,
    );
  }
  if (d.length === 14) return d; // CNPJ
  if (d.length === 10 || d.length === 13) return `+${d.length === 13 ? d : `55${d}`}`;
  return v;
}


/**
 * Chave de idempotência determinística (UUID v5-like sobre SHA-256).
 *
 * A doc recomenda um uuid por requisição, armazenado do nosso lado: repetindo
 * a mesma chave em até 24 h o BTG devolve a resposta original em vez de
 * duplicar a operação.
 *
 * Derivamos de `${batchId}:${lancamentoId}` de propósito: um duplo-clique no
 * mesmo envio reaproveita a chave (não duplica), enquanto um reenvio depois de
 * corrigir os dados abre um lote novo — batchId novo, chave nova, requisição
 * de fato reprocessada.
 */
export async function chaveIdempotencia(...partes: string[]): Promise<string> {
  const seed = partes.join(":");
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(seed));
  const b = new Uint8Array(buf);
  b[6] = (b[6] & 0x0f) | 0x50; // versão 5
  b[8] = (b[8] & 0x3f) | 0x80; // variante RFC 4122
  const hex = Array.from(b.slice(0, 16), (x) => x.toString(16).padStart(2, "0")).join("");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-");
}

// ─── detail por tipo ─────────────────────────────────────────

function creditPartyPix(dados: Record<string, unknown>): Record<string, unknown> | null {
  const nome = primeiro(dados, "nome", "beneficiario", "holderName", "creditPartyName");
  const doc = primeiro(dados, "documento", "cpf_cnpj", "taxId", "holderTaxId");
  if (!nome || !doc) return null;
  return { name: nome, taxId: normalizarTaxId(doc, "creditParty.taxId") };
}

function creditPartyConta(dados: Record<string, unknown>): Record<string, unknown> {
  const nome = primeiro(dados, "nome", "beneficiario", "holderName", "creditPartyName");
  const doc = primeiro(dados, "documento", "cpf_cnpj", "taxId", "holderTaxId");
  const bankCode = primeiro(dados, "banco", "bankCode", "codigo_banco");
  const branch = primeiro(dados, "agencia", "branch", "branchCode");
  const number = primeiro(dados, "conta", "number", "account", "accountNumber", "numero_conta");

  if (!nome) throw new Error("Nome do beneficiário é obrigatório (creditParty.name)");
  if (!bankCode) throw new Error("Código do banco é obrigatório (creditParty.account.bankCode)");
  if (!branch) throw new Error("Agência é obrigatória (creditParty.account.branch)");
  if (!number) throw new Error("Número da conta é obrigatório (creditParty.account.number)");

  return {
    taxId: normalizarTaxId(doc, "creditParty.taxId"),
    name: nome,
    account: {
      // `invalid-json-schema-field-bank-code`: numérico de três dígitos.
      type: normalizarTipoConta(primeiro(dados, "tipo_conta", "accountType", "type")),
      number: somenteDigitos(number),
      branch: somenteDigitos(branch),
      bankCode: somenteDigitos(bankCode).padStart(3, "0"),
    },
  };
}

/**
 * Monta o objeto `detail` conforme o tipo de pagamento.
 * Lança com mensagem legível quando falta dado — melhor barrar aqui do que
 * receber um 500 opaco do banco.
 */
export function montarDetail(tipo: string, dados: Record<string, unknown>): Record<string, unknown> {
  switch (tipo) {
    case "PIX_KEY": {
      const detail: Record<string, unknown> = {
        key: { value: normalizarChavePix(primeiro(dados, "chave_pix", "pixKey", "key")) },
      };
      const cp = creditPartyPix(dados);
      if (cp) detail.creditParty = cp;
      return detail;
    }

    case "PIX_QR_CODE": {
      const emv = primeiro(dados, "emv", "qr_code", "copia_e_cola");
      if (!emv) throw new Error("Emv (copia e cola) é obrigatório para PIX_QR_CODE");
      const detail: Record<string, unknown> = { emv };
      const cp = creditPartyPix(dados);
      if (cp) detail.creditParty = cp;
      return detail;
    }

    case "TED":
    case "PIX_MANUAL":
      return { creditParty: creditPartyConta(dados) };

    case "BANKSLIP": {
      // BANKSLIP exige `digitableLine` (47/48 dígitos) e NÃO aceita linha
      // iniciada em 8 — essa é arrecadação, vai como UTILITIES.
      const linha = paraLinhaDigitavel(
        primeiro(dados, "linha_digitavel", "digitableLine", "codigo_barras", "barcode"),
      );
      if (linha[0] === "8") {
        throw new Error("Linha iniciada em 8 é arrecadação — use o tipo UTILITIES");
      }
      return { digitableLine: linha };
    }

    case "UTILITIES": {
      // Arrecadação: digitableLine (48) ou barcode (44).
      const cod = paraLinhaDigitavel(
        primeiro(dados, "linha_digitavel", "digitableLine", "codigo_barras", "barcode"),
      );
      return cod.length === 44 ? { barcode: cod } : { digitableLine: cod };
    }

    case "DARF": {
      const principal = Number(primeiro(dados, "valor_principal", "principalAmount") || 0);
      if (!(principal > 0)) throw new Error("principalAmount é obrigatório e deve ser > 0 no DARF");
      const detail: Record<string, unknown> = {
        taxPayer: {
          id: normalizarTaxId(primeiro(dados, "cnpj", "cpf", "documento", "taxId"), "taxPayer.id"),
          name: primeiro(dados, "nome", "razao_social", "taxPayerName", "name"),
        },
        // `invalid-json-schema-field-treasury-revenue-code`: 4 dígitos.
        treasuryRevenueCode: somenteDigitos(
          primeiro(dados, "codigo_receita", "treasuryRevenueCode", "revenueCode"),
        ).padStart(4, "0"),
        principalAmount: principal,
        expireDate: primeiro(dados, "data_vencimento", "expireDate", "dueDate"),
        baselinePeriodDate: primeiro(dados, "periodo_apuracao", "baselinePeriodDate", "referenceDate"),
      };
      const multa = Number(primeiro(dados, "multa", "fineAmount") || 0);
      const juros = Number(primeiro(dados, "juros", "feeAmount") || 0);
      if (multa > 0) detail.fineAmount = multa;
      if (juros > 0) detail.feeAmount = juros;
      const ref = primeiro(dados, "numero_referencia", "referenceNumber");
      if (ref) detail.referenceNumber = ref;
      return detail;
    }

    case "PIX_REVERSAL": {
      const e2e = primeiro(dados, "originalEndToEndId", "end_to_end_id", "endToEndId");
      if (!e2e) throw new Error("originalEndToEndId é obrigatório para PIX_REVERSAL");
      return { originalEndToEndId: e2e };
    }

    default:
      throw new Error(
        `Tipo de pagamento "${tipo}" não suportado — válidos: ${TIPOS_BTG.join(", ")}`,
      );
  }
}

// ─── item completo ───────────────────────────────────────────

/**
 * Monta um item de `POST /{companyId}/banking/payments`.
 *
 * Sem `batchId` o pagamento é avulso e precisa de
 * `agreementId: "INDIVIDUAL_APPROVE"`; com `batchId` ele entra no lote aberto.
 */
export function montarItem(args: MontarItemArgs): Record<string, unknown> {
  const { tipo, valor, dados, debitParty, paymentDate, batchId, externalId } = args;

  if (!TIPOS_BTG.includes(tipo as BtgPaymentType)) {
    throw new Error(`Tipo de pagamento "${tipo}" não suportado — válidos: ${TIPOS_BTG.join(", ")}`);
  }
  if (!(Number(valor) > 0)) {
    throw new Error(`Valor inválido (${valor}) — deve ser numérico e maior que 0`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(paymentDate))) {
    throw new Error(`paymentDate inválida ("${paymentDate}") — formato esperado yyyy-MM-dd`);
  }
  if (!debitParty?.number) {
    throw new Error("Conta de débito não configurada (debitParty.number)");
  }

  const item: Record<string, unknown> = {
    type: tipo,
    detail: montarDetail(tipo, dados),
    amount: Number(valor),
    paymentDate: String(paymentDate),
    debitParty: {
      branchCode: somenteDigitos(debitParty.branchCode) || "50",
      number: somenteDigitos(debitParty.number),
    },
  };

  if (batchId) item.batchId = batchId;
  else item.agreementId = "INDIVIDUAL_APPROVE";

  const desc = sanitizarDescricao(args.descricao);
  if (desc) item.description = desc;

  const interna = sanitizarDescricao(args.descricaoInterna);
  if (interna) item.internalDescription = interna;

  // `tags.externalId` volta em todos os webhooks — é a nossa âncora de
  // conciliação, já que o 201 devolve batchId/contractGuid e não paymentId.
  if (externalId) item.tags = { externalId: String(externalId) };

  return item;
}

/** Corpo completo da requisição: a API aceita 1 pagamento por chamada. */
export function montarCorpo(item: Record<string, unknown>): { items: Record<string, unknown>[] } {
  return { items: [item] };
}

/**
 * Extrai a mensagem útil da resposta de erro do BTG.
 * O corpo é `{ data: {...} }` ou `{ data: [ {...} ] }`, com `errors[].code` e
 * `errors[].detail`.
 */
export function descreverErroBtg(corpo: unknown): string {
  try {
    const raiz = (corpo as Record<string, unknown>)?.data ?? corpo;
    const alvo = Array.isArray(raiz) ? raiz[0] : raiz;
    const errors = (alvo as Record<string, unknown>)?.errors;
    if (Array.isArray(errors) && errors.length > 0) {
      return errors
        .map((e: Record<string, unknown>) => {
          const code = String(e.code ?? "").split(":").pop() ?? "";
          const detail = String(e.detail ?? "").trim();
          return detail ? `${detail}${code ? ` (${code})` : ""}` : code;
        })
        .filter(Boolean)
        .join(" | ");
    }
  } catch { /* corpo fora do formato esperado */ }
  return typeof corpo === "string" ? corpo : JSON.stringify(corpo ?? {});
}
