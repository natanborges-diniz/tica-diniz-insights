// Testes da conversão linha digitável → código de barras (FEBRABAN).
// Bug real coberto: DDA entrega linha digitável de 47 dígitos, API BTG espera
// código de barras de 44 — enviar 47 causava 500 genérico no batch-payments
// (boleto Luxottica R$ 15,96, 31/07/2026).
import { describe, it, expect } from 'vitest';
import {
  paraCodigoBarras,
  paraLinhaDigitavel,
  valorDoCodigoBarras,
  somenteDigitos,
  mod10,
  formatarLinhaDigitavel,
  vencimentoDoCodigoBarras,
  diagnosticarBoleto,
} from '../../../../supabase/functions/_shared/boleto';

// Boleto real (Luxottica, Santander 033, venc 07/08/2026 = fator 1531, R$ 15,96)
const LINHA_LUXOTTICA = '03399940308090000198584636301016415310000001596';
const BARRAS_LUXOTTICA = '03394153100000015969940380900001988463630101';

describe('somenteDigitos', () => {
  it('remove pontuação e espaços da linha digitável formatada', () => {
    expect(somenteDigitos('03399.94030 80900.001985 84636.301016 4 15310000001596'))
      .toBe(LINHA_LUXOTTICA);
    expect(somenteDigitos(null)).toBe('');
  });
});

describe('mod10', () => {
  it('calcula o DV FEBRABAN dos campos do boleto real', () => {
    expect(mod10('033999403')).toBe(0); // campo 1 → DV 0
    expect(mod10('8090000198')).toBe(5); // campo 2 → DV 5
    expect(mod10('8463630101')).toBe(6); // campo 3 → DV 6
  });
});

describe('paraCodigoBarras', () => {
  it('converte linha digitável de 47 no código de barras de 44 (caso real)', () => {
    const barras = paraCodigoBarras(LINHA_LUXOTTICA);
    expect(barras).toHaveLength(44);
    expect(barras).toBe(BARRAS_LUXOTTICA);
    // banco+moeda preservados, fator/valor no lugar certo
    expect(barras.slice(0, 4)).toBe('0339');
    expect(barras.slice(5, 9)).toBe('1531'); // fator vencimento = 07/08/2026
    expect(barras.slice(9, 19)).toBe('0000001596'); // R$ 15,96
  });

  it('aceita linha digitável com pontuação/espaços', () => {
    expect(paraCodigoBarras('03399.94030 80900.001985 84636.301016 4 15310000001596'))
      .toBe(BARRAS_LUXOTTICA);
  });

  it('passa código de barras de 44 adiante sem mexer', () => {
    expect(paraCodigoBarras(BARRAS_LUXOTTICA)).toBe(BARRAS_LUXOTTICA);
  });

  it('converte arrecadação de 48 removendo o DV de cada bloco de 12', () => {
    // 4 blocos de 12: 11 úteis + DV sintético 'X' na 12ª posição
    const blocos = ['846700000017', '435900240209', '024050002435', '842126912197'];
    const esperado = blocos.map((b) => b.slice(0, 11)).join('');
    expect(paraCodigoBarras(blocos.join(''))).toBe(esperado);
    expect(esperado).toHaveLength(44);
  });

  it('rejeita linha corrompida (DV de campo não confere)', () => {
    const corrompida = LINHA_LUXOTTICA.slice(0, 4) + '0' + LINHA_LUXOTTICA.slice(5);
    expect(() => paraCodigoBarras(corrompida)).toThrow(/DV do campo/);
  });

  it('rejeita tamanho inesperado com mensagem clara', () => {
    expect(() => paraCodigoBarras('123456')).toThrow(/6 dígitos/);
    expect(() => paraCodigoBarras('')).toThrow(/0 dígitos/);
  });
});

describe('paraLinhaDigitavel (formato que o BTG exige no digitableLine)', () => {
  it('valida e devolve a linha de 47 como está (caso real Luxottica)', () => {
    expect(paraLinhaDigitavel(LINHA_LUXOTTICA)).toBe(LINHA_LUXOTTICA);
    expect(paraLinhaDigitavel('03399.94030 80900.001985 84636.301016 4 15310000001596'))
      .toBe(LINHA_LUXOTTICA);
  });

  it('reconstrói a linha de 47 a partir do código de barras de 44 (ida e volta)', () => {
    expect(paraLinhaDigitavel(BARRAS_LUXOTTICA)).toBe(LINHA_LUXOTTICA);
  });

  it('arrecadação: 48 passa como está; 44 iniciado em 8 fica em barras', () => {
    const arrecadacao48 = '846700000017435900240209024050002435842126912197';
    expect(paraLinhaDigitavel(arrecadacao48)).toBe(arrecadacao48);
    const arrecadacao44 = '84670000001435900240200240500024384212691219';
    expect(paraLinhaDigitavel(arrecadacao44)).toBe(arrecadacao44);
  });

  it('rejeita linha corrompida e tamanho inesperado', () => {
    const corrompida = LINHA_LUXOTTICA.slice(0, 4) + '0' + LINHA_LUXOTTICA.slice(5);
    expect(() => paraLinhaDigitavel(corrompida)).toThrow(/DV do campo/);
    expect(() => paraLinhaDigitavel('123')).toThrow(/3 dígitos/);
  });
});

// Caso real (Johnson & Johnson, 02/08/2026): o ERP trazia R$ 213,08 e o boleto
// registrado vale R$ 213,06. Enviar o valor do ERP dispara `amount-doesnt-match`
// no BTG, então o valor precisa ser lido do próprio título.
describe('valorDoCodigoBarras', () => {
  const LINHA_JJ = '03399652613490000045534488401042115260000021306';

  it('lê o valor da linha digitável de cobrança (47)', () => {
    expect(valorDoCodigoBarras(LINHA_JJ)).toBe(213.06);
  });

  it('lê o valor do código de barras (44)', () => {
    expect(valorDoCodigoBarras(BARRAS_LUXOTTICA)).toBe(15.96);
  });

  it('lê o mesmo valor a partir da linha ou das barras', () => {
    expect(valorDoCodigoBarras(LINHA_LUXOTTICA)).toBe(valorDoCodigoBarras(BARRAS_LUXOTTICA));
  });

  it('devolve null para arrecadação (layout de valor distinto)', () => {
    expect(valorDoCodigoBarras('8'.repeat(44))).toBeNull();
  });

  it('devolve null em vez de lançar quando o código é inválido', () => {
    expect(valorDoCodigoBarras('123')).toBeNull();
    expect(valorDoCodigoBarras(null)).toBeNull();
  });
});

// A tela agora dá retorno na hora: o operador cola do papel e vê se a linha
// está certa, com valor e vencimento lidos do próprio código.
describe('formatarLinhaDigitavel', () => {
  it('formata a linha de 47 como está impressa no boleto', () => {
    expect(formatarLinhaDigitavel(LINHA_LUXOTTICA))
      .toBe('03399.94030 80900.001985 84636.301016 4 15310000001596');
  });

  it('é idempotente: formatar o já formatado dá o mesmo resultado', () => {
    const uma = formatarLinhaDigitavel(LINHA_LUXOTTICA);
    expect(formatarLinhaDigitavel(uma)).toBe(uma);
  });

  it('formata arrecadação em 4 blocos de 12', () => {
    expect(formatarLinhaDigitavel('846700000017435900240209024050002435842126912197'))
      .toBe('846700000017 435900240209 024050002435 842126912197');
  });

  it('formata parcialmente enquanto o operador digita', () => {
    expect(formatarLinhaDigitavel('033999403')).toBe('03399.9403');
    expect(formatarLinhaDigitavel('')).toBe('');
  });
});

describe('vencimentoDoCodigoBarras', () => {
  it('lê o vencimento do fator (Luxottica, fator 1531 = 07/08/2026)', () => {
    expect(vencimentoDoCodigoBarras(LINHA_LUXOTTICA)).toBe('2026-08-07');
    expect(vencimentoDoCodigoBarras(BARRAS_LUXOTTICA)).toBe('2026-08-07');
  });

  it('devolve null para arrecadação e para código inválido', () => {
    expect(vencimentoDoCodigoBarras('846700000017435900240209024050002435842126912197')).toBeNull();
    expect(vencimentoDoCodigoBarras('123')).toBeNull();
  });
});

describe('diagnosticarBoleto', () => {
  it('vazio quando não há dígitos', () => {
    expect(diagnosticarBoleto('').status).toBe('vazio');
    expect(diagnosticarBoleto(null).status).toBe('vazio');
  });

  it('incompleto (não erro) enquanto falta dígito', () => {
    const d = diagnosticarBoleto(LINHA_LUXOTTICA.slice(0, 40));
    expect(d.status).toBe('incompleto');
    expect(d.mensagem).toContain('faltam 7');
  });

  it('ok com tipo, valor e vencimento na mensagem (caso real)', () => {
    const d = diagnosticarBoleto('03399.94030 80900.001985 84636.301016 4 15310000001596');
    expect(d.status).toBe('ok');
    expect(d.tipo).toBe('COBRANCA');
    expect(d.valor).toBe(15.96);
    expect(d.vencimento).toBe('2026-08-07');
    expect(d.mensagem).toContain('Boleto de cobrança');
    expect(d.mensagem).toContain('07/08/2026');
  });

  it('reconhece arrecadação', () => {
    const d = diagnosticarBoleto('846700000017435900240209024050002435842126912197');
    expect(d.status).toBe('ok');
    expect(d.tipo).toBe('ARRECADACAO');
    expect(d.valor).toBeNull();
  });

  it('invalido quando o DV do campo não confere', () => {
    const corrompida = LINHA_LUXOTTICA.slice(0, 4) + '0' + LINHA_LUXOTTICA.slice(5);
    const d = diagnosticarBoleto(corrompida);
    expect(d.status).toBe('invalido');
    expect(d.mensagem).toMatch(/DV do campo/);
  });

  it('invalido quando o tamanho passa do esperado', () => {
    const d = diagnosticarBoleto(LINHA_LUXOTTICA + '99999');
    expect(d.status).toBe('invalido');
    expect(d.mensagem).toContain('52 dígitos');
  });
});
