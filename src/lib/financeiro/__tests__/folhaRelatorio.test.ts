// Leitura da Relação de Totais Líquidos.
//
// O texto abaixo é o relatório real de Osasco (M DE M GOMES OPTICA), colado como
// sai do leitor de PDF — inclusive com rótulo grudado no valor
// ("Razão Social:M DE M...") e dois campos na mesma linha.
import { describe, it, expect } from 'vitest';
import {
  parseRelatorioFolha,
  ehRelatorioTotaisLiquidos,
} from '../../../../supabase/functions/_shared/folhaRelatorio';

const RELATORIO = `Relação de Totais Líquidos Pág: 1
Período de:01/07/2026 à 31/07/2026 Pagamento
Razão Social:M DE M GOMES OPTICA C.N.P.J./CEI:13.844.111/0001-26
Endereço:Rua Dona Primitiva Vianco Nº:355
Complemento: Bairro:Centro
Cidade:Osasco UF:SP CEP:06010-000
Código Funcionário CPF Data Pagamento Valor Líquido
75 EDINEIA FERNANDES DIAS 356.961.978-84 30/07/2026 3.290,14
77 YASMIN SANTOS CORDEIRO 553.597.828-03 30/07/2026 1.714,45
Total: 5.004,59`;

describe('ehRelatorioTotaisLiquidos', () => {
  it('reconhece o relatório', () => {
    expect(ehRelatorioTotaisLiquidos(RELATORIO)).toBe(true);
  });

  it('planilha TSV não é confundida com o relatório', () => {
    expect(ehRelatorioTotaisLiquidos('nome\tcpf\tvalor\nJoão\t35696197884\t100')).toBe(false);
  });

  it('cabeçalho sem nenhuma linha de colaborador é recusado', () => {
    // Cópia truncada: o operador selecionou só a primeira meia página. Passar
    // aqui importaria uma folha vazia sem ninguém perceber.
    const truncado = RELATORIO.split('\n').slice(0, 6).join('\n');
    expect(ehRelatorioTotaisLiquidos(truncado)).toBe(false);
  });
});

describe('parseRelatorioFolha — cabeçalho', () => {
  const r = parseRelatorioFolha(RELATORIO);

  it('extrai o CNPJ só com dígitos, para casar com a loja', () => {
    expect(r.cnpj).toBe('13844111000126');
  });

  it('extrai a razão social sem engolir o rótulo seguinte', () => {
    expect(r.razao_social).toBe('M DE M GOMES OPTICA');
  });

  it('deriva a competência do mês inicial do período', () => {
    expect(r.competencia).toBe('2026-07');
  });

  it('usa a data de pagamento predominante', () => {
    expect(r.data_pagamento).toBe('2026-07-30');
  });
});

describe('parseRelatorioFolha — colaboradores', () => {
  const r = parseRelatorioFolha(RELATORIO);

  it('lê todos, sem o cabeçalho da tabela virar linha', () => {
    expect(r.colaboradores).toHaveLength(2);
  });

  it('separa código, nome, CPF e valor', () => {
    expect(r.colaboradores[0]).toEqual({
      codigo: '75',
      nome: 'EDINEIA FERNANDES DIAS',
      cpf: '35696197884',
      data_pagamento: '2026-07-30',
      valor_liquido: 3290.14,
    });
  });

  it('converte valor no formato brasileiro', () => {
    expect(r.colaboradores[1].valor_liquido).toBe(1714.45);
  });

  it('nome longo não engole o CPF', () => {
    const r2 = parseRelatorioFolha(
      RELATORIO.replace('75 EDINEIA FERNANDES DIAS', '75 MARIA DAS GRACAS DE SOUZA E ALBUQUERQUE'),
    );
    expect(r2.colaboradores[0].nome).toBe('MARIA DAS GRACAS DE SOUZA E ALBUQUERQUE');
    expect(r2.colaboradores[0].cpf).toBe('35696197884');
  });
});

describe('parseRelatorioFolha — conferência', () => {
  it('o Total impresso confere com a soma lida', () => {
    const r = parseRelatorioFolha(RELATORIO);
    expect(r.total_informado).toBe(5004.59);
    expect(r.divergencia).toBe(0);
  });

  it('linha perdida na cópia aparece como divergência, não passa calada', () => {
    const semUmaLinha = RELATORIO.replace('77 YASMIN SANTOS CORDEIRO 553.597.828-03 30/07/2026 1.714,45\n', '');
    const r = parseRelatorioFolha(semUmaLinha);
    expect(r.colaboradores).toHaveLength(1);
    expect(r.divergencia).toBe(1714.45);
  });

  it('sem Total impresso, não inventa conferência', () => {
    const r = parseRelatorioFolha(RELATORIO.replace('Total: 5.004,59', ''));
    expect(r.total_informado).toBeNull();
    expect(r.divergencia).toBeNull();
  });

  it('valor acima de mil com separador de milhar', () => {
    const r = parseRelatorioFolha(RELATORIO.replace('3.290,14', '13.290,14'));
    expect(r.colaboradores[0].valor_liquido).toBe(13290.14);
  });
});

describe('parseRelatorioFolha — bordas', () => {
  it('texto vazio devolve estrutura vazia sem quebrar', () => {
    const r = parseRelatorioFolha('');
    expect(r.colaboradores).toEqual([]);
    expect(r.cnpj).toBeNull();
  });

  it('rescisão em data diferente não muda a data da folha', () => {
    const r = parseRelatorioFolha(
      RELATORIO.replace('553.597.828-03 30/07/2026', '553.597.828-03 15/07/2026')
        + '\n78 JOSE DA SILVA 111.222.333-96 30/07/2026 2.000,00',
    );
    expect(r.data_pagamento).toBe('2026-07-30');
    expect(r.colaboradores.find((c) => c.cpf === '55359782803')?.data_pagamento).toBe('2026-07-15');
  });
});

// Texto como sai do extrator de PDF (montarLinhas sobre o arquivo real de
// Osasco). Difere da cópia manual em detalhes que quebram regex: "Pág: 1" vem
// antes do título, e há espaço depois de "Período de:" e de "C.N.P.J./CEI:".
const DO_PDF = `Pág: 1
Relação de Totais Líquidos
Período de: 01/07/2026 à 31/07/2026 Pagamento
Razão Social:M DE M GOMES OPTICA C.N.P.J./CEI: 13.844.111/0001-26
Endereço:Rua Dona Primitiva Vianco Nº:355
Complemento: Bairro:Centro
Cidade:Osasco UF:SP CEP: 06010-000
Código Funcionário CPF Data Pagamento Valor Líquido
75 EDINEIA FERNANDES DIAS 356.961.978-84 30/07/2026 3.290,14
77 YASMIN SANTOS CORDEIRO 553.597.828-03 30/07/2026 1.714,45
Total: 5.004,59`;

describe('texto extraído do PDF (não colado à mão)', () => {
  it('é reconhecido como relatório', () => {
    expect(ehRelatorioTotaisLiquidos(DO_PDF)).toBe(true);
  });

  it('lê os mesmos dados da cópia manual', () => {
    const r = parseRelatorioFolha(DO_PDF);
    expect(r.cnpj).toBe('13844111000126');
    expect(r.competencia).toBe('2026-07');
    expect(r.data_pagamento).toBe('2026-07-30');
    expect(r.colaboradores).toHaveLength(2);
    expect(r.divergencia).toBe(0);
  });

  it('"Pág: 1" antes do título não vira colaborador nem atrapalha', () => {
    expect(parseRelatorioFolha(DO_PDF).colaboradores.map(c => c.nome))
      .toEqual(['EDINEIA FERNANDES DIAS', 'YASMIN SANTOS CORDEIRO']);
  });
});
