import { describe, it, expect } from 'vitest';
import { getStatusInfo } from '../status-mix-ideal';

const base = { estrategica: false } as const;

function mk(status: 'OK' | 'ABAIXO_MINIMO_ESTRATEGICA' | 'SUGERIR_DESCONTINUAR' | 'SEM_VENDAS_180D', estrategica = false) {
  return { status, estrategica };
}

describe('getStatusInfo — Princípio #34', () => {
  it('OK: marca viável sem flags', () => {
    const r = getStatusInfo(mk('OK'), false);
    expect(r.label).toBe('OK');
    expect(r.className).toContain('green');
  });

  it('ESTRATÉGICA: marca com flag estratégica', () => {
    const r = getStatusInfo(mk('OK', true), false);
    expect(r.label).toBe('ESTRATÉGICA');
    expect(r.className).toContain('blue');
  });

  it('RECÉM: marca com flag recém-introduzida', () => {
    const r = getStatusInfo(mk('OK'), true);
    expect(r.label).toBe('RECÉM');
    expect(r.className).toContain('blue');
  });

  it('SEM VENDAS 180D: sem flags manuais', () => {
    const r = getStatusInfo(mk('SEM_VENDAS_180D'), false);
    expect(r.label).toBe('SEM VENDAS 180D');
    expect(r.className).toContain('amber');
  });

  it('AB. MÍN.: SUGERIR_DESCONTINUAR sem flags manuais', () => {
    const r = getStatusInfo(mk('SUGERIR_DESCONTINUAR'), false);
    expect(r.label).toBe('AB. MÍN.');
    expect(r.className).toContain('red');
  });

  it('ESTRATÉGICA • AB. MÍN.: estratégica forçada com participação baixa', () => {
    const r = getStatusInfo(mk('ABAIXO_MINIMO_ESTRATEGICA', true), false);
    expect(r.label).toBe('ESTRATÉGICA • AB. MÍN.');
    expect(r.className).toContain('blue');
  });

  it('RECÉM • AB. MÍN.: recém com participação abaixo do corte', () => {
    const r = getStatusInfo(mk('SUGERIR_DESCONTINUAR'), true);
    expect(r.label).toBe('RECÉM • AB. MÍN.');
    expect(r.className).toContain('blue');
  });

  it('ESTRATÉGICA: sem vendas 180d suprimido quando há flag manual', () => {
    // SEM_VENDAS_180D + estratégica → flag manual prevalece, sem vendas não aparece
    const r = getStatusInfo(mk('SEM_VENDAS_180D', true), false);
    expect(r.label).toBe('ESTRATÉGICA');
    expect(r.label).not.toContain('SEM VENDAS');
  });

  it('RECÉM: sem vendas 180d suprimido quando há recém', () => {
    const r = getStatusInfo(mk('SEM_VENDAS_180D'), true);
    expect(r.label).toBe('RECÉM');
    expect(r.label).not.toContain('SEM VENDAS');
  });
});
