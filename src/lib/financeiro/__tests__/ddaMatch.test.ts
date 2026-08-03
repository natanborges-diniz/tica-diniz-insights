// Conciliação DDA × ERP.
//
// Bugs reais cobertos (auditoria de 03/08/2026): as duas rotas exigiam
// vencimento IDÊNTICO, e uma delas valor idêntico ao centavo. Ambos derivam na
// prática — Johnson & Johnson (ERP 213,08 vs boleto 213,06) e HOYA (ERP 06/08
// vs registro na CIP 04/08) — e o boleto legítimo ficava órfão.
import { describe, it, expect } from 'vitest';
import {
  casarTitulo,
  distanciaDias,
  TOLERANCIA_VALOR,
  JANELA_DIAS,
} from '../../../../supabase/functions/_shared/ddaMatch';

const CNPJ_JJ = '54.516.661/0001-01';
const CNPJ_HOYA = '68.571.041/0001-71';

const cand = (over: Record<string, unknown> = {}) => ({
  id: 'l1', valor: 213.08, data_vencimento: '2026-08-02', pessoa_documento: CNPJ_JJ, ...over,
});

describe('distanciaDias', () => {
  it('conta dias entre datas yyyy-MM-dd', () => {
    expect(distanciaDias('2026-08-06', '2026-08-04')).toBe(2);
    expect(distanciaDias('2026-08-04', '2026-08-06')).toBe(2);
    expect(distanciaDias('2026-08-04', '2026-08-04')).toBe(0);
  });

  it('não quebra com data inválida', () => {
    expect(distanciaDias('', '2026-08-04')).toBe(Infinity);
  });
});

describe('casos reais que falhavam antes', () => {
  it('Johnson & Johnson: 2 centavos de diferença agora casam', () => {
    const r = casarTitulo(
      { valor: 213.06, data_vencimento: '2026-08-02', documento_emissor: CNPJ_JJ },
      [cand({ valor: 213.08 })],
    );
    expect(r.candidato?.id).toBe('l1');
    expect(r.motivo).toMatch(/CNPJ/);
  });

  it('HOYA: vencimento 2 dias diferente agora casa', () => {
    const r = casarTitulo(
      { valor: 165, data_vencimento: '2026-08-04', documento_emissor: CNPJ_HOYA },
      [cand({ id: 'hoya', valor: 165, data_vencimento: '2026-08-06', pessoa_documento: CNPJ_HOYA })],
    );
    expect(r.candidato?.id).toBe('hoya');
  });
});

describe('CNPJ do emissor como sinal forte', () => {
  it('escolhe o do mesmo fornecedor, ignorando outro de valor igual', () => {
    const r = casarTitulo(
      { valor: 165, data_vencimento: '2026-08-04', documento_emissor: CNPJ_HOYA },
      [
        cand({ id: 'outro', valor: 165, pessoa_documento: '11.111.111/0001-11' }),
        cand({ id: 'certo', valor: 165, pessoa_documento: CNPJ_HOYA }),
      ],
    );
    expect(r.candidato?.id).toBe('certo');
  });

  it('mesmo fornecedor e mesmo valor: o vencimento mais próximo desempata', () => {
    const r = casarTitulo(
      { valor: 100, data_vencimento: '2026-08-10', documento_emissor: CNPJ_HOYA },
      [
        cand({ id: 'longe', valor: 100, data_vencimento: '2026-08-14', pessoa_documento: CNPJ_HOYA }),
        cand({ id: 'perto', valor: 100, data_vencimento: '2026-08-11', pessoa_documento: CNPJ_HOYA }),
      ],
    );
    expect(r.candidato?.id).toBe('perto');
  });

  it('empate real não casa — melhor conferir do que amarrar errado', () => {
    const r = casarTitulo(
      { valor: 100, data_vencimento: '2026-08-10', documento_emissor: CNPJ_HOYA },
      [
        cand({ id: 'a', valor: 100, data_vencimento: '2026-08-09', pessoa_documento: CNPJ_HOYA }),
        cand({ id: 'b', valor: 100, data_vencimento: '2026-08-11', pessoa_documento: CNPJ_HOYA }),
      ],
    );
    expect(r.candidato).toBeNull();
    expect(r.empatados).toBe(2);
    expect(r.motivo).toMatch(/conferir manualmente/);
  });

  it('CNPJ conhecido e nenhum candidato do fornecedor: não força por valor', () => {
    const r = casarTitulo(
      { valor: 165, data_vencimento: '2026-08-04', documento_emissor: CNPJ_HOYA },
      [cand({ id: 'outro', valor: 165, pessoa_documento: '11.111.111/0001-11' })],
    );
    expect(r.candidato).toBeNull();
    expect(r.motivo).toMatch(/mesmo fornecedor/);
  });
});

describe('sem CNPJ dos dois lados', () => {
  it('casa quando valor e janela deixam só um candidato', () => {
    const r = casarTitulo(
      { valor: 500, data_vencimento: '2026-08-10', documento_emissor: null },
      [cand({ id: 'unico', valor: 500, data_vencimento: '2026-08-12', pessoa_documento: null })],
    );
    expect(r.candidato?.id).toBe('unico');
  });

  it('dois plausíveis não casam', () => {
    const r = casarTitulo(
      { valor: 500, data_vencimento: '2026-08-10', documento_emissor: null },
      [
        cand({ id: 'a', valor: 500, data_vencimento: '2026-08-10', pessoa_documento: null }),
        cand({ id: 'b', valor: 500, data_vencimento: '2026-08-11', pessoa_documento: null }),
      ],
    );
    expect(r.candidato).toBeNull();
    expect(r.empatados).toBe(2);
  });
});

describe('limites das tolerâncias', () => {
  it(`aceita diferença de até R$ ${TOLERANCIA_VALOR.toFixed(2)}`, () => {
    const dentro = casarTitulo(
      { valor: 100, data_vencimento: '2026-08-10', documento_emissor: CNPJ_HOYA },
      [cand({ valor: 100 + TOLERANCIA_VALOR, data_vencimento: '2026-08-10', pessoa_documento: CNPJ_HOYA })],
    );
    expect(dentro.candidato).not.toBeNull();

    const fora = casarTitulo(
      { valor: 100, data_vencimento: '2026-08-10', documento_emissor: CNPJ_HOYA },
      [cand({ valor: 100 + TOLERANCIA_VALOR + 0.01, pessoa_documento: CNPJ_HOYA })],
    );
    expect(fora.candidato).toBeNull();
    expect(fora.motivo).toMatch(/valor compatível/);
  });

  it(`sem CNPJ, respeita a janela de ±${JANELA_DIAS} dias`, () => {
    const fora = casarTitulo(
      { valor: 500, data_vencimento: '2026-08-10', documento_emissor: null },
      [cand({ id: 'x', valor: 500, data_vencimento: '2026-08-20', pessoa_documento: null })],
    );
    expect(fora.candidato).toBeNull();
    expect(fora.motivo).toMatch(/±5 dias/);
  });

  it('lista vazia devolve motivo legível', () => {
    const r = casarTitulo({ valor: 100, data_vencimento: '2026-08-10' }, []);
    expect(r.candidato).toBeNull();
    expect(r.empatados).toBe(0);
  });
});
