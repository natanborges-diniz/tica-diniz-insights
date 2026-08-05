// Reconstrução das linhas de um PDF.
//
// O parser da folha depende de nome, CPF e valor caírem na mesma linha. O PDF
// não guarda linhas — guarda pedaços posicionados — e é aqui que a linha volta
// a existir.
import { describe, it, expect } from 'vitest';
import { montarLinhas, type ItemTextoPdf } from '../../pdf/textoPdf';

const item = (str: string, x: number, y: number, width = str.length * 5): ItemTextoPdf =>
  ({ str, x, y, width });

describe('montarLinhas', () => {
  it('agrupa pelo Y e ordena pelo X', () => {
    expect(montarLinhas([
      item('DIAS', 200, 700),
      item('75', 50, 700),
      item('EDINEIA', 90, 700),
    ])).toEqual(['75 EDINEIA DIAS']);
  });

  it('primeira linha da página é a de maior Y — no PDF a origem é embaixo', () => {
    expect(montarLinhas([
      item('rodapé', 50, 100),
      item('título', 50, 700),
      item('meio', 50, 400),
    ])).toEqual(['título', 'meio', 'rodapé']);
  });

  it('tolera oscilação da linha de base entre negrito e normal', () => {
    // "Razão Social:" em negrito e o valor em regular não fecham no mesmo Y.
    expect(montarLinhas([
      item('Razão Social:', 50, 700),
      item('M DE M GOMES OPTICA', 130, 698.6),
    ])).toEqual(['Razão Social: M DE M GOMES OPTICA']);
  });

  it('não insere espaço onde não havia — o valor não pode virar "3.290, 14"', () => {
    // Pedaços encostados: fim do primeiro (10+18=28) é o início do segundo.
    expect(montarLinhas([
      item('3.290,', 10, 500, 18),
      item('14', 28, 500, 6),
    ])).toEqual(['3.290,14']);
  });

  it('insere espaço quando há distância de verdade', () => {
    expect(montarLinhas([
      item('CPF', 10, 500, 15),
      item('Data', 90, 500, 20),
    ])).toEqual(['CPF Data']);
  });

  it('descarta pedaços vazios e espaços repetidos', () => {
    expect(montarLinhas([
      item('', 10, 500, 0),
      item('A', 20, 500, 5),
      item('   ', 40, 500, 8),
      item('B', 60, 500, 5),
    ])).toEqual(['A B']);
  });

  it('linha que sobra em branco não vira linha', () => {
    expect(montarLinhas([item('   ', 10, 500, 5)])).toEqual([]);
  });

  it('lista vazia devolve nada', () => {
    expect(montarLinhas([])).toEqual([]);
  });

  it('linha de colaborador sai pronta para o parser da folha', () => {
    const linha = montarLinhas([
      item('75', 40, 600, 8),
      item('EDINEIA FERNANDES DIAS', 70, 600, 110),
      item('356.961.978-84', 260, 600, 60),
      item('30/07/2026', 350, 600, 45),
      item('3.290,14', 450, 600, 35),
    ]);
    expect(linha).toEqual(['75 EDINEIA FERNANDES DIAS 356.961.978-84 30/07/2026 3.290,14']);
  });
});
