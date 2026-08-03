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

  it('todos os candidatos têm CNPJ e nenhum bate: é outro fornecedor', () => {
    const r = casarTitulo(
      { valor: 165, data_vencimento: '2026-08-04', documento_emissor: CNPJ_HOYA },
      [cand({ id: 'outro', valor: 165, pessoa_documento: '11.111.111/0001-11' })],
    );
    expect(r.candidato).toBeNull();
    expect(r.motivo).toMatch(/outro fornecedor/);
  });
});

// A regressão mais cara do dia: o import do ERP nunca gravava pessoa_documento,
// e a regra anterior lia ausência de CNPJ como divergência — recusava tudo.
describe('lançamento sem CNPJ (import antigo do ERP)', () => {
  it('casa mesmo assim, por valor e vencimento', () => {
    const r = casarTitulo(
      { valor: 165, data_vencimento: '2026-08-04', documento_emissor: CNPJ_HOYA },
      [cand({ id: 'sem-cnpj', valor: 165, data_vencimento: '2026-08-06', pessoa_documento: null })],
    );
    expect(r.candidato?.id).toBe('sem-cnpj');
    expect(r.criterio).toBe('VALOR_DATA');
  });

  it('prefere o que tem CNPJ batendo, quando existe', () => {
    const r = casarTitulo(
      { valor: 165, data_vencimento: '2026-08-04', documento_emissor: CNPJ_HOYA },
      [
        cand({ id: 'sem-cnpj', valor: 165, pessoa_documento: null }),
        cand({ id: 'com-cnpj', valor: 165, pessoa_documento: CNPJ_HOYA }),
      ],
    );
    expect(r.candidato?.id).toBe('com-cnpj');
    expect(r.criterio).toBe('CNPJ');
  });

  it('CNPJ de outro fornecedor não bloqueia o candidato sem CNPJ', () => {
    const r = casarTitulo(
      { valor: 165, data_vencimento: '2026-08-04', documento_emissor: CNPJ_HOYA },
      [
        cand({ id: 'outro-forn', valor: 165, pessoa_documento: '11.111.111/0001-11' }),
        cand({ id: 'sem-cnpj', valor: 165, pessoa_documento: null }),
      ],
    );
    expect(r.candidato?.id).toBe('sem-cnpj');
  });
});

describe('número do documento — a chave mais forte', () => {
  it('decide mesmo com CNPJ ausente dos dois lados', () => {
    const r = casarTitulo(
      { valor: 2914.25, data_vencimento: '2026-08-02', numero_documento: '106544' },
      [
        cand({ id: 'errado', valor: 2914.25, documento: '999999', pessoa_documento: null }),
        cand({ id: 'certo', valor: 2914.25, documento: '106544/2', pessoa_documento: null }),
      ],
    );
    expect(r.candidato?.id).toBe('certo');
    expect(r.criterio).toBe('DOCUMENTO');
  });

  it('ignora zeros à esquerda e pontuação do ERP', () => {
    const r = casarTitulo(
      { valor: 100, data_vencimento: '2026-08-02', numero_documento: '0010655-44' },
      [cand({ id: 'x', valor: 100, documento: '1065544', pessoa_documento: null })],
    );
    expect(r.candidato?.id).toBe('x');
  });

  it('documento curto demais não decide sozinho', () => {
    const r = casarTitulo(
      { valor: 100, data_vencimento: '2026-08-02', numero_documento: '7' },
      [cand({ id: 'x', valor: 100, documento: '7', data_vencimento: '2026-08-02', pessoa_documento: null })],
    );
    // cai para valor+data, que resolve — mas não pelo documento
    expect(r.criterio).toBe('VALOR_DATA');
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

  it('havendo um claramente mais próximo do vencimento, ele vence', () => {
    const r = casarTitulo(
      { valor: 500, data_vencimento: '2026-08-10', documento_emissor: null },
      [
        cand({ id: 'exato', valor: 500, data_vencimento: '2026-08-10', pessoa_documento: null }),
        cand({ id: 'um-dia', valor: 500, data_vencimento: '2026-08-11', pessoa_documento: null }),
      ],
    );
    expect(r.candidato?.id).toBe('exato');
  });

  it('equidistantes não casam — aí é conferência humana', () => {
    const r = casarTitulo(
      { valor: 500, data_vencimento: '2026-08-10', documento_emissor: null },
      [
        cand({ id: 'a', valor: 500, data_vencimento: '2026-08-09', pessoa_documento: null }),
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

// Aluguel e condominio SEMPRE vem com boleto reajustado. O lancamento
// provisionado carrega o valor ESPERADO da rubrica, nao o cobrado — com a
// tolerancia fixa de R$ 0,10 o boleto legitimo nunca casaria.
describe('tolerancia propria do candidato (rubrica com faixa)', () => {
  const boleto = { valor: 8437.20, data_vencimento: '2026-09-10', documento_emissor: null };

  it('provisionado por rubrica casa dentro da faixa dela', () => {
    const r = casarTitulo(boleto, [{
      id: 'aluguel',
      valor: 8000,                 // valor esperado da rubrica
      data_vencimento: '2026-09-10',
      tolerancia_valor: 800,       // faixa de 10%
    }]);
    expect(r.candidato?.id).toBe('aluguel');
  });

  it('sem faixa propria, a tolerancia fixa de centavos recusa', () => {
    const r = casarTitulo(boleto, [{
      id: 'aluguel', valor: 8000, data_vencimento: '2026-09-10',
    }]);
    expect(r.candidato).toBeNull();
    expect(r.motivo).toMatch(/valor compatível/);
  });

  it('desvio acima da faixa continua recusado — a faixa e o limite, nao um passe livre', () => {
    const r = casarTitulo({ ...boleto, valor: 12000 }, [{
      id: 'aluguel', valor: 8000, data_vencimento: '2026-09-10', tolerancia_valor: 800,
    }]);
    expect(r.candidato).toBeNull();
  });
});
