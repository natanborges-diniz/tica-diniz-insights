// Testes do encadeamento automático da conciliação.
//
// Caso real (03/08/2026): borderô de Barueri enviado e pago, extrato importado
// pela tela, e o movimento continuou "sem classificação" — o motor só rodava no
// cron das 09:10 do dia seguinte. A regra que se quer garantir aqui é que quem
// importa extrato ou baixa pagamento chama o motor na sequência, e que essa
// chamada nunca derrube a operação que já deu certo.
import { describe, it, expect, vi } from 'vitest';
import { conciliarAgora, empresasAlvo } from '../../../../supabase/functions/_shared/conciliacaoAuto';

const CFG = { baseUrl: 'https://proj.supabase.co', serviceKey: 'srv-key' };

function respostaOk(conciliados: number) {
  return { ok: true, json: () => Promise.resolve({ success: true, conciliados }) } as unknown as Response;
}

describe('empresasAlvo', () => {
  it('não repete empresa — um borderô com 9 itens aponta 9x para a mesma loja', () => {
    expect(empresasAlvo([16, 16, 16, 1])).toEqual([16, 1]);
  });

  it('descarta nulo, zero e não-numérico vindos de dados_extras', () => {
    expect(empresasAlvo([16, null, undefined, 0, NaN])).toEqual([16]);
  });

  it('lista vazia continua vazia', () => {
    expect(empresasAlvo([])).toEqual([]);
  });
});

describe('conciliarAgora', () => {
  it('chama o motor uma vez por empresa e soma os conciliados', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(respostaOk(9))
      .mockResolvedValueOnce(respostaOk(2));

    const r = await conciliarAgora([16, 1], { ...CFG, fetchImpl: fetchImpl as unknown as typeof fetch });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(r).toEqual({ empresas: 2, conciliados: 11, erros: [] });
  });

  it('usa a rota executar com service role e o cod_empresa no corpo', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(respostaOk(0));
    await conciliarAgora([16], { ...CFG, fetchImpl: fetchImpl as unknown as typeof fetch });

    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://proj.supabase.co/functions/v1/conciliar-extrato?action=executar');
    expect(init.method).toBe('POST');
    // service_role entra como caller interno no motor — é o que dispensa admin.
    expect(init.headers.Authorization).toBe('Bearer srv-key');
    expect(JSON.parse(init.body)).toEqual({ cod_empresa: 16 });
  });

  it('sem empresa nenhuma, não bate no motor', async () => {
    const fetchImpl = vi.fn();
    const r = await conciliarAgora([], { ...CFG, fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(r.empresas).toBe(0);
  });

  it('erro numa loja não impede as outras de conciliar', async () => {
    const fetchImpl = vi.fn()
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce(respostaOk(4));

    const r = await conciliarAgora([16, 1], { ...CFG, fetchImpl: fetchImpl as unknown as typeof fetch });

    expect(r.conciliados).toBe(4);
    expect(r.erros).toHaveLength(1);
    expect(r.erros[0]).toContain('empresa 16');
  });

  it('HTTP não-ok vira erro reportado, nunca exceção — o import já foi gravado', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 500 } as unknown as Response);
    const r = await conciliarAgora([16], { ...CFG, fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(r.erros[0]).toContain('HTTP 500');
    expect(r.conciliados).toBe(0);
  });

  it('sem credenciais, adia para o cron em vez de estourar', async () => {
    const fetchImpl = vi.fn();
    const r = await conciliarAgora([16], { fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(r.erros[0]).toMatch(/adiada para o cron/);
  });
});
