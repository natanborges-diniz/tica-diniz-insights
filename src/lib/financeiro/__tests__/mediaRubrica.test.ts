// Valor esperado da rubrica por média móvel.
//
// O valor fixo envelhece: aluguel reajusta, energia oscila com a estação, e a
// faixa de tolerância vai ficando mentirosa até tudo cair na Mesa como desvio.
import { describe, it, expect } from 'vitest';
import {
  mediaUltimosPagamentos,
  deveAtualizarEsperado,
} from '../../../../supabase/functions/_shared/rubricaProvisao';

const pag = (data: string, valor: number) => ({ data, valor });

describe('mediaUltimosPagamentos', () => {
  it('usa os 6 mais recentes, ignorando os anteriores', () => {
    const hist = [
      pag('2026-08-05', 900), pag('2026-07-05', 800), pag('2026-06-05', 1000),
      pag('2026-05-05', 900), pag('2026-04-05', 800), pag('2026-03-05', 1000),
      pag('2026-02-05', 50), // fora da janela — não deve puxar a média para baixo
    ];
    const r = mediaUltimosPagamentos(hist)!;
    expect(r.media).toBe(900);
    expect(r.amostras).toBe(6);
  });

  it('devolve o período coberto, para o admin saber de onde veio o número', () => {
    const r = mediaUltimosPagamentos([
      pag('2026-08-05', 100), pag('2026-07-05', 100), pag('2026-06-05', 100),
    ])!;
    expect(r.de).toBe('2026-06-05');
    expect(r.ate).toBe('2026-08-05');
  });

  it('não calcula com histórico curto — média de uma amostra não é média', () => {
    expect(mediaUltimosPagamentos([pag('2026-08-05', 900)])).toBeNull();
    expect(mediaUltimosPagamentos([pag('2026-08-05', 900), pag('2026-07-05', 800)])).toBeNull();
  });

  it('respeita janela e mínimo customizados', () => {
    const hist = [pag('2026-08-05', 300), pag('2026-07-05', 100)];
    expect(mediaUltimosPagamentos(hist, 2, 2)!.media).toBe(200);
  });

  it('ignora valores zerados e datas inválidas', () => {
    const r = mediaUltimosPagamentos([
      pag('2026-08-05', 900), pag('2026-07-05', 0), pag('', 900),
      pag('2026-06-05', 900), pag('2026-05-05', 900),
    ])!;
    expect(r.amostras).toBe(3);
    expect(r.media).toBe(900);
  });

  it('arredonda para centavos', () => {
    const r = mediaUltimosPagamentos([
      pag('2026-08-05', 100), pag('2026-07-05', 100), pag('2026-06-05', 101),
    ])!;
    expect(r.media).toBe(100.33);
  });

  it('não depende da ordem de entrada', () => {
    const crescente = [pag('2026-06-05', 1000), pag('2026-07-05', 800), pag('2026-08-05', 900)];
    const decrescente = [...crescente].reverse();
    expect(mediaUltimosPagamentos(crescente)).toEqual(mediaUltimosPagamentos(decrescente));
  });
});

describe('deveAtualizarEsperado', () => {
  it('atualiza quando não há valor cadastrado', () => {
    expect(deveAtualizarEsperado(null, 900)).toBe(true);
    expect(deveAtualizarEsperado(0, 900)).toBe(true);
  });

  it('ignora diferença irrelevante — não reescreve a rubrica por centavos', () => {
    expect(deveAtualizarEsperado(1000, 1005)).toBe(false); // 0,5%
  });

  it('atualiza a partir do limite', () => {
    expect(deveAtualizarEsperado(1000, 1010)).toBe(true);  // 1%
    expect(deveAtualizarEsperado(8000, 8400)).toBe(true);  // reajuste de aluguel
  });

  it('vale nos dois sentidos', () => {
    expect(deveAtualizarEsperado(1000, 900)).toBe(true);
  });
});
