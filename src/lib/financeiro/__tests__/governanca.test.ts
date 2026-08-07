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

  it('exceção pendente → VERMELHO, fora do borderô até o admin aprovar', () => {
    const a = avaliarLancamento(lanc({ lastro: 'EXCECAO', justificativa: 'Conserto emergencial do ar-condicionado da loja Centro' }), null, HOJE);
    expect(a.selo).toBe('VERMELHO');
    expect(a.podeBordero).toBe(false);
  });

  it('exceção APROVADA individualmente → VERMELHO liberado para borderô', () => {
    const a = avaliarLancamento(
      lanc({ lastro: 'EXCECAO', justificativa: 'Conserto emergencial do ar-condicionado da loja Centro', excecao_aprovada: true }),
      null,
      HOJE,
    );
    expect(a.selo).toBe('VERMELHO');
    expect(a.podeBordero).toBe(true);
  });

  it('exceção aprovada mas sem justificativa válida continua SEM_LASTRO', () => {
    expect(avaliarLancamento(lanc({ lastro: 'EXCECAO', justificativa: 'urgente', excecao_aprovada: true }), null, HOJE).selo).toBe('SEM_LASTRO');
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

  it('admin pode auto-aprovar, com marca de auditoria', () => {
    const r = criadorAprovadorDistintos('user-a', 'user-a', true);
    expect(r.ok).toBe(true);
    expect(r.autoAprovacao).toBe(true);
  });


  it('justificativa mínima de 20 caracteres', () => {
    expect(validarJustificativa('curta')).toBe(false);
    expect(validarJustificativa('  compra emergencial de material de reparo  ')).toBe(true);
    expect(validarJustificativa(null)).toBe(false);
  });
});

// Edição manual de valor — o selo olha a ORIGEM, não o número. Sem esta
// checagem, um valor digitado à mão herdaria o "veio do ERP" e sairia direto
// para o banco, sem ninguém conferir.
describe('valor editado à mão', () => {
  const erp = (over: Record<string, unknown> = {}) => ({
    id: 'l1', erp_parcela_id: 123, valor: 1000, ...over,
  } as never);

  it('sem edição, título do ERP segue VERDE', () => {
    expect(avaliarLancamento(erp(), null, '2026-08-03').selo).toBe('VERDE');
  });

  it('acerto pequeno (juros/arredondamento) não rebaixa', () => {
    const av = avaliarLancamento(erp({ valor: 1030, valor_original: 1000 }), null, '2026-08-03');
    expect(av.selo).toBe('VERDE');
  });

  it('alteração grande rebaixa para AMARELO e explica o desvio', () => {
    const av = avaliarLancamento(erp({ valor: 10000, valor_original: 1000 }), null, '2026-08-03');
    expect(av.selo).toBe('AMARELO');
    expect(av.podeBordero).toBe(true); // entra no borderô, mas sinalizado
    expect(av.motivo).toMatch(/alterado à mão/);
  });

  it('em boleto, qualquer alteração vai para a Mesa', () => {
    const av = avaliarLancamento(
      erp({ valor: 213.08, valor_original: 213.06, btg_payment_type: 'BANKSLIP' }),
      null, '2026-08-03',
    );
    expect(av.selo).toBe('AMARELO');
    expect(av.motivo).toMatch(/título registrado/);
  });

  it('DDA vinculado também conta como boleto', () => {
    const av = avaliarLancamento(
      erp({ valor: 1001, valor_original: 1000, btg_dda_id: 'dda-1' }),
      null, '2026-08-03',
    );
    expect(av.selo).toBe('AMARELO');
  });
});

// Liberar valia so para aquele bordero: com aluguel reajustado, o admin
// liberava de novo todo mes, e a repeticao transforma a conferencia em carimbo.
describe('credito de liberacao da rubrica', () => {
  const rubrica = (over: Record<string, unknown> = {}) => ({
    id: 'r1', status: 'ATIVA', tolerancia_pct: 10, valor_teto: 20000,
    valor_esperado: 1000, vigencia_inicio: '2026-01-01', ...over,
  } as never);

  const lanc = (valor: number) => ({ id: 'l1', rubrica_id: 'r1', valor } as never);

  it('sem credito, valor fora da faixa fica AMARELO', () => {
    const av = avaliarLancamento(lanc(1300), rubrica(), '2026-08-04');
    expect(av.selo).toBe('AMARELO');
    expect(av.usouLiberacao).toBeUndefined();
  });

  it('com credito, passa como AZUL e sinaliza o consumo', () => {
    const av = avaliarLancamento(lanc(1300), rubrica({ liberacoes_restantes: 3 }), '2026-08-04');
    expect(av.selo).toBe('AZUL');
    expect(av.usouLiberacao).toBe(true);
    expect(av.motivo).toMatch(/restam 3/);
  });

  it('credito nao mascara valor acima do teto — isso continua barrado', () => {
    const av = avaliarLancamento(lanc(25000), rubrica({ liberacoes_restantes: 5 }), '2026-08-04');
    expect(av.selo).toBe('SEM_LASTRO');
    expect(av.podeBordero).toBe(false);
  });

  it('dentro da faixa nao consome credito', () => {
    const av = avaliarLancamento(lanc(1050), rubrica({ liberacoes_restantes: 3 }), '2026-08-04');
    expect(av.selo).toBe('AZUL');
    expect(av.usouLiberacao).toBeUndefined();
  });

  it('credito zerado volta a pedir conferencia', () => {
    const av = avaliarLancamento(lanc(1300), rubrica({ liberacoes_restantes: 0 }), '2026-08-04');
    expect(av.selo).toBe('AMARELO');
  });
});
