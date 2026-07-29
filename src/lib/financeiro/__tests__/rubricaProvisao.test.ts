// Testes do provisionamento por rubrica (extensão G3 — SPEC_P2_5 §3)
import { describe, it, expect } from 'vitest';
import {
  gerarCompetencias,
  montarProvisao,
  type RubricaProvisionavel,
} from '../../../../supabase/functions/_shared/rubricaProvisao';

const rubrica = (over: Partial<RubricaProvisionavel> = {}): RubricaProvisionavel => ({
  id: 'rub-1', cod_empresa: 1, descricao: 'Aluguel loja Centro',
  favorecido_nome: 'IMOBILIARIA X', conta_numero: '3.2.1',
  periodicidade: 'MENSAL', valor_esperado: 5000, dia_vencimento: 10,
  vigencia_inicio: '2026-01-01', vigencia_fim: null, status: 'ATIVA', provisionar: true,
  ...over,
});

describe('gerarCompetencias', () => {
  it('mensal: 12 competências à frente, começando no mês corrente se o venc. não passou', () => {
    const cs = gerarCompetencias(rubrica(), '2026-07-05', 12);
    expect(cs).toHaveLength(12);
    expect(cs[0]).toEqual({ competencia: '2026-07', data_vencimento: '2026-07-10' });
    expect(cs[11].competencia).toBe('2027-06');
  });

  it('vencimento do mês corrente já passou → começa no próximo', () => {
    const cs = gerarCompetencias(rubrica(), '2026-07-15', 12);
    expect(cs[0].competencia).toBe('2026-08');
    expect(cs).toHaveLength(11);
  });

  it('vigência fim corta o horizonte', () => {
    const cs = gerarCompetencias(rubrica({ vigencia_fim: '2026-10-31' }), '2026-07-05', 12);
    expect(cs.map((c) => c.competencia)).toEqual(['2026-07', '2026-08', '2026-09', '2026-10']);
  });

  it('anual: só o mês da vigência_inicio', () => {
    const cs = gerarCompetencias(rubrica({ periodicidade: 'ANUAL', vigencia_inicio: '2026-01-01' }), '2026-07-05', 12);
    expect(cs).toHaveLength(1);
    expect(cs[0].competencia).toBe('2027-01');
  });

  it('virada de ano sem recriar nada (idempotência é do índice; aqui só gera)', () => {
    const cs = gerarCompetencias(rubrica(), '2026-12-20', 12);
    expect(cs[0].competencia).toBe('2027-01');
    expect(cs[10].competencia).toBe('2027-11');
  });

  it('dia inválido (>28) normaliza para 10', () => {
    const cs = gerarCompetencias(rubrica({ dia_vencimento: 31 }), '2026-07-05', 2);
    expect(cs[0].data_vencimento).toBe('2026-07-10');
  });

  it('não provisiona: RASCUNHO, provisionar=false, sem valor, semanal', () => {
    expect(gerarCompetencias(rubrica({ status: 'RASCUNHO' }), '2026-07-05')).toHaveLength(0);
    expect(gerarCompetencias(rubrica({ provisionar: false }), '2026-07-05')).toHaveLength(0);
    expect(gerarCompetencias(rubrica({ valor_esperado: null }), '2026-07-05')).toHaveLength(0);
    expect(gerarCompetencias(rubrica({ periodicidade: 'SEMANAL' }), '2026-07-05')).toHaveLength(0);
  });
});

describe('montarProvisao', () => {
  it('nasce PREVISTO com lastro RUBRICA e chave de competência', () => {
    const r = montarProvisao(rubrica(), { competencia: '2026-08', data_vencimento: '2026-08-10' }, 4);
    expect(r.status).toBe('PREVISTO');
    expect(r.lastro).toBe('RUBRICA');
    expect(r.rubrica_id).toBe('rub-1');
    expect(r.competencia_rubrica).toBe('2026-08');
    expect(r.cod_empresa).toBe(4);
    expect(r.valor).toBe(5000);
    expect(r.tipo).toBe('PAGAR');
  });
});
