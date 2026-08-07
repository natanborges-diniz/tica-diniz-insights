// Testes do parser do Extrato Eletronico Cielo — layout v15 (manual 15.15).
//
// As linhas de teste sao montadas por um builder que posiciona cada campo pelas
// coordenadas do manual (1-based, inclusivas). O builder foi escrito a partir da
// especificacao, de forma independente do parser: se as duas leituras do manual
// divergirem, o teste quebra.

import { describe, it, expect } from 'vitest';
import {
  parseExtratoCielo,
  parseRegistroE,
  parseRegistroD,
  parseRegistro8,
  chaveRastreioVenda,
  chaveUrLancamento,
  agruparUrs,
  modalidadeVenda,
  statusVenda,
  normalizaCodigoRastreio,
  campoDataDDMMAAAA,
  campoDataAAMMDD,
  campoHora,
  campoValorComSinal,
  STATUS_PAGAMENTO,
  BANDEIRAS,
} from '../../../../supabase/functions/_shared/cieloLayout15';

// ---------------------------------------------------------------------------
// Builder de linhas posicionais
// ---------------------------------------------------------------------------

class LinhaBuilder {
  private buf: string[];

  constructor(tamanho: number) {
    this.buf = new Array(tamanho).fill(' ');
  }

  /** Escreve `valor` no intervalo [ini, fim] 1-based inclusivo. */
  put(ini: number, fim: number, valor: string): this {
    const largura = fim - ini + 1;
    if (valor.length > largura) {
      throw new Error(`Valor "${valor}" excede ${largura} posicoes em [${ini}, ${fim}]`);
    }
    for (let i = 0; i < largura; i++) {
      this.buf[ini - 1 + i] = valor[i] ?? ' ';
    }
    return this;
  }

  /** Numerico zero-padded a esquerda. */
  num(ini: number, fim: number, valor: number | string): this {
    return this.put(ini, fim, String(valor).padStart(fim - ini + 1, '0'));
  }

  /** Monetario: sinal na posicao anterior, valor em centavos zero-padded. */
  dinheiro(posSinal: number, ini: number, fim: number, reais: number): this {
    this.put(posSinal, posSinal, reais < 0 ? '-' : '+');
    return this.num(ini, fim, Math.round(Math.abs(reais) * 100));
  }

  build(): string {
    return this.buf.join('');
  }
}

const header = (over: Partial<{ tipo: string; matriz: string; seq: number; data: string }> = {}) => {
  const { tipo = '03', matriz = '1234567890', seq = 42, data = '20260804' } = over;
  return new LinhaBuilder(250)
    .put(1, 1, '0')
    .put(2, 11, matriz)
    .put(12, 19, data)
    .put(20, 27, data)
    .put(28, 35, data)
    .num(36, 42, seq)
    .put(43, 47, 'CIELO')
    .put(48, 49, tipo)
    .put(50, 50, 'I')
    .put(51, 70, 'CAIXA01')
    .put(71, 73, '015')
    .put(74, 75, '03')
    .put(76, 76, 'S')
    .build();
};

const trailer = (over: {
  total: number;
  liquido: number;
  qtdE: number;
  bruto: number;
}) =>
  new LinhaBuilder(250)
    .put(1, 1, '9')
    .num(2, 12, over.total)
    .dinheiro(13, 14, 30, over.liquido)
    .num(31, 41, over.qtdE)
    .dinheiro(42, 43, 59, over.bruto)
    .dinheiro(60, 61, 77, 0)
    .dinheiro(78, 79, 95, 0)
    .build();

interface OpcoesE {
  estabelecimento?: string;
  tipoLancamento?: string;
  parcela?: number;
  totalParcelas?: number;
  chaveUr?: string;
  codigoTransacaoRecebida?: string;
  numeroTransacaoProcessada?: string;
  bruto?: number;
  liquido?: number;
  tarifaAdm?: number;
  bandeiraLiq?: string;
  bandeiraAut?: string;
  nsu?: string;
  autorizacao?: string;
  dataAutorizacao?: string;
  dataVencimento?: string;
  taxaVenda?: number;
  rejeitada?: boolean;
}

const registroE = (o: OpcoesE = {}) => {
  const {
    estabelecimento = '0000012345',
    tipoLancamento = '02',
    parcela = 0,
    totalParcelas = 0,
    chaveUr = 'UR-ABC-0001',
    codigoTransacaoRecebida = '2608040210500000001',
    numeroTransacaoProcessada = '',
    bruto = 150.75,
    liquido = 145.5,
    tarifaAdm = -5.25,
    bandeiraLiq = '007',
    bandeiraAut = '007',
    nsu = '004321',
    autorizacao = 'A1B2C3',
    dataAutorizacao = '04082026',
    dataVencimento = '05092026',
    taxaVenda = 3.48,
    rejeitada = false,
  } = o;

  return new LinhaBuilder(760)
    .put(1, 1, 'E')
    .put(2, 11, estabelecimento)
    .put(12, 14, bandeiraLiq)
    .put(15, 17, '002')
    .num(18, 19, parcela)
    .num(20, 21, totalParcelas)
    .put(22, 27, autorizacao)
    .put(28, 29, tipoLancamento)
    .put(30, 129, chaveUr.padEnd(100, ' '))
    .put(130, 151, codigoTransacaoRecebida)
    .put(152, 155, '0000')
    .put(156, 158, '070')
    .put(159, 159, 'N')
    .put(160, 160, 'N')
    .put(161, 161, 'N')
    .put(162, 162, '3')
    .put(163, 163, 'N')
    .put(164, 164, rejeitada ? 'S' : 'N')
    .put(165, 165, 'N')
    .put(166, 171, '516292')
    .put(172, 175, '7788')
    .put(176, 181, nsu)
    .num(182, 191, 0)
    .put(192, 211, '')
    .put(212, 231, '')
    .num(232, 236, Math.round(taxaVenda * 100))
    .num(237, 241, 0)
    .num(242, 246, Math.round(taxaVenda * 100))
    .dinheiro(247, 248, 260, bruto)
    .dinheiro(261, 262, 274, bruto)
    .dinheiro(275, 276, 288, liquido)
    .dinheiro(289, 290, 302, tarifaAdm)
    .dinheiro(303, 304, 316, 0)
    .dinheiro(317, 318, 330, 0)
    .dinheiro(331, 332, 344, tarifaAdm)
    .dinheiro(345, 346, 358, 0)
    .dinheiro(359, 360, 372, 0)
    .dinheiro(373, 374, 386, 0)
    .dinheiro(387, 388, 400, 0)
    .dinheiro(401, 402, 414, 0)
    .dinheiro(415, 416, 428, 0)
    .dinheiro(429, 430, 442, tarifaAdm)
    .dinheiro(443, 444, 456, 0)
    .dinheiro(457, 458, 470, 0)
    .put(471, 476, '143025')
    .put(477, 478, '01')
    .put(479, 492, '12345678000199')
    .put(493, 495, bandeiraAut)
    .put(496, 510, '000000000000777')
    .put(511, 525, '000000000000000')
    .put(526, 540, '000000000000000')
    .put(541, 543, '001')
    .put(544, 551, '00099887')
    .put(552, 553, '00')
    .put(554, 556, tipoLancamento === '01' ? '001' : tipoLancamento === '03' ? '003' : '002')
    .num(557, 560, 0)
    .put(561, 565, 'MOD01')
    .put(566, 573, dataAutorizacao)
    .put(574, 581, dataAutorizacao)
    .put(582, 589, dataAutorizacao)
    .put(590, 597, dataAutorizacao)
    .num(598, 604, 12345)
    // Campo declarado "Num" no manual: zero-padded a ESQUERDA.
    .put(605, 626, numeroTransacaoProcessada.padStart(22, '0'))
    .put(627, 629, '')
    .put(630, 637, dataVencimento)
    .put(638, 647, '0000000001')
    .put(648, 649, '01')
    .put(650, 650, 'N')
    .put(651, 651, 'N')
    .put(652, 652, 'N')
    .put(653, 656, '0341')
    .put(657, 661, '12345')
    .put(662, 681, '00000000000000998877')
    .put(682, 682, '1')
    .put(683, 705, 'ARN000000000000000001')
    .put(706, 706, 'N')
    .put(707, 708, '05')
    .put(709, 722, '')
    .build();
};

interface OpcoesD {
  estabelecimento?: string;
  chaveUr?: string;
  tipoLancamento?: string;
  statusPagamento?: string;
  bruto?: number;
  taxa?: number;
  liquido?: number;
  dataPagamento?: string;
  qtdLancamentos?: number;
}

const registroD = (o: OpcoesD = {}) => {
  const {
    estabelecimento = '0000012345',
    chaveUr = 'UR-ABC-0001',
    tipoLancamento = '02',
    statusPagamento = '04',
    bruto = 150.75,
    taxa = 5.25,
    liquido = 145.5,
    dataPagamento = '05092026',
    qtdLancamentos = 1,
  } = o;

  const b = new LinhaBuilder(400)
    .put(1, 1, 'D')
    .put(2, 11, estabelecimento)
    .put(12, 25, '12345678000199')
    .put(26, 39, '12345678000199')
    .put(40, 53, '12345678000199')
    .put(54, 56, '007')
    .put(57, 59, '002')
    .put(60, 69, '0000012345')
    .put(70, 71, statusPagamento)
    .dinheiro(72, 73, 85, bruto);

  // Registro D inverte o sinal da taxa: "+" identifica valor a DEBITO.
  b.put(86, 86, '+').num(87, 99, Math.round(Math.abs(taxa) * 100));

  return b
    .dinheiro(100, 101, 113, liquido)
    .put(114, 117, '0341')
    .put(118, 122, '12345')
    .put(123, 142, '00000000000000998877')
    .put(143, 143, '1')
    .num(144, 149, qtdLancamentos)
    .put(150, 151, tipoLancamento)
    .put(152, 251, chaveUr.padEnd(100, ' '))
    .put(252, 253, '00')
    .put(254, 254, '0')
    .num(255, 263, 0)
    .num(264, 267, 0)
    .put(268, 275, dataPagamento)
    .put(276, 283, dataPagamento)
    .put(284, 291, dataPagamento)
    .put(292, 301, '0000012345')
    .put(302, 302, 'N')
    .put(303, 303, 'N')
    .put(304, 304, 'N')
    .put(305, 318, '')
    .put(319, 319, ' ')
    .build();
};

const registro8 = (
  o: { idPix?: string; bruto?: number; taxa?: number; liquido?: number; status?: string } = {},
) => {
  const {
    idPix = 'E1234567890123456789012345678901234',
    bruto = 80.0,
    taxa = -0.8,
    liquido = 79.2,
    status = '01',
  } = o;

  return new LinhaBuilder(400)
    .put(1, 1, '8')
    .put(2, 11, '0000012345')
    .put(12, 13, '01')
    .put(14, 19, '260804')
    .put(20, 25, '101530')
    .put(26, 61, idPix.padEnd(36, ' '))
    .put(62, 67, '000777')
    .put(68, 73, '260804')
    .dinheiro(74, 75, 87, bruto)
    .dinheiro(88, 89, 101, taxa)
    .dinheiro(102, 103, 115, liquido)
    .put(116, 119, '0341')
    .put(120, 124, '12345')
    .put(125, 144, '00000000000000998877')
    .put(145, 150, '260804')
    .num(151, 155, 100)
    .num(156, 159, 0)
    .put(160, 161, '01')
    .put(162, 169, '00099887')
    .num(170, 175, 0)
    .num(176, 181, 0)
    .put(182, 217, '')
    .put(218, 219, '  ')
    .put(220, 221, '  ')
    .put(222, 222, 'N')
    .put(223, 224, status)
    .put(225, 230, '260804')
    .num(231, 238, 777)
    .put(239, 239, 'N')
    .put(240, 275, 'TX0001'.padEnd(36, ' '))
    .put(276, 311, '')
    .put(312, 347, '')
    .build();
};

// ---------------------------------------------------------------------------
// Helpers de campo
// ---------------------------------------------------------------------------

describe('helpers de extracao', () => {
  it('converte DDMMAAAA para ISO', () => {
    expect(campoDataDDMMAAAA('04082026', 1, 8)).toBe('2026-08-04');
  });

  it('trata a sentinela 01011001 como ausencia de data', () => {
    // Manual, registro D: "Para valores ainda nao enviados sera informado 01011001".
    expect(campoDataDDMMAAAA('01011001', 1, 8)).toBeNull();
  });

  it('trata zeros como ausencia de data', () => {
    expect(campoDataDDMMAAAA('00000000', 1, 8)).toBeNull();
    expect(campoDataAAMMDD('000000', 1, 6)).toBeNull();
  });

  it('converte AAMMDD com pivot no ano 2000', () => {
    expect(campoDataAAMMDD('260804', 1, 6)).toBe('2026-08-04');
  });

  it('recusa datas que não existem no calendário', () => {
    // Um campo corrompido não pode virar '2026-02-31': passa em checagem de
    // faixa e só estoura no INSERT, derrubando o lote inteiro.
    expect(campoDataDDMMAAAA('31022026', 1, 8)).toBeNull();
    expect(campoDataDDMMAAAA('32012026', 1, 8)).toBeNull();
    expect(campoDataDDMMAAAA('01132026', 1, 8)).toBeNull();
    expect(campoDataDDMMAAAA('29022024', 1, 8)).toBe('2024-02-29'); // bissexto válido
    expect(campoDataDDMMAAAA('29022026', 1, 8)).toBeNull();         // 2026 não é bissexto
  });

  it('recusa horas fora de faixa', () => {
    expect(campoHora('143025', 1, 6)).toBe('14:30:25');
    expect(campoHora('999999', 1, 6)).toBeNull();
    expect(campoHora('246000', 1, 6)).toBeNull();
    expect(campoHora('  ab  ', 1, 6)).toBeNull();
  });

  it('aplica o sinal que precede o valor', () => {
    expect(campoValorComSinal('+0000000015075', 1, 2, 14)).toBeCloseTo(150.75, 2);
    expect(campoValorComSinal('-0000000015075', 1, 2, 14)).toBeCloseTo(-150.75, 2);
  });
});

describe('tabelas de dominio', () => {
  it('mapeia bandeiras da tabela III', () => {
    expect(BANDEIRAS['001']).toBe('VISA');
    expect(BANDEIRAS['002']).toBe('MASTERCARD');
    expect(BANDEIRAS['007']).toBe('ELO');
    expect(BANDEIRAS['040']).toBe('HIPERCARD');
    expect(BANDEIRAS['888']).toBe('PIX');
  });

  it('agrupa os codigos de status de pagamento da tabela IV', () => {
    expect(STATUS_PAGAMENTO['00']).toBe('AGENDADO');
    expect(STATUS_PAGAMENTO['04']).toBe('PAGO');
    expect(STATUS_PAGAMENTO['99']).toBe('PAGO');
    expect(STATUS_PAGAMENTO['06']).toBe('REJEITADO_PELO_BANCO');
    expect(STATUS_PAGAMENTO['46']).toBe('DEBITADO_EM_CONTA');
    expect(STATUS_PAGAMENTO['58']).toBe('PAGO_VIA_NEGOCIACAO');
    expect(STATUS_PAGAMENTO['02']).toBe('BLOQUEADO');
  });
});

// ---------------------------------------------------------------------------
// Registros
// ---------------------------------------------------------------------------

describe('registro E — detalhe do lancamento', () => {
  it('le os campos posicionais de uma venda a credito', () => {
    const e = parseRegistroE(registroE());

    expect(e.estabelecimentoSubmissor).toBe('12345');
    expect(e.tipoLancamento).toBe('02');
    expect(e.tipoLancamentoDescricao).toBe('Venda credito');
    expect(e.chaveUr).toBe('UR-ABC-0001');
    expect(e.codigoTransacaoRecebida).toBe('2608040210500000001');
    expect(e.codigoAutorizacao).toBe('A1B2C3');
    expect(e.nsu).toBe('004321');
    expect(e.binCartao).toBe('516292');
    expect(e.finalCartao).toBe('7788');
    expect(e.bandeiraLiquidacao).toBe('ELO');
    expect(e.valorBruto).toBeCloseTo(150.75, 2);
    expect(e.valorLiquido).toBeCloseTo(145.5, 2);
    expect(e.taxaVendaPercentual).toBeCloseTo(3.48, 2);
    expect(e.dataAutorizacao).toBe('2026-08-04');
    expect(e.dataVencimentoOriginal).toBe('2026-09-05');
    expect(e.horaTransacao).toBe('14:30:25');
    expect(e.canalVenda).toBe('POS');
    expect(e.tipoCaptura).toBe('Leitura de chip');
    expect(e.tipoTransacao).toBe('CREDITO');
  });

  it('mantem a tarifa administrativa como valor negativo (debito)', () => {
    const e = parseRegistroE(registroE({ tarifaAdm: -5.25 }));
    expect(e.valorTarifaAdministrativa).toBeCloseTo(-5.25, 2);
    expect(e.valorComissao).toBeCloseTo(-5.25, 2);
  });

  it('classifica modalidade pelo tipo de lancamento', () => {
    expect(modalidadeVenda(parseRegistroE(registroE({ tipoLancamento: '01' })))).toBe('DEBITO');
    expect(modalidadeVenda(parseRegistroE(registroE({ tipoLancamento: '02' })))).toBe('CREDITO');
    expect(modalidadeVenda(parseRegistroE(registroE({ tipoLancamento: '03' })))).toBe('CREDITO');
    expect(modalidadeVenda(parseRegistroE(registroE({ tipoLancamento: '42' })))).toBe('VOUCHER');
  });

  it('classifica status a partir do lancamento e do indicativo de rejeicao', () => {
    expect(statusVenda(parseRegistroE(registroE()))).toBe('APROVADA');
    expect(statusVenda(parseRegistroE(registroE({ tipoLancamento: '06' })))).toBe('CANCELADA');
    expect(statusVenda(parseRegistroE(registroE({ tipoLancamento: '08' })))).toBe('ESTORNADA');
    expect(statusVenda(parseRegistroE(registroE({ rejeitada: true })))).toBe('CANCELADA');
  });
});

describe('chave de rastreio', () => {
  it('usa o codigo da transacao recebida para venda a vista', () => {
    const e = parseRegistroE(registroE({ tipoLancamento: '02' }));
    expect(chaveRastreioVenda(e)).toBe('2608040210500000001');
  });

  it('não deixa duas linhas colidirem quando a Cielo manda o código zerado', () => {
    // Sem código de rastreio, o fallback precisa discriminar transações
    // distintas da mesma UR — senão o upsert em lote aborta com "cannot affect
    // row a second time".
    const comum = { tipoLancamento: '02', codigoTransacaoRecebida: '0'.repeat(22), chaveUr: 'UR-X' };
    const a = parseRegistroE(registroE({ ...comum, nsu: '000001', bruto: 10, liquido: 9 }));
    const b = parseRegistroE(registroE({ ...comum, nsu: '000002', bruto: 10, liquido: 9 }));
    const c = parseRegistroE(registroE({ ...comum, nsu: '000001', bruto: 20, liquido: 19 }));

    expect(a.codigoTransacaoRecebida).toBe('');
    expect(new Set([a, b, c].map(chaveRastreioVenda)).size).toBe(3);
  });

  it('desambigua parcelas do parcelado, que compartilham o mesmo codigo', () => {
    // Manual: "o Codigo da transacao recebida e o mesmo para todas as parcelas".
    const p1 = parseRegistroE(registroE({ tipoLancamento: '03', parcela: 1, totalParcelas: 4 }));
    const p2 = parseRegistroE(registroE({ tipoLancamento: '03', parcela: 2, totalParcelas: 4 }));

    expect(p1.codigoTransacaoRecebida).toBe(p2.codigoTransacaoRecebida);
    expect(chaveRastreioVenda(p1)).not.toBe(chaveRastreioVenda(p2));
    expect(chaveRastreioVenda(p1)).toBe('2608040210500000001#01');
    expect(chaveRastreioVenda(p2)).toBe('2608040210500000001#02');
  });
});

describe('registro D — UR agenda', () => {
  it('le os campos posicionais', () => {
    const d = parseRegistroD(registroD());

    expect(d.estabelecimentoSubmissor).toBe('12345');
    expect(d.chaveUr).toBe('UR-ABC-0001');
    expect(d.tipoLancamento).toBe('02');
    expect(d.bandeira).toBe('ELO');
    expect(d.valorBruto).toBeCloseTo(150.75, 2);
    expect(d.valorLiquido).toBeCloseTo(145.5, 2);
    expect(d.dataPagamento).toBe('2026-09-05');
    expect(d.banco).toBe('0341');
    expect(d.qtdLancamentos).toBe(1);
  });

  it('inverte o sinal da taxa administrativa conforme o manual', () => {
    // No registro D, "+" identifica valor a DEBITO — ao contrario do registro E.
    const d = parseRegistroD(registroD({ taxa: 5.25 }));
    expect(d.valorTaxaAdministrativa).toBeCloseTo(-5.25, 2);
  });

  it('deriva `liquidado` da tabela IV de status de pagamento', () => {
    expect(parseRegistroD(registroD({ statusPagamento: '04' })).liquidado).toBe(true);
    expect(parseRegistroD(registroD({ statusPagamento: '58' })).liquidado).toBe(true);
    expect(parseRegistroD(registroD({ statusPagamento: '46' })).liquidado).toBe(true);
    expect(parseRegistroD(registroD({ statusPagamento: '00' })).liquidado).toBe(false);
    expect(parseRegistroD(registroD({ statusPagamento: '06' })).liquidado).toBe(false);
    expect(parseRegistroD(registroD({ statusPagamento: '02' })).liquidado).toBe(false);
  });
});

describe('registro 8 — Pix', () => {
  it('le os campos posicionais', () => {
    const p = parseRegistro8(registro8());

    expect(p.tipoTransacao).toBe('01');
    expect(p.idPix).toBe('E1234567890123456789012345678901234');
    expect(p.dataTransacao).toBe('2026-08-04');
    expect(p.horaTransacao).toBe('10:15:30');
    expect(p.valorBruto).toBeCloseTo(80.0, 2);
    expect(p.valorLiquido).toBeCloseTo(79.2, 2);
    expect(p.valorTaxaAdministrativa).toBeCloseTo(-0.8, 2);
    expect(p.txId).toBe('TX0001');
    expect(p.nsuLongo).toBe('00000777');
  });

  it('considera liquidado apenas os status 01 e 05', () => {
    // Manual: "considerar como liquidadas as transacoes com status 01 ou 05".
    expect(parseRegistro8(registro8({ status: '01' })).liquidado).toBe(true);
    expect(parseRegistro8(registro8({ status: '05' })).liquidado).toBe(true);
    expect(parseRegistro8(registro8({ status: '02' })).liquidado).toBe(false);
    expect(parseRegistro8(registro8({ status: '03' })).liquidado).toBe(false);
    expect(parseRegistro8(registro8({ status: '06' })).liquidado).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Arquivo completo
// ---------------------------------------------------------------------------

describe('parseExtratoCielo — CIELO03', () => {
  const montar = (regs: string[], t: { total: number; liquido: number; qtdE: number; bruto: number }) =>
    [header({ tipo: '03' }), ...regs, trailer(t)].join('\n');

  it('parseia e valida um arquivo consistente', () => {
    const e1 = registroE({ bruto: 150.75, liquido: 145.5 });
    const e2 = registroE({
      bruto: 100,
      liquido: 96.5,
      chaveUr: 'UR-ABC-0002',
      codigoTransacaoRecebida: '2608040210500000002',
    });

    const parsed = parseExtratoCielo(
      montar([e1, e2], { total: 2, liquido: 242.0, qtdE: 2, bruto: 250.75 }),
    );

    expect(parsed.header.tipoArquivo).toBe('CIELO03');
    expect(parsed.header.versaoLayout).toBe('015');
    expect(parsed.header.estabelecimentoMatriz).toBe('1234567890');
    expect(parsed.registrosE).toHaveLength(2);
    expect(parsed.validacao.ok).toBe(true);
    expect(parsed.validacao.erros).toEqual([]);
  });

  it('acusa divergencia entre trailer e soma dos registros', () => {
    const parsed = parseExtratoCielo(
      montar([registroE()], { total: 1, liquido: 999.99, qtdE: 1, bruto: 150.75 }),
    );

    expect(parsed.validacao.ok).toBe(false);
    expect(parsed.validacao.erros.some((e) => e.includes('liquido'))).toBe(true);
  });

  it('acusa contagem de registros divergente', () => {
    const parsed = parseExtratoCielo(
      montar([registroE()], { total: 5, liquido: 145.5, qtdE: 5, bruto: 150.75 }),
    );

    expect(parsed.validacao.ok).toBe(false);
    expect(parsed.validacao.erros).toHaveLength(2);
  });

  it('avisa quando a matriz nao cobre toda a hierarquia', () => {
    // Visto em arquivo real da Cielo: posição 76 = "N". Significa que existe
    // estabelecimento da hierarquia fora desta matriz, e a venda dele não entra
    // no arquivo — some da conciliação sem nada apontando a causa.
    const incompleto = new LinhaBuilder(250)
      .put(1, 1, '0').put(2, 11, '2809658220').put(12, 19, '20260807')
      .put(20, 27, '20260807').put(28, 35, '20260807').num(36, 42, 1269)
      .put(43, 47, 'CIELO').put(48, 49, '03').put(50, 50, 'I')
      .put(71, 73, '015').put(74, 75, '03').put(76, 76, 'N')
      .build();

    const parsed = parseExtratoCielo(
      [incompleto, trailer({ total: 0, liquido: 0, qtdE: 0, bruto: 0 })].join('\n'),
    );

    expect(parsed.header.cadastroCompleto).toBe(false);
    expect(parsed.validacao.ok).toBe(true);
    expect(parsed.validacao.avisos.some(a => a.includes('Cadastro incompleto'))).toBe(true);
  });

  it('parseia arquivo sem movimento, so header e trailer', () => {
    // Formato real dos dias sem venda: o arquivo vem mesmo assim, zerado.
    const vazio = new LinhaBuilder(250)
      .put(1, 1, '0').put(2, 11, '2809658220').put(12, 19, '20260807')
      .put(20, 27, '20260807').put(28, 35, '20260807').num(36, 42, 1269)
      .put(43, 47, 'CIELO').put(48, 49, '03').put(50, 50, 'I')
      .put(71, 73, '015').put(74, 75, '03').put(76, 76, 'S')
      .build();

    const parsed = parseExtratoCielo(
      [vazio, trailer({ total: 0, liquido: 0, qtdE: 0, bruto: 0 })].join('\n'),
    );

    expect(parsed.header.estabelecimentoMatriz).toBe('2809658220');
    expect(parsed.header.sequencia).toBe(1269);
    expect(parsed.registrosE).toHaveLength(0);
    expect(parsed.validacao.ok).toBe(true);
    expect(parsed.validacao.erros).toEqual([]);
  });

  it('avisa quando o arquivo e um reprocessamento', () => {
    const arquivo = [
      header({ tipo: '03', seq: 9999999 }),
      registroE(),
      trailer({ total: 1, liquido: 145.5, qtdE: 1, bruto: 150.75 }),
    ].join('\n');

    const parsed = parseExtratoCielo(arquivo);
    expect(parsed.header.reprocessamento).toBe(true);
    expect(parsed.validacao.avisos.some((a) => a.includes('reprocessamento'))).toBe(true);
  });

  it('conta registros nao tratados sem quebrar o parse', () => {
    // Registro R (Reserva Financeira) aparece no CIELO03 mas nao e tratado aqui.
    const linhaR = new LinhaBuilder(250).put(1, 1, 'R').build();
    const parsed = parseExtratoCielo(
      [
        header({ tipo: '03' }),
        registroE(),
        linhaR,
        trailer({ total: 2, liquido: 145.5, qtdE: 1, bruto: 150.75 }),
      ].join('\n'),
    );

    expect(parsed.registrosIgnorados).toEqual({ R: 1 });
    expect(parsed.validacao.ok).toBe(true);
    expect(parsed.validacao.avisos.some((a) => a.includes('R=1'))).toBe(true);
  });

  it('rejeita arquivo sem header', () => {
    expect(() => parseExtratoCielo(registroE())).toThrow(/header/i);
  });

  it('rejeita arquivo vazio', () => {
    expect(() => parseExtratoCielo('   \n\n')).toThrow(/vazio/i);
  });

  it('ignora terminadores CRLF', () => {
    const parsed = parseExtratoCielo(
      [header(), registroE(), trailer({ total: 1, liquido: 145.5, qtdE: 1, bruto: 150.75 })].join(
        '\r\n',
      ),
    );
    expect(parsed.registrosE).toHaveLength(1);
    expect(parsed.validacao.ok).toBe(true);
  });
});

describe('parseExtratoCielo — CIELO04', () => {
  it('valida o trailer contra os registros D, nao os E', () => {
    // Manual, registro 9: "CIELO04 considera a somatoria dos valores dos registros D".
    const parsed = parseExtratoCielo(
      [
        header({ tipo: '04' }),
        registroD({ bruto: 150.75, liquido: 145.5 }),
        registroE({ bruto: 150.75, liquido: 145.5 }),
        trailer({ total: 2, liquido: 145.5, qtdE: 1, bruto: 150.75 }),
      ].join('\n'),
    );

    expect(parsed.header.tipoArquivo).toBe('CIELO04');
    expect(parsed.validacao.ok).toBe(true);
  });

  it('vincula registros E as URs por chave UR + tipo de lancamento', () => {
    const parsed = parseExtratoCielo(
      [
        header({ tipo: '04' }),
        registroD({ chaveUr: 'UR-A', tipoLancamento: '02', bruto: 250.75, liquido: 242.0, qtdLancamentos: 2 }),
        registroE({ chaveUr: 'UR-A', tipoLancamento: '02', bruto: 150.75, liquido: 145.5 }),
        registroE({
          chaveUr: 'UR-A',
          tipoLancamento: '02',
          bruto: 100,
          liquido: 96.5,
          codigoTransacaoRecebida: '2608040210500000002',
        }),
        registroE({ chaveUr: 'UR-ORFA', tipoLancamento: '02' }),
        trailer({ total: 4, liquido: 242.0, qtdE: 3, bruto: 250.75 }),
      ].join('\n'),
    );

    const { urs, orfaos } = agruparUrs(parsed);

    expect(urs).toHaveLength(1);
    expect(urs[0].ur.chaveUr).toBe('UR-A');
    expect(urs[0].lancamentos).toHaveLength(2);
    expect(orfaos).toHaveLength(1);
    expect(orfaos[0].chaveUr).toBe('UR-ORFA');
  });

  it('nao mistura URs de mesma chave com tipos de lancamento diferentes', () => {
    // Uma venda (02) e um cancelamento (06) podem cair na mesma chave UR.
    expect(chaveUrLancamento('UR-A', '02')).not.toBe(chaveUrLancamento('UR-A', '06'));

    const parsed = parseExtratoCielo(
      [
        header({ tipo: '04' }),
        registroD({ chaveUr: 'UR-A', tipoLancamento: '02', bruto: 150.75, liquido: 145.5 }),
        registroD({ chaveUr: 'UR-A', tipoLancamento: '06', bruto: -50, liquido: -50 }),
        registroE({ chaveUr: 'UR-A', tipoLancamento: '06', bruto: -50, liquido: -50 }),
        trailer({ total: 3, liquido: 95.5, qtdE: 1, bruto: 100.75 }),
      ].join('\n'),
    );

    const { urs } = agruparUrs(parsed);
    expect(urs).toHaveLength(2);
    expect(urs.find((u) => u.ur.tipoLancamento === '06')!.lancamentos).toHaveLength(1);
    expect(urs.find((u) => u.ur.tipoLancamento === '02')!.lancamentos).toHaveLength(0);
  });
});

describe('parseExtratoCielo — CIELO16', () => {
  it('valida o trailer contra os registros 8', () => {
    const parsed = parseExtratoCielo(
      [
        header({ tipo: '16' }),
        registro8({ bruto: 80, liquido: 79.2 }),
        registro8({ idPix: 'E9999999999999999999999999999999999', bruto: 20, liquido: 19.8 }),
        trailer({ total: 2, liquido: 99.0, qtdE: 0, bruto: 100.0 }),
      ].join('\n'),
    );

    expect(parsed.header.tipoArquivo).toBe('CIELO16');
    expect(parsed.registros8).toHaveLength(2);
    expect(parsed.validacao.ok).toBe(true);
  });
});

describe('rastreio de ajustes', () => {
  it('liga o cancelamento a venda de origem pelo numero da transacao processada', () => {
    // Exemplo do manual: cancelamento com codigo proprio 2303020610410000657
    // apontando para a venda original 2303010110290001373.
    const cancelamento = parseRegistroE(
      registroE({
        tipoLancamento: '06',
        codigoTransacaoRecebida: '2303020610410000657',
        numeroTransacaoProcessada: '2303010110290001373',
      }),
    );

    expect(cancelamento.codigoTransacaoRecebida).toBe('2303020610410000657');
    expect(cancelamento.numeroTransacaoProcessada).toBe('2303010110290001373');
    expect(chaveRastreioVenda(cancelamento)).toBe('2303020610410000657');
  });

  it('casa o ajuste com a venda apesar dos paddings diferentes dos dois campos', () => {
    // "Codigo da transacao recebida" e Alpha/Num (alinhado a esquerda) e
    // "Numero da transacao processada" e Num (zero-padded a esquerda). Sem
    // normalizacao os dois nunca se encontrariam.
    const venda = parseRegistroE(
      registroE({ tipoLancamento: '02', codigoTransacaoRecebida: '2303010110290001373' }),
    );
    const cancelamento = parseRegistroE(
      registroE({
        tipoLancamento: '06',
        codigoTransacaoRecebida: '2303020610410000657',
        numeroTransacaoProcessada: '2303010110290001373',
      }),
    );

    expect(cancelamento.numeroTransacaoProcessada).toBe(venda.codigoTransacaoRecebida);
    expect(chaveRastreioVenda(venda).startsWith(cancelamento.numeroTransacaoProcessada)).toBe(true);
  });

  it('trata campo todo zerado como ausencia de vinculo', () => {
    const venda = parseRegistroE(registroE({ tipoLancamento: '02' }));
    expect(venda.numeroTransacaoProcessada).toBe('');
  });

  it('preserva codigos alfanumericos sem mexer em zeros a esquerda', () => {
    expect(normalizaCodigoRastreio('00AB12')).toBe('00AB12');
    expect(normalizaCodigoRastreio('  000123  ')).toBe('123');
    expect(normalizaCodigoRastreio('00000')).toBe('');
  });
});
