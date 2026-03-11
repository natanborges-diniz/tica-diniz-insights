// src/services/zeissValidation.ts
// Payload validation for Zeiss orders — clinical ranges and mandatory fields

export interface ValidationError {
  field: string;
  message: string;
  severity: "error" | "warning";
}

interface PrescFields {
  esferico: string;
  cilindrico: string;
  eixo: string;
  adicao: string;
  dnp: string;
  alturaMontagem: string;
  prisma: string;
  eixoPrisma: string;
}

interface ArmacaoFields {
  modelo: string;
  ponte: string;
  altura: string;
  largura: string;
  diagonalMaior: string;
  tipo: string;
}

/**
 * Detecta se o produto é Lente Pronta (código começa com "LP").
 * Lentes prontas não exigem medidas de armação.
 */
export function isLentePronta(produtoCod: string | null | undefined, produtoNome?: string | null): boolean {
  if (produtoCod && produtoCod.toUpperCase().startsWith("LP")) return true;
  if (produtoNome && produtoNome.toUpperCase().startsWith("LP")) return true;
  return false;
}

export function validateZeissPayload(
  produtoOdCod: string | null,
  produtoOeCod: string | null,
  prescOd: PrescFields,
  prescOe: PrescFields,
  armacao: ArmacaoFields,
  osNumero: string,
  paciente: string,
  produtoOdNome?: string | null,
  produtoOeNome?: string | null,
): ValidationError[] {
  const errors: ValidationError[] = [];

  // ── Mandatory fields ──
  if (!osNumero.trim()) errors.push({ field: "osNumero", message: "Número da OS é obrigatório", severity: "error" });
  if (!paciente.trim()) errors.push({ field: "paciente", message: "Nome do paciente é obrigatório", severity: "error" });
  if (!produtoOdCod) errors.push({ field: "produtoOd", message: "Produto OD é obrigatório", severity: "error" });

  // ── Prescription validation per eye ──
  const validateEye = (presc: PrescFields, eye: "OD" | "OE") => {
    const esf = parseFloat(presc.esferico);
    const cil = parseFloat(presc.cilindrico);
    const eixo = parseInt(presc.eixo);
    const adicao = parseFloat(presc.adicao);
    const dnp = parseFloat(presc.dnp);
    const altura = parseFloat(presc.alturaMontagem);

    if (presc.esferico.trim() && !isNaN(esf)) {
      if (esf < -30 || esf > 30) errors.push({ field: `presc${eye}.esferico`, message: `${eye}: Esférico fora do range (-30 a +30)`, severity: "error" });
    }
    if (presc.cilindrico.trim() && !isNaN(cil)) {
      if (cil < -10 || cil > 10) errors.push({ field: `presc${eye}.cilindrico`, message: `${eye}: Cilíndrico fora do range (-10 a +10)`, severity: "error" });
      if (cil !== 0 && (!presc.eixo.trim() || isNaN(eixo))) {
        errors.push({ field: `presc${eye}.eixo`, message: `${eye}: Eixo obrigatório quando cilíndrico ≠ 0`, severity: "error" });
      }
    }
    if (presc.eixo.trim() && !isNaN(eixo)) {
      if (eixo < 0 || eixo > 180) errors.push({ field: `presc${eye}.eixo`, message: `${eye}: Eixo deve ser entre 0° e 180°`, severity: "error" });
    }
    if (presc.adicao.trim() && !isNaN(adicao)) {
      if (adicao < 0.5 || adicao > 4.0) errors.push({ field: `presc${eye}.adicao`, message: `${eye}: Adição fora do range (0.50 a 4.00)`, severity: "warning" });
    }
    if (presc.dnp.trim() && !isNaN(dnp)) {
      if (dnp < 20 || dnp > 45) errors.push({ field: `presc${eye}.dnp`, message: `${eye}: DNP fora do range usual (20 a 45mm)`, severity: "warning" });
    }
    if (presc.alturaMontagem.trim() && !isNaN(altura)) {
      if (altura < 8 || altura > 50) errors.push({ field: `presc${eye}.altura`, message: `${eye}: Altura de montagem fora do range (8 a 50mm)`, severity: "warning" });
    }
    if (presc.prisma.trim() && parseFloat(presc.prisma) !== 0) {
      if (!presc.eixoPrisma.trim()) {
        errors.push({ field: `presc${eye}.eixoPrisma`, message: `${eye}: Eixo do prisma obrigatório quando prisma ≠ 0`, severity: "error" });
      }
    }
  };

  if (prescOd.esferico || prescOd.cilindrico) validateEye(prescOd, "OD");
  if (prescOe.esferico || prescOe.cilindrico) validateEye(prescOe, "OE");

  // ── Frame validation ──
  // Lente Pronta (LP) não exige medidas de armação — serão enviadas como "0"
  const todosLP = isLentePronta(produtoOdCod, produtoOdNome)
    && (!produtoOeCod || isLentePronta(produtoOeCod, produtoOeNome));

  if (!todosLP) {
    // Produto surfaçado: armação obrigatória
    if (!armacao.tipo) errors.push({ field: "armacao.tipo", message: "Tipo de armação é obrigatório", severity: "error" });

    const hasMedidas = (armacao.ponte && armacao.ponte !== "0")
      || (armacao.altura && armacao.altura !== "0")
      || (armacao.largura && armacao.largura !== "0")
      || (armacao.diagonalMaior && armacao.diagonalMaior !== "0");

    if (!hasMedidas) {
      errors.push({ field: "armacao.medidas", message: "Medidas da armação obrigatórias para lente surfaçada (ponte, altura, largura ou diagonal)", severity: "error" });
    }

    const ponte = parseFloat(armacao.ponte);
    if (armacao.ponte && !isNaN(ponte) && ponte !== 0 && (ponte < 10 || ponte > 30)) {
      errors.push({ field: "armacao.ponte", message: "Ponte fora do range (10 a 30mm)", severity: "warning" });
    }

    const largura = parseFloat(armacao.largura);
    if (armacao.largura && !isNaN(largura) && largura !== 0 && (largura < 30 || largura > 70)) {
      errors.push({ field: "armacao.largura", message: "Largura fora do range (30 a 70mm)", severity: "warning" });
    }

    const alturaArm = parseFloat(armacao.altura);
    if (armacao.altura && !isNaN(alturaArm) && alturaArm !== 0 && (alturaArm < 15 || alturaArm > 55)) {
      errors.push({ field: "armacao.altura", message: "Altura fora do range (15 a 55mm)", severity: "warning" });
    }
  }
  // Para LP: aceita campos vazios silenciosamente — payload usará "0"

  return errors;
}

// Check if there are any blocking errors (not warnings)
export function hasBlockingErrors(errors: ValidationError[]): boolean {
  return errors.some(e => e.severity === "error");
}
