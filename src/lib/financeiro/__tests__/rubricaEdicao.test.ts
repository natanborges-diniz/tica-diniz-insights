// Edição e cancelamento de rubrica.
//
// O risco que estas regras cobrem: editar virar a porta dos fundos da aprovação.
// Aprovar uma rubrica de R$ 100 e depois trocar o teto para R$ 100.000 daria
// autorização irrestrita sem ninguém aprovar nada.
import { describe, it, expect } from 'vitest';
import {
  validarEdicao,
  validarCancelamento,
  CAMPOS_SENSIVEIS,
  type RubricaEditavel,
} from '../../../../supabase/functions/_shared/rubricaEdicao';

const ATIVA: RubricaEditavel = {
  id: 'r1',
  status: 'ATIVA',
  descricao: 'Salário — EDINEIA FERNANDES DIAS',
  favorecido_nome: 'EDINEIA FERNANDES DIAS',
  favorecido_documento: '35696197884',
  favorecido_banco: '208',
  favorecido_agencia: '0050',
  favorecido_conta: '008792899',
  favorecido_tipo_conta: 'CC',
  forma_pagamento: 'PIX_MANUAL',
  valor_esperado: 3290.14,
  tolerancia_pct: 20,
  valor_teto: 4935.21,
  dia_vencimento: 5,
  conta_numero: '4.1.1.001',
};

describe('validarEdicao — o que exige aprovação de novo', () => {
  it('mudar o teto derruba a rubrica para reaprovação', () => {
    const r = validarEdicao(ATIVA, { valor_teto: 100000 });
    expect(r.erros).toEqual([]);
    expect(r.alterados).toEqual(['valor_teto']);
    expect(r.exigeReaprovacao).toBe(true);
  });

  it('mudar a conta do favorecido também — é para onde o dinheiro vai', () => {
    expect(validarEdicao(ATIVA, { favorecido_conta: '999999999' }).exigeReaprovacao).toBe(true);
  });

  it('mudar tolerância exige reaprovação: ela define o que passa sem a Mesa', () => {
    expect(validarEdicao(ATIVA, { tolerancia_pct: 90 }).exigeReaprovacao).toBe(true);
  });

  it('descrição e dia de vencimento não mudam risco — segue ativa', () => {
    const r = validarEdicao(ATIVA, { descricao: 'Salário mensal — Edinéia', dia_vencimento: 10 });
    expect(r.erros).toEqual([]);
    expect(r.exigeReaprovacao).toBe(false);
  });

  it('rubrica em rascunho nunca "exige reaprovação" — já está lá', () => {
    const r = validarEdicao({ ...ATIVA, status: 'RASCUNHO' }, { valor_teto: 9000 });
    expect(r.exigeReaprovacao).toBe(false);
  });

  it('a lista de campos sensíveis cobre favorecido, valores e destino', () => {
    expect(CAMPOS_SENSIVEIS).toContain('favorecido_documento');
    expect(CAMPOS_SENSIVEIS).toContain('valor_esperado');
    expect(CAMPOS_SENSIVEIS).toContain('forma_pagamento');
    expect(CAMPOS_SENSIVEIS).not.toContain('dia_vencimento');
  });
});

describe('validarEdicao — o que é considerado mudança', () => {
  it('reenviar o mesmo valor não conta como alteração', () => {
    const r = validarEdicao(ATIVA, { valor_teto: 4935.21, descricao: ATIVA.descricao });
    expect(r.alterados).toEqual([]);
    expect(r.erros).toContain('Nada foi alterado');
  });

  it('"0050" e "50" são a mesma agência — zero à esquerda não é edição', () => {
    // Diferença falsa aqui derrubaria uma rubrica ATIVA para rascunho, travando
    // o pagamento do mês por uma aprovação que ninguém sabia ser necessária.
    expect(validarEdicao(ATIVA, { favorecido_agencia: '50' }).alterados).toEqual([]);
  });

  it('conta com máscara e com zero à esquerda continua a mesma conta', () => {
    expect(validarEdicao(ATIVA, { favorecido_conta: '8.792-899' }).alterados).toEqual([]);
  });

  it('mas trocar de conta de verdade é detectado', () => {
    expect(validarEdicao(ATIVA, { favorecido_conta: '123456' }).alterados).toEqual(['favorecido_conta']);
  });

  it('CPF com e sem pontuação é o mesmo documento', () => {
    expect(validarEdicao(ATIVA, { favorecido_documento: '356.961.978-84' }).alterados).toEqual([]);
  });
});

describe('validarEdicao — recusas', () => {
  it('teto zerado é recusado: sem teto a rubrica autoriza qualquer valor', () => {
    expect(validarEdicao(ATIVA, { valor_teto: 0 }).erros).toContain('Teto deve ser maior que zero');
  });

  it('esperado acima do teto é recusado — o pagamento normal nasceria barrado', () => {
    const r = validarEdicao(ATIVA, { valor_esperado: 5000 });
    expect(r.erros.some(e => e.includes('não pode ser maior que o teto'))).toBe(true);
  });

  it('tolerância fora de 0–100 é recusada', () => {
    expect(validarEdicao(ATIVA, { tolerancia_pct: 150 }).erros)
      .toContain('Tolerância deve estar entre 0 e 100%');
  });

  it('dia 30 é recusado — não existe em fevereiro', () => {
    expect(validarEdicao(ATIVA, { dia_vencimento: 30 }).erros)
      .toContain('Dia de vencimento deve estar entre 1 e 28');
  });

  it('documento que não é CPF nem CNPJ é recusado', () => {
    expect(validarEdicao(ATIVA, { favorecido_documento: '12345' }).erros.length).toBeGreaterThan(0);
  });

  it('favorecido não pode ficar sem nome', () => {
    expect(validarEdicao(ATIVA, { favorecido_nome: '  ' }).erros)
      .toContain('Favorecido não pode ficar sem nome');
  });

  it('rubrica cancelada não aceita edição nenhuma', () => {
    const r = validarEdicao({ ...ATIVA, status: 'CANCELADA' }, { descricao: 'x' });
    expect(r.erros[0]).toMatch(/cancelada não pode ser editada/);
    expect(r.alterados).toEqual([]);
  });

  it('campo fora da lista de editáveis é ignorado, não vira erro silencioso', () => {
    const r = validarEdicao(ATIVA, { status: 'ATIVA', id: 'outro', descricao: 'nova' });
    expect(r.alterados).toEqual(['descricao']);
  });
});

describe('validarCancelamento', () => {
  it('cancela com motivo e sem títulos em aberto', () => {
    expect(validarCancelamento(ATIVA, 0, 'Colaboradora desligada em 05/08').erros).toEqual([]);
  });

  it('exige motivo — cancelamento sem razão não se audita', () => {
    expect(validarCancelamento(ATIVA, 0, 'saiu').erros)
      .toContain('Informe o motivo do cancelamento (mínimo 10 caracteres)');
  });

  it('recusa com lançamento em aberto e sugere suspender', () => {
    const r = validarCancelamento(ATIVA, 3, 'Colaboradora desligada em 05/08');
    expect(r.erros[0]).toContain('3 lançamento(s) em aberto');
    expect(r.erros[0]).toContain('suspender');
  });

  it('cancelar duas vezes é recusado', () => {
    expect(validarCancelamento({ ...ATIVA, status: 'CANCELADA' }, 0, 'motivo suficiente aqui').erros)
      .toContain('Rubrica já está cancelada');
  });
});
