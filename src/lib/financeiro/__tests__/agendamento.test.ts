// Testes das regras de agendamento do borderô (prática da casa: pagar na segunda).
import { describe, it, expect } from 'vitest';
import {
  hojeBrt,
  proximaSegunda,
  descricaoBordero,
  dataAgendamento,
} from '../../../../supabase/functions/_shared/agendamento';

describe('hojeBrt', () => {
  it('devolve o dia BRT mesmo quando o UTC já virou (21h–24h de Brasília)', () => {
    // 31/07 22:44 BRT = 01:44 UTC de 01/08
    expect(hojeBrt(new Date('2026-08-01T01:44:00Z'))).toBe('2026-07-31');
    expect(hojeBrt(new Date('2026-07-31T15:00:00Z'))).toBe('2026-07-31');
  });
});

describe('proximaSegunda', () => {
  it('sexta 31/07/2026 → segunda 03/08', () => {
    expect(proximaSegunda('2026-07-31')).toBe('2026-08-03');
  });
  it('segunda-feira devolve ela mesma', () => {
    expect(proximaSegunda('2026-08-03')).toBe('2026-08-03');
  });
  it('domingo → segunda seguinte; terça → segunda da outra semana', () => {
    expect(proximaSegunda('2026-08-02')).toBe('2026-08-03');
    expect(proximaSegunda('2026-08-04')).toBe('2026-08-10');
  });
});

describe('descricaoBordero', () => {
  it('nomeia pela segunda da semana planejada', () => {
    expect(descricaoBordero('2026-08-03', 0)).toBe('Borderô Semana 03/08/2026');
  });
  it('numera os descendentes a partir do segundo', () => {
    expect(descricaoBordero('2026-08-03', 1)).toBe('Borderô Semana 03/08/2026 — 2');
    expect(descricaoBordero('2026-08-03', 4)).toBe('Borderô Semana 03/08/2026 — 5');
  });
});

describe('dataAgendamento', () => {
  const hoje = '2026-07-31'; // sexta
  const segunda = '2026-08-03';

  it('agenda para a data de pagamento do borderô (vencimento depois dela)', () => {
    expect(dataAgendamento('2026-08-07', segunda, hoje)).toBe(segunda);
  });
  it('vencimento ANTES da data de pagamento → paga no vencimento (sem juros)', () => {
    expect(dataAgendamento('2026-08-01', segunda, hoje)).toBe('2026-08-01');
  });
  it('vencido/hoje → pagamento imediato (sem scheduledDate)', () => {
    expect(dataAgendamento('2026-07-30', segunda, hoje)).toBe(null);
    expect(dataAgendamento(hoje, segunda, hoje)).toBe(null);
  });
  it('sem data no borderô (legado) → agenda pelo vencimento futuro', () => {
    expect(dataAgendamento('2026-08-07', null, hoje)).toBe('2026-08-07');
    expect(dataAgendamento('2026-07-20', null, hoje)).toBe(null);
    expect(dataAgendamento(null, null, hoje)).toBe(null);
  });
  it('sem vencimento mas com data de pagamento → agenda para ela', () => {
    expect(dataAgendamento(null, segunda, hoje)).toBe(segunda);
  });
});
