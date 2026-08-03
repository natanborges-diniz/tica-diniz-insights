// Disparo do motor de conciliação logo após o evento que cria a chance de casar.
//
// Antes, o motor só rodava no cron das 09:10 BRT. O extrato entrava às 06:20 e
// o borderô já tinha saído do banco na véspera, mas a linha ficava PENDENTE
// esperando o relógio — e o operador, olhando a tela no meio do dia, via
// movimento "sem classificação" de uma despesa que já tinha conta definida no
// borderô. Pior: importando o extrato manualmente pela tela, nada conciliava
// até o dia seguinte.
//
// A conciliação é consequência de dois eventos, não de um horário:
//   1. chegou linha nova no extrato   (btg-extrato / btg-poll-status)
//   2. o borderô voltou pago do banco (btg-poll-status)
// Quem provoca o evento chama isto. O cron continua existindo como rede de
// segurança para o que escapar dos dois caminhos.
//
// Falha aqui nunca derruba o chamador: importar extrato e baixar pagamento já
// deram certo quando chegamos neste ponto, e desfazê-los por causa da
// conciliação seria trocar um atraso por uma perda. No pior caso o cron pega na
// rodada seguinte.

export interface ResultadoConciliacaoAuto {
  empresas: number;
  conciliados: number;
  erros: string[];
}

/**
 * Normaliza a lista de empresas a conciliar: sem repetição, sem lixo.
 *
 * Repetição acontece de verdade — um borderô com vários itens baixados na mesma
 * rodada aponta N vezes para a mesma loja, e rodar o motor N vezes só gastaria
 * tempo, já que a primeira passada consome os candidatos.
 */
export function empresasAlvo(codEmpresas: Iterable<number | null | undefined>): number[] {
  const vistos = new Set<number>();
  for (const c of codEmpresas) {
    const n = Number(c);
    if (Number.isFinite(n) && n > 0) vistos.add(n);
  }
  return [...vistos];
}

/** Lê env sem assumir Deno — o mesmo módulo é carregado pelos testes em Node. */
function env(chave: string): string | undefined {
  const d = (globalThis as { Deno?: { env?: { get(k: string): string | undefined } } }).Deno;
  return d?.env?.get(chave);
}

/**
 * Roda o motor de conciliação para as empresas indicadas, uma por vez.
 *
 * Empresa a empresa de propósito: o motor carrega pools por empresa, e um erro
 * numa loja não pode impedir as outras de conciliar.
 */
export async function conciliarAgora(
  codEmpresas: Iterable<number | null | undefined>,
  opcoes: {
    fetchImpl?: typeof fetch;
    baseUrl?: string;
    serviceKey?: string;
  } = {},
): Promise<ResultadoConciliacaoAuto> {
  const lista = empresasAlvo(codEmpresas);
  const saida: ResultadoConciliacaoAuto = { empresas: lista.length, conciliados: 0, erros: [] };
  if (lista.length === 0) return saida;

  const baseUrl = opcoes.baseUrl ?? env("SUPABASE_URL");
  const serviceKey = opcoes.serviceKey ?? env("SUPABASE_SERVICE_ROLE_KEY");
  const chamar = opcoes.fetchImpl ?? fetch;

  if (!baseUrl || !serviceKey) {
    saida.erros.push("SUPABASE_URL/SERVICE_ROLE_KEY ausentes — conciliação adiada para o cron");
    return saida;
  }

  for (const codEmpresa of lista) {
    try {
      const res = await chamar(`${baseUrl}/functions/v1/conciliar-extrato?action=executar`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({ cod_empresa: codEmpresa }),
      });
      if (!res.ok) {
        saida.erros.push(`empresa ${codEmpresa}: motor HTTP ${res.status}`);
        continue;
      }
      const dados = await res.json().catch(() => null) as { conciliados?: number } | null;
      saida.conciliados += Number(dados?.conciliados ?? 0);
    } catch (e) {
      saida.erros.push(`empresa ${codEmpresa}: ${String(e)}`);
    }
  }

  console.log("[conciliacaoAuto]", JSON.stringify(saida));
  return saida;
}
