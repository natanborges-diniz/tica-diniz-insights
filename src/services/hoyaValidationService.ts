// src/services/hoyaValidationService.ts
// Validação de payload clínico para pedidos Hoya
// Usa ProductRequirements derivado dos dados do catálogo para determinar campos obrigatórios

import { HoyaPedidoPayload, HoyaPrescricaoOlho } from "./hoyaService";
import { OsHubRecord } from "./osHubService";
import { ProductRequirements, getDefaultRequirements } from "./hoyaProductRequirements";

export interface ValidationError {
  field: string;
  message: string;
  severity: "error" | "warning";
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
}

/**
 * Campos obrigatórios mínimos para envio de pedido Hoya
 */
function validatePrescricaoOlho(
  olho: HoyaPrescricaoOlho,
  label: string,
  requirements: ProductRequirements,
): ValidationError[] {
  const errors: ValidationError[] = [];

  if (olho.esferico === null && olho.cilindrico === null) {
    errors.push({
      field: `prescricao.${label}`,
      message: `${label}: Esférico ou Cilíndrico obrigatório`,
      severity: "error",
    });
  }

  if (olho.cilindrico !== null && olho.cilindrico !== 0 && olho.eixo === null) {
    errors.push({
      field: `prescricao.${label}.eixo`,
      message: `${label}: Eixo obrigatório quando há cilíndrico`,
      severity: "error",
    });
  }

  // DNP obrigatório apenas quando o produto exige (derivado dos ranges do catálogo)
  if (requirements.needsDnp && olho.dnpLonge === null) {
    errors.push({
      field: `prescricao.${label}.dnpLonge`,
      message: `${label}: DNP obrigatório para este produto`,
      severity: "error",
    });
  }

  return errors;
}

/**
 * @deprecated Use getProductRequirements() do hoyaProductRequirements.ts
 * Mantido temporariamente para compatibilidade com código legado.
 */
export function isSurfacada(nomeProduto: string, tipoLente?: string): boolean {
  const isSV = tipoLente
    ? tipoLente === "Visao Simples"
    : /\bSV\b/i.test(nomeProduto);
  if (!isSV) return true;
  return /\bDG\b/i.test(nomeProduto);
}

export function validateHoyaPayload(
  payload: HoyaPedidoPayload,
  produtoCamposComplementares?: { codigo: number; nome: string; obrigatorio: boolean; rangeMinimo: number; rangeMaximo: number; valorPadrao?: number | string | null }[],
  camposValues?: Record<number, string>,
  produtoRanges?: { alturaPupilarMinima: number; alturaPupilarMaxima: number; esfericoMinimo: number; esfericoMaximo: number; cilindricoMinimo: number; cilindricoMaximo: number; adicaoMinima: number; adicaoMaxima: number },
  nomeProduto?: string,
  /** Requisitos derivados do catálogo — se fornecido, ignora nomeProduto/isSurfacada */
  requirements?: ProductRequirements,
): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  // Usa requirements do catálogo se disponível; fallback para heurística de nome; default = mais restritivo
  const reqs: ProductRequirements = requirements
    ?? (produtoRanges
      ? deriveRequirementsFromRanges(produtoRanges)
      : getDefaultRequirements());

  // OS number
  if (!payload.os || payload.os === "0") {
    errors.push({ field: "os", message: "Número da OS obrigatório", severity: "error" });
  }

  // Product
  if (!payload.especificacoes?.codigoProduto) {
    errors.push({ field: "especificacoes.codigoProduto", message: "Produto Hoya não selecionado", severity: "error" });
  }

  // Prescription — DNP obrigatório conforme requisitos do produto
  errors.push(...validatePrescricaoOlho(payload.prescricao.direito, "OD", reqs));
  errors.push(...validatePrescricaoOlho(payload.prescricao.esquerdo, "OE", reqs));

  // Adicao warning
  if (reqs.needsAdicao && payload.prescricao.direito.adicao === null && payload.prescricao.esquerdo.adicao === null) {
    warnings.push({
      field: "prescricao.adicao",
      message: "Sem adição — verifique se é lente monofocal",
      severity: "warning",
    });
  }

  // Altura pupilar e medidas de armação — conforme requisitos do produto
  if (reqs.needsAlturaPupilar) {
    if (payload.prescricao.direito.alturaPupilar === null && payload.prescricao.esquerdo.alturaPupilar === null) {
      warnings.push({
        field: "prescricao.alturaPupilar",
        message: "Sem altura pupilar — recomendado para este produto",
        severity: "warning",
      });
    } else if (reqs.alturaPupilarRange) {
      const { min: apMin, max: apMax } = reqs.alturaPupilarRange;
      if (payload.prescricao.direito.alturaPupilar != null) {
        if (payload.prescricao.direito.alturaPupilar < apMin || payload.prescricao.direito.alturaPupilar > apMax) {
          errors.push({
            field: "prescricao.direito.alturaPupilar",
            message: `OD: Altura pupilar (${payload.prescricao.direito.alturaPupilar}) fora do range do produto (${apMin}–${apMax})`,
            severity: "error",
          });
        }
      }
      if (payload.prescricao.esquerdo.alturaPupilar != null) {
        if (payload.prescricao.esquerdo.alturaPupilar < apMin || payload.prescricao.esquerdo.alturaPupilar > apMax) {
          errors.push({
            field: "prescricao.esquerdo.alturaPupilar",
            message: `OE: Altura pupilar (${payload.prescricao.esquerdo.alturaPupilar}) fora do range do produto (${apMin}–${apMax})`,
            severity: "error",
          });
        }
      }
    }
  }

  // Frame measurements — only when product requires
  if (reqs.needsDadosArmacao) {
    if (payload.dadosMedida?.larguraLente == null) {
      warnings.push({ field: "dadosMedida.larguraLente", message: "Largura da lente não informada", severity: "warning" });
    }
    if (payload.dadosMedida?.alturaLente == null) {
      errors.push({ field: "dadosMedida.alturaLente", message: "Altura da lente obrigatória (18–52mm)", severity: "error" });
    } else if (payload.dadosMedida.alturaLente < 18 || payload.dadosMedida.alturaLente > 52) {
      errors.push({ field: "dadosMedida.alturaLente", message: "Altura da lente deve ser entre 18 e 52mm", severity: "error" });
    }
  }

  // Garantia
  if (!payload.garantia?.usuarioFinal) {
    warnings.push({ field: "garantia.usuarioFinal", message: "Nome do usuário final não informado (garantia)", severity: "warning" });
  }

  // F4.4: Campos complementares obrigatórios
  if (produtoCamposComplementares && camposValues) {
    for (const campo of produtoCamposComplementares) {
      if (campo.obrigatorio) {
        const val = camposValues[campo.codigo] ?? String(campo.valorPadrao ?? "");
        if (!val || val.trim() === "") {
          errors.push({
            field: `camposComplementares.${campo.codigo}`,
            message: `Campo complementar "${campo.nome}" é obrigatório`,
            severity: "error",
          });
          continue;
        }
        const numVal = Number(val);
        if (!isNaN(numVal) && (numVal < campo.rangeMinimo || numVal > campo.rangeMaximo)) {
          errors.push({
            field: `camposComplementares.${campo.codigo}`,
            message: `"${campo.nome}" deve estar entre ${campo.rangeMinimo} e ${campo.rangeMaximo}`,
            severity: "error",
          });
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Deriva ProductRequirements a partir de produtoRanges (backward compat).
 * Usado quando o caller ainda passa ranges soltos em vez do objeto ProductRequirements.
 */
function deriveRequirementsFromRanges(ranges: {
  alturaPupilarMinima: number;
  alturaPupilarMaxima: number;
  adicaoMinima: number;
  adicaoMaxima: number;
  [key: string]: number;
}): ProductRequirements {
  const hasAP = ranges.alturaPupilarMinima !== 0 || ranges.alturaPupilarMaxima !== 0;
  const hasAdicao = ranges.adicaoMinima !== 0 || ranges.adicaoMaxima !== 0;
  const isLentePronta = !hasAP;

  return {
    needsDnp: !isLentePronta,
    needsAlturaPupilar: hasAP,
    needsDadosArmacao: !isLentePronta,
    needsAdicao: hasAdicao,
    alturaPupilarRange: hasAP ? { min: ranges.alturaPupilarMinima, max: ranges.alturaPupilarMaxima } : null,
    adicaoRange: hasAdicao ? { min: ranges.adicaoMinima, max: ranges.adicaoMaxima } : null,
    tipoLabel: isLentePronta ? "Lente Pronta" : "Lente Surfaçada",
    isLentePronta,
  };
}

/**
 * Mapeia prismas da OS para o payload Hoya
 */
export function mapPrismasFromOs(os: OsHubRecord): {
  odPrismaH: number | null;
  odBasePRPrismaH: string | null;
  odPrismaV: number | null;
  odBasePRPrismaV: string | null;
  oePrismaH: number | null;
  oeBasePRPrismaH: string | null;
  oePrismaV: number | null;
  oeBasePRPrismaV: string | null;
} {
  const parsePrisma = (prismaStr: string | null): { valor: number | null; base: string | null } => {
    if (!prismaStr || prismaStr.trim() === "") return { valor: null, base: null };
    
    const parts = prismaStr.trim().split(/\s+/);
    const valor = parseFloat(parts[0]);
    if (isNaN(valor) || valor === 0) return { valor: null, base: null };
    
    const baseStr = parts.slice(1).join(" ").toUpperCase();
    let base: string | null = null;
    if (baseStr.includes("IN") || baseStr.includes("BI") || baseStr.includes("NASAL")) base = "IN";
    else if (baseStr.includes("OUT") || baseStr.includes("BO") || baseStr.includes("TEMPORAL")) base = "OUT";
    else if (baseStr.includes("UP") || baseStr.includes("BS") || baseStr.includes("SUPERIOR")) base = "UP";
    else if (baseStr.includes("DOWN") || baseStr.includes("BD") || baseStr.includes("INFERIOR")) base = "DOWN";
    
    return { valor, base };
  };

  const odPrisma = parsePrisma(os.prisma);
  const oePrisma = parsePrisma(os.prisma1);

  return {
    odPrismaH: odPrisma.valor,
    odBasePRPrismaH: odPrisma.base,
    odPrismaV: null,
    odBasePRPrismaV: null,
    oePrismaH: oePrisma.valor,
    oeBasePRPrismaH: oePrisma.base,
    oePrismaV: null,
    oeBasePRPrismaV: null,
  };
}
