import { describe, it, expect } from "vitest";
import { resolverPrescricaoOlho } from "../prescricaoResolver";

const base = {
  longeEsf: null, longeCil: null, longeEixo: null,
  pertoEsf: null, pertoCil: null, pertoEixo: null,
  adicao: null, dnp: null, altura: null,
};

describe("resolverPrescricaoOlho", () => {
  // Bug OS 96999: ERP devolvia perto/adição = 0 e Regra 3 inventava adição = -longe.
  it("não inventa adição quando perto e adição vêm zerados do ERP (OS 96999)", () => {
    const r = resolverPrescricaoOlho({
      ...base,
      longeEsf: -2, longeCil: 0, longeEixo: 0,
      pertoEsf: 0, pertoCil: 0, pertoEixo: 0,
      adicao: 0,
    });
    expect(r.adicao).toBeNull();
    expect(r.esferico).toBe(-2);
    expect(r.origem).toBe("longe");
  });

  it("OE do caso 96999: longe -2.5, tudo o resto zerado → sem adição", () => {
    const r = resolverPrescricaoOlho({
      ...base,
      longeEsf: -2.5, longeCil: -2.5, longeEixo: 90,
      pertoEsf: 0, pertoCil: 0, adicao: 0,
    });
    expect(r.adicao).toBeNull();
    expect(r.esferico).toBe(-2.5);
    expect(r.cilindrico).toBe(-2.5);
  });

  it("respeita adição explícita do operador mesmo com perto zerado", () => {
    const r = resolverPrescricaoOlho({
      ...base, longeEsf: -2, pertoEsf: 0, adicao: 2,
    });
    expect(r.adicao).toBe(2);
    expect(r.esferico).toBe(-2);
    expect(r.origem).toBe("longe");
  });

  it("Regra 3 real: longe -2 e perto -0.5 → adição = 1.5", () => {
    const r = resolverPrescricaoOlho({
      ...base, longeEsf: -2, pertoEsf: -0.5, adicao: null,
    });
    expect(r.adicao).toBe(1.5);
    expect(r.esferico).toBe(-2);
    expect(r.origem).toBe("calculado");
  });

  it("Regra 3 ignora diferença clinicamente irrelevante (< 0.5)", () => {
    const r = resolverPrescricaoOlho({
      ...base, longeEsf: -2, pertoEsf: -1.75, adicao: null,
    });
    expect(r.adicao).toBeNull();
  });

  it("Regra 1: só perto preenchido (longe zerado) → usa perto como esférico", () => {
    const r = resolverPrescricaoOlho({
      ...base, longeEsf: 0, pertoEsf: 2, adicao: null,
    });
    expect(r.esferico).toBe(2);
    expect(r.adicao).toBeNull();
    expect(r.origem).toBe("perto");
  });

  it("longe vazio (cil preenchido em perto) + adição informada → usa perto + adição", () => {
    const r = resolverPrescricaoOlho({
      ...base, pertoCil: -1, adicao: 2,
    });
    expect(r.adicao).toBe(2);
    expect(r.origem).toBe("perto");
  });
});
