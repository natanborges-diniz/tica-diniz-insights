// Testes do motor de conciliação 3 vias (E3 — SPEC_P1_CONCILIACAO_3VIAS.md §8)
// O motor é um módulo puro compartilhado com as edge functions.
import { describe, it, expect } from 'vitest';
import {
  matchEntry,
  combinacoesRecebiveis,
  janelaRecebivel,
  diffDias,
  tolReceb,
  type ExtratoEntry,
  type Pools,
} from '../../../../supabase/functions/_shared/conciliacaoMotor';
import { assignDedupeKeys } from '../../../../supabase/functions/_shared/btgExtrato';

const entryBase = (over: Partial<ExtratoEntry> = {}): ExtratoEntry => ({
  id: 'ext-1',
  cod_empresa: 1,
  data_lancamento: '2026-07-01',
  descricao: 'PIX ENVIADO - FORNECEDOR XYZ',
  valor: 1000,
  tipo: 'DEBITO',
  ...over,
});

const poolsVazios = (over: Partial<Pools> = {}): Pools => ({
  fortes: [],
  recebiveis: [],
  lancamentos: [],
  regras: [],
  ...over,
});

describe('helpers', () => {
  it('diffDias calcula diferença absoluta em dias', () => {
    expect(diffDias('2026-07-01', '2026-07-04')).toBe(3);
    expect(diffDias('2026-07-04', '2026-07-01')).toBe(3);
  });

  it('janelaRecebivel: ±1 dia normal, até 3 dias quando o extrato cai numa segunda', () => {
    expect(janelaRecebivel('2026-07-01', '2026-07-02')).toBe(true); // quarta ±1
    expect(janelaRecebivel('2026-07-01', '2026-07-04')).toBe(false); // quarta +3
    // 2026-07-06 é segunda-feira; recebível de sexta 2026-07-03 (diff 3) entra
    expect(janelaRecebivel('2026-07-06', '2026-07-03')).toBe(true);
  });

  it('tolReceb: max(R$1, 1%)', () => {
    expect(tolReceb(50)).toBe(1);
    expect(tolReceb(10000)).toBe(100);
  });
});

describe('F1 — referência forte', () => {
  it('candidato único com valor exato e data próxima → MATCH EXATO score 100', () => {
    const r = matchEntry(entryBase(), poolsVazios({
      fortes: [{ alvo_tipo: 'PAGAMENTO_BTG', id: 'pag-1', valor: 1000, data: '2026-07-01', label: 'Pgto' }],
    }), new Set());
    expect(r.status).toBe('MATCH');
    expect(r.metodo).toBe('EXATO');
    expect(r.score).toBe(100);
    expect(r.alocacoes).toEqual([{ alvo_tipo: 'PAGAMENTO_BTG', alvo_id: 'pag-1', valor_alocado: 1000 }]);
  });

  it('dois candidatos empatados → NUNCA casa sozinho, vira sugestão', () => {
    const r = matchEntry(entryBase(), poolsVazios({
      fortes: [
        { alvo_tipo: 'PAGAMENTO_BTG', id: 'pag-1', valor: 1000, data: '2026-07-01', label: 'A' },
        { alvo_tipo: 'PAGAMENTO_BTG', id: 'pag-2', valor: 1000, data: '2026-07-01', label: 'B' },
      ],
    }), new Set());
    expect(r.status).toBe('SUGESTAO');
    expect(r.sugestoes.length).toBeGreaterThanOrEqual(2);
  });

  it('candidato fora da janela de 2 dias não casa', () => {
    const r = matchEntry(entryBase(), poolsVazios({
      fortes: [{ alvo_tipo: 'PAGAMENTO_BTG', id: 'pag-1', valor: 1000, data: '2026-07-10', label: 'Pgto' }],
    }), new Set());
    expect(r.status).toBe('NENHUM');
  });

  it('alvo já usado nesta execução não é candidato', () => {
    const usados = new Set(['PAGAMENTO_BTG|pag-1']);
    const r = matchEntry(entryBase(), poolsVazios({
      fortes: [{ alvo_tipo: 'PAGAMENTO_BTG', id: 'pag-1', valor: 1000, data: '2026-07-01', label: 'Pgto' }],
    }), usados);
    expect(r.status).toBe('NENHUM');
  });
});

describe('F2 — recebíveis de cartão', () => {
  const credito = entryBase({ tipo: 'CREDITO', valor: 995, descricao: 'CREDITO REDE' });

  it('recebível único dentro da tolerância de 1% → MATCH TOLERANCIA, alocação fecha no valor do extrato', () => {
    const r = matchEntry(credito, poolsVazios({
      recebiveis: [{ id: 'rec-1', valor_liquido: 1000, data_vencimento: '2026-07-01', adquirente: 'REDE' }],
    }), new Set());
    expect(r.status).toBe('MATCH');
    expect(r.metodo).toBe('TOLERANCIA');
    const soma = r.alocacoes!.reduce((s, a) => s + a.valor_alocado, 0);
    expect(soma).toBeCloseTo(995, 2); // delta absorvido na última alocação
  });

  it('combinação de 2 recebíveis do mesmo dia → MATCH AGRUPADO com soma fechada', () => {
    const r = matchEntry(entryBase({ tipo: 'CREDITO', valor: 1500 }), poolsVazios({
      recebiveis: [
        { id: 'rec-1', valor_liquido: 900, data_vencimento: '2026-07-01', adquirente: 'REDE' },
        { id: 'rec-2', valor_liquido: 600, data_vencimento: '2026-07-01', adquirente: 'REDE' },
      ],
    }), new Set());
    expect(r.status).toBe('MATCH');
    expect(r.metodo).toBe('AGRUPADO');
    expect(r.alocacoes).toHaveLength(2);
    const soma = r.alocacoes!.reduce((s, a) => s + a.valor_alocado, 0);
    expect(soma).toBeCloseTo(1500, 2);
  });

  it('dois recebíveis individuais empatados → sugestão, não match', () => {
    const r = matchEntry(entryBase({ tipo: 'CREDITO', valor: 1000 }), poolsVazios({
      recebiveis: [
        { id: 'rec-1', valor_liquido: 1000, data_vencimento: '2026-07-01' },
        { id: 'rec-2', valor_liquido: 1000, data_vencimento: '2026-07-01' },
      ],
    }), new Set());
    expect(r.status).toBe('SUGESTAO');
  });

  it('débito nunca casa com recebíveis (F2 é só crédito)', () => {
    const r = matchEntry(entryBase({ tipo: 'DEBITO', valor: 1000 }), poolsVazios({
      recebiveis: [{ id: 'rec-1', valor_liquido: 1000, data_vencimento: '2026-07-01' }],
    }), new Set());
    expect(r.status).toBe('NENHUM');
  });

  it('combinacoesRecebiveis encontra subconjuntos dentro da tolerância', () => {
    const combos = combinacoesRecebiveis(
      [
        { id: 'a', valor_liquido: 300, data_vencimento: '2026-07-01' },
        { id: 'b', valor_liquido: 700, data_vencimento: '2026-07-01' },
        { id: 'c', valor_liquido: 5000, data_vencimento: '2026-07-01' },
      ],
      1000,
      10
    );
    expect(combos).toHaveLength(1);
    expect(combos[0].map((c) => c.id).sort()).toEqual(['a', 'b']);
  });
});

describe('F3 — lançamento individual', () => {
  it('valor exato, vencimento ±3d, candidato único → MATCH score 90', () => {
    const r = matchEntry(entryBase(), poolsVazios({
      lancamentos: [{ id: 'lanc-1', tipo: 'PAGAR', valor: 1000, data_vencimento: '2026-07-03' }],
    }), new Set());
    expect(r.status).toBe('MATCH');
    expect(r.score).toBe(90);
    expect(r.alocacoes![0]).toMatchObject({ alvo_tipo: 'LANCAMENTO', alvo_id: 'lanc-1' });
  });

  it('valor exato mas só na janela de 7d → SUGESTAO com score 70 (não casa sozinho)', () => {
    const r = matchEntry(entryBase(), poolsVazios({
      lancamentos: [{ id: 'lanc-1', tipo: 'PAGAR', valor: 1000, data_vencimento: '2026-07-07' }],
    }), new Set());
    expect(r.status).toBe('SUGESTAO');
    expect(r.sugestoes[0].score).toBe(70);
  });

  it('dois candidatos na mesma janela → SUGESTAO (ambiguidade nunca casa)', () => {
    const r = matchEntry(entryBase(), poolsVazios({
      lancamentos: [
        { id: 'lanc-1', tipo: 'PAGAR', valor: 1000, data_vencimento: '2026-07-02' },
        { id: 'lanc-2', tipo: 'PAGAR', valor: 1000, data_vencimento: '2026-07-03' },
      ],
    }), new Set());
    expect(r.status).toBe('SUGESTAO');
  });

  it('tipo do lançamento deve corresponder ao lado do extrato', () => {
    const r = matchEntry(entryBase({ tipo: 'DEBITO' }), poolsVazios({
      lancamentos: [{ id: 'lanc-1', tipo: 'RECEBER', valor: 1000, data_vencimento: '2026-07-01' }],
    }), new Set());
    expect(r.status).toBe('NENHUM');
  });
});

describe('F4 — regras de classificação', () => {
  const regraTarifa = {
    id: 'regra-1',
    cod_empresa: null,
    padrao_descricao: 'TARIFA|MANUTENCAO CONTA',
    tipo: 'DEBITO' as const,
    natureza: 'DESPESAS_FINANCEIRAS',
    categoria: 'TARIFA_BANCARIA',
    auto_conciliar: true,
    valor_max: 500,
  };

  it('regra com regex casando e valor dentro do teto → MATCH REGRA com alvo TARIFA', () => {
    const r = matchEntry(
      entryBase({ valor: 49.9, descricao: 'TARIFA MANUTENCAO CONTA PJ' }),
      poolsVazios({ regras: [regraTarifa] }),
      new Set()
    );
    expect(r.status).toBe('MATCH');
    expect(r.metodo).toBe('REGRA');
    expect(r.alocacoes![0]).toMatchObject({
      alvo_tipo: 'TARIFA',
      alvo_id: null,
      natureza: 'DESPESAS_FINANCEIRAS',
      categoria: 'TARIFA_BANCARIA',
    });
  });

  it('valor acima do teto valor_max → regra não aplica', () => {
    const r = matchEntry(
      entryBase({ valor: 5000, descricao: 'TARIFA ESPECIAL' }),
      poolsVazios({ regras: [regraTarifa] }),
      new Set()
    );
    expect(r.status).toBe('NENHUM');
  });

  it('regra com auto_conciliar=false vira sugestão para confirmação', () => {
    const r = matchEntry(
      entryBase({ valor: 49.9, descricao: 'TARIFA MANUTENCAO' }),
      poolsVazios({ regras: [{ ...regraTarifa, auto_conciliar: false }] }),
      new Set()
    );
    expect(r.status).toBe('SUGESTAO');
    expect(r.sugestoes[0].alvo_tipo).toBe('TARIFA');
  });

  it('regex inválida cadastrada é ignorada sem quebrar o motor', () => {
    const r = matchEntry(
      entryBase({ descricao: 'TARIFA X' }),
      poolsVazios({ regras: [{ ...regraTarifa, padrao_descricao: '([inválida' }] }),
      new Set()
    );
    expect(r.status).toBe('NENHUM');
  });
});

describe('prioridade do waterfall', () => {
  it('F1 vence F3 quando ambos casariam', () => {
    const r = matchEntry(entryBase(), poolsVazios({
      fortes: [{ alvo_tipo: 'PAGAMENTO_BTG', id: 'pag-1', valor: 1000, data: '2026-07-01', label: 'Pgto' }],
      lancamentos: [{ id: 'lanc-1', tipo: 'PAGAR', valor: 1000, data_vencimento: '2026-07-01' }],
    }), new Set());
    expect(r.status).toBe('MATCH');
    expect(r.alocacoes![0].alvo_tipo).toBe('PAGAMENTO_BTG');
  });
});

describe('dedupe_key (E1 — btgExtrato)', () => {
  const row = (over: Record<string, unknown> = {}) => ({
    cod_empresa: 1,
    data_lancamento: '2026-07-01',
    valor: 100,
    tipo: 'DEBITO',
    descricao: 'PIX FORNECEDOR',
    ...over,
  });

  it('é estável: mesmo lote produz as mesmas chaves', async () => {
    const a = [row(), row({ valor: 200 })];
    const b = [row(), row({ valor: 200 })];
    await assignDedupeKeys(a);
    await assignDedupeKeys(b);
    expect(a[0].dedupe_key).toBe(b[0].dedupe_key);
    expect(a[1].dedupe_key).toBe(b[1].dedupe_key);
  });

  it('gêmeos idênticos no mesmo dia recebem chaves distintas (índice de ocorrência)', async () => {
    const rows = [row(), row()];
    await assignDedupeKeys(rows);
    expect(rows[0].dedupe_key).not.toBe(rows[1].dedupe_key);
  });

  it('reimportação com um gêmeo a mais só gera 1 chave nova', async () => {
    const lote1 = [row(), row()];
    const lote2 = [row(), row(), row()];
    await assignDedupeKeys(lote1);
    await assignDedupeKeys(lote2);
    const keys1 = new Set(lote1.map((r) => r.dedupe_key));
    const novas = lote2.filter((r) => !keys1.has(r.dedupe_key));
    expect(novas).toHaveLength(1);
  });
});
