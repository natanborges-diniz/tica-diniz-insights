// Título recusado pelo banco, corrigido e sem borderô novo: continua sendo
// dinheiro que não saiu, então tem de aparecer no painel.
import { describe, it, expect } from "vitest";
import { pendenciaDeLancamentoReaberto } from "../../../../supabase/functions/_shared/pendenciasFinanceiro";

const base = {
  id: "l1",
  cod_empresa: 9,
  descricao: "SALARIO",
  pessoa_nome: "VERONICA KELLY",
  valor: 499.53,
  data_vencimento: "2026-08-06",
};

describe("pendenciaDeLancamentoReaberto", () => {
  it("classifica como pendência sem borderô, com o lançamento como âncora", () => {
    const p = pendenciaDeLancamentoReaberto(base, "2026-08-06");
    expect(p.tipo).toBe("REABERTO_SEM_BORDERO");
    expect(p.bordero_id).toBeNull();
    expect(p.lancamento_id).toBe("l1");
    expect(p.acao_sistema).toBe("ABRIR_PREPARO");
    expect(p.valor_pendente).toBe(499.53);
    expect(p.descricao).toContain("VERONICA KELLY");
  });

  it("sobe para alta a partir de dois dias parado", () => {
    expect(pendenciaDeLancamentoReaberto(base, "2026-08-07").severidade).toBe("MEDIA");
    expect(pendenciaDeLancamentoReaberto(base, "2026-08-08").severidade).toBe("ALTA");
  });

  it("repassa o motivo do banco quando existe", () => {
    const p = pendenciaDeLancamentoReaberto(
      { ...base, motivo_recusa: "Chave Pix inválida" },
      "2026-08-06",
    );
    expect(p.mensagem).toContain("Chave Pix inválida");
  });
});
