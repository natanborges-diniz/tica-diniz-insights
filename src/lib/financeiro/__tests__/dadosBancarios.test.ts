// Cruzamento da planilha de dados bancários com a folha.
//
// O erro caro aqui não é deixar de casar — é casar errado: dado bancário de uma
// pessoa gravado na rubrica de outra manda o salário para a conta errada. Por
// isso a regra é conservadora, e a dúvida nunca vira decisão.
import { describe, it, expect } from 'vitest';
import {
  cruzarDadosBancarios,
  normalizarNome,
  normalizarTipoConta,
  temDadosDePagamento,
  mapearLinhaBancaria,
  normalizarCabecalho,
  type ColaboradorAlvo,
} from '../../../../supabase/functions/_shared/dadosBancarios';

const EDINEIA: ColaboradorAlvo = { id: 'i1', nome: 'EDINEIA FERNANDES DIAS', cpf: '35696197884' };
const YASMIN: ColaboradorAlvo = { id: 'i2', nome: 'YASMIN SANTOS CORDEIRO', cpf: '55359782803' };

const conta = (over = {}) => ({ banco: '208', agencia: '0050', conta: '008792899', ...over });

describe('normalizarNome', () => {
  it('acento e caixa não separam a mesma pessoa', () => {
    expect(normalizarNome('José da Silva')).toBe(normalizarNome('JOSE DA SILVA'));
  });

  it('mantém partículas — elas distinguem gente de verdade', () => {
    expect(normalizarNome('JOSE DA SILVA')).not.toBe(normalizarNome('JOSE SILVA'));
  });

  it('espaço duplo e pontuação não atrapalham', () => {
    expect(normalizarNome('  MARIA   S.  SOUZA ')).toBe('MARIA S SOUZA');
  });
});

describe('temDadosDePagamento', () => {
  it('exige banco, agência e conta juntos quando não há chave pix', () => {
    expect(temDadosDePagamento(conta())).toBe(true);
    expect(temDadosDePagamento({ banco: '208', agencia: '0050' })).toBe(false);
  });

  it('só chave pix serve — pagamento por chave é caminho válido', () => {
    expect(temDadosDePagamento({ chave_pix: 'a@b.com' })).toBe(true);
  });

  it('linha totalmente vazia não serve', () => {
    expect(temDadosDePagamento({ nome: 'X' })).toBe(false);
  });
});

describe('normalizarTipoConta', () => {
  it('entende o que o RH escreve', () => {
    expect(normalizarTipoConta('Poupança')).toBe('PP');
    expect(normalizarTipoConta('conta salário')).toBe('PG');
    expect(normalizarTipoConta('Corrente')).toBe('CC');
    expect(normalizarTipoConta('')).toBe('CC');
  });
});

describe('cruzarDadosBancarios', () => {
  it('casa por CPF mesmo com o nome escrito diferente', () => {
    const r = cruzarDadosBancarios(
      [{ nome: 'Edinéia F. Dias', cpf: '356.961.978-84', ...conta() }],
      [EDINEIA, YASMIN],
    );
    expect(r.casados).toHaveLength(1);
    expect(r.casados[0].por).toBe('CPF');
    expect(r.casados[0].alvo.id).toBe('i1');
  });

  it('sem CPF na planilha, casa pelo nome normalizado', () => {
    const r = cruzarDadosBancarios(
      [{ nome: 'yasmin santos cordeiro', ...conta() }],
      [EDINEIA, YASMIN],
    );
    expect(r.casados[0].por).toBe('NOME');
    expect(r.casados[0].alvo.id).toBe('i2');
  });

  it('CPF manda sobre o nome quando os dois apontam para pessoas diferentes', () => {
    // Planilha com nome de uma e CPF de outra: o CPF é o campo que não varia.
    const r = cruzarDadosBancarios(
      [{ nome: 'YASMIN SANTOS CORDEIRO', cpf: '35696197884', ...conta() }],
      [EDINEIA, YASMIN],
    );
    expect(r.casados[0].alvo.id).toBe('i1');
  });

  it('homônimos sem CPF não casam — escolher um seria apostar o salário', () => {
    const gemeas = [
      { id: 'a', nome: 'MARIA SOUZA', cpf: '' },
      { id: 'b', nome: 'MARIA SOUZA', cpf: '' },
    ];
    const r = cruzarDadosBancarios([{ nome: 'Maria Souza', ...conta() }], gemeas);
    expect(r.casados).toHaveLength(0);
    expect(r.ambiguos).toEqual([{ nome: 'MARIA SOUZA', quantidade: 2 }]);
  });

  it('normaliza banco com zero à esquerda e tira máscara da conta', () => {
    const r = cruzarDadosBancarios(
      [{ cpf: '35696197884', banco: '33', agencia: '1234-5', conta: '00879.289-9' }],
      [EDINEIA],
    );
    expect(r.casados[0].dados.banco).toBe('033');
    expect(r.casados[0].dados.agencia).toBe('12345');
    expect(r.casados[0].dados.conta).toBe('008792899');
  });

  it('linha sem dados de pagamento não casa com ninguém', () => {
    const r = cruzarDadosBancarios([{ cpf: '35696197884', banco: '208' }], [EDINEIA]);
    expect(r.casados).toHaveLength(0);
    expect(r.sem_correspondente).toHaveLength(1);
    expect(r.sem_correspondente[0].motivo).toBe('SEM_DADOS_DE_PAGAMENTO');
  });

  it('lista quem a planilha não cobriu — é quem trava o fechamento', () => {
    const r = cruzarDadosBancarios([{ cpf: '35696197884', ...conta() }], [EDINEIA, YASMIN]);
    expect(r.nao_cobertos.map(a => a.id)).toEqual(['i2']);
  });

  it('funcionário demitido continua na planilha e não vira erro, só sobra', () => {
    const r = cruzarDadosBancarios(
      [{ nome: 'JOAO QUE SAIU', cpf: '11144477735', ...conta() }],
      [EDINEIA],
    );
    expect(r.sem_correspondente).toHaveLength(1);
    expect(r.sem_correspondente[0].motivo).toBe('NAO_ESTA_NA_FOLHA');
    expect(r.casados).toHaveLength(0);
  });

  it('linha repetida para a mesma pessoa: a primeira vence', () => {
    const r = cruzarDadosBancarios(
      [
        { cpf: '35696197884', ...conta({ conta: '111111111' }) },
        { cpf: '35696197884', ...conta({ conta: '999999999' }) },
      ],
      [EDINEIA],
    );
    expect(r.casados).toHaveLength(1);
    expect(r.casados[0].dados.conta).toBe('111111111');
  });

  it('planilha vazia não casa nada e reporta todo mundo como descoberto', () => {
    const r = cruzarDadosBancarios([], [EDINEIA, YASMIN]);
    expect(r.casados).toEqual([]);
    expect(r.nao_cobertos).toHaveLength(2);
  });
});

describe('mapearLinhaBancaria — cabeçalho que cada RH escreve do seu jeito', () => {
  it('reconhece a coluna de chave Pix nas grafias comuns', () => {
    for (const cabecalho of ['Chave PIX', 'chave_pix', 'PIX', 'Chave', 'chavePix']) {
      expect(mapearLinhaBancaria({ [cabecalho]: 'edineia@email.com' }).chave_pix)
        .toBe('edineia@email.com');
    }
  });

  it('cabeçalho mais longo entra pelo prefixo', () => {
    expect(mapearLinhaBancaria({ 'Chave PIX do colaborador': '11999998888' }).chave_pix)
      .toBe('11999998888');
    expect(mapearLinhaBancaria({ 'Nº da Conta (com dígito)': '008792899' }).conta)
      .toBe('008792899');
  });

  it('planilha completa é lida inteira', () => {
    const l = mapearLinhaBancaria({
      'Nome': 'EDINEIA FERNANDES DIAS',
      'CPF': '356.961.978-84',
      'Banco': '208',
      'Agência': '0050',
      'Conta c/ Dígito': '008792899',
      'Tipo de Conta': 'Corrente',
      'Chave PIX': 'edineia@email.com',
    });
    expect(l).toEqual({
      nome: 'EDINEIA FERNANDES DIAS',
      cpf: '356.961.978-84',
      banco: '208',
      agencia: '0050',
      conta: '008792899',
      tipo_conta: 'Corrente',
      chave_pix: 'edineia@email.com',
    });
  });

  it('"Conta c/ Dígito" ganha de "Conta" quando as duas existem', () => {
    const l = mapearLinhaBancaria({ 'Conta': '87928', 'Conta com dígito': '008792899' });
    expect(l.conta).toBe('008792899');
  });

  it('célula vazia não vira string vazia — o campo simplesmente não vem', () => {
    const l = mapearLinhaBancaria({ 'Nome': 'X', 'Agência': '   ', 'Chave PIX': '' });
    expect(l.agencia).toBeUndefined();
    expect(l.chave_pix).toBeUndefined();
  });

  it('coluna desconhecida é ignorada, não quebra a leitura', () => {
    const l = mapearLinhaBancaria({ 'Nome': 'X', 'Centro de custo': '42' });
    expect(l.nome).toBe('X');
  });

  it('planilha só com Pix é lida — é o caso que motivou tudo isto', () => {
    const l = mapearLinhaBancaria({ 'Funcionário': 'YASMIN', 'CPF': '55359782803', 'PIX': '553.597.828-03' });
    expect(l.chave_pix).toBe('553.597.828-03');
    expect(temDadosDePagamento(l)).toBe(true);
  });
});

describe('normalizarCabecalho', () => {
  it('tira acento, espaço e pontuação', () => {
    expect(normalizarCabecalho('Conta c/ Dígito')).toBe('contacdigito');
    expect(normalizarCabecalho(' AGÊNCIA ')).toBe('agencia');
  });
});
