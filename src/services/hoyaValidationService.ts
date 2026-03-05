// src/services/hoyaValidationService.ts
// Validação de payload clínico para pedidos Hoya
// Lentes prontas (sem "DG" no nome) não exigem medidas de armação, DNP ou altura pupilar

import { HoyaPedidoPayload, HoyaPrescricaoOlho } from "./hoyaService";
import { OsHubRecord } from "./osHubService";

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
  isSurfacada: boolean,
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

  // DNP só é obrigatório para lentes surfaçadas (DG)
  if (isSurfacada && olho.dnpLonge === null) {
    errors.push({
      field: `prescricao.${label}.dnpLonge`,
      message: `${label}: DNP obrigatório para lentes surfaçadas`,
      severity: "error",
    });
  }

  return errors;
}

/**
 * Detecta se o produto é surfaçado (DG) com base no nome.
 * Produtos com "DG" no nome são surfaçados e exigem medidas de armação, DNP, etc.
 * Produtos sem "DG" são lentes prontas e só precisam de receita.
 */
export function isSurfacada(nomeProduto: string): boolean {
  return /\bDG\b/i.test(nomeProduto);
}

export function validateHoyaPayload(
  payload: HoyaPedidoPayload,
  produtoCamposComplementares?: { codigo: number; nome: string; obrigatorio: boolean; rangeMinimo: number; rangeMaximo: number; valorPadrao?: number | string | null }[],
  camposValues?: Record<number, string>,
  produtoRanges?: { alturaPupilarMinima: number; alturaPupilarMaxima: number; esfericoMinimo: number; esfericoMaximo: number; cilindricoMinimo: number; cilindricoMaximo: number; adicaoMinima: number; adicaoMaxima: number },
  nomeProduto?: string,
): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  // Detecta se é surfaçada (DG) — se não informado, assume surfaçada por segurança
  const surfacada = nomeProduto ? isSurfacada(nomeProduto) : true;

  // OS number
  if (!payload.os || payload.os === "0") {
    errors.push({ field: "os", message: "Número da OS obrigatório", severity: "error" });
  }

  // Product
  if (!payload.especificacoes?.codigoProduto) {
    errors.push({ field: "especificacoes.codigoProduto", message: "Produto Hoya não selecionado", severity: "error" });
  }

  // Prescription — DNP obrigatório apenas para surfaçadas
  errors.push(...validatePrescricaoOlho(payload.prescricao.direito, "OD", surfacada));
  errors.push(...validatePrescricaoOlho(payload.prescricao.esquerdo, "OE", surfacada));

  // Adicao for progressive lenses (warning)
  if (payload.prescricao.direito.adicao === null && payload.prescricao.esquerdo.adicao === null) {
    warnings.push({
      field: "prescricao.adicao",
      message: "Sem adição — verifique se é lente monofocal",
      severity: "warning",
    });
  }

  // Altura pupilar e medidas de armação — só obrigatórios para surfaçadas (DG)
  if (surfacada) {
    if (payload.prescricao.direito.alturaPupilar === null && payload.prescricao.esquerdo.alturaPupilar === null) {
      warnings.push({
        field: "prescricao.alturaPupilar",
        message: "Sem altura pupilar — recomendado para progressivas",
        severity: "warning",
      });
    } else if (produtoRanges) {
      const { alturaPupilarMinima: apMin, alturaPupilarMaxima: apMax } = produtoRanges;
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

    // Frame measurements
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
        // Use user value OR fall back to valorPadrao (matches payload builder logic)
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
  // prisma = OD prisma horizontal, prisma1 = OE prisma horizontal
  // Format from ERP: "0.50 BASE IN" or "1.00 BI" etc.
  const parsePrisma = (prismaStr: string | null): { valor: number | null; base: string | null } => {
    if (!prismaStr || prismaStr.trim() === "") return { valor: null, base: null };
    
    const parts = prismaStr.trim().split(/\s+/);
    const valor = parseFloat(parts[0]);
    if (isNaN(valor) || valor === 0) return { valor: null, base: null };
    
    // Try to extract base direction
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
    odPrismaV: null, // Vertical prisma not separately tracked in current ERP
    odBasePRPrismaV: null,
    oePrismaH: oePrisma.valor,
    oeBasePRPrismaH: oePrisma.base,
    oePrismaV: null,
    oeBasePRPrismaV: null,
  };
}
