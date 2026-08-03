// supabase/functions/btg-dda/index.ts
// BTG Pactual Banking — DDA + Conciliação (endpoints oficiais v2)
// Path: /{CNPJ}/banking/direct-debit/debits
// Actions: importar, listar, conciliar_auto, conciliar_manual, ignorar, indicadores

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { casarTitulo, JANELA_DIAS, TOLERANCIA_VALOR } from "../_shared/ddaMatch.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function getServiceClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}

async function getBtgConfig() {
  const db = getServiceClient();
  const { data } = await db
    .from("fornecedor_configuracao")
    .select("ambiente")
    .eq("fornecedor", "btg")
    .eq("ativo", true)
    .single();
  const env = data?.ambiente === "production" ? "production" : "sandbox";
  const isSandbox = env === "sandbox";
  return {
    apiBase: isSandbox
      ? "https://api.sandbox.empresas.btgpactual.com"
      : "https://api.empresas.btgpactual.com",
    isSandbox,
  };
}

// ─── Auth helpers ────────────────────────────────────────────
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(base64));
  } catch {
    return null;
  }
}

function requireAuth(req: Request): string {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) throw json({ error: "Unauthorized" }, 401);
  const claims = decodeJwtPayload(authHeader.replace("Bearer ", ""));
  if (!claims?.sub || claims.aud !== "authenticated") throw json({ error: "Unauthorized" }, 401);
  const exp = claims.exp as number | undefined;
  if (exp && exp < Math.floor(Date.now() / 1000)) throw json({ error: "Token expirado" }, 401);
  return claims.sub as string;
}

async function isAdmin(userId: string): Promise<boolean> {
  const db = getServiceClient();
  const { data } = await db.from("user_roles").select("role").eq("user_id", userId).eq("role", "admin");
  return !!data && data.length > 0;
}

async function requireAdminRole(userId: string) {
  if (!(await isAdmin(userId))) throw json({ error: "Forbidden — apenas admin" }, 403);
}

async function getBtgToken(codEmpresa: number): Promise<string> {
  const db = getServiceClient();
  const { data } = await db.from("btg_tokens").select("access_token, expires_at").eq("cod_empresa", codEmpresa).single();
  if (!data) throw json({ error: `Empresa ${codEmpresa} não autenticada no BTG.` }, 400);
  if (new Date(data.expires_at) < new Date()) throw json({ error: `Token BTG expirado para empresa ${codEmpresa}.` }, 401);
  return data.access_token;
}

async function getCnpj(codEmpresa: number): Promise<string> {
  const db = getServiceClient();
  const { data: conta } = await db.from("btg_contas_bancarias").select("cnpj").eq("cod_empresa", codEmpresa).eq("ativa", true).single();
  if (conta?.cnpj) return conta.cnpj.replace(/\D/g, "");
  const { data: emp } = await db.from("empresa").select("cnpj").eq("cod_empresa", codEmpresa).single();
  if (emp?.cnpj) return emp.cnpj.replace(/\D/g, "");
  throw json({ error: `CNPJ não encontrado para empresa ${codEmpresa}` }, 400);
}

// ─── Param helper ────────────────────────────────────────────
function getParam(body: Record<string, unknown> | null, url: URL, key: string): string | null {
  if (body && body[key] !== undefined && body[key] !== null) return String(body[key]);
  return url.searchParams.get(key);
}

// ─── ACTION: importar ────────────────────────────────────────
async function handleImportar(body: Record<string, unknown>, userId: string) {
  await requireAdminRole(userId);

  const { cod_empresa } = body;
  if (!cod_empresa) return json({ error: "cod_empresa obrigatório" }, 400);

  return await importarEmpresa(Number(cod_empresa));
}

/**
 * ACTION: importar_todas — roda o DDA de todas as empresas com token válido.
 *
 * Existe porque a importação era manual, uma loja por vez: em 03/08/2026 só
 * quatro das dez lojas tinham título de DDA, e as demais mostravam "sem boleto"
 * em tudo. Extrato, retorno de pagamento e token já tinham cron; o DDA não.
 *
 * Falha de uma loja não interrompe as outras — token expirado ou DDA não
 * habilitado no BTG viram item de relatório, não erro geral.
 */
async function handleImportarTodas() {
  const db = getServiceClient();

  const { data: tokens } = await db
    .from("btg_tokens")
    .select("cod_empresa, expires_at");

  const agora = new Date();
  const resultado = {
    empresas: 0,
    importados: 0,
    duplicados: 0,
    reconciliados: 0,
    sem_match: 0,
    lancamentos_gerados: 0,
    ignoradas: [] as Array<{ cod_empresa: number; motivo: string }>,
    erros: [] as Array<{ cod_empresa: number; erro: string }>,
  };

  for (const t of (tokens || [])) {
    const ce = Number(t.cod_empresa);

    if (new Date(t.expires_at) < agora) {
      resultado.ignoradas.push({ cod_empresa: ce, motivo: "token BTG expirado — reautorizar a loja" });
      continue;
    }

    try {
      const res = await importarEmpresa(ce);
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.error) {
        resultado.erros.push({ cod_empresa: ce, erro: String(data?.error ?? `HTTP ${res.status}`) });
        continue;
      }
      resultado.empresas++;
      resultado.importados += Number(data.importados || 0);
      resultado.duplicados += Number(data.duplicados || 0);
      resultado.reconciliados += Number(data.reconciliados || 0);
      resultado.sem_match += Number(data.sem_match || 0);
      resultado.lancamentos_gerados += Number(data.lancamentos_gerados || 0);
    } catch (e) {
      resultado.erros.push({ cod_empresa: ce, erro: e instanceof Error ? e.message : String(e) });
    }
  }

  console.log("[btg-dda] importar_todas:", JSON.stringify(resultado));
  return json({ success: true, ...resultado });
}

/**
 * Reavalia o vínculo dos títulos de DDA que ainda não acharam lançamento.
 *
 * Existe porque a conciliação só rodava no instante da inserção do título:
 * título que chegou antes da parcela do ERP (ou que não casou pela regra antiga
 * de data/valor exatos) ficava órfão para sempre — reimportar não ajudava,
 * porque ele entrava como duplicado e pulava a checagem.
 *
 * Roda ao fim de toda importação, então o sistema se conserta sozinho na
 * passada seguinte, sem ninguém precisar apertar nada.
 */
/**
 * Vencido há mais tempo que isto e ainda sem lançamento: é arquivo, não pendência.
 *
 * O DDA do BTG devolve tudo que já passou pela conta — as lojas 1, 2 e 4 têm
 * título desde fevereiro de 2018. Essa dívida nunca esteve neste sistema, então
 * não existe lançamento para vincular e nunca vai existir. Sem arquivar, ela
 * infla a contagem de "sem boleto" para sempre.
 */
const DIAS_PARA_ARQUIVAR = 90;

/**
 * Tira de circulação os títulos velhos que nunca acharão par.
 *
 * Só toca no que está sem vínculo: título ligado a um lançamento guarda o
 * histórico do pagamento e permanece, por mais antigo que seja.
 */
async function arquivarTitulosVelhos(ce: number): Promise<number> {
  const db = getServiceClient();
  const limite = new Date(Date.now() - DIAS_PARA_ARQUIVAR * 86_400_000).toISOString().slice(0, 10);

  const { data: candidatos } = await db
    .from("btg_dda_titulos")
    .select("id")
    .eq("cod_empresa", ce)
    .lt("data_vencimento", limite)
    .not("status", "in", "(ARQUIVADO,PAGO,IGNORADO)");

  if (!candidatos || candidatos.length === 0) return 0;

  const ids = candidatos.map((t) => String(t.id));
  const { data: comVinculo } = await db
    .from("lancamentos_financeiros")
    .select("btg_dda_id")
    .in("btg_dda_id", ids);
  const protegidos = new Set((comVinculo || []).map((l) => String(l.btg_dda_id)));

  const arquivar = ids.filter((id) => !protegidos.has(id));
  if (arquivar.length === 0) return 0;

  await db.from("btg_dda_titulos").update({ status: "ARQUIVADO" }).in("id", arquivar);
  console.log(`[btg-dda] empresa ${ce}: ${arquivar.length} títulos arquivados (vencidos há mais de ${DIAS_PARA_ARQUIVAR} dias, sem vínculo)`);
  return arquivar.length;
}

async function reconciliarEmpresa(ce: number): Promise<{ vinculados: number; sem_match: number }> {
  const db = getServiceClient();

  // Sem filtro por status. "CONCILIADO" nesta tabela significa que o título
  // casou com uma PARCELA do ERP no Firebird — não que exista lançamento
  // vinculado. Filtrar por PENDENTE deixava esses títulos invisíveis para
  // sempre, e o Hub seguia mostrando "sem boleto". A pergunta certa é só uma:
  // este título já tem lançamento apontando para ele?
  const { data: titulos } = await db
    .from("btg_dda_titulos")
    .select("id, valor, data_vencimento, documento_emissor, numero_documento, emissor, linha_digitavel")
    .eq("cod_empresa", ce)
    .not("status", "in", "(PAGO,IGNORADO,CANCELADO)");

  if (!titulos || titulos.length === 0) return { vinculados: 0, sem_match: 0 };

  const { data: jaVinculados } = await db
    .from("lancamentos_financeiros")
    .select("btg_dda_id")
    .eq("cod_empresa", ce)
    .not("btg_dda_id", "is", null);
  const vinculadosSet = new Set((jaVinculados || []).map((l) => String(l.btg_dda_id)));

  let vinculados = 0;
  let semMatch = 0;

  for (const t of titulos) {
    if (vinculadosSet.has(String(t.id))) continue;

    const venc = String(t.data_vencimento).slice(0, 10);
    const emDias = (d: number) =>
      new Date(Date.parse(`${venc}T12:00:00Z`) + d * 86_400_000).toISOString().slice(0, 10);

    const { data: candidatos } = await db
      .from("lancamentos_financeiros")
      .select("id, valor, data_vencimento, pessoa_documento, dados_extras")
      .eq("cod_empresa", ce)
      .eq("tipo", "PAGAR")
      .in("status", ["PREVISTO", "CLASSIFICADO"])
      .is("btg_dda_id", null)
      .gte("data_vencimento", emDias(-JANELA_DIAS))
      .lte("data_vencimento", emDias(JANELA_DIAS))
      .gte("valor", Number(t.valor) - TOLERANCIA_VALOR)
      .lte("valor", Number(t.valor) + TOLERANCIA_VALOR);

    const r = casarTitulo(
      {
        valor: Number(t.valor),
        data_vencimento: venc,
        documento_emissor: t.documento_emissor,
        numero_documento: t.numero_documento,
      },
      (candidatos || []).map((c) => ({
        id: String(c.id),
        valor: Number(c.valor),
        data_vencimento: String(c.data_vencimento),
        pessoa_documento: c.pessoa_documento,
        documento: ((c.dados_extras || {}) as Record<string, unknown>).documento as string | null,
      })),
    );

    if (!r.candidato) {
      semMatch++;
      console.log(`[btg-dda] reconciliar: título ${t.id} sem vínculo — ${r.motivo}`);
      continue;
    }

    const alvo = (candidatos || []).find((c) => String(c.id) === r.candidato!.id)!;
    const extras = (alvo.dados_extras || {}) as Record<string, unknown>;
    await db.from("lancamentos_financeiros").update({
      btg_dda_id: t.id,
      forma_pagamento: "BOLETO",
      dados_extras: {
        ...extras,
        linha_digitavel: t.linha_digitavel || extras.linha_digitavel,
        dda_emissor: t.emissor,
        btg_payment_type: "BANKSLIP",
      },
    }).eq("id", alvo.id);
    await db.from("btg_dda_titulos").update({ conciliado: true }).eq("id", t.id);

    vinculadosSet.add(String(t.id));
    vinculados++;
  }

  return { vinculados, sem_match: semMatch };
}

/** ACTION: reconciliar — reavalia vínculos de uma loja, sob demanda. */
async function handleReconciliar(body: Record<string, unknown>, userId: string) {
  await requireAdminRole(userId);
  const { cod_empresa } = body;
  if (!cod_empresa) return json({ error: "cod_empresa obrigatório" }, 400);
  const r = await reconciliarEmpresa(Number(cod_empresa));
  return json({ success: true, ...r });
}

async function importarEmpresa(ce: number): Promise<Response> {
  const db = getServiceClient();
  const { apiBase, isSandbox } = await getBtgConfig();

  let btgData: Record<string, unknown>[] = [];

  if (isSandbox) {
    btgData = [
      {
        id: `sandbox-dda-${Date.now()}-1`,
        amount: 1890.50,
        dueDate: new Date(Date.now() + 5 * 86400000).toISOString(),
        expirationDate: new Date(Date.now() + 10 * 86400000).toISOString(),
        digitableLine: "23793.38128 60000.000003 00000.000402 1 88880000189050",
        payee: { document: "06981180000116", fantasyName: "CEMIG DISTRIBUICAO SA", socialName: "CEMIG DISTRIBUICAO SA", bankCode: "001", bankName: "BANCO DO BRASIL" },
        hidden: false,
        status: "CREATED",
      },
      {
        id: `sandbox-dda-${Date.now()}-2`,
        amount: 450.00,
        dueDate: new Date(Date.now() + 3 * 86400000).toISOString(),
        expirationDate: new Date(Date.now() + 8 * 86400000).toISOString(),
        digitableLine: "23793.38128 60000.000004 00000.000403 1 88880000045000",
        payee: { document: "02558157000162", fantasyName: "TELEFONICA BRASIL SA", socialName: "TELEFONICA BRASIL SA", bankCode: "341", bankName: "ITAU UNIBANCO" },
        hidden: false,
        status: "OVERDUE",
      },
      {
        id: `sandbox-dda-${Date.now()}-3`,
        amount: 12350.00,
        dueDate: new Date(Date.now() + 7 * 86400000).toISOString(),
        expirationDate: new Date(Date.now() + 12 * 86400000).toISOString(),
        digitableLine: "23793.38128 60000.000005 00000.000404 1 88881001235000",
        payee: { document: "01722296000117", fantasyName: "HOYA LENS DO BRASIL LTDA", socialName: "HOYA LENS DO BRASIL LTDA", bankCode: "208", bankName: "BTG PACTUAL" },
        hidden: false,
        status: "CREATED",
      },
    ];
  } else {
    const accessToken = await getBtgToken(ce);
    const cnpj = await getCnpj(ce);

    // Paginação: buscávamos só a primeira página de 100. Para o DDA ser espelho
    // do banco, precisa vir tudo — senão os títulos além da página 1 nunca
    // entram, e a remoção do que saiu apagaria o que simplesmente não veio.
    const MAX_PAGINAS = 50;
    for (let pagina = 1; pagina <= MAX_PAGINAS; pagina++) {
      const btgRes = await fetch(
        `${apiBase}/${cnpj}/banking/direct-debit/debits?pageNumber=${pagina}&pageSize=100`,
        { headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" } }
      );

      const btgBody = await btgRes.text();
      if (!btgRes.ok) {
        console.error("[btg-dda] BTG API error:", btgRes.status, btgBody);
        if (pagina === 1) {
          return json({ error: "Erro ao consultar DDA no BTG", btg_status: btgRes.status, details: btgBody }, 502);
        }
        break; // páginas seguintes: fica com o que já veio
      }

      let lote: Record<string, unknown>[];
      try {
        const parsed = JSON.parse(btgBody);
        lote = Array.isArray(parsed) ? parsed : (parsed.data || []);
      } catch {
        if (pagina === 1) return json({ error: "Resposta inválida do BTG" }, 502);
        break;
      }

      if (lote.length === 0) break;
      btgData.push(...lote);
      if (lote.length < 100) break; // última página
    }

    console.log(`[btg-dda] empresa ${ce}: ${btgData.length} títulos vindos do BTG`);
  }

  // Delete old records that have null emissor OR null banco_emissor (bad imports) to allow reimport
  const { count: deletedOld } = await db
    .from("btg_dda_titulos")
    .delete({ count: "exact" })
    .eq("cod_empresa", ce)
    .or("emissor.is.null,banco_emissor.is.null")
    .eq("status", "PENDENTE");

  console.log(`[btg-dda] Deleted ${deletedOld ?? 0} old records with null emissor/banco for reimport`);

  let inseridos = 0;
  let duplicados = 0;
  let lancamentosGerados = 0;

  // Linhas digitáveis vistas nesta rodada — base da remoção do que saiu do banco.
  const linhasDoBanco = new Set<string>();

  // Deduplicação em UMA consulta, não uma por título.
  //
  // Antes cada título fazia 3 idas ao banco (existe por linha, existe por id,
  // reler o id inserido). Com ~1.100 títulos por rodada e 10 lojas no
  // `importar_todas`, isso estourava o limite de 150s da edge function
  // (IDLE_TIMEOUT). Carregamos o índice da empresa uma vez e comparamos em
  // memória.
  const { data: jaExistem } = await db
    .from("btg_dda_titulos")
    .select("linha_digitavel, btg_dda_id")
    .eq("cod_empresa", ce);

  const linhasExistentes = new Set<string>();
  const idsExistentes = new Set<string>();
  for (const r of (jaExistem || [])) {
    const l = String(r.linha_digitavel ?? "").replace(/\D/g, "");
    if (l) linhasExistentes.add(l);
    if (r.btg_dda_id) idsExistentes.add(String(r.btg_dda_id));
  }

  for (const titulo of btgData) {
    const btgDdaId = (titulo.id || titulo.ddaId || "") as string;
    const linhaBruta = String(titulo.digitableLine ?? "").replace(/\D/g, "");
    if (linhaBruta) linhasDoBanco.add(linhaBruta);

    // Deduplicação pela LINHA DIGITÁVEL, que é a chave natural do boleto.
    // Antes só checávamos por `id` — e quando o BTG não devolvia `id`, cada
    // importação reinseria tudo. Como a tela importa sozinha ao abrir, a base
    // multiplicava a cada visita (dez cópias do mesmo título da J&J).
    if (linhaBruta) {
      if (linhasExistentes.has(linhaBruta)) { duplicados++; continue; }
      linhasExistentes.add(linhaBruta);
    } else if (btgDdaId) {
      if (idsExistentes.has(btgDdaId)) { duplicados++; continue; }
      idsExistentes.add(btgDdaId);
    }


    // Map BTG API fields — production uses taxId, sandbox/docs use document
    const payee = (titulo.payee || {}) as Record<string, unknown>;
    const emissorVal = (payee.fantasyName || payee.socialName || null) as string | null;
    const docEmissorVal = (payee.document || payee.taxId || null) as string | null;
    const bancoVal = (payee.bankName || null) as string | null;
    const valorVal = Number(titulo.amount || 0);
    const vencVal = (titulo.dueDate || new Date().toISOString()).toString().slice(0, 10);
    // Guardamos só os dígitos: o BTG às vezes devolve com pontos e espaços, e a
    // mesma linha em formatos diferentes escapava da deduplicação.
    const linhaVal = linhaBruta || null;

    // Map BTG status to internal status
    const btgStatus = (titulo.status || "CREATED") as string;
    const statusMap: Record<string, string> = {
      CREATED: "PENDENTE",
      OVERDUE: "PENDENTE",
      PAYMENT_PENDING_APPROVAL: "PAGAMENTO_PENDENTE",
      PAYMENT_PROCESSING: "PAGAMENTO_PROCESSANDO",
      PAYMENT_CONFIRMED: "CONCILIADO",
      SCHEDULED: "AGENDADO",
    };
    const internalStatus = statusMap[btgStatus] || "PENDENTE";
    const isConciliado = btgStatus === "PAYMENT_CONFIRMED";

    const { data: ddaRow, error } = await db.from("btg_dda_titulos").insert({
      cod_empresa: ce,
      btg_dda_id: btgDdaId || null,
      emissor: emissorVal,
      documento_emissor: docEmissorVal,
      banco_emissor: bancoVal,
      valor: valorVal,
      data_vencimento: vencVal,
      linha_digitavel: linhaVal,
      status: internalStatus,
      conciliado: isConciliado,
    }).select("id").maybeSingle();

    if (!error) {
      inseridos++;


      if (ddaRow) {
        // Governança (31/07): DDA é COBRANÇA, não dívida — nunca mais criamos
        // lançamento órfão (era a causa da duplicação DDA × título ERP no Hub).
        // Comportamento novo: anexar o boleto ao título existente; sem título
        // correspondente, o boleto fica pendente e aparece no card "Cobranças
        // sem entrada" da Mesa de Aprovação (humano investiga/dá entrada).
        const { data: existingLanc } = await db
          .from("lancamentos_financeiros")
          .select("id")
          .eq("btg_dda_id", ddaRow.id)
          .eq("cod_empresa", ce)
          .maybeSingle();

        if (!existingLanc && vencVal) {
          // Candidatos numa JANELA de vencimento, não em data exata: o emissor
          // pode prorrogar ou antecipar o título na CIP depois de imprimir o
          // boleto (visto na HOYA: ERP 06/08, registro 04/08). A escolha entre
          // eles fica com _shared/ddaMatch.ts.
          const emDias = (d: number) =>
            new Date(Date.parse(`${vencVal}T12:00:00Z`) + d * 86_400_000).toISOString().slice(0, 10);

          const { data: candidatos } = await db
            .from("lancamentos_financeiros")
            .select("id, valor, data_vencimento, pessoa_documento, dados_extras")
            .eq("cod_empresa", ce)
            .eq("tipo", "PAGAR")
            .in("status", ["PREVISTO", "CLASSIFICADO"])
            .is("btg_dda_id", null)
            .gte("data_vencimento", emDias(-JANELA_DIAS))
            .lte("data_vencimento", emDias(JANELA_DIAS))
            .gte("valor", Number(valorVal) - TOLERANCIA_VALOR)
            .lte("valor", Number(valorVal) + TOLERANCIA_VALOR);

          const resultado = casarTitulo(
            { valor: Number(valorVal), data_vencimento: vencVal, documento_emissor: docEmissorVal },
            (candidatos || []).map((c) => ({
              id: String(c.id),
              valor: Number(c.valor),
              data_vencimento: String(c.data_vencimento),
              pessoa_documento: c.pessoa_documento,
            })),
          );

          if (!resultado.candidato && (candidatos || []).length > 0) {
            console.log(`[btg-dda] título ${btgDdaId} sem vínculo: ${resultado.motivo}`);
          }

          if (resultado.candidato) {
            const alvo = (candidatos || []).find((c) => String(c.id) === resultado.candidato!.id)!;
            const extras = (alvo.dados_extras || {}) as Record<string, unknown>;
            await db.from("lancamentos_financeiros").update({
              btg_dda_id: ddaRow.id,
              forma_pagamento: "BOLETO",
              dados_extras: {
                ...extras,
                linha_digitavel: linhaVal || extras.linha_digitavel,
                dda_emissor: emissorVal,
                btg_payment_type: "BANKSLIP",
              },
            }).eq("id", alvo.id);
            lancamentosGerados++; // reaproveitado como contador de vínculos
          }
          // 0 ou 2+ candidatos: não cria nada — card da Mesa cuida da visibilidade
        }
      }
    } else {
      console.warn("[btg-dda] Insert error:", error.message);
    }
  }

  // ── Espelho: o que não veio do banco não deve continuar aqui ──
  //
  // Boleto pago, cancelado ou retirado pelo emissor some da lista do DDA. Sem
  // esta limpeza a tela vira acumulador e mostra cobrança que não existe mais.
  //
  // Só removemos o que é seguro remover: título sem lançamento vinculado. Com
  // vínculo, o histórico do pagamento importa mais que o espelho — esse fica.
  let removidos = 0;
  if (btgData.length > 0 && linhasDoBanco.size > 0) {
    const { data: locais } = await db
      .from("btg_dda_titulos")
      .select("id, linha_digitavel")
      .eq("cod_empresa", ce);

    // Compara SÓ DÍGITOS dos dois lados. A primeira versão comparava a linha
    // crua contra o conjunto normalizado; como os registros antigos estavam
    // gravados com pontuação, quase todos pareceram "sumidos" — e a limpeza
    // apagou boleto legítimo em 04/08/2026.
    const sumiram = (locais || [])
      .filter((t) => {
        const linha = String(t.linha_digitavel ?? "").replace(/\D/g, "");
        return linha.length > 0 && !linhasDoBanco.has(linha);
      })
      .map((t) => String(t.id));

    // Trava de sanidade: se o "espelho" quer apagar quase tudo, quem está
    // errado é o espelho. Falha de rede, resposta truncada ou mudança de
    // formato não podem virar exclusão em massa.
    const limite = Math.max(20, Math.floor((locais || []).length * 0.3));
    if (sumiram.length > limite) {
      console.warn(
        `[btg-dda] empresa ${ce}: limpeza ABORTADA — ${sumiram.length} de ${(locais || []).length} ` +
        `títulos apareceriam como removidos (limite ${limite}). Provável divergência de formato ou resposta incompleta do BTG.`,
      );
    } else if (sumiram.length > 0) {
      // Vínculos em lotes: `.in()` com centenas de UUIDs estoura o limite de
      // URL do PostgREST. Antes o erro não era checado, a lista de protegidos
      // vinha vazia e a exclusão levava junto o que tinha vínculo.
      const protegidos = new Set<string>();
      let falhouChecagem = false;

      for (let i = 0; i < sumiram.length; i += 50) {
        const fatia = sumiram.slice(i, i + 50);
        const { data: comVinculo, error } = await db
          .from("lancamentos_financeiros")
          .select("btg_dda_id")
          .in("btg_dda_id", fatia);
        if (error) {
          console.error(`[btg-dda] empresa ${ce}: falha ao checar vínculos — limpeza abortada:`, error.message);
          falhouChecagem = true;
          break;
        }
        for (const l of (comVinculo || [])) protegidos.add(String(l.btg_dda_id));
      }

      // Na dúvida, não apaga. Título a mais na tela é ruído; título a menos é
      // boleto perdido.
      if (!falhouChecagem) {
        const apagar = sumiram.filter((id) => !protegidos.has(id));
        if (apagar.length > 0) {
          const { count, error } = await db
            .from("btg_dda_titulos")
            .delete({ count: "exact" })
            .in("id", apagar);
          if (error) {
            console.error(`[btg-dda] empresa ${ce}: erro ao remover títulos:`, error.message);
          } else {
            removidos = count ?? apagar.length;
            console.log(`[btg-dda] empresa ${ce}: ${removidos} títulos removidos (não constam mais no banco)`);
          }
        }
      }
    }
  }

  const sampleItem = btgData.length > 0 ? btgData[0] : null;

  // Segunda passada: títulos que já estavam na base e continuavam órfãos —
  // tipicamente porque chegaram antes da parcela do ERP. Sem isto, reimportar
  // não conciliava nada (eles entram como duplicados e pulam a checagem).
  const recon = await reconciliarEmpresa(ce);

  // Depois de tentar vincular, o que é velho demais sai de circulação.
  // A ordem importa: arquivar antes tiraria da mesa um título que ainda casaria.
  const arquivados = await arquivarTitulosVelhos(ce);

  return json({
    success: true,
    importados: inseridos,
    duplicados,
    removidos,
    arquivados,
    total_btg_paginado: btgData.length,
    reconciliados: recon.vinculados,
    sem_match: recon.sem_match,
    lancamentos_gerados: lancamentosGerados + recon.vinculados,
    registros_limpos: deletedOld ?? 0,
    total_btg: btgData.length,
    sandbox: isSandbox,
    _debug_sample_keys: sampleItem ? Object.keys(sampleItem) : [],
    _debug_sample: sampleItem,
  });
}

// ─── ACTION: conciliar_auto ──────────────────────────────────
async function handleConciliarAuto(body: Record<string, unknown>, userId: string) {
  await requireAdminRole(userId);

  const { cod_empresa } = body;
  if (!cod_empresa) return json({ error: "cod_empresa obrigatório" }, 400);

  const ce = Number(cod_empresa);
  const db = getServiceClient();

  const { data: titulosDda, error: ddaErr } = await db
    .from("btg_dda_titulos")
    .select("*")
    .eq("cod_empresa", ce)
    .eq("status", "PENDENTE")
    .eq("conciliado", false);

  if (ddaErr) return json({ error: "Erro ao buscar títulos DDA", details: ddaErr.message }, 500);
  if (!titulosDda || titulosDda.length === 0) {
    return json({ success: true, conciliados: 0, sem_match: 0, mensagem: "Nenhum título DDA pendente" });
  }

  const vencimentos = titulosDda.map((t) => t.data_vencimento).filter(Boolean).sort();
  const dataInicio = vencimentos[0] || new Date().toISOString().slice(0, 10);
  const dataFim = vencimentos[vencimentos.length - 1] || dataInicio;

  const firebirdBaseUrl = Deno.env.get("FIREBIRD_API_BASE_URL") || "https://firebird-bridge-production.up.railway.app";
  const parcelasUrl = new URL(`${firebirdBaseUrl}/api/v1/financeiro/parcelas`);
  parcelasUrl.searchParams.set("empresa", String(ce));
  parcelasUrl.searchParams.set("dataInicio", dataInicio);
  parcelasUrl.searchParams.set("dataFim", dataFim);
  parcelasUrl.searchParams.set("tipo", "PAGAR");
  parcelasUrl.searchParams.set("situacao", "EM ABERTO");
  parcelasUrl.searchParams.set("campoData", "VENCIMENTO");

  let parcelasErp: Array<Record<string, unknown>> = [];

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    const res = await fetch(parcelasUrl.toString(), {
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (res.ok) {
      const envelope = await res.json();
      parcelasErp = envelope.ok ? (envelope.data || []) : [];
    } else {
      console.warn("[btg-dda] Firebird parcelas error:", res.status);
    }
  } catch (e) {
    console.error("[btg-dda] Erro ao buscar parcelas do ERP:", e);
    return json({ error: "Não foi possível consultar parcelas do ERP", details: String(e) }, 502);
  }

  // Index parcelas by valor+vencimento (primary) and valor-only (fallback)
  const parcelasIndexExact = new Map<string, Record<string, unknown>>();
  const parcelasIndexValorVenc = new Map<string, Record<string, unknown>>();
  for (const p of parcelasErp) {
    const valor = Number(p.parcela_valor || 0).toFixed(2);
    const venc = (String(p.parcela_data_vencimento || "")).slice(0, 10);
    const keyExact = `${valor}|${venc}`;
    if (!parcelasIndexExact.has(keyExact)) parcelasIndexExact.set(keyExact, p);
    // Also index by valor+fornecedor (CNPJ) for CNPJ-based matching
    const cnpjForn = (String(p.fornecedor_cnpj || p.pessoa_identificador || "")).replace(/\D/g, "");
    if (cnpjForn) {
      const keyCnpj = `${valor}|${venc}|${cnpjForn}`;
      if (!parcelasIndexValorVenc.has(keyCnpj)) parcelasIndexValorVenc.set(keyCnpj, p);
    }
  }

  let conciliadosCount = 0;
  let semMatch = 0;

  for (const titulo of titulosDda) {
    const valorStr = Number(titulo.valor).toFixed(2);
    const vencStr = (titulo.data_vencimento || "").slice(0, 10);
    const cnpjDda = (titulo.documento_emissor || "").replace(/\D/g, "");

    // Try CNPJ + valor + vencimento first (most precise)
    let parcelaMatch: Record<string, unknown> | undefined;
    let matchKeyUsed = "";

    if (cnpjDda) {
      const keyCnpj = `${valorStr}|${vencStr}|${cnpjDda}`;
      parcelaMatch = parcelasIndexValorVenc.get(keyCnpj);
      if (parcelaMatch) matchKeyUsed = keyCnpj;
    }

    // Fallback: valor + vencimento only
    if (!parcelaMatch) {
      const keyExact = `${valorStr}|${vencStr}`;
      parcelaMatch = parcelasIndexExact.get(keyExact);
      if (parcelaMatch) matchKeyUsed = keyExact;
    }

    if (parcelaMatch) {
      await db.from("btg_dda_titulos").update({ conciliado: true, status: "CONCILIADO" }).eq("id", titulo.id);
      if (matchKeyUsed.includes("|") && matchKeyUsed.split("|").length === 3) {
        parcelasIndexValorVenc.delete(matchKeyUsed);
      } else {
        parcelasIndexExact.delete(matchKeyUsed);
      }
      conciliadosCount++;
    } else {
      semMatch++;
    }
  }

  return json({
    success: true,
    conciliados: conciliadosCount,
    sem_match: semMatch,
    total: titulosDda.length,
    parcelas_erp_encontradas: parcelasErp.length,
  });
}

// ─── ACTION: conciliar_manual ────────────────────────────────
async function handleConciliarManual(body: Record<string, unknown>, userId: string) {
  await requireAdminRole(userId);

  const { titulo_id, parcela_id } = body;
  if (!titulo_id || !parcela_id) return json({ error: "titulo_id e parcela_id são obrigatórios" }, 400);

  const db = getServiceClient();
  const { data: titulo } = await db.from("btg_dda_titulos").select("id, conciliado").eq("id", String(titulo_id)).single();
  if (!titulo) return json({ error: "Título DDA não encontrado" }, 404);
  if (titulo.conciliado) return json({ error: "Título já conciliado" }, 400);

  const { error } = await db.from("btg_dda_titulos").update({
    parcela_id: String(parcela_id),
    conciliado: true,
    status: "CONCILIADO",
  }).eq("id", String(titulo_id));

  if (error) return json({ error: "Erro ao conciliar", details: error.message }, 500);
  return json({ success: true, status: "CONCILIADO" });
}

// ─── ACTION: ignorar ─────────────────────────────────────────
async function handleIgnorar(body: Record<string, unknown>, userId: string) {
  await requireAdminRole(userId);

  const { titulo_id } = body;
  if (!titulo_id) return json({ error: "titulo_id obrigatório" }, 400);

  const db = getServiceClient();
  const { error } = await db.from("btg_dda_titulos").update({ status: "IGNORADO" }).eq("id", String(titulo_id));
  if (error) return json({ error: "Erro ao ignorar", details: error.message }, 500);
  return json({ success: true, status: "IGNORADO" });
}

// ─── ACTION: listar ──────────────────────────────────────────
async function handleListar(body: Record<string, unknown> | null, url: URL, userId: string) {
  const codEmpresa = getParam(body, url, "cod_empresa");
  const status = getParam(body, url, "status");
  const conciliado = getParam(body, url, "conciliado");
  const limit = Number(getParam(body, url, "limit") || "100");

  const db = getServiceClient();
  const admin = await isAdmin(userId);
  let empresasPermitidas: number[] = [];

  if (!admin) {
    const { data: perms } = await db.from("user_empresa_permissions").select("cod_empresa").eq("user_id", userId);
    empresasPermitidas = (perms || []).map((p: { cod_empresa: number }) => p.cod_empresa);
    if (empresasPermitidas.length === 0) return json([]);
  }

  let query = db.from("btg_dda_titulos").select("*").order("data_vencimento", { ascending: true }).limit(limit);

  if (codEmpresa) {
    const ce = Number(codEmpresa);
    if (!admin && !empresasPermitidas.includes(ce)) return json({ error: "Sem permissão" }, 403);
    query = query.eq("cod_empresa", ce);
  } else if (!admin) {
    query = query.in("cod_empresa", empresasPermitidas);
  }

  if (status) query = query.eq("status", status);
  if (conciliado !== null && conciliado !== undefined) {
    query = query.eq("conciliado", conciliado === "true");
  }

  const { data, error } = await query;
  if (error) return json({ error: "Erro ao listar DDA", details: error.message }, 500);
  return json(data || []);
}

// ─── ACTION: indicadores ─────────────────────────────────────
async function handleIndicadores(body: Record<string, unknown> | null, url: URL) {
  const codEmpresa = getParam(body, url, "cod_empresa");
  if (!codEmpresa) return json({ error: "cod_empresa obrigatório" }, 400);

  const db = getServiceClient();
  const ce = Number(codEmpresa);

  const { count: total } = await db.from("btg_dda_titulos").select("id", { count: "exact", head: true }).eq("cod_empresa", ce);
  const { count: conciliados } = await db.from("btg_dda_titulos").select("id", { count: "exact", head: true }).eq("cod_empresa", ce).eq("conciliado", true);
  const { count: pendentes } = await db.from("btg_dda_titulos").select("id", { count: "exact", head: true }).eq("cod_empresa", ce).eq("status", "PENDENTE").eq("conciliado", false);
  const { count: ignorados } = await db.from("btg_dda_titulos").select("id", { count: "exact", head: true }).eq("cod_empresa", ce).eq("status", "IGNORADO");

  const t = total || 0;
  const c = conciliados || 0;

  return json({
    total: t,
    conciliados: c,
    pendentes: pendentes || 0,
    ignorados: ignorados || 0,
    percentual_conciliado: t > 0 ? Math.round((c / t) * 100) : 0,
  });
}

// ─── MAIN ────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    let action = url.searchParams.get("action") || "";
    let body: Record<string, unknown> | null = null;

    if (req.method === "POST") {
      try {
        body = await req.json();
        if (!action && body?.action) action = String(body.action);
      } catch { /* no-op */ }
    }

    // Rodada em lote: chamada pelo pg_cron, sem usuário. Mesmo padrão do
    // btg-poll-status (verify_jwt=false). Só lê do BTG e grava nas nossas
    // tabelas — não movimenta dinheiro.
    if (action === "importar_todas") {
      return await handleImportarTodas();
    }

    const userId = requireAuth(req);

    switch (action) {
      case "importar":
        return await handleImportar(body || {}, userId);
      case "listar":
        return await handleListar(body, url, userId);
      case "reconciliar":
        return await handleReconciliar(body || {}, userId);
      case "conciliar_auto":
        return await handleConciliarAuto(body || {}, userId);
      case "conciliar_manual":
        return await handleConciliarManual(body || {}, userId);
      case "ignorar":
        return await handleIgnorar(body || {}, userId);
      case "indicadores":
        return await handleIndicadores(body, url);
      default:
        return json({ error: `Ação desconhecida: '${action}'. Use: importar, importar_todas, reconciliar, listar, conciliar_auto, conciliar_manual, ignorar, indicadores` }, 400);
    }
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[btg-dda] Unhandled error:", e);
    return json({ error: "Erro interno", details: String(e) }, 500);
  }
});
