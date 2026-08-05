// Folha de pagamento — regras puras.
//
// Contrato do BTG (reference/submitpaymentbatch): o tipo de pagamento é do
// LOTE, não do item. Salário e férias do mesmo mês são remessas separadas.
import { describe, it, expect } from 'vitest';
import {
  PAYMENT_TYPE_BTG,
  EVENTOS_FOLHA,
  ehEventoFolha,
  cpfValido,
  validarLinha,
  vencimentoEncargo,
  montarEncargos,
  montarLoteFolha,
  totalizar,
  extrairRetornoFolha,
  vincularRubricas,
} from '../../../../supabase/functions/_shared/folha';

// CPFs válidos (dígitos verificadores conferem)
const CPF_OK = '52998224725';
const CPF_OK2 = '11144477735';

const linha = (over: Record<string, unknown> = {}) => ({
  nome: 'MARIA DA SILVA',
  cpf: CPF_OK,
  banco: '208',
  agencia: '50',
  conta: '008792899',
  valor_liquido: 3200,
  ...over,
} as Parameters<typeof validarLinha>[0]);

describe('tipos de pagamento do BTG', () => {
  it('usa os códigos exatos da API — inventar valor faz a API recusar', () => {
    expect(PAYMENT_TYPE_BTG.SALARIO).toBe(2);
    expect(PAYMENT_TYPE_BTG.PLR).toBe(5);
    expect(PAYMENT_TYPE_BTG.FERIAS).toBe(9);
    expect(PAYMENT_TYPE_BTG.DECIMO_TERCEIRO).toBe(10);
    expect(PAYMENT_TYPE_BTG.RESCISAO).toBe(11);
    expect(PAYMENT_TYPE_BTG.ADIANTAMENTO).toBe(17);
    expect(PAYMENT_TYPE_BTG.PROLABORE).toBe(18);
    expect(PAYMENT_TYPE_BTG.COMISSAO).toBe(24);
  });

  it('reconhece eventos válidos e rejeita o resto', () => {
    expect(ehEventoFolha('SALARIO')).toBe(true);
    expect(ehEventoFolha('VALE_TRANSPORTE')).toBe(false);
    expect(EVENTOS_FOLHA).toContain('RESCISAO');
  });
});

describe('cpfValido', () => {
  it('aceita CPF com dígitos verificadores corretos', () => {
    expect(cpfValido(CPF_OK)).toBe(true);
    expect(cpfValido('529.982.247-25')).toBe(true);
  });

  it('rejeita dígito errado, tamanho errado e repetição', () => {
    expect(cpfValido('52998224726')).toBe(false);
    expect(cpfValido('123')).toBe(false);
    expect(cpfValido('11111111111')).toBe(false);
    expect(cpfValido(null)).toBe(false);
  });
});

describe('validarLinha', () => {
  it('linha completa passa sem erro', () => {
    expect(validarLinha(linha()).erros).toEqual([]);
  });

  it('acumula todos os erros de uma vez, para o usuário corrigir de uma vez só', () => {
    const r = validarLinha(linha({ nome: '', cpf: '123', valor_liquido: 0, banco: null, agencia: null, conta: null }));
    expect(r.erros.length).toBeGreaterThanOrEqual(4);
    expect(r.erros.join(' ')).toMatch(/nome vazio/);
    expect(r.erros.join(' ')).toMatch(/CPF inválido/);
    expect(r.erros.join(' ')).toMatch(/líquido inválido/);
    expect(r.erros.join(' ')).toMatch(/sem dados bancários/);
  });

  it('aceita chave pix no lugar da conta', () => {
    const r = validarLinha(linha({ banco: null, agencia: null, conta: null, chave_pix: CPF_OK }));
    expect(r.erros).toEqual([]);
  });

  it('acusa quando bruto − descontos não fecha com o líquido', () => {
    const r = validarLinha(linha({ valor_bruto: 4000, descontos: 500, valor_liquido: 3200 }));
    expect(r.erros.join(' ')).toMatch(/não fecha com o líquido/);
  });

  it('normaliza o CPF para dígitos', () => {
    expect(validarLinha(linha({ cpf: '529.982.247-25' })).cpf).toBe(CPF_OK);
  });
});

describe('vencimentoEncargo', () => {
  it('FGTS vence dia 7 do mês seguinte', () => {
    expect(vencimentoEncargo('2026-08', 'FGTS')).toBe('2026-09-07'); // segunda
  });

  it('INSS e IRRF vencem dia 20 do mês seguinte', () => {
    expect(vencimentoEncargo('2026-08', 'INSS')).toBe('2026-09-18'); // 20/09 é domingo → antecipa
    expect(vencimentoEncargo('2026-08', 'IRRF')).toBe('2026-09-18');
  });

  it('antecipa (nunca posterga) quando cai em fim de semana', () => {
    // multa de encargo é cara; antecipar é o comportamento legal
    const d = vencimentoEncargo('2026-10', 'FGTS'); // 07/11/2026 é sábado
    expect(d).toBe('2026-11-06');
  });

  it('vira o ano corretamente na competência de dezembro', () => {
    expect(vencimentoEncargo('2026-12', 'FGTS')).toBe('2027-01-07');
  });
});

describe('montarEncargos', () => {
  it('gera um título por encargo informado, ignorando zerados', () => {
    const r = montarEncargos('2026-08', { INSS: 12000, FGTS: 4800, IRRF: 0 });
    expect(r).toHaveLength(2);
    expect(r.map(e => e.tipo).sort()).toEqual(['FGTS', 'INSS']);
    expect(r.find(e => e.tipo === 'FGTS')?.data_vencimento).toBe('2026-09-07');
  });

  it('não inventa alíquota — sem valor informado, não há título', () => {
    expect(montarEncargos('2026-08', {})).toEqual([]);
  });
});

describe('montarLoteFolha', () => {
  const base = {
    evento: 'SALARIO' as const,
    descricao: 'Folha 2026-08',
    dataPagamento: '2026-09-05',
    cnpj: '13844111000126',
    debitParty: { branchCode: '50', number: '009133601' },
    itens: [
      { id: 'item-1', cpf: CPF_OK, banco: '208', agencia: '50', conta: '008792899', valor_liquido: 3200 },
      { id: 'item-2', cpf: CPF_OK2, banco: '33', agencia: '1234', conta: '567890', valor_liquido: 2100.5 },
    ],
  };

  it('põe o paymentType no LOTE, não no item', () => {
    const corpo = montarLoteFolha(base);
    expect(corpo.paymentType).toBe(2);
    expect(corpo.companies[0].items[0]).not.toHaveProperty('paymentType');
  });

  it('manda scheduledDate como date-time ao meio-dia, para não escorregar de fuso', () => {
    expect(montarLoteFolha(base).scheduledDate).toBe('2026-09-05T12:00:00Z');
  });

  it('leva o id do item em reference — a âncora de conciliação', () => {
    const corpo = montarLoteFolha(base);
    expect(corpo.companies[0].items.map(i => i.reference)).toEqual(['item-1', 'item-2']);
  });

  it('normaliza bankCode para três dígitos', () => {
    const corpo = montarLoteFolha(base);
    expect(corpo.companies[0].items[1].bankCode).toBe('033');
  });

  it('usa agência 50 como padrão da conta de débito', () => {
    const corpo = montarLoteFolha({ ...base, debitParty: { branchCode: '', number: '009133601' } });
    expect(corpo.companies[0].debitParty.branchCode).toBe('50');
  });

  it('recusa colaborador sem conta completa, dizendo quem é', () => {
    expect(() => montarLoteFolha({
      ...base,
      itens: [{ id: 'x', cpf: CPF_OK, banco: '208', agencia: null, conta: '123', valor_liquido: 100 }],
    })).toThrow(new RegExp(CPF_OK));
  });

  it('recusa folha vazia e data fora do formato', () => {
    expect(() => montarLoteFolha({ ...base, itens: [] })).toThrow(/sem colaboradores/);
    expect(() => montarLoteFolha({ ...base, dataPagamento: '05/09/2026' })).toThrow(/yyyy-MM-dd/);
  });

  it('trunca a descrição em 140 caracteres', () => {
    const corpo = montarLoteFolha({ ...base, descricao: 'x'.repeat(200) });
    expect(corpo.description).toHaveLength(140);
  });
});

describe('totalizar', () => {
  it('soma bruto, descontos e líquido', () => {
    const t = totalizar([
      { valor_bruto: 4000, descontos: 800, valor_liquido: 3200 },
      { valor_bruto: 2500, descontos: 399.5, valor_liquido: 2100.5 },
    ]);
    expect(t).toEqual({
      qtd_colaboradores: 2,
      total_bruto: 6500,
      total_descontos: 1199.5,
      total_liquido: 5300.5,
    });
  });

  it('tolera linhas sem bruto informado', () => {
    expect(totalizar([{ valor_liquido: 1000 }]).total_liquido).toBe(1000);
  });
});

describe('extrairRetornoFolha — leitura do retorno do lote', () => {
  // A folha ainda não rodou em produção (escopo payroll bloqueado), então o
  // formato exato da resposta é suposição. O que estes testes garantem é que
  // formatos plausíveis são lidos e que o desconhecido não vira baixa errada.

  it('lê itens na raiz, correlacionando pelo reference que enviamos', () => {
    const r = extrairRetornoFolha({
      status: 'PROCESSED',
      items: [
        { reference: 'lanc-1', status: 'PAID', netAmount: 3290.14, executedAt: '2026-07-30T10:00:00Z' },
        { reference: 'lanc-2', status: 'REJECTED', netAmount: 1714.45 },
      ],
    });
    expect(r.statusLote).toBe('PROCESSED');
    expect(r.itens).toHaveLength(2);
    expect(r.itens[0]).toEqual({
      referencia: 'lanc-1', status: 'PAID', valor: 3290.14, data: '2026-07-30',
    });
    expect(r.itens[1].status).toBe('REJECTED');
  });

  it('lê itens aninhados em companies[].items — mesmo formato do envio', () => {
    const r = extrairRetornoFolha({
      data: { status: 'COMPLETED', companies: [{ items: [{ reference: 'lanc-9', status: 'PAID', amount: 100 }] }] },
    });
    expect(r.itens[0].referencia).toBe('lanc-9');
    expect(r.itens[0].valor).toBe(100);
  });

  it('item sem status herda o status do lote', () => {
    const r = extrairRetornoFolha({ status: 'PROCESSED', payments: [{ reference: 'lanc-3' }] });
    expect(r.itens[0].status).toBe('PROCESSED');
  });

  it('formato desconhecido devolve lista vazia em vez de inventar baixa', () => {
    const r = extrairRetornoFolha({ mensagem: 'algo que não esperávamos' });
    expect(r.itens).toEqual([]);
  });

  it('resposta nula não quebra', () => {
    expect(extrairRetornoFolha(null)).toEqual({ statusLote: '', itens: [] });
  });

  it('item sem reference é lido, mas sem âncora — o chamador não vai baixá-lo', () => {
    const r = extrairRetornoFolha({ items: [{ status: 'PAID', amount: 50 }] });
    expect(r.itens[0].referencia).toBeNull();
  });
});

describe('vincularRubricas — o lastro do salário no mês seguinte', () => {
  // Sem este vínculo a rubrica existia, aprovada e com faixa, e todo salário
  // ainda saía SEM_LASTRO: a governança avalia por rubrica_id, não por
  // favorecido.
  const itens = [{ cpf: '35696197884' }, { cpf: '553.597.828-03' }];

  it('liga cada colaborador à rubrica do seu CPF', () => {
    const v = vincularRubricas(itens, [
      { id: 'r1', favorecido_documento: '356.961.978-84' },
      { id: 'r2', favorecido_documento: '55359782803' },
    ]);
    expect(v.get('35696197884')).toBe('r1');
    expect(v.get('55359782803')).toBe('r2');
  });

  it('pontuação não impede o vínculo dos dois lados', () => {
    const v = vincularRubricas([{ cpf: '356.961.978-84' }], [{ id: 'r1', favorecido_documento: '35696197884' }]);
    expect(v.get('35696197884')).toBe('r1');
  });

  it('quem não tem rubrica fica de fora, sem vínculo inventado', () => {
    const v = vincularRubricas(itens, [{ id: 'r1', favorecido_documento: '35696197884' }]);
    expect(v.size).toBe(1);
    expect(v.has('55359782803')).toBe(false);
  });

  it('CPF repetido em duas rubricas do mesmo evento não vincula nenhuma', () => {
    // Cadastro inconsistente: escolher uma seria fazer o selo de uma pessoa
    // responder por parâmetros que ninguém revisou.
    const v = vincularRubricas([{ cpf: '35696197884' }], [
      { id: 'r1', favorecido_documento: '35696197884' },
      { id: 'r2', favorecido_documento: '35696197884' },
    ]);
    expect(v.size).toBe(0);
  });

  it('rubrica sem documento é ignorada — nome não vincula', () => {
    expect(vincularRubricas(itens, [{ id: 'r1', favorecido_documento: null }]).size).toBe(0);
  });

  it('sem rubrica nenhuma, devolve mapa vazio sem quebrar', () => {
    expect(vincularRubricas(itens, []).size).toBe(0);
  });
});
