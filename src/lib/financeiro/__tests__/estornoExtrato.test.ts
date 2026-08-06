// Devolução de Pix no extrato — o caso real do salário de R$ 499,53 (loja 9,
// 06/08/2026): débito e devolução no mesmo dia, mesmo endToEndId.
import { describe, it, expect } from 'vitest';
import {
  ehDevolucao,
  nomeDoTexto,
  acharDebitoEstornado,
  falhaFinalDoBanco,
  type LinhaExtrato,
} from '../../../../supabase/functions/_shared/estornoExtrato';

const E2E = 'E30306294202608061747935FDA3E525';

const DEBITO: LinhaExtrato = {
  id: 'deb',
  data_lancamento: '2026-08-06',
  descricao: 'Pix enviado para Veronica Kelly Batista Dos Santos',
  valor: 499.53,
  tipo: 'DEBITO',
  referencias: [E2E],
};

const DEVOLUCAO: LinhaExtrato = {
  id: 'cre',
  data_lancamento: '2026-08-06',
  descricao: 'Devolução do pix enviado para VERONICA KELLY BATISTA DOS SANTOS',
  valor: 499.53,
  tipo: 'CREDITO',
  referencias: [E2E],
};

describe('ehDevolucao', () => {
  it('reconhece o texto real do BTG', () => {
    expect(ehDevolucao(DEVOLUCAO)).toBe(true);
  });

  it('débito nunca é devolução, mesmo com a palavra no texto', () => {
    expect(ehDevolucao({ ...DEVOLUCAO, tipo: 'DEBITO' })).toBe(false);
  });

  it('crédito comum não é devolução', () => {
    expect(ehDevolucao({ descricao: 'Pix recebido de cliente', tipo: 'CREDITO' })).toBe(false);
  });

  it('cobre estorno e ressarcimento', () => {
    expect(ehDevolucao({ descricao: 'ESTORNO DE TED', tipo: 'CREDITO' })).toBe(true);
    expect(ehDevolucao({ descricao: 'Ressarcimento tarifa', tipo: 'CREDITO' })).toBe(true);
  });
});

describe('acharDebitoEstornado', () => {
  it('casa por identidade (mesmo endToEndId)', () => {
    expect(acharDebitoEstornado(DEVOLUCAO, [DEBITO])).toEqual({
      debito_id: 'deb',
      motivo: 'IDENTIDADE',
    });
  });

  it('casa por valor e data quando não há identificador comum', () => {
    const semRef = { ...DEBITO, referencias: [] };
    const dev = { ...DEVOLUCAO, referencias: [] };
    expect(acharDebitoEstornado(dev, [semRef])?.motivo).toBe('VALOR_DATA');
  });

  it('não casa fora da janela de dias', () => {
    const antigo = { ...DEBITO, referencias: [], data_lancamento: '2026-07-01' };
    expect(acharDebitoEstornado({ ...DEVOLUCAO, referencias: [] }, [antigo])).toBeNull();
  });

  it('desempata pelo nome quando há dois débitos do mesmo valor', () => {
    const outro = { ...DEBITO, id: 'outro', referencias: [], descricao: 'Pix enviado para JOAO DA SILVA' };
    const igual = { ...DEBITO, referencias: [] };
    const r = acharDebitoEstornado({ ...DEVOLUCAO, referencias: [] }, [outro, igual]);
    expect(r).toEqual({ debito_id: 'deb', motivo: 'VALOR_NOME' });
  });

  it('ambiguidade sem desempate não casa — decisão fica com o humano', () => {
    const a = { ...DEBITO, id: 'a', referencias: [], descricao: 'Pagamento diverso' };
    const b = { ...DEBITO, id: 'b', referencias: [], descricao: 'Outro pagamento' };
    expect(acharDebitoEstornado({ ...DEVOLUCAO, referencias: [], descricao: 'Devolução de pix' }, [a, b])).toBeNull();
  });

  it('valor diferente não casa', () => {
    expect(acharDebitoEstornado({ ...DEVOLUCAO, referencias: [], valor: 100 }, [{ ...DEBITO, referencias: [] }])).toBeNull();
  });
});

describe('nomeDoTexto', () => {
  it('extrai o favorecido do texto do BTG', () => {
    expect(nomeDoTexto(DEBITO.descricao)).toBe('VERONICA KELLY BATISTA DOS SANTOS');
  });
  it('sem "para" não inventa nome', () => {
    expect(nomeDoTexto('Tarifa mensal')).toBeNull();
  });
});

describe('falhaFinalDoBanco', () => {
  it('FAILED do caso real é falha final', () => {
    expect(falhaFinalDoBanco({ btg_payment_status: 'FAILED' })).toBe(true);
  });
  it('status em trânsito não é falha', () => {
    for (const st of ['PROCESSING', 'SCHEDULED', 'CONFIRMED', 'PROCESSED', 'ADJOURNED']) {
      expect(falhaFinalDoBanco({ btg_payment_status: st })).toBe(false);
    }
  });
  it('sem status não assume nada', () => {
    expect(falhaFinalDoBanco(null)).toBe(false);
    expect(falhaFinalDoBanco({})).toBe(false);
  });
});
