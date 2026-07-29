// Testes das regras puras da governança de pagamentos (G2 — SPEC_P2_5)
import { describe, it, expect } from 'vitest';
import {
  avaliarLancamento,
  avaliarRubrica,
  validarJustificativa,
  criadorAprovadorDistintos,
  type LancParaAvaliar,
  type RubricaAvaliavel,
} from '../../../../supabase/functions/_shared/governanca';

const HOJE = '2026-07-30';

const lanc = (over: Partial<LancParaAvaliar> = {}): LancParaAvaliar => ({
  id: 'l1', valor: 1000, pessoa_documento: '12.345.678/0001-90', ...over,
});

const rubrica = (over: Partial<RubricaAvaliavel> = {}): RubricaAvaliavel => ({
  id: 'r1', status: 'ATIVA', favorecido_documento: '12345678000190',
  valor_esperado: 1000, tolerancia_pct: 10, valor_teto: 2000,
  vigencia_inicio: '2026-01-01', vigencia_fim: null, ...over,
});

describe('avaliarLancamento — selos por lastro', () => {
  it('título ERP → VERDE, entra em borderô', () => {
    const a = avaliarLancamento(lanc({ erp_parcela_id: 123 }), null, HOJE);
    expect(a.selo).toBe('VERDE');
    expect(a.podeBordero).toBe(true);
  });

  it('NF de entrada → VERDE', () => {
    expect(avaliarLancamento(lanc({ nf_entrada_id: 'nf1', lastro: 'NF' }), null, HOJE).selo).toBe('VERDE');
  });

  it('sem lastro nenhum → SEM_LASTRO, bloqueado', () => {
    const a = avaliarLancamento(lanc(), null, HOJE);
    expect(a.selo).toBe('SEM_LASTRO');
    expect(a.podeBordero).toBe(false);
  });

  it('DDA sozinho NÃO é lastro (boleto sem título = investigar)', () => {
    const a = avaliarLancamento(lanc({ btg_dda_id: 'dda1' }), null, HOJE);
    expect(a.selo).toBe('SEM_LASTRO');
    expect(a.motivo).toMatch(/DDA/);
  });

  it('exceção com justificativa → VERMELHO e NUNCA entra em borderô', () => {
    const a = avaliarLancamento(lanc({ lastro: 'EXCECAO', justificativa: 'Conserto emergencial do ar-condicionado da loja Centro' }), null, HOJE);
    expect(a.selo).toBe('VERMELHO');
    expect(a.podeBordero).toBe(false);
  });

  it('exceção sem justificativa válida → SEM_LASTRO', () => {
    expect(avaliarLancamento(lanc({ lastro: 'EXCECAO', justificativa: 'urgente' }), null, HOJE).selo).toBe('SEM_LASTRO');
  });
});

describe('avaliarRubrica — faixa, teto, favorecido, vigência', () => {
  it('dentro da faixa → AZUL', () => {
    const a = avaliarRubrica(lanc({ valor: 1050 }), rubrica(), HOJE);
    expect(a.selo).toBe('AZUL');
    expect(a.podeBordero).toBe(true);
  });

  it('fora da faixa mas sob o teto → AMARELO com desvio calculado', () => {
    const a = avaliarRubrica(lanc({ valor: 1380 }), rubrica(), HOJE);
    expect(a.selo).toBe('AMARELO');
    expect(a.podeBordero).toBe(true);
    expect(a.desvioPct).toBe(38);
  });

  it('acima do teto → bloqueado, mesmo com rubrica', () => {
    const a = avaliarRubrica(lanc({ valor: 2500 }), rubrica(), HOJE);
    expect(a.selo).toBe('SEM_LASTRO');
    expect(a.podeBordero).toBe(false);
  });

  it('favorecido diferente do cadastrado → bloqueado (troca de chave/destino)', () => {
    const a = avaliarRubrica(lanc({ pessoa_documento: '99.999.999/0001-00' }), rubrica(), HOJE);
    expect(a.selo).toBe('SEM_LASTRO');
    expect(a.motivo).toMatch(/Favorecido/);
  });

  it('formatação do CNPJ não importa (compara só dígitos)', () => {
    const a = avaliarRubrica(lanc({ pessoa_documento: '12345678000190' }), rubrica({ favorecido_documento: '12.345.678/0001-90' }), HOJE);
    expect(a.selo).toBe('AZUL');
  });

  it('rubrica RASCUNHO (ex.: chave PIX alterada) → bloqueada até re-aprovação', () => {
    expect(avaliarRubrica(lanc(), rubrica({ status: 'RASCUNHO' }), HOJE).podeBordero).toBe(false);
  });

  it('fora da vigência → bloqueada', () => {
    expect(avaliarRubrica(lanc(), rubrica({ vigencia_fim: '2026-06-30' }), HOJE).podeBordero).toBe(false);
  });

  it('sem valor_esperado (só teto) → AZUL até o teto', () => {
    const a = avaliarRubrica(lanc({ valor: 1900 }), rubrica({ valor_esperado: null }), HOJE);
    expect(a.selo).toBe('AZUL');
  });
});

describe('separação de funções', () => {
  it('criador não aprova; outro usuário aprova', () => {
    expect(criadorAprovadorDistintos('user-a', 'user-a').ok).toBe(false);
    expect(criadorAprovadorDistintos('user-a', 'user-b').ok).toBe(true);
    expect(criadorAprovadorDistintos(null, 'user-b').ok).toBe(true); // legado sem criado_por
  });

  it('justificativa mínima de 20 caracteres', () => {
    expect(validarJustificativa('curta')).toBe(false);
    expect(validarJustificativa('  compra emergencial de material de reparo  ')).toBe(true);
    expect(validarJustificativa(null)).toBe(false);
  });
});
