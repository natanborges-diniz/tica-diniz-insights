import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, authGuard } from "../_shared/authGuard.ts";
import { avaliarLancamento as avaliarLancamentoPuro, validarJustificativa, criadorAprovadorDistintos } from "../_shared/governanca.ts";

/**
 * avaliarLancamento com a flag de exceção aprovada derivada de
 * dados_extras.excecao_aprovada_por (gravada pelo aprovar_excecao). Exceção
 * aprovada individualmente pelo admin volta ao trilho do borderô.
 */
function avaliarLancamento(l: never, rubrica: never, hoje: string) {
  const rec = l as Record<string, unknown>;
  const dx = (rec.dados_extras ?? {}) as Record<string, unknown>;
  return avaliarLancamentoPuro(
    { ...rec, excecao_aprovada: Boolean(dx.excecao_aprovada_por) } as never,
    rubrica,
    hoje,
  );
}
import { validarAgrupamento, descricaoPagador, ratearValorPago } from "../_shared/rateio.ts";
import { casarTitulo, JANELA_DIAS } from "../_shared/ddaMatch.ts";
import { montarLoteFolha } from "../_shared/folha.ts";
import { tipoPorLinhaDigitavel } from "../_shared/btgPayment.ts";
import { resumirComposicao, type ItemBordero } from "../_shared/borderoEstado.ts";
import { separarParaReenvio, estadoDeVolta } from "../_shared/reenvio.ts";
import {
  pendenciaDoBordero,
  ordenarPendencias,
  resumirPendencias,
  pendenciaDeLancamentoReaberto,
  type Pendencia,
} from "../_shared/pendenciasFinanceiro.ts";
import { validarEdicao, validarCancelamento, CAMPOS_EDITAVEIS } from "../_shared/rubricaEdicao.ts";
import {
  hojeBrt,
  proximaSegunda,
  descricaoBordero,
  dataAgendamento,
  dataPagamentoItem,
} from "../_shared/agendamento.ts";
import {
  montarItem,
  montarCorpo,
  chaveIdempotencia,
  descreverErroBtg,
} from "../_shared/btgPayment.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const auth = await authGuard(req, { requiredRole: "authenticated" });
    const body = await req.json();
    const action = body.action;

    switch (action) {
      // ── Lançamentos ──
      case "listar":
        return await listar(body);
      case "criar":
        return await criar(body, auth.userId);
      case "editar":
        return await editar(body, auth.userId);
      case "excluir":
        return await excluir(body);
      case "agrupar_lancamentos":
        return await agruparLancamentos(body, auth.userId);
      case "desagrupar_lancamento":
        return await desagruparLancamento(body);
      case "autorizar":
        return await autorizar(body, auth.userId);
      case "baixar":
        return await baixar(body, auth.userId);
      case "reabrir":
        return await reabrir(body, auth.userId);
      case "cancelar":
        return await cancelar(body);
      case "importar_erp":
        // Aposentada junto com importar_erp_auto (P2) — ERP entra só pelo sync-ledger
        return json({ error: "Ação aposentada pelo P2 — o ERP entra automaticamente via sync-ledger." }, 410);
      case "importar_erp_legado_desativado":
        return await importarErp(body, auth.userId);
      case "importar_erp_auto":
        // P2 — aposentada: usava chave frouxa ERP-{emp}-{documento} (colidia em
        // documentos multi-parcela e criou os "lançamentos sombra" limpos em 29/07).
        // O caminho único agora é a function sync-ledger (chave dura por parcela).
        return json({
          error: "Ação aposentada pelo P2 — use a function sync-ledger (o Hub e o cron de 30min já usam).",
        }, 410);
      case "classificar":
        return await classificar(body, auth.userId);
      case "classificar_lote":
        return await classificarLote(body, auth.userId);
      case "reverter_cancelamento":
        return await reverterCancelamento(body);
      case "cancelar_lote":
        return await cancelarLote(body);
      case "listar_pendentes_validacao":
        return await listarPendentesValidacao(body);
      case "resumo_financeiro":
        return await resumoFinanceiro(body);
      case "confirmar_processamento":
        return await confirmarProcessamento(body, auth.userId);

      // ── Borderôs ──
      case "refazer_bordero":
        return await refazerBordero(body, auth.userId);
      case "encerrar_bordero":
        return await encerrarBordero(body, auth.userId);
      case "devolver_para_preparo":
        return await devolverParaPreparo(body, auth.userId);
      case "painel_pendencias":
        return await painelPendencias(body);
      case "dispensar_pendencia":
        return await dispensarPendencia(body, auth.userId);
      case "listar_borderos":
        return await listarBorderos(body);
      case "criar_bordero":
        return await criarBordero(body, auth.userId);
      case "adicionar_ao_bordero":
        return await adicionarAoBordero(body);
      case "remover_do_bordero":
        return await removerDoBordero(body);
      case "editar_rubrica":
        return await editarRubrica(body, auth.userId);
      case "cancelar_rubrica":
        return await cancelarRubrica(body, auth.userId);
      case "criar_rubrica_de_lancamento":
        return await criarRubricaDeLancamento(body, auth.userId);
      case "sugerir_rubricas":
        return await sugerirRubricas(body, auth.userId);
      case "mesa_aprovacao":
        return await mesaAprovacao(body);
      case "aprovar_excecao":
        return await aprovarExcecao(body, auth.userId);
      case "diagnostico_bordero":
        return await diagnosticoBordero(body, auth.userId);
      case "aprovar_bordero":
        return await aprovarBordero(body, auth.userId);
      case "enviar_bordero_btg":
        return await enviarBorderoBtg(body, auth.userId);
      case "editar_bordero":
        return await editarBordero(body, auth.userId);
      case "cancelar_bordero":
        return await cancelarBordero(body);
      case "liberar_processando_orfao":
        return await liberarProcessandoOrfao(body, auth.userId);
      case "detalhe_bordero":
        return await detalheBordero(body);

      default:
        return json({ error: `Action desconhecida: ${action}` }, 400);
    }
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[financeiro-lancamentos]", err);
    return json({ error: err.message || "Erro interno" }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function requireAdmin(userId: string) {
  const { data: roles } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin");
  if (!roles || roles.length === 0) {
    throw new Error("Apenas administradores podem executar esta ação");
  }
}

/**
 * Quem pode mexer no fluxo do financeiro sem decidir sobre dinheiro.
 *
 * Corrigir um pagamento recusado — data errada, linha digitável trocada, chave
 * Pix incorreta — é trabalho do operador, que é quem vê o motivo no app do
 * banco. Exigir admin aqui criava fila para uma correção que não autoriza nada:
 * o controle continua adiante, no lastro do borderô novo e na autorização do
 * master no BTG.
 */
async function requireFinanceEdit(userId: string) {
  const { data: roles } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["admin", "master"]);
  if (roles && roles.length > 0) return;

  const { data: podeEditar } = await supabase.rpc("has_module_edit_access", {
    _user_id: userId,
    _module: "financeiro",
  });
  if (!podeEditar) {
    throw new Error("Sem permissão de edição no Financeiro");
  }
}


// ═══════════════════════════════════════════════════════════
// LANÇAMENTOS
// ═══════════════════════════════════════════════════════════

async function listar(body: Record<string, unknown>) {
  const { cod_empresa, tipo, status, natureza, origem, data_inicio, data_fim, campo_data, requer_validacao, limit: lim } = body;

  // PAGAMENTO existe para a aba de pagos: quem procura comprovante pensa em
  // "quando saiu da conta", não em quando o título vencia.
  const dateColumn = campo_data === "EMISSAO"
    ? "data_emissao"
    : campo_data === "PAGAMENTO"
      ? "data_pagamento"
      : "data_vencimento";

  let query = supabase
    .from("lancamentos_financeiros")
    .select("*")
    .order("data_vencimento", { ascending: true });

  if (cod_empresa) query = query.eq("cod_empresa", cod_empresa);
  if (tipo) query = query.eq("tipo", tipo);
  if (status) query = query.eq("status", status);
  if (natureza) query = query.eq("natureza", natureza);
  if (origem) query = query.eq("origem", origem);
  if (data_inicio) query = query.gte(dateColumn, data_inicio);
  if (data_fim) query = query.lte(dateColumn, data_fim);
  if (requer_validacao !== undefined) query = query.eq("requer_validacao", requer_validacao);
  if (lim) query = query.limit(Number(lim));

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  // Selo de lastro junto da listagem.
  //
  // Antes ele só existia na Mesa de Aprovação: o operador montava o borderô,
  // clicava em enviar e só então descobria que um item exigia aprovação. A
  // governança precisa estar visível ONDE o trabalho acontece, não depois.
  const pendentes = (data || []).filter(
    (l) => l.tipo === "PAGAR" && !["BAIXADO", "CANCELADO"].includes(l.status),
  );

  if (pendentes.length > 0) {
    const rubIds = [...new Set(pendentes.map((l) => l.rubrica_id).filter(Boolean))] as string[];
    const rubMap = new Map<string, Record<string, unknown>>();
    if (rubIds.length > 0) {
      const { data: rubs } = await supabase.from("rubricas_autorizadas").select("*").in("id", rubIds);
      for (const r of (rubs || [])) rubMap.set(String(r.id), r);
    }

    const hoje = hojeBrt();
    for (const l of pendentes) {
      const rubrica = l.rubrica_id ? (rubMap.get(String(l.rubrica_id)) as never) ?? null : null;
      const av = avaliarLancamento(l as never, rubrica, hoje);
      (l as Record<string, unknown>).selo = av.selo;
      (l as Record<string, unknown>).selo_motivo = av.motivo;
      (l as Record<string, unknown>).pode_bordero = av.podeBordero;
    }
  }

  return json(data);
}

async function criar(body: Record<string, unknown>, userId: string) {
  // G2 — lastro na criação (SPEC_P2_5 §1). Exceção exige justificativa.
  const lastroInformado = body.lastro ? String(body.lastro) : null;
  const rubricaId = body.rubrica_id ? String(body.rubrica_id) : null;
  if (lastroInformado === "EXCECAO" && !validarJustificativa(body.justificativa)) {
    throw new Error("Exceção emergencial exige justificativa (mínimo 20 caracteres)");
  }
  const lastro = rubricaId ? "RUBRICA" : lastroInformado;

  const record = {
    lastro,
    rubrica_id: rubricaId,
    justificativa: body.justificativa ? String(body.justificativa) : null,
    cod_empresa: body.cod_empresa,
    tipo: body.tipo,
    descricao: body.descricao,
    valor: body.valor,
    data_vencimento: body.data_vencimento,
    pessoa_nome: body.pessoa_nome || null,
    pessoa_documento: body.pessoa_documento || null,
    natureza: body.natureza || null,
    categoria: body.categoria || null,
    subcategoria: body.subcategoria || null,
    forma_pagamento: body.forma_pagamento || null,
    adquirente: body.adquirente || null,
    bandeira: body.bandeira || null,
    numero_parcela: body.numero_parcela || null,
    total_parcelas: body.total_parcelas || null,
    data_emissao: body.data_emissao || null,
    observacao: body.observacao || null,
    origem: body.origem || "MANUAL",
    origem_id: body.origem_id || null,
    recorrente: body.recorrente || false,
    recorrencia_tipo: body.recorrencia_tipo || null,
    dados_extras: body.dados_extras || {},
    criado_por: userId,
    status: "PREVISTO",
  };

  const { data, error } = await supabase
    .from("lancamentos_financeiros")
    .insert(record)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return json(data, 201);
}

async function editar(body: Record<string, unknown>, _userId: string) {
  const { id, ...fields } = body;
  if (!id) throw new Error("id obrigatório");

  const { data: existing } = await supabase
    .from("lancamentos_financeiros")
    .select("status, valor, valor_original, lancamento_pai_id, data_vencimento, dados_extras, rubrica_id, origem")
    .eq("id", id)
    .single();

  if (!existing) throw new Error("Lançamento não encontrado");

  // Reprogramação: mudar o vencimento é legítimo e não conflita com as rotinas
  // automáticas — a provisão de rubricas casa por (empresa, rubrica,
  // competência) e o import do ERP por origem_id, nenhuma das duas olha a data.
  //
  // O que faltava era o rastro. Sem ele, na semana seguinte ninguém sabe por
  // que aquela data difere da rubrica, e o número perde credibilidade.
  const motivo = fields.motivo_reprogramacao ? String(fields.motivo_reprogramacao).trim() : "";
  delete fields.motivo_reprogramacao;

  if (
    fields.data_vencimento !== undefined &&
    String(fields.data_vencimento) !== String(existing.data_vencimento)
  ) {
    const extras = (existing.dados_extras || {}) as Record<string, unknown>;
    const jaMesclado = (fields.dados_extras as Record<string, unknown>) ?? extras;

    fields.dados_extras = {
      ...jaMesclado,
      // Só na primeira vez: guardamos de onde partiu, não o passo anterior.
      data_vencimento_original: extras.data_vencimento_original ?? existing.data_vencimento,
      reprogramado_de: existing.data_vencimento,
      reprogramado_para: String(fields.data_vencimento),
      reprogramado_por: _userId,
      reprogramado_em: new Date().toISOString(),
      motivo_reprogramacao: motivo || extras.motivo_reprogramacao || null,
    };
  }

  // Trilha da edição de valor: guardamos o número que veio da origem na
  // primeira alteração. É ele que permite à governança distinguir "veio do
  // ERP" de "alguém digitou" — sem isso o selo verde seria herdado por um
  // valor manual e o pagamento sairia sem passar pela Mesa.
  if (fields.valor !== undefined && Number(fields.valor) !== Number(existing.valor)) {
    if (!(Number(fields.valor) > 0)) throw new Error("Valor precisa ser maior que zero");
    if (existing.valor_original == null) fields.valor_original = Number(existing.valor);
    fields.valor_editado_por = _userId;
    fields.valor_editado_em = new Date().toISOString();
  }

  // Allow editing natureza/categoria/observacao on any non-CANCELADO status
  // Full edit only on PREVISTO
  const allowedFieldsAnyStatus = ["natureza", "categoria", "subcategoria", "observacao", "dados_extras"];
  delete fields.action;

  // Componente de pagamento unificado: pode editar, mas o pagador tem que
  // acompanhar — senão a soma das partes deixa de fechar com o que vai ao banco.
  const paiParaRecalcular = existing.lancamento_pai_id && fields.valor !== undefined
    ? String(existing.lancamento_pai_id)
    : null;

  // Edição completa enquanto o lançamento não entrou em borderô. AGRUPADO é
  // componente de pagamento unificado — ainda não foi ao banco, então continua
  // editável.
  const statusEditaveis = ["PREVISTO", "CLASSIFICADO", "AGRUPADO"];
  if (!statusEditaveis.includes(existing.status)) {
    const editKeys = Object.keys(fields);
    const disallowed = editKeys.filter(k => !allowedFieldsAnyStatus.includes(k));
    if (disallowed.length > 0) {
      throw new Error(`Lançamento com status ${existing.status}: só é possível editar classificação (natureza, categoria). Campos bloqueados: ${disallowed.join(", ")}`);
    }
  }

  const { data, error } = await supabase
    .from("lancamentos_financeiros")
    .update(fields)
    .eq("id", id)
    .select()
    .single();

  if (error) throw new Error(error.message);

  if (paiParaRecalcular) await recalcularPagador(paiParaRecalcular);

  return json(data);
}

/**
 * Reajusta o valor do pagador para a soma dos seus componentes.
 *
 * O pagador é o que vai ao banco; se a soma das partes deixar de fechar com
 * ele, o DRE por rubrica e o caixa passam a contar histórias diferentes.
 */
async function recalcularPagador(paiId: string) {
  const { data: filhos } = await supabase
    .from("lancamentos_financeiros")
    .select("valor")
    .eq("lancamento_pai_id", paiId);

  const soma = (filhos || []).reduce((s, f) => s + Number(f.valor), 0);
  await supabase
    .from("lancamentos_financeiros")
    .update({ valor: Math.round(soma * 100) / 100 })
    .eq("id", paiId);
}

// ═══════════════════════════════════════════════════════════
// PAGAMENTO UNIFICADO (rateio)
// ═══════════════════════════════════════════════════════════

/**
 * Une vários lançamentos num pagamento só, preservando a memória de cada um.
 *
 * Caso típico: boleto de ocupação que embute aluguel, IPTU e condomínio. O
 * pagador vai ao banco; os componentes ficam pendurados nele com suas rubricas
 * e continuam alimentando o DRE.
 *
 * `pagador_id` opcional: quando o boleto já existe como lançamento (veio do
 * DDA), ele vira o pagador e a soma dos componentes tem que fechar com o valor
 * cobrado. Sem ele, criamos um pagador a partir da soma.
 */
async function agruparLancamentos(body: Record<string, unknown>, userId: string) {
  const ids = (body.lancamento_ids as string[]) || [];
  const pagadorId = body.pagador_id ? String(body.pagador_id) : null;
  const descricao = body.descricao ? String(body.descricao) : null;

  if (ids.length < 2) throw new Error("Selecione ao menos dois lançamentos para unificar");

  const { data: lancs, error: qErr } = await supabase
    .from("lancamentos_financeiros")
    .select("*")
    .in("id", ids);
  if (qErr) throw new Error(qErr.message);
  if (!lancs || lancs.length !== ids.length) throw new Error("Algum lançamento não foi encontrado");

  const componentes = lancs.filter((l) => l.id !== pagadorId);
  let pagador = pagadorId ? lancs.find((l) => l.id === pagadorId) : null;

  if (pagadorId && !pagador) {
    const { data } = await supabase.from("lancamentos_financeiros").select("*").eq("id", pagadorId).single();
    pagador = data;
    if (!pagador) throw new Error("Título pagador não encontrado");
  }

  const validacao = validarAgrupamento(
    componentes as never,
    pagador ? Number(pagador.valor) : null,
  );
  if (!validacao.ok) throw new Error(validacao.motivo);

  // Sem pagador preexistente: cria um a partir dos componentes, herdando
  // favorecido e vencimento do primeiro (é o que a operação espera ver).
  if (!pagador) {
    const ref = componentes[0];
    const { data: novo, error: insErr } = await supabase
      .from("lancamentos_financeiros")
      .insert({
        cod_empresa: ref.cod_empresa,
        tipo: "PAGAR",
        descricao: descricao || descricaoPagador(componentes as never, ref.pessoa_nome),
        valor: validacao.soma,
        data_vencimento: componentes
          .map((c) => String(c.data_vencimento))
          .sort()[0], // o mais cedo manda, para não pagar juros
        pessoa_nome: ref.pessoa_nome,
        pessoa_documento: ref.pessoa_documento,
        natureza: ref.natureza,
        categoria: ref.categoria,
        origem: "AGRUPAMENTO",
        status: "PREVISTO",
        criado_por: userId,
        requer_validacao: true, // falta configurar a forma de pagamento
        dados_extras: { agrupamento: true, componentes: componentes.length },
      })
      .select()
      .single();
    if (insErr) throw new Error(insErr.message);
    pagador = novo;
  }

  const { error: updErr } = await supabase
    .from("lancamentos_financeiros")
    .update({ lancamento_pai_id: pagador.id, status: "AGRUPADO" })
    .in("id", componentes.map((c) => c.id));
  if (updErr) throw new Error(updErr.message);

  // Procura o boleto do DDA para o pagador recém-criado.
  //
  // Caso real (Barueri, 04/08): o ERP lançou o título dividido em amortização e
  // juros, mas o boleto é um só, com a soma. Unificar resolvia o pagamento e
  // deixava o boleto para trás — nenhum componente batia com o valor do DDA
  // sozinho, e o pagador nascia depois da conciliação já ter rodado.
  //
  // Só faz sentido para pagador sintético: quando o pagador é o próprio título
  // do DDA, o vínculo já existe.
  let boletoVinculado = false;
  if (!pagadorId) {
    boletoVinculado = await vincularBoletoAoPagador(pagador, validacao.soma);
  }

  return json({
    ok: true,
    pagador_id: pagador.id,
    componentes: componentes.length,
    total: validacao.soma,
    boleto_vinculado: boletoVinculado,
  });
}

/**
 * Tenta anexar um título do DDA ao pagador criado pela unificação.
 *
 * A conciliação normal roda na importação do DDA e no import do ERP — nenhuma
 * das duas passa por aqui, porque o pagador nasce depois, de uma ação manual.
 * Sem esta busca, boleto legítimo ficava órfão justamente nos casos em que a
 * unificação era necessária.
 */
async function vincularBoletoAoPagador(
  pagador: Record<string, unknown>,
  total: number,
): Promise<boolean> {
  const venc = String(pagador.data_vencimento).slice(0, 10);
  const emDias = (d: number) =>
    new Date(Date.parse(`${venc}T12:00:00Z`) + d * 86_400_000).toISOString().slice(0, 10);

  const { data: titulos } = await supabase
    .from("btg_dda_titulos")
    .select("id, valor, data_vencimento, documento_emissor, numero_documento, emissor, linha_digitavel")
    .eq("cod_empresa", pagador.cod_empresa)
    .not("status", "in", "(PAGO,IGNORADO,CANCELADO,ARQUIVADO)")
    .gte("data_vencimento", emDias(-JANELA_DIAS))
    .lte("data_vencimento", emDias(JANELA_DIAS));

  if (!titulos || titulos.length === 0) return false;

  // Só títulos ainda sem lançamento vinculado.
  const { data: jaVinculados } = await supabase
    .from("lancamentos_financeiros")
    .select("btg_dda_id")
    .in("btg_dda_id", titulos.map((t) => t.id));
  const ocupados = new Set((jaVinculados || []).map((l) => String(l.btg_dda_id)));

  const candidato = {
    id: String(pagador.id),
    valor: total,
    data_vencimento: venc,
    pessoa_documento: (pagador.pessoa_documento ?? null) as string | null,
  };

  for (const t of titulos) {
    if (ocupados.has(String(t.id))) continue;
    const r = casarTitulo(
      {
        valor: Number(t.valor),
        data_vencimento: String(t.data_vencimento),
        documento_emissor: t.documento_emissor,
        numero_documento: t.numero_documento,
      },
      [candidato],
    );
    if (!r.candidato) continue;

    const extras = (pagador.dados_extras || {}) as Record<string, unknown>;
    await supabase.from("lancamentos_financeiros").update({
      btg_dda_id: t.id,
      forma_pagamento: "BOLETO",
      dados_extras: {
        ...extras,
        linha_digitavel: t.linha_digitavel,
        dda_emissor: t.emissor,
        btg_payment_type: "BANKSLIP",
      },
    }).eq("id", pagador.id);
    await supabase.from("btg_dda_titulos").update({ conciliado: true }).eq("id", t.id);
    console.log(`[financeiro-lancamentos] unificação: boleto ${t.id} anexado ao pagador ${pagador.id}`);
    return true;
  }
  return false;
}

/**
 * Baixa os componentes de um pagador liquidado, rateando o valor efetivamente
 * pago proporcionalmente a cada um.
 *
 * O rateio importa porque o valor pago raramente é idêntico ao previsto —
 * juros, multa, desconto, ou o ajuste para o valor do boleto registrado. Sem
 * distribuir, a diferença ficaria só no pagador e o DRE por rubrica sairia
 * errado. Idempotente: só mexe em componente que ainda não foi baixado.
 */
async function baixarComponentes(
  pagadorId: string,
  valorPagoTotal: number,
  dataPagamento: string,
  userId: string | null,
): Promise<number> {
  const { data: filhos } = await supabase
    .from("lancamentos_financeiros")
    .select("id, valor")
    .eq("lancamento_pai_id", pagadorId)
    .neq("status", "BAIXADO");

  if (!filhos || filhos.length === 0) return 0;

  const rateado = ratearValorPago(
    filhos.map((f) => ({ id: String(f.id), valor: Number(f.valor) })),
    valorPagoTotal,
  );

  const agora = new Date().toISOString();
  let n = 0;
  for (const parte of rateado) {
    const { error } = await supabase
      .from("lancamentos_financeiros")
      .update({
        status: "BAIXADO",
        valor_pago: parte.valor,
        data_pagamento: dataPagamento,
        data_baixa: dataPagamento,
        baixado_por: userId,
        baixado_em: agora,
      })
      .eq("id", parte.id);
    if (!error) n++;
  }
  return n;
}

/** Desfaz a unificação: os componentes voltam a ser lançamentos avulsos. */
async function desagruparLancamento(body: Record<string, unknown>) {
  const { pagador_id } = body;
  if (!pagador_id) throw new Error("pagador_id obrigatório");

  const { data: pagador } = await supabase
    .from("lancamentos_financeiros")
    .select("id, status, origem")
    .eq("id", pagador_id)
    .single();
  if (!pagador) throw new Error("Pagamento unificado não encontrado");
  if (!["PREVISTO", "CLASSIFICADO"].includes(pagador.status)) {
    throw new Error(`Pagamento em ${pagador.status} — só dá para desfazer antes de entrar em borderô`);
  }

  const { data: filhos } = await supabase
    .from("lancamentos_financeiros")
    .select("id")
    .eq("lancamento_pai_id", pagador_id);

  await supabase
    .from("lancamentos_financeiros")
    .update({ lancamento_pai_id: null, status: "PREVISTO" })
    .eq("lancamento_pai_id", pagador_id);

  // Pagador sintético não tem razão de existir sem componentes.
  if (pagador.origem === "AGRUPAMENTO") {
    await supabase.from("lancamentos_financeiros").delete().eq("id", pagador_id);
  }

  return json({ ok: true, componentes: (filhos || []).length });
}

async function excluir(body: Record<string, unknown>) {
  const { id } = body;
  if (!id) throw new Error("id obrigatório");

  const { error } = await supabase
    .from("lancamentos_financeiros")
    .delete()
    .eq("id", id)
    .eq("status", "PREVISTO");

  if (error) throw new Error(error.message);
  return json({ ok: true });
}

async function autorizar(body: Record<string, unknown>, userId: string) {
  const { id } = body;
  if (!id) throw new Error("id obrigatório");
  await requireAdmin(userId);

  const { data, error } = await supabase
    .from("lancamentos_financeiros")
    .update({
      status: "AUTORIZADO",
      autorizado_por: userId,
      autorizado_em: new Date().toISOString(),
    })
    .eq("id", id)
    .in("status", ["PREVISTO", "BORDERO"])
    .select()
    .single();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("Lançamento não encontrado ou status inválido para autorização");
  return json(data);
}

async function baixar(body: Record<string, unknown>, userId: string) {
  const { id, valor_pago, data_pagamento } = body;
  if (!id) throw new Error("id obrigatório");

  const { data, error } = await supabase
    .from("lancamentos_financeiros")
    .update({
      status: "BAIXADO",
      valor_pago: valor_pago || null,
      data_pagamento: data_pagamento || new Date().toISOString().slice(0, 10),
      data_baixa: new Date().toISOString().slice(0, 10),
      baixado_por: userId,
      baixado_em: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return json(data);
}

async function cancelar(body: Record<string, unknown>) {
  const { id } = body;
  if (!id) throw new Error("id obrigatório");

  const { data, error } = await supabase
    .from("lancamentos_financeiros")
    .update({ status: "CANCELADO" })
    .eq("id", id)
    .not("status", "eq", "BAIXADO")
    .select()
    .single();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("Lançamento não encontrado ou já baixado");
  return json(data);
}

async function reabrir(body: Record<string, unknown>, userId: string) {
  const { id } = body;
  if (!id) throw new Error("id obrigatório");
  await requireAdmin(userId);

  const { data: existing } = await supabase
    .from("lancamentos_financeiros")
    .select("status")
    .eq("id", id)
    .single();

  if (!existing) throw new Error("Lançamento não encontrado");
  if (!["BAIXADO", "AUTORIZADO"].includes(existing.status)) {
    throw new Error("Apenas lançamentos BAIXADOS ou AUTORIZADOS podem ser reabertos");
  }

  const { data, error } = await supabase
    .from("lancamentos_financeiros")
    .update({
      status: "PREVISTO",
      valor_pago: null,
      data_pagamento: null,
      data_baixa: null,
      baixado_por: null,
      baixado_em: null,
      bordero_id: null,
    })
    .eq("id", id)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return json(data);
}

// ═══════════════════════════════════════════════════════════
// BORDERÔS
// ═══════════════════════════════════════════════════════════



/**
 * Muda data de pagamento, modo de data ou descrição de um borderô ainda não
 * enviado.
 *
 * Não existia: a data era decidida na criação e virava pedra. Quem errasse
 * cancelava o borderô inteiro e remontava — com folha de 30 pessoas, isso é
 * refazer tudo por causa de um campo.
 *
 * Só antes do envio. Depois de ENVIADO a data está com o banco, e mudar aqui só
 * criaria divergência entre o que a tela mostra e o que foi contratado.
 *
 * A data de pagamento é replicada no vencimento dos títulos de FOLHA: ali
 * vencimento e data de pagamento são a mesma coisa, e deixá-los diferentes faz
 * o agendamento antecipar para o vencimento antigo — foi exatamente o que
 * travava a folha no dia impresso no relatório do contador.
 */
async function editarBordero(body: Record<string, unknown>, userId: string) {
  const id = String(body.bordero_id || "");
  if (!id) throw new Error("bordero_id obrigatório");

  const { data: bordero } = await supabase.from("borderos").select("*").eq("id", id).single();
  if (!bordero) throw new Error("Borderô não encontrado");

  if (!["MONTAGEM", "APROVADO"].includes(String(bordero.status))) {
    return json({
      ok: false,
      code: "BORDERO_NAO_EDITAVEL",
      error: `Borderô em ${bordero.status} não pode ser alterado — a data já está com o banco. ` +
        `Cancele e monte outro, ou aguarde o retorno.`,
    });
  }

  const patch: Record<string, unknown> = {};

  if (body.data_pagamento !== undefined) {
    const d = String(body.data_pagamento ?? "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new Error("data_pagamento deve ser yyyy-MM-dd");
    // Data no passado o banco recusa com `past-payment-date`; barramos antes.
    if (d < hojeBrt()) throw new Error(`Data ${d} já passou — escolha hoje ou uma data futura`);
    patch.data_pagamento = d;
  }

  if (body.modo_data !== undefined) {
    const m = String(body.modo_data);
    if (!["DATA_UNICA", "VENCIMENTO"].includes(m)) throw new Error("modo_data inválido");
    patch.modo_data = m;
  }

  if (body.descricao !== undefined) patch.descricao = String(body.descricao);

  if (Object.keys(patch).length === 0) throw new Error("Nada a alterar");

  const { error } = await supabase.from("borderos").update(patch).eq("id", id);
  if (error) throw new Error(error.message);

  // Folha: o vencimento acompanha a data de pagamento.
  let titulosAtualizados = 0;
  if (patch.data_pagamento && bordero.tipo === "FOLHA") {
    const { data: afetados } = await supabase
      .from("lancamentos_financeiros")
      .update({ data_vencimento: patch.data_pagamento })
      .eq("bordero_id", id)
      .in("status", ["BORDERO", "PREVISTO", "AUTORIZADO"])
      .select("id");
    titulosAtualizados = afetados?.length ?? 0;
  }

  console.log(`[financeiro-lancamentos] bordero ${id} alterado por ${userId}:`, JSON.stringify(patch));
  return json({ ok: true, ...patch, titulos_atualizados: titulosAtualizados });
}

// ─── Rubricas: editar e cancelar ─────────────────────────────
/**
 * Edita uma rubrica existente.
 *
 * Editar sem regra seria a porta dos fundos da aprovação: bastaria aprovar uma
 * rubrica de R$ 100 e depois trocar o teto para R$ 100.000. Por isso mexer no
 * que define o risco — favorecido, valores, faixa, destino do dinheiro —
 * devolve a rubrica a rascunho, e a aprovação tem de acontecer de novo, por
 * outra pessoa.
 *
 * Tudo fica registrado em `rubricas_edicoes`, com antes e depois.
 */
async function editarRubrica(body: Record<string, unknown>, userId: string) {
  const id = String(body.rubrica_id || "");
  if (!id) throw new Error("rubrica_id obrigatório");

  const { data: atual, error: errBusca } = await supabase
    .from("rubricas_autorizadas").select("*").eq("id", id).single();
  if (errBusca || !atual) throw new Error("Rubrica não encontrada");

  const mudancas: Record<string, unknown> = {};
  for (const campo of CAMPOS_EDITAVEIS) {
    if (campo in body) mudancas[campo] = body[campo];
  }

  const v = validarEdicao(atual, mudancas);
  if (v.erros.length > 0) {
    return json({ ok: false, code: "EDICAO_INVALIDA", error: v.erros.join(" · "), erros: v.erros });
  }

  // Só o que mudou vai para o update e para a trilha.
  const patch: Record<string, unknown> = {};
  const alteracoes: Record<string, { antes: unknown; depois: unknown }> = {};
  for (const campo of v.alterados) {
    patch[campo] = mudancas[campo] === "" ? null : mudancas[campo];
    alteracoes[campo] = { antes: atual[campo] ?? null, depois: patch[campo] };
  }

  if (v.exigeReaprovacao) {
    patch.status = "RASCUNHO";
    patch.aprovado_por = null;
    patch.aprovado_em = null;
  }

  const { error } = await supabase.from("rubricas_autorizadas").update(patch).eq("id", id);
  if (error) throw new Error(error.message);

  await supabase.from("rubricas_edicoes").insert({
    rubrica_id: id,
    editado_por: userId,
    alteracoes,
    exigiu_reaprovacao: v.exigeReaprovacao,
    motivo: body.motivo ? String(body.motivo) : null,
  });

  return json({
    ok: true,
    alterados: v.alterados,
    exige_reaprovacao: v.exigeReaprovacao,
    status: v.exigeReaprovacao ? "RASCUNHO" : atual.status,
  });
}

/**
 * Cancela uma rubrica.
 *
 * Terminal e sem exclusão: o histórico de pagamentos aponta para ela, e um DRE
 * que perde a referência do que autorizou a despesa deixa de ser auditável.
 *
 * Com título em aberto vinculado, recusamos e sugerimos suspender — cancelar
 * deixaria o lançamento órfão de lastro no meio do caminho, entre a criação e o
 * borderô.
 */
async function cancelarRubrica(body: Record<string, unknown>, userId: string) {
  const id = String(body.rubrica_id || "");
  if (!id) throw new Error("rubrica_id obrigatório");

  const { data: atual } = await supabase
    .from("rubricas_autorizadas").select("*").eq("id", id).single();
  if (!atual) throw new Error("Rubrica não encontrada");

  const { count } = await supabase
    .from("lancamentos_financeiros")
    .select("id", { count: "exact", head: true })
    .eq("rubrica_id", id)
    .not("status", "in", '("BAIXADO","CANCELADO")');

  const v = validarCancelamento(atual, Number(count ?? 0), body.motivo);
  if (v.erros.length > 0) {
    return json({ ok: false, code: "CANCELAMENTO_INVALIDO", error: v.erros.join(" · "), erros: v.erros });
  }

  const { error } = await supabase.from("rubricas_autorizadas").update({
    status: "CANCELADA",
    cancelada_por: userId,
    cancelada_em: new Date().toISOString(),
    cancelamento_motivo: String(body.motivo),
  }).eq("id", id);
  if (error) throw new Error(error.message);

  await supabase.from("rubricas_edicoes").insert({
    rubrica_id: id,
    editado_por: userId,
    alteracoes: { status: { antes: atual.status, depois: "CANCELADA" } },
    exigiu_reaprovacao: false,
    motivo: String(body.motivo),
  });

  return json({ ok: true, status: "CANCELADA" });
}


/**
 * O que está parado, em todas as lojas, num lugar só.
 *
 * Um fornecedor cobrou porque não tinha recebido. O sistema sabia: o borderô
 * estava enviado e o item nunca voltou processado. Mas isso só aparecia dentro
 * do borderô, na loja daquele borderô — e com dez lojas, ninguém abre uma por
 * uma todo dia.
 *
 * Aqui a varredura é geral e devolve só o que exige ação: o agendado para
 * semana que vem não aparece, o enviado cuja data já passou sem retorno aparece
 * em primeiro lugar.
 */
async function painelPendencias(body: Record<string, unknown>) {
  const hoje = hojeBrt();

  // Só os estados que podem esconder pendência. PROCESSADO e CANCELADO estão
  // resolvidos, e trazê-los faria a varredura crescer sem propósito.
  let query = supabase
    .from("borderos")
    .select("id, cod_empresa, descricao, status, tipo, data_pagamento, total_valor, pendencia_dispensada_em, pendencia_dispensada_status")
    .in("status", ["MONTAGEM", "APROVADO", "ENVIADO", "PROCESSADO_PARCIAL"])
    .order("data_pagamento", { ascending: true })
    .limit(300);

  if (body.cod_empresa) query = query.eq("cod_empresa", Number(body.cod_empresa));

  const { data: borderos, error } = await query;
  if (error) throw new Error(error.message);
  if (!borderos || borderos.length === 0) {
    return json({ pendencias: [], resumo: resumirPendencias([]) });
  }

  // Composição de todos de uma vez: uma consulta a mais aqui evita N consultas
  // e é o que permite distinguir "agendado" de "parado".
  const { data: itens } = await supabase
    .from("lancamentos_financeiros")
    .select("bordero_id, status, requer_validacao, valor, data_vencimento, dados_extras")
    .in("bordero_id", borderos.map((b) => b.id));

  const porBordero = new Map<string, ItemBordero[]>();
  for (const it of (itens || [])) {
    const bid = String(it.bordero_id);
    const extras = (it.dados_extras || {}) as Record<string, unknown>;
    const lista = porBordero.get(bid) ?? [];
    lista.push({
      status: String(it.status),
      requer_validacao: Boolean(it.requer_validacao),
      data_prevista: (extras.btg_payment_date as string) ?? it.data_vencimento ?? null,
      // Já traduzido na hora da recusa (btgRecusa.ts) — aqui é só repassar.
      motivo_recusa: (extras.btg_motivo_recusa as string) ?? null,
      // O que o banco respondeu por último: é o que separa "não processado" de
      // "esperando autorização do master".
      btg_status: (extras.btg_payment_status as string) ?? null,
      valor: Number(it.valor ?? 0),
    });


    porBordero.set(bid, lista);
  }

  // Borderô em montagem: separar "começado e esquecido" de "pronto, mas com
  // exceção esperando decisão" — situações com donos diferentes. A conta é a
  // mesma que trava o envio, então usamos a mesma avaliação de lastro.
  const emMontagem = borderos.filter((b) => String(b.status).toUpperCase() === "MONTAGEM");
  const bloqueiosPorBordero = new Map<string, number>();

  if (emMontagem.length > 0) {
    const { data: lancsMontagem } = await supabase
      .from("lancamentos_financeiros")
      .select("id, bordero_id, descricao, valor, lastro, erp_parcela_id, rubrica_id, btg_dda_id, justificativa, pessoa_documento, data_vencimento, dados_extras")
      .in("bordero_id", emMontagem.map((b) => b.id));

    const rubIds = [...new Set((lancsMontagem || []).map((l) => l.rubrica_id).filter(Boolean))] as string[];
    const rubMap = new Map<string, Record<string, unknown>>();
    if (rubIds.length > 0) {
      const { data: rubs } = await supabase.from("rubricas_autorizadas").select("*").in("id", rubIds);
      for (const r of (rubs || [])) rubMap.set(String(r.id), r);
    }

    for (const l of (lancsMontagem || [])) {
      const rubrica = (l.rubrica_id ? rubMap.get(String(l.rubrica_id)) ?? null : null) as never;
      const av = avaliarLancamento(l as never, rubrica, hoje);
      if (av.selo !== "VERDE" && av.selo !== "AZUL") {
        const bid = String(l.bordero_id);
        bloqueiosPorBordero.set(bid, (bloqueiosPorBordero.get(bid) ?? 0) + 1);
      }
    }
  }

  const pendencias: Pendencia[] = [];
  for (const b of borderos) {
    // Aviso dispensado: alguém já resolveu o caso por fora (pagou no caixa,
    // acertou direto com o fornecedor) e não quer mais o alerta. Ele volta
    // sozinho se a situação do borderô mudar — dispensa não é cegueira.
    const dispensado = Boolean(b.pendencia_dispensada_em) &&
      String(b.pendencia_dispensada_status ?? "") === String(b.status);
    if (dispensado) continue;

    const p = pendenciaDoBordero(
      {
        ...b,
        composicao: resumirComposicao(porBordero.get(String(b.id)) ?? []),
        bloqueios_mesa: bloqueiosPorBordero.get(String(b.id)) ?? 0,
      },
      hoje,
    );
    if (p) pendencias.push(p);
  }

  // Títulos recusados pelo banco que já voltaram ao preparo e não entraram em
  // borderô novo. Varrer só borderôs deixava esse buraco: o borderô antigo fica
  // resolvido, o novo ainda não existe, e o pagamento — que falhou de verdade —
  // não aparecia em lugar nenhum. Foi assim que um salário ficou dias parado.
  let qSoltos = supabase
    .from("lancamentos_financeiros")
    .select("id, cod_empresa, descricao, pessoa_nome, valor, data_vencimento, dados_extras")
    .eq("tipo", "PAGAR")
    .is("bordero_id", null)
    .is("data_baixa", null)
    .in("status", ["PREVISTO", "CLASSIFICADO", "AUTORIZADO", "AGRUPADO"])
    .not("dados_extras", "is", null)
    .limit(500);
  if (body.cod_empresa) qSoltos = qSoltos.eq("cod_empresa", Number(body.cod_empresa));

  const { data: soltos } = await qSoltos;
  for (const l of (soltos || [])) {
    const extras = (l.dados_extras || {}) as Record<string, unknown>;
    const tentouNoBanco = Boolean(extras.btg_payment_status) || Boolean(extras.btg_motivo_recusa);
    if (!tentouNoBanco) continue;
    // Aviso silenciado por alguém que resolveu o caso por fora.
    if (extras.pendencia_dispensada_em) continue;
    pendencias.push(pendenciaDeLancamentoReaberto({
      id: String(l.id),
      cod_empresa: Number(l.cod_empresa),
      descricao: l.descricao as string | null,
      pessoa_nome: l.pessoa_nome as string | null,
      valor: Number(l.valor ?? 0),
      data_vencimento: l.data_vencimento as string | null,
      motivo_recusa: (extras.btg_motivo_recusa as string) ?? null,
    }, hoje));
  }

  const ordenadas = ordenarPendencias(pendencias);
  return json({ pendencias: ordenadas, resumo: resumirPendencias(ordenadas), hoje });
}

/**
 * Some o aviso de pagamento parado sem mexer no borderô.
 *
 * Existe porque o painel guarda casos anteriores aos ajustes do fluxo e casos
 * resolvidos por fora do sistema. Apagar o borderô seria perder o histórico;
 * aqui só o alerta é silenciado, com autor e motivo registrados, e amarrado à
 * situação atual — se o borderô andar (ou voltar), o aviso reaparece.
 */
async function dispensarPendencia(body: Record<string, unknown>, userId: string) {
  await requireFinanceEdit(userId);

  const borderoId = body.bordero_id ? String(body.bordero_id) : null;
  const lancamentoId = body.lancamento_id ? String(body.lancamento_id) : null;

  // Título solto também precisa poder ser silenciado: se o pagamento foi
  // resolvido por fora (caixa da loja, acerto direto), insistir no alerta só
  // ensina o operador a ignorar o painel.
  if (!borderoId && lancamentoId) {
    const { data: lanc, error: errL } = await supabase
      .from("lancamentos_financeiros")
      .select("id, dados_extras")
      .eq("id", lancamentoId)
      .maybeSingle();
    if (errL) throw new Error(errL.message);
    if (!lanc) throw new Error("Lançamento não encontrado");

    const extras = { ...((lanc.dados_extras || {}) as Record<string, unknown>) };
    if (body.desfazer === true) {
      delete extras.pendencia_dispensada_em;
      delete extras.pendencia_dispensada_por;
      delete extras.pendencia_dispensada_motivo;
    } else {
      extras.pendencia_dispensada_em = new Date().toISOString();
      extras.pendencia_dispensada_por = userId;
      extras.pendencia_dispensada_motivo = body.motivo ? String(body.motivo).slice(0, 500) : null;
    }

    const { error: errU } = await supabase
      .from("lancamentos_financeiros")
      .update({ dados_extras: extras })
      .eq("id", lancamentoId);
    if (errU) throw new Error(errU.message);

    return json({
      ok: true,
      mensagem: body.desfazer === true ? "Aviso reativado" : "Aviso dispensado",
    });
  }

  if (!borderoId) throw new Error("Informe bordero_id ou lancamento_id");

  const { data: bordero, error: errBusca } = await supabase
    .from("borderos")
    .select("id, status, descricao")
    .eq("id", borderoId)
    .maybeSingle();
  if (errBusca) throw new Error(errBusca.message);
  if (!bordero) throw new Error("Borderô não encontrado");

  const desfazer = body.desfazer === true;

  const { error } = await supabase
    .from("borderos")
    .update(
      desfazer
        ? {
            pendencia_dispensada_em: null,
            pendencia_dispensada_por: null,
            pendencia_dispensada_status: null,
            pendencia_dispensada_motivo: null,
          }
        : {
            pendencia_dispensada_em: new Date().toISOString(),
            pendencia_dispensada_por: userId,
            pendencia_dispensada_status: String(bordero.status),
            pendencia_dispensada_motivo: body.motivo ? String(body.motivo).slice(0, 500) : null,
          },
    )
    .eq("id", borderoId);
  if (error) throw new Error(error.message);

  return json({
    ok: true,
    mensagem: desfazer
      ? "Aviso reativado"
      : "Aviso dispensado — volta a aparecer se o borderô mudar de situação",
  });
}


/**
 * Devolve ao preparo os pagamentos que o banco recusou.
 *
 * O item recusado voltava como AUTORIZADO com "revisar dados e reenviar", preso
 * ao borderô antigo — e `criar_bordero` só aceita PREVISTO e CLASSIFICADO. Ou
 * seja: o sistema mandava reenviar e não deixava. Título parado, fornecedor sem
 * receber.
 *
 * Reenviar o MESMO borderô seria pior: ele já tem lote no BTG, e nesse lote em
 * geral há itens pagos. Reabrir arriscaria pagar duas vezes quem já recebeu, e
 * Pix não volta. Aqui o título é solto para entrar num borderô novo — lote novo,
 * chave de idempotência nova, nada ambíguo do lado do banco.
 */
async function devolverParaPreparo(body: Record<string, unknown>, userId: string) {
  // Operador do financeiro basta.
  //
  // Devolver ao preparo não move dinheiro: traz o título de volta para que a
  // data, a linha digitável ou a chave Pix sejam corrigidas. Quem descobre o
  // motivo da recusa no app do banco é o operador, e exigir admin só para
  // desbloquear a correção criava fila sem ganho — o controle continua adiante,
  // no lastro do borderô novo e na autorização do master no BTG.
  await requireFinanceEdit(userId);

  const borderoId = body.bordero_id ? String(body.bordero_id) : null;
  const ids = (body.lancamento_ids as string[]) || [];
  if (!borderoId && ids.length === 0) {
    throw new Error("Informe bordero_id ou lancamento_ids");
  }

  let query = supabase
    .from("lancamentos_financeiros")
    .select("id, descricao, status, requer_validacao, data_baixa, valor_pago, dados_extras");
  query = borderoId ? query.eq("bordero_id", borderoId) : query.in("id", ids);

  const { data: itens, error } = await query;
  if (error) throw new Error(error.message);
  if (!itens || itens.length === 0) throw new Error("Nenhum lançamento encontrado");

  const r = separarParaReenvio(itens.map((i: Record<string, unknown>) => ({
    id: String(i.id),
    descricao: i.descricao as string | null,
    status: String(i.status),
    requer_validacao: Boolean(i.requer_validacao),
    data_baixa: i.data_baixa as string | null,
    valor_pago: i.valor_pago as number | null,
  })));

  if (r.liberar.length === 0) {
    return json({
      ok: false,
      code: "NADA_A_REENVIAR",
      error: "Nenhum pagamento em condição de reenvio",
      bloqueados: r.bloqueados,
    });
  }

  // Motivo do banco item a item: a mensagem de recusa é o que diz ao operador o
  // que corrigir antes de tentar de novo.
  let devolvidos = 0;
  for (const id of r.liberar) {
    const item = itens.find((i: Record<string, unknown>) => String(i.id) === id);
    const extras = (item?.dados_extras || {}) as Record<string, unknown>;
    const { error: uErr } = await supabase
      .from("lancamentos_financeiros")
      .update(estadoDeVolta(extras))
      .eq("id", id);
    if (!uErr) devolvidos++;
  }

  // O borderô de origem some da lista de pendências assim que não sobra nada
  // recusado nele — senão o painel cobraria para sempre uma ação já feita.
  if (borderoId) await recalcBordero(borderoId);

  console.log(`[financeiro-lancamentos] devolver_para_preparo por ${userId}: ${devolvidos} título(s)`);
  return json({
    ok: true,
    devolvidos,
    bloqueados: r.bloqueados,
    mensagem: `${devolvidos} título(s) de volta em Contas a Pagar, com a classificação e os dados de pagamento preservados. ` +
      `Corrija o que o banco apontou e monte um novo borderô.`,
  });
}


/**
 * Encerra o borderô cujo pagamento aconteceu por fora.
 *
 * Acontece quando o boleto sai por débito automático, ou alguém paga no app do
 * banco, e o sync do ERP baixa o título. O borderô fica APROVADO com tudo pago e
 * nunca vai ao banco — mas continua pedindo envio, e esse botão pagaria os
 * mesmos boletos de novo.
 *
 * Encerrar não mexe nos títulos: eles já estão baixados, com o valor e a data
 * reais do ERP. Só fecha o borderô, que virou casca.
 */
async function encerrarBordero(body: Record<string, unknown>, userId: string) {
  await requireFinanceEdit(userId);
  const id = String(body.bordero_id || "");
  if (!id) throw new Error("bordero_id obrigatório");

  const { data: bordero } = await supabase.from("borderos").select("*").eq("id", id).single();
  if (!bordero) throw new Error("Borderô não encontrado");

  if (["PROCESSADO", "CANCELADO"].includes(String(bordero.status))) {
    return json({ ok: false, code: "JA_ENCERRADO", error: `Borderô já está ${bordero.status}` });
  }

  // Só encerra o que não tem mais nada a pagar. Com título em aberto, encerrar
  // esconderia um pagamento que ninguém fez.
  const { data: pendentes } = await supabase
    .from("lancamentos_financeiros")
    .select("id, descricao, status")
    .eq("bordero_id", id)
    .not("status", "in", '("BAIXADO","CANCELADO")');

  if (pendentes && pendentes.length > 0) {
    return json({
      ok: false,
      code: "AINDA_TEM_PENDENTE",
      error: `${pendentes.length} título(s) ainda não foram pagos — encerrar esconderia um pagamento que ninguém fez`,
      pendentes: pendentes.map((p: Record<string, unknown>) => ({ descricao: p.descricao, status: p.status })),
    });
  }

  const { count } = await supabase
    .from("lancamentos_financeiros")
    .select("id", { count: "exact", head: true })
    .eq("bordero_id", id)
    .eq("status", "BAIXADO");

  const { error } = await supabase.from("borderos").update({
    status: "PROCESSADO",
    observacao: String(body.motivo || "Encerrado: títulos pagos por fora do borderô"),
    encerrado_por: userId,
    encerrado_em: new Date().toISOString(),
  }).eq("id", id);
  if (error) throw new Error(error.message);

  console.log(`[financeiro-lancamentos] bordero ${id} encerrado por ${userId} (${count} pagos por fora)`);
  return json({
    ok: true,
    status: "PROCESSADO",
    titulos_pagos: count ?? 0,
    mensagem: `Borderô encerrado. Os ${count ?? 0} título(s) permanecem baixados com o valor e a data do ERP.`,
  });
}


/**
 * Refaz um borderô que foi ao banco e não foi autorizado.
 *
 * O caso: lote enviado, data de pagamento venceu, o master não autorizou a
 * tempo. A data não pode mais ser alterada (ela está no lote do BTG) e os
 * títulos não voltam sozinhos — ficam PROCESSANDO para sempre. Não havia saída
 * pela tela: só "abrir borderô", que não oferecia nada.
 *
 * Exige confirmação explícita de que o lote não será mais liquidado, porque nós
 * não temos como verificar isso. O motivo pode ser vários — horário-limite da
 * operação, saldo, recusa do banco, falta de autorização — e quem diz qual é o
 * retorno do BTG, não um catálogo mantido aqui. Se o lote ainda estiver vivo e o
 * master autorizar depois, os mesmos títulos num borderô novo viram pagamento em
 * duplicidade — e Pix não volta. Por isso o operador afirma, e a afirmação fica
 * registrada com o usuário e a data.
 *
 * Títulos já baixados não são tocados: parte do lote pode ter liquidado.
 */
async function refazerBordero(body: Record<string, unknown>, userId: string) {
  await requireFinanceEdit(userId);
  const id = String(body.bordero_id || "");
  if (!id) throw new Error("bordero_id obrigatório");

  const { data: bordero } = await supabase.from("borderos").select("*").eq("id", id).single();
  if (!bordero) throw new Error("Borderô não encontrado");

  if (String(bordero.status) !== "ENVIADO") {
    return json({
      ok: false,
      code: "NAO_ENVIADO",
      error: `Borderô em ${bordero.status}. Refazer serve para lote que já foi ao banco e não foi autorizado — ` +
        `antes do envio, basta alterar a data.`,
    });
  }

  if (body.confirmado_no_banco !== true) {
    return json({
      ok: false,
      code: "CONFIRMACAO_OBRIGATORIA",
      error: "Confirme no app do BTG que o lote não será mais liquidado antes de refazer. " +
        "Se ele ainda estiver ativo e o master autorizar depois, os títulos serão pagos duas vezes.",
    });
  }

  const motivo = String(body.motivo ?? "").trim();
  if (motivo.length < 10) {
    return json({
      ok: false,
      code: "MOTIVO_OBRIGATORIO",
      error: "Descreva o que aconteceu no banco (mínimo 10 caracteres) — fica registrado com seu usuário",
    });
  }

  // Só o que continua em trânsito volta. O que o banco pagou fica pago.
  const { data: pendentes } = await supabase
    .from("lancamentos_financeiros")
    .select("id, descricao, dados_extras")
    .eq("bordero_id", id)
    .eq("status", "PROCESSANDO");

  if (!pendentes || pendentes.length === 0) {
    return json({
      ok: false,
      code: "NADA_EM_TRANSITO",
      error: "Nenhum título em trânsito neste borderô — nada a refazer",
    });
  }

  let devolvidos = 0;
  for (const l of pendentes) {
    const extras = (l.dados_extras || {}) as Record<string, unknown>;
    const { error } = await supabase.from("lancamentos_financeiros").update({
      // CLASSIFICADO, não PREVISTO: a conta do DRE e a forma de pagamento
      // continuam válidas — o que falhou foi a autorização, não o preparo.
      status: "CLASSIFICADO",
      bordero_id: null,
      autorizado_por: null,
      autorizado_em: null,
      observacao: `Lote não liquidado no BTG (${motivo}). Devolvido para novo borderô.`,
      dados_extras: {
        ...extras,
        // Trilha do lote abandonado: se um dia aparecer baixa com este batch,
        // dá para saber de onde veio.
        btg_batch_abandonado: bordero.btg_batch_id ?? null,
        btg_batch_id: null,
      },
    }).eq("id", l.id);
    if (!error) devolvidos++;
  }

  await supabase.from("borderos").update({
    status: "CANCELADO",
    observacao: `Lote não liquidado — ${motivo}. ${devolvidos} título(s) devolvidos ao preparo.`,
    encerrado_por: userId,
    encerrado_em: new Date().toISOString(),
  }).eq("id", id);

  console.log(`[financeiro-lancamentos] bordero ${id} refeito por ${userId}: ${devolvidos} devolvidos`);
  return json({
    ok: true,
    devolvidos,
    mensagem: `${devolvidos} título(s) de volta em Contas a Pagar. ` +
      `Monte um novo borderô com a data correta — o borderô antigo foi cancelado.`,
  });
}

async function listarBorderos(body: Record<string, unknown>) {
  const { cod_empresa, status: st, limit: lim } = body;

  let query = supabase
    .from("borderos")
    .select("*")
    .order("created_at", { ascending: false });

  if (cod_empresa) query = query.eq("cod_empresa", cod_empresa);
  if (st) query = query.eq("status", st);
  if (lim) query = query.limit(Number(lim));

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  // Composição dos itens junto da lista.
  //
  // O status gravado no borderô não distingue "nove pagos e dois recusados" de
  // "tudo agendado para semana que vem" — os dois ficavam "ENVIADO". Sem a
  // contagem, o operador abria borderô por borderô só para descobrir quais
  // exigiam alguma coisa. Uma consulta a mais aqui evita N aberturas na tela.
  const borderos = (data || []) as Array<Record<string, unknown>>;
  const ids = borderos.map((b) => String(b.id));

  if (ids.length > 0) {
    const { data: itens } = await supabase
      .from("lancamentos_financeiros")
      .select("bordero_id, status, requer_validacao, valor, data_vencimento, dados_extras")
      .in("bordero_id", ids);

    const porBordero = new Map<string, ItemBordero[]>();
    for (const it of (itens || [])) {
      const bid = String(it.bordero_id);
      const extras = (it.dados_extras || {}) as Record<string, unknown>;
      const lista = porBordero.get(bid) ?? [];
      lista.push({
        status: String(it.status),
        requer_validacao: Boolean(it.requer_validacao),
        // A data que vale é a combinada com o banco; o vencimento é o fallback.
        data_prevista: (extras.btg_payment_date as string) ?? it.data_vencimento ?? null,
        motivo_recusa: (extras.btg_motivo_recusa as string) ?? null,
        btg_status: (extras.btg_payment_status as string) ?? null,
        valor: Number(it.valor ?? 0),
      });

      porBordero.set(bid, lista);
    }

    for (const b of borderos) {
      b.composicao = resumirComposicao(porBordero.get(String(b.id)) ?? []);
    }
  }

  return json(borderos);
}

async function criarBordero(body: Record<string, unknown>, userId: string) {
  const { cod_empresa, descricao, lancamento_ids, data_pagamento, modo_data } = body;
  if (!cod_empresa) throw new Error("cod_empresa obrigatório");

  // DATA_UNICA (default): tudo na data do borderô, antecipando o que vence
  // antes. VENCIMENTO: cada título no próprio vencimento (do DDA quando houver).
  const modoData = modo_data === "VENCIMENTO" ? "VENCIMENTO" : "DATA_UNICA";

  const ids = (lancamento_ids as string[]) || [];

  // Prática da casa: pagamentos executados na segunda. Default da data de
  // pagamento = próxima segunda; descrição automática "Borderô Semana dd/MM/yyyy"
  // (com " — N" a partir do segundo borderô da mesma data/empresa).
  const dataPg = data_pagamento ? String(data_pagamento) : proximaSegunda(hojeBrt());
  let descFinal = descricao ? String(descricao) : null;
  if (!descFinal) {
    const { count } = await supabase
      .from("borderos")
      .select("id", { count: "exact", head: true })
      .eq("cod_empresa", Number(cod_empresa))
      .eq("data_pagamento", dataPg);
    descFinal = descricaoBordero(dataPg, count || 0);
  }

  const { data: bordero, error: bErr } = await supabase
    .from("borderos")
    .insert({
      cod_empresa: Number(cod_empresa),
      descricao: descFinal,
      data_pagamento: dataPg,
      modo_data: modoData,
      criado_por: userId,
      status: "MONTAGEM",
      qtd_lancamentos: ids.length,
      total_valor: 0,
    })
    .select()
    .single();

  if (bErr) throw new Error(bErr.message);

  if (ids.length > 0) {
    // Antes o update silencioso deixava um borderô fantasma: qtd_lancamentos
    // vinha de ids.length, mas nenhum título tinha sido anexado (já estava em
    // outro borderô, CANCELADO, BAIXADO...). O erro só aparecia depois, no
    // envio, como "Borderô vazio". Agora falha aqui, dizendo o motivo.
    const { data: anexados, error: uErr } = await supabase
      .from("lancamentos_financeiros")
      .update({ bordero_id: bordero.id, status: "BORDERO" })
      .in("id", ids)
      .in("status", ["PREVISTO", "CLASSIFICADO"])
      .eq("tipo", "PAGAR")
      .select("id");

    if (uErr) {
      await supabase.from("borderos").delete().eq("id", bordero.id);
      throw new Error(uErr.message);
    }

    if ((anexados || []).length === 0) {
      await supabase.from("borderos").delete().eq("id", bordero.id);
      const { data: atuais } = await supabase
        .from("lancamentos_financeiros")
        .select("descricao, status")
        .in("id", ids);
      const detalhe = (atuais || [])
        .map((l) => `"${l.descricao ?? "sem descrição"}" está em ${l.status}`)
        .join("; ");
      throw new Error(
        `Nenhum lançamento pôde entrar no borderô — só entram títulos a PAGAR em PREVISTO ou CLASSIFICADO. ${detalhe || "Os itens selecionados não existem mais."}`,
      );
    }

    await recalcBordero(bordero.id);
  }


  const { data: updated } = await supabase.from("borderos").select("*").eq("id", bordero.id).single();
  return json(updated, 201);
}

async function adicionarAoBordero(body: Record<string, unknown>) {
  const { bordero_id, lancamento_ids } = body;
  if (!bordero_id) throw new Error("bordero_id obrigatório");
  const ids = (lancamento_ids as string[]) || [];
  if (ids.length === 0) throw new Error("lancamento_ids obrigatório");

  const { data: bordero } = await supabase.from("borderos").select("status").eq("id", bordero_id).single();
  if (!bordero) throw new Error("Borderô não encontrado");
  if (bordero.status !== "MONTAGEM") throw new Error("Borderô não está em montagem");

  // G2 — borderô só aceita lançamento com lastro válido (SPEC_P2_5 §4)
  const { data: lancs } = await supabase
    .from("lancamentos_financeiros")
    .select("id, descricao, valor, lastro, erp_parcela_id, rubrica_id, btg_dda_id, justificativa, pessoa_documento, data_vencimento, dados_extras")
    .in("id", ids);
  const rubricaIds = [...new Set((lancs || []).map((l) => l.rubrica_id).filter(Boolean))] as string[];
  const rubricasMap = new Map<string, Record<string, unknown>>();
  if (rubricaIds.length > 0) {
    const { data: rubs } = await supabase.from("rubricas_autorizadas").select("*").in("id", rubricaIds);
    for (const r of (rubs || [])) rubricasMap.set(String(r.id), r);
  }
  const hoje = new Date().toISOString().slice(0, 10);
  const rejeitados: string[] = [];
  for (const l of (lancs || [])) {
    const rubrica = l.rubrica_id ? (rubricasMap.get(String(l.rubrica_id)) as never) ?? null : null;
    const av = avaliarLancamento(l as never, rubrica, hoje);
    if (!av.podeBordero) rejeitados.push(`"${l.descricao ?? l.id}" (R$ ${Number(l.valor).toFixed(2)}): ${av.motivo}`);
  }
  if (rejeitados.length > 0) {
    throw new Error(`Sem lastro para borderô — resolva antes de adicionar:\n${rejeitados.join("\n")}`);
  }

  const { data: anexados, error } = await supabase
    .from("lancamentos_financeiros")
    .update({ bordero_id: String(bordero_id), status: "BORDERO" })
    .in("id", ids)
    .in("status", ["PREVISTO", "CLASSIFICADO"])
    .eq("tipo", "PAGAR")
    .select("id");

  if (error) throw new Error(error.message);
  if ((anexados || []).length === 0) {
    const detalhe = (lancs || [])
      .map((l) => `"${l.descricao ?? "sem descrição"}"`)
      .join("; ");
    throw new Error(
      `Nenhum lançamento foi adicionado — só entram títulos a PAGAR em PREVISTO ou CLASSIFICADO. ${detalhe}`,
    );
  }
  await recalcBordero(String(bordero_id));

  return json({ ok: true });
}

/**
 * Tirar item do borderô = desautorizar aquele título e devolvê-lo ao preparo.
 *
 * Vale também com o borderô já APROVADO: era o caso sem saída da tela — o
 * item aparecia em "Em Borderô / Autorizados" e a única forma de mexer nele
 * era cancelar a remessa inteira. Como a composição mudou, o borderô volta a
 * MONTAGEM e precisa ser aprovado de novo (a aprovação valia para aquele
 * conjunto, não para outro).
 */
async function removerDoBordero(body: Record<string, unknown>) {
  const { bordero_id, lancamento_ids } = body;
  if (!bordero_id) throw new Error("bordero_id obrigatório");
  const ids = (lancamento_ids as string[]) || [];
  if (ids.length === 0) throw new Error("lancamento_ids obrigatório");

  const { data: bordero } = await supabase.from("borderos").select("status").eq("id", bordero_id).single();
  if (!bordero) throw new Error("Borderô não encontrado");
  if (!["MONTAGEM", "APROVADO"].includes(bordero.status)) {
    throw new Error("Borderô já enviado ao banco — não é possível desautorizar itens");
  }

  const { error } = await supabase
    .from("lancamentos_financeiros")
    .update({ bordero_id: null, status: "PREVISTO", autorizado_por: null, autorizado_em: null })
    .in("id", ids)
    .eq("bordero_id", bordero_id);

  if (error) throw new Error(error.message);
  await recalcBordero(String(bordero_id));

  if (bordero.status === "APROVADO") {
    await supabase.from("borderos").update({
      status: "MONTAGEM",
      aprovado_por: null,
      aprovado_em: null,
    }).eq("id", bordero_id);
  }

  return json({ ok: true, reaprovar: bordero.status === "APROVADO" });
}

/**
 * Diz, num lugar só, por que o borderô não sai e o que fazer.
 *
 * Antes: o envio falhava com uma lista de motivos crus e um botão que jogava o
 * admin na Mesa de Aprovação — onde ele via todos os lançamentos da empresa e
 * tinha que descobrir sozinho quais eram os do borderô e o que significavam.
 *
 * Aqui devolvemos o diagnóstico pronto: quem trava, por quê, o que resolve, e
 * se ESTE usuário pode liberar. A separação de funções (quem monta não aprova)
 * é a causa mais comum de trava em equipe pequena, e nunca era dita em voz alta.
 */
async function diagnosticoBordero(body: Record<string, unknown>, userId: string) {
  const { bordero_id } = body;
  if (!bordero_id) throw new Error("bordero_id obrigatório");

  const { data: bordero } = await supabase.from("borderos").select("*").eq("id", bordero_id).single();
  if (!bordero) throw new Error("Borderô não encontrado");

  const { data: lancs } = await supabase
    .from("lancamentos_financeiros")
    .select("*")
    .eq("bordero_id", bordero_id);

  const rubIds = [...new Set((lancs || []).map((l) => l.rubrica_id).filter(Boolean))] as string[];
  const rubMap = new Map<string, Record<string, unknown>>();
  if (rubIds.length > 0) {
    const { data: rubs } = await supabase.from("rubricas_autorizadas").select("*").in("id", rubIds);
    for (const r of (rubs || [])) rubMap.set(String(r.id), r);
  }

  const hoje = hojeBrt();
  const itens = (lancs || []).map((l) => {
    const rubrica = l.rubrica_id ? (rubMap.get(String(l.rubrica_id)) as never) ?? null : null;
    const av = avaliarLancamento(l as never, rubrica, hoje);
    return {
      id: l.id,
      descricao: l.descricao,
      pessoa_nome: l.pessoa_nome,
      valor: Number(l.valor),
      selo: av.selo,
      motivo: av.motivo,
      trava: av.selo !== "VERDE" && av.selo !== "AZUL",
      // O que resolve, em linguagem de quem opera — não de quem programou.
      como_resolver: comoResolver(av.selo, l),
    };
  });

  const travados = itens.filter((i) => i.trava);
  const admin = await isAdminUser(userId);
  const distinto = criadorAprovadorDistintos(bordero.criado_por, userId);

  let impedimento: string | null = null;
  if (!admin) impedimento = "Só um administrador pode liberar um borderô com itens sinalizados.";
  else if (!distinto.ok) impedimento = `${distinto.motivo} — peça a outro administrador.`;
  else if (bordero.status !== "MONTAGEM") impedimento = `O borderô está em ${bordero.status}.`;

  return json({
    ok: true,
    bordero: { id: bordero.id, descricao: bordero.descricao, status: bordero.status, total: Number(bordero.total_valor) },
    total_itens: itens.length,
    travados: travados.length,
    valor_travado: Math.round(travados.reduce((s, i) => s + i.valor, 0) * 100) / 100,
    itens,
    pode_liberar: travados.length > 0 && !impedimento,
    envia_direto: travados.length === 0,
    impedimento,
  });
}

/** Tradução do selo em ação concreta para quem está olhando a tela. */
function comoResolver(selo: string, l: Record<string, unknown>): string | null {
  switch (selo) {
    case "VERDE":
    case "AZUL":
      return null;
    case "AMARELO":
      return "O valor saiu da faixa da rubrica. Confira se está certo — se estiver, é só liberar; se não, corrija o valor no lançamento.";
    case "VERMELHO":
      return "Exceção emergencial não entra em borderô. Remova daqui e pague individualmente.";
    default:
      return l.btg_dda_id
        ? "Boleto veio do banco sem título correspondente no ERP. Confirme que a dívida existe e vincule ao título, ou cadastre uma rubrica para este fornecedor."
        : "Sem origem que comprove a dívida. Vincule a um título do ERP, cadastre uma rubrica, ou remova do borderô.";
  }
}

async function isAdminUser(userId: string): Promise<boolean> {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId).eq("role", "admin");
  return !!data && data.length > 0;
}

/**
 * Concede crédito de liberação à rubrica de um lançamento.
 *
 * Liberar valia só para aquele borderô: com aluguel reajustado, o admin liberava
 * de novo todo mês, e a repetição transforma a conferência em carimbo — o oposto
 * do controle que a faixa deveria dar.
 *
 * Escopos:
 *   UNICA       — nada persiste; vale só o borderô atual
 *   QUANTIDADE  — crédito para os próximos N lançamentos daquela rubrica
 *   PERMANENTE  — adota o valor atual como esperado; a faixa passa a girar em
 *                 torno dele (e a média móvel mensal mantém isso vivo)
 */
async function aplicarLiberacao(
  lancamentoId: string,
  escopo: string,
  quantidade: number,
  motivo: string,
  userId: string,
) {
  if (escopo === "UNICA") return;

  const { data: lanc } = await supabase
    .from("lancamentos_financeiros")
    .select("rubrica_id, valor")
    .eq("id", lancamentoId)
    .single();
  if (!lanc?.rubrica_id) return; // sem rubrica não há o que persistir

  if (escopo === "PERMANENTE") {
    await supabase.from("rubricas_autorizadas").update({
      valor_esperado: Number(lanc.valor),
      liberacao_concedida_por: userId,
      liberacao_concedida_em: new Date().toISOString(),
      liberacao_motivo: motivo || "valor adotado como novo padrão",
    }).eq("id", lanc.rubrica_id);
    return;
  }

  if (escopo === "QUANTIDADE") {
    const n = Math.max(1, Math.min(24, Math.floor(quantidade || 1)));
    const { data: rub } = await supabase
      .from("rubricas_autorizadas")
      .select("liberacoes_restantes")
      .eq("id", lanc.rubrica_id)
      .single();
    await supabase.from("rubricas_autorizadas").update({
      liberacoes_restantes: Number(rub?.liberacoes_restantes ?? 0) + n,
      liberacao_concedida_por: userId,
      liberacao_concedida_em: new Date().toISOString(),
      liberacao_motivo: motivo || null,
    }).eq("id", lanc.rubrica_id);
  }
}

async function aprovarBordero(body: Record<string, unknown>, userId: string) {
  const { bordero_id } = body;
  if (!bordero_id) throw new Error("bordero_id obrigatório");
  await requireAdmin(userId); // Decisão 30/07: operador cria, ADMIN aprova (sem papel master)

  // Escopo por item: a decisão do admin pode virar política, em vez de morrer
  // neste borderô. Ver aplicarLiberacao.
  const liberacoes = (body.liberacoes as Array<{
    lancamento_id: string; escopo: string; quantidade?: number; motivo?: string;
  }>) || [];

  const { data: bordero } = await supabase.from("borderos").select("*").eq("id", bordero_id).single();
  if (!bordero) throw new Error("Borderô não encontrado");
  if (bordero.status !== "MONTAGEM") throw new Error(`Borderô com status ${bordero.status} não pode ser aprovado`);
  if (bordero.qtd_lancamentos === 0) throw new Error("Borderô vazio — adicione lançamentos antes de aprovar");

  // G2 — separação de funções: quem montou o borderô não o aprova
  const distinto = criadorAprovadorDistintos(bordero.criado_por, userId);
  if (!distinto.ok) throw new Error(distinto.motivo!);

  for (const lib of liberacoes) {
    await aplicarLiberacao(
      String(lib.lancamento_id),
      String(lib.escopo || "UNICA"),
      Number(lib.quantidade ?? 1),
      String(lib.motivo ?? ""),
      userId,
    );
  }

  const { error: bErr } = await supabase
    .from("borderos")
    .update({
      status: "APROVADO",
      aprovado_por: userId,
      aprovado_em: new Date().toISOString(),
    })
    .eq("id", bordero_id);

  if (bErr) throw new Error(bErr.message);

  const { error: lErr } = await supabase
    .from("lancamentos_financeiros")
    .update({
      status: "AUTORIZADO",
      autorizado_por: userId,
      autorizado_em: new Date().toISOString(),
    })
    .eq("bordero_id", bordero_id)
    .eq("status", "BORDERO");

  if (lErr) throw new Error(lErr.message);

  return json({ ok: true, status: "APROVADO" });
}

async function enviarBorderoBtg(body: Record<string, unknown>, userId: string) {
  const { bordero_id } = body;
  if (!bordero_id) throw new Error("bordero_id obrigatório");

  const { data: bordero } = await supabase.from("borderos").select("*").eq("id", bordero_id).single();
  if (!bordero) throw new Error("Borderô não encontrado");

  // Decisão do stakeholder (31/07, refinada): borderô 100% lastreado dentro da
  // faixa (VERDE/AZUL) pode ser ENVIADO PELO OPERADOR — a aprovação do dinheiro
  // é a confirmação do admin no app BTG (destino/valor à vista, biometria do
  // banco). A separação de funções está no desenho: quem prepara não tem a
  // credencial bancária; quem confirma no banco não preparou.
  // Qualquer AMARELO (fora da faixa), exceção ou sem lastro → Mesa (admin)
  // obrigatória antes do envio.
  if (bordero.status === "MONTAGEM") {
    const { data: lancsAvaliar, error: errAvaliar } = await supabase
      .from("lancamentos_financeiros")
      .select("id, descricao, valor, lastro, erp_parcela_id, rubrica_id, btg_dda_id, justificativa, pessoa_documento, data_vencimento, dados_extras")
      .eq("bordero_id", bordero_id);
    if (errAvaliar) throw new Error(`Falha ao ler lançamentos do borderô: ${errAvaliar.message}`);
    const rubIds = [...new Set((lancsAvaliar || []).map((l) => l.rubrica_id).filter(Boolean))] as string[];
    const rubMap = new Map<string, Record<string, unknown>>();
    if (rubIds.length > 0) {
      const { data: rubs } = await supabase.from("rubricas_autorizadas").select("*").in("id", rubIds);
      for (const r of (rubs || [])) rubMap.set(String(r.id), r);
    }
    if ((lancsAvaliar || []).length === 0) throw new Error("Borderô vazio — adicione lançamentos antes de enviar");
    const hojeAv = new Date().toISOString().slice(0, 10);
    // Bloqueio estruturado: o operador precisa saber EXATAMENTE qual item travou,
    // por quê e qual ação resolve — e ir direto para ele na Mesa (sem varrer a
    // tela inteira). Por isso devolvemos ok:false com a lista, não um throw solto.
    const bloqueios: Array<Record<string, unknown>> = [];
    const ACAO_POR_SELO: Record<string, string> = {
      SEM_LASTRO: "Vincule o título do ERP/NF, aponte uma rubrica autorizada ou registre exceção com justificativa",
      AMARELO: "Aprove na Mesa (valor fora da faixa da rubrica) ou ajuste o valor para dentro da faixa",
      VERMELHO: "Exceção emergencial: precisa da aprovação individual do admin na Mesa",
    };
    for (const l of (lancsAvaliar || [])) {
      const rubrica = l.rubrica_id ? (rubMap.get(String(l.rubrica_id)) as never) ?? null : null;
      const av = avaliarLancamento(l as never, rubrica, hojeAv);
      if (av.selo !== "VERDE" && av.selo !== "AZUL") {
        bloqueios.push({
          id: l.id,
          descricao: l.descricao ?? null,
          valor: Number(l.valor ?? 0),
          data_vencimento: l.data_vencimento ?? null,
          selo: av.selo,
          motivo: av.motivo,
          acao: ACAO_POR_SELO[av.selo] ?? "Resolver na Mesa de Aprovação",
        });
      }
    }
    if (bloqueios.length > 0) {
      const total = bloqueios.reduce((s, b) => s + Number(b.valor ?? 0), 0);
      return json({
        ok: false,
        code: "MESA_REQUIRED",
        bordero_id,
        cod_empresa: bordero.cod_empresa,
        bloqueios,
        qtd_total: (lancsAvaliar || []).length,
        qtd_bloqueados: bloqueios.length,
        valor_bloqueado: total,
        error: `${bloqueios.length} de ${(lancsAvaliar || []).length} itens exigem decisão na Mesa antes do envio`,
      });
    }

    if ((lancsAvaliar || []).length === 0) throw new Error("Borderô vazio");

    // Auto-aprovação: 100% verde/azul — lastro validado na origem (nota no ERP
    // ou rubrica ativada pelo admin). aprovado_por fica NULL = aprovação
    // estrutural pelo lastro; a trilha de quem enviou fica em autorizado_por.
    await supabase.from("borderos").update({
      status: "APROVADO",
      aprovado_por: null,
      aprovado_em: new Date().toISOString(),
    }).eq("id", bordero_id);
    await supabase.from("lancamentos_financeiros").update({
      status: "AUTORIZADO",
      autorizado_por: userId,
      autorizado_em: new Date().toISOString(),
    }).eq("bordero_id", bordero_id).eq("status", "BORDERO");
    bordero.status = "APROVADO";
  }

  if (bordero.status !== "APROVADO") throw new Error("Borderô precisa estar APROVADO para envio ao banco");

  // Get BTG environment config
  const { data: config } = await supabase
    .from("fornecedor_configuracao")
    .select("ambiente")
    .eq("fornecedor", "btg")
    .eq("ativo", true)
    .single();

  const isSandbox = !config || config.ambiente !== "production";

  // Itens do borderô.
  //
  // O filtro era só AUTORIZADO. Um borderô APROVADO cujo item ficasse em
  // BORDERO — por reabertura, correção de dados ou qualquer ajuste posterior à
  // aprovação — saía daqui com zero itens: o envio dizia "borderô vazio" e
  // nada chegava ao banco, mesmo com o borderô aprovado e com valor na tela.
  // Aprovação é do borderô: item preso a um borderô APROVADO e sem baixa é
  // promovido a AUTORIZADO no próprio envio.
  const { data: itensDoBordero } = await supabase
    .from("lancamentos_financeiros")
    .select("*")
    .eq("bordero_id", bordero_id)
    .in("status", ["AUTORIZADO", "BORDERO"]);

  const paraPromover = (itensDoBordero || []).filter(
    (l) => String(l.status) === "BORDERO" && !l.data_baixa && !(Number(l.valor_pago ?? 0) > 0),
  );
  if (paraPromover.length > 0) {
    await supabase
      .from("lancamentos_financeiros")
      .update({
        status: "AUTORIZADO",
        autorizado_por: userId,
        autorizado_em: new Date().toISOString(),
      })
      .in("id", paraPromover.map((l) => l.id));
  }

  const lancamentos = (itensDoBordero || [])
    .filter((l) => !l.data_baixa && !(Number(l.valor_pago ?? 0) > 0))
    .map((l) => ({ ...l, status: "AUTORIZADO" }));


  // Borderô sem item nenhum não vai ao banco.
  //
  // A checagem de vazio existia só dentro do ramo de MONTAGEM. Um borderô já
  // APROVADO que ficasse sem itens — porque foram removidos, cancelados, ou
  // porque a criação falhou no meio — passava direto por aqui, era marcado
  // ENVIADO e ficava eternamente "aguardando". Na tela parecia dinheiro em
  // trânsito; no banco não havia nada, e o fornecedor não recebia.
  if (!lancamentos || lancamentos.length === 0) {
    return json({
      ok: false,
      code: "BORDERO_VAZIO",
      bordero_id,
      cod_empresa: bordero.cod_empresa,
      error: "Borderô sem itens autorizados — nada foi enviado ao banco. " +
        "Verifique se os lançamentos foram removidos ou cancelados; se o borderô não serve mais, cancele-o.",
    });
  }

  if (isSandbox) {
    const mockBatchId = `sandbox-batch-${Date.now()}`;
    await supabase.from("borderos").update({
      status: "ENVIADO",
      btg_batch_id: mockBatchId,
    }).eq("id", bordero_id);

    // Correlação por pagamento também no sandbox, para o btg-poll-status simular a baixa
    for (const lanc of (lancamentos || [])) {
      const dados = (lanc.dados_extras || {}) as Record<string, unknown>;
      await supabase.from("lancamentos_financeiros").update({
        status: "PROCESSANDO",
        dados_extras: {
          ...dados,
          btg_batch_id: mockBatchId,
          btg_external_id: lanc.id,
          btg_payment_id: `sandbox-pay-${lanc.id.slice(0, 8)}`,
        },
      }).eq("id", lanc.id);
    }

    return json({ ok: true, status: "ENVIADO", btg_batch_id: mockBatchId, sandbox: true });
  }

  // Production: BTG Batch Payments API
  const { data: tokenData } = await supabase
    .from("btg_tokens")
    .select("access_token, expires_at, scopes")
    .eq("cod_empresa", bordero.cod_empresa)
    .single();

  if (!tokenData) throw new Error("Token BTG não encontrado para esta empresa");
  if (new Date(tokenData.expires_at) < new Date()) throw new Error("Token BTG expirado");

  // O envio de lote exige escopo de ESCRITA de pagamentos. Tokens autorizados
  // antes da inclusão desse escopo falham com 403 "Insufficient scope" no BTG.
  //
  // Folha usa OUTRO escopo. A checagem cobria só `payments`, então o borderô de
  // folha passava daqui e morria num 403 cru do BTG, sem dizer o que fazer.
  const scopes: string[] = Array.isArray(tokenData.scopes) ? tokenData.scopes : [];
  const ehFolha = bordero.tipo === "FOLHA";
  const escopoNecessario = ehFolha
    ? "brn:btg:empresas:banking:payroll"
    : "brn:btg:empresas:banking:payments";
  const escopoLegado = ehFolha
    ? "empresas.btgpactual.com/payroll"
    : "empresas.btgpactual.com/payments";

  if (scopes.length > 0 && !scopes.includes(escopoNecessario) && !scopes.includes(escopoLegado)) {
    throw new Error(
      ehFolha
        ? `A autorização BTG da empresa ${bordero.cod_empresa} não inclui o escopo de folha ` +
          `(${escopoNecessario}). Diferente dos demais, esse escopo não é liberado no portal do ` +
          `desenvolvedor: precisa ser habilitado pelo BTG a pedido do gerente da conta. ` +
          `Depois de liberado, reautorize a loja em /admin/btg-validacao e envie de novo. ` +
          `Nada foi debitado.`
        : `A autorização BTG da empresa ${bordero.cod_empresa} não inclui o escopo de pagamentos. ` +
          `Reautorize esta loja em /admin/btg-validacao (botão Autorizar) e envie o borderô novamente.`,
    );
  }


  const { data: conta } = await supabase
    .from("btg_contas_bancarias")
    .select("cnpj, agencia, conta")
    .eq("cod_empresa", bordero.cod_empresa)
    .eq("ativa", true)
    .single();

  const cnpj = conta?.cnpj?.replace(/\D/g, "");
  if (!cnpj) throw new Error("CNPJ não encontrado");

  // `debitParty` é obrigatório em TODO item (schema BankSlipPaymentIssue).
  // A doc do BTG instrui usar agência "50" para conta PJ.
  if (!conta?.conta) {
    throw new Error(
      `Conta BTG da empresa ${bordero.cod_empresa} sem número cadastrado — ` +
      `preencha btg_contas_bancarias.conta antes de enviar o borderô`,
    );
  }
  const debitParty = { branchCode: conta.agencia || "50", number: String(conta.conta) };

  const apiBase = "https://api.empresas.btgpactual.com";

  // Borderô de folha vai por outro endpoint, com outro escopo e o tipo de
  // pagamento no cabeçalho do lote. Um caminho só até aqui (montagem,
  // governança, aprovação), bifurcando só no envio.
  if (bordero.tipo === "FOLHA") {
    return await enviarFolhaBtg(bordero, lancamentos || [], apiBase, tokenData.access_token, cnpj, debitParty);
  }

  // 1. Abrir lote — POST /{companyId}/banking/batch-payments
  //    Body exige `taxId` (CNPJ). A resposta traz batchId, expiresAt e maxSize.
  const batchRes = await fetch(`${apiBase}/${cnpj}/banking/batch-payments`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${tokenData.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ taxId: cnpj }),
  });

  if (!batchRes.ok) {
    const errBody = await batchRes.text();
    throw new Error(`BTG batch-payments open failed: ${batchRes.status} ${errBody}`);
  }

  const batchData = await batchRes.json();
  const batchId = batchData.batchId || batchData.id;
  const maxSize = Number(batchData.maxSize ?? 200);

  if ((lancamentos || []).length > maxSize) {
    throw new Error(
      `Borderô tem ${lancamentos?.length} itens e o lote do BTG aceita no máximo ${maxSize}. ` +
      `Divida em borderôs menores.`,
    );
  }

  // 2. Incluir cada pagamento no lote.
  //
  // ATENÇÃO ao contrato (fonte do 500 genérico até 03/08/2026): NÃO existe a
  // rota .../batch-payments/{batchId}/payments. Os itens entram pelo endpoint
  // normal POST /{companyId}/banking/payments, com envelope `{ items: [...] }`
  // (1 item por requisição) e o `batchId` DENTRO do corpo do item.
  //
  // O 201 devolve { batchId, contractGuid, operationNeedsApproval } — não um
  // paymentId. A correlação para baixa automática vem de `tags.externalId`
  // (= id do lançamento), que volta em todos os webhooks (SPEC P1 §5.5).
  // Títulos do DDA vinculados aos lançamentos deste borderô.
  //
  // O DDA é a nossa janela para o registro do boleto na CIP (hoje Nuclea), e é
  // ele que vale para o fornecedor — não o que veio do ERP. Duas consequências:
  //   - o `amount` enviado tem que ser o valor registrado. Divergir, ainda que
  //     em centavos, dispara `amount-doesnt-match` no BTG;
  //   - o vencimento usado no agendamento é o do registro, que pode ter sido
  //     prorrogado/antecipado pelo emissor depois de o boleto ser impresso.
  const ddaIds = [...new Set(
    (lancamentos || []).map((l) => l.btg_dda_id).filter(Boolean),
  )] as string[];
  const ddaPorId = new Map<string, { valor: number; data_vencimento: string; linha_digitavel: string | null }>();
  if (ddaIds.length > 0) {
    const { data: titulos } = await supabase
      .from("btg_dda_titulos")
      .select("id, valor, data_vencimento, linha_digitavel")
      .in("id", ddaIds);
    for (const t of (titulos || [])) {
      ddaPorId.set(String(t.id), {
        valor: Number(t.valor),
        data_vencimento: String(t.data_vencimento),
        linha_digitavel: t.linha_digitavel ?? null,
      });
    }
  }

  let aceitos = 0;
  let falhas = 0;
  const motivos: string[] = [];

  for (const lanc of (lancamentos || [])) {
    const dados = (lanc.dados_extras || {}) as Record<string, unknown>;
    const dda = lanc.btg_dda_id ? ddaPorId.get(String(lanc.btg_dda_id)) : undefined;

    // Tipo: boleto vindo do DDA tem linha digitável → BANKSLIP, ou UTILITIES
    // quando inicia em 8 (arrecadação: água/luz/tributos). Caso contrário usa
    // o tipo configurado no lançamento.
    let paymentType = String(dados.btg_payment_type || "PIX_KEY");
    // Nome e documento do beneficiário vêm do lançamento — a tela de preparação
    // não os coleta, e TED/PIX exigem `creditParty`.
    let dadosItem: Record<string, unknown> = {
      nome: lanc.pessoa_nome ?? undefined,
      documento: lanc.pessoa_documento ?? undefined,
      ...((dados.btg_details as Record<string, unknown>) || dados),
    };

    // Linha digitável: a do registro no DDA tem precedência sobre a copiada
    // para o lançamento, pelo mesmo motivo do valor.
    const linhaDigitavel = dda?.linha_digitavel
      || dados.linha_digitavel
      || (dados.btg_details as Record<string, unknown> | undefined)?.barcode;

    // O tipo vem da LINHA, com ou sem vínculo de DDA.
    //
    // Antes esta correção só rodava para lançamento com título do DDA. A conta
    // da SABESP de Barueri tinha a linha salva à mão, sem vínculo, ficou como
    // BANKSLIP e derrubou o lote inteiro por um item.
    if (linhaDigitavel) {
      const correto = tipoPorLinhaDigitavel(linhaDigitavel);
      if (correto) paymentType = correto;
      dadosItem = { ...dadosItem, linha_digitavel: linhaDigitavel };
    }

    // Valor: o do boleto registrado manda. A diferença fica registrada para a
    // baixa lançar como desconto/acréscimo e o DRE fechar.
    const valorErp = Number(lanc.valor);
    const valorEnviado = dda ? dda.valor : valorErp;
    const ajusteValor = Number((valorEnviado - valorErp).toFixed(2));

    // Data: modo do borderô + override por item. O vencimento de referência é
    // o do DDA quando houver.
    const hoje = hojeBrt();
    const paymentDate = dataPagamentoItem({
      modo: bordero.modo_data,
      override: (dados.data_pagamento_item ?? dados.scheduledDate) as string | null,
      vencimento: dda?.data_vencimento ?? (lanc.data_vencimento ? String(lanc.data_vencimento) : null),
      dataPagamentoBordero: bordero.data_pagamento ? String(bordero.data_pagamento) : null,
      hoje,
    });

    // Montagem e validação locais: melhor barrar aqui, com mensagem legível,
    // do que receber um `unmapped-error` opaco do banco.
    let item: Record<string, unknown>;
    let idempotencyKey: string;
    try {
      item = montarItem({
        tipo: paymentType,
        valor: valorEnviado,
        dados: dadosItem,
        debitParty,
        paymentDate,
        batchId,
        externalId: lanc.id,
        descricao: bordero.descricao,
        descricaoInterna: `bordero ${String(bordero.id).slice(0, 8)}`,
      });
      // Determinística por (lote, lançamento): duplo-clique no mesmo envio não
      // duplica; reenvio após correção abre lote novo → chave nova.
      idempotencyKey = await chaveIdempotencia(String(batchId), String(lanc.id));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[financeiro-lancamentos] Item inválido (lanc ${lanc.id}):`, msg);
      motivos.push(`validação local: ${msg}`);
      await supabase.from("lancamentos_financeiros").update({
        requer_validacao: true,
        observacao: `Não enviado ao BTG: ${msg.slice(0, 250)}`,
        // Marca a diferença que o operador precisa ver: o pagamento não chegou
        // ao banco. Sem isto a tela dizia "o banco não processou", como se o
        // lote existisse no BTG e faltasse autorização.
        dados_extras: {
          ...dados,
          btg_envio_rejeitado: true,
          btg_motivo_envio: `Bloqueado antes do envio: ${msg.slice(0, 250)}`,
          btg_envio_rejeitado_em: new Date().toISOString(),
          btg_payment_status: null,
        },
      }).eq("id", lanc.id);
      falhas++;
      continue;
    }

    console.log(
      `[financeiro-lancamentos] BTG request POST /${cnpj}/banking/payments (lanc ${lanc.id}):`,
      JSON.stringify(montarCorpo(item)),
    );

    const payRes = await fetch(`${apiBase}/${cnpj}/banking/payments`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        "Content-Type": "application/json",
        "x-idempotency-key": idempotencyKey,
      },
      body: JSON.stringify(montarCorpo(item)),
    });

    if (payRes.ok) {
      const payData = await payRes.json().catch(() => ({} as Record<string, unknown>));
      const btgPaymentId = payData.paymentId || payData.id || payData.transactionId || null;
      await supabase.from("lancamentos_financeiros").update({
        status: "PROCESSANDO",
        dados_extras: {
          ...dados,
          btg_batch_id: batchId,
          // Âncora de conciliação: o 201 não traz paymentId, ele chega depois
          // pelo webhook/listagem casando por este externalId.
          btg_external_id: lanc.id,
          btg_payment_id: btgPaymentId != null ? String(btgPaymentId) : null,
          btg_idempotency_key: idempotencyKey,
          btg_payment_date: paymentDate,
          // Trilha do ajuste ERP → boleto registrado, para a baixa e o DRE.
          valor_erp: valorErp,
          valor_enviado: valorEnviado,
          ajuste_valor: ajusteValor || null,
          btg_payment_response: payData,
        },
      }).eq("id", lanc.id);
      aceitos++;
    } else {
      const errText = await payRes.text();
      console.error(`[financeiro-lancamentos] Pagamento rejeitado no lote (lanc ${lanc.id}):`, payRes.status, errText);
      let detalhe = errText.slice(0, 300);
      try {
        detalhe = descreverErroBtg(JSON.parse(errText)).slice(0, 300);
      } catch { /* corpo não-JSON */ }
      // 403 role-policy-validation-error não é problema do payload: o login BTG
      // que autorizou o app não tem alçada/procuração de pagamento nesta conta.
      const semAlcada = payRes.status === 403 && /role-policy-validation-error|access denied/i.test(errText);
      if (semAlcada) {
        detalhe = `o login BTG que autorizou a empresa ${bordero.cod_empresa} (CNPJ ${cnpj}, ag ${debitParty.branchCode} / cc ${debitParty.number}) não tem alçada de pagamento nesta conta. ` +
          `No app/internet banking BTG, dê ao usuário poderes de "Pagamentos" (procuração/alçada) para esta conta e reautorize a loja em /admin/btg-validacao antes de reenviar.`;
      }
      motivos.push(semAlcada ? detalhe : `${payRes.status}: ${detalhe}`);
      await supabase.from("lancamentos_financeiros").update({
        requer_validacao: true,
        observacao: `Falha ao incluir no lote BTG (${payRes.status}): ${detalhe.slice(0, 250)}`,
      }).eq("id", lanc.id);
      falhas++;
    }
  }


  if (aceitos === 0) {
    // Lote vazio não deve ficar pendurado até o `expiresAt` — abandona.
    await fetch(`${apiBase}/${cnpj}/banking/batch-payments/${batchId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    }).catch((e) => console.warn("[financeiro-lancamentos] Falha ao abandonar lote:", e));

    const motivo = motivos.join(" | ") || "sem detalhe";
    const alcada = /alçada de pagamento/.test(motivo);
    // Neste passo o BTG apenas VALIDA a iniciação — nada é executado nem
    // debitado (dinheiro só se move após confirmação no app).
    const mensagem = alcada
      ? `O BTG recusou o borderô por falta de permissão (403): ${motivo} ` +
        `Nada foi executado nem debitado — o borderô segue APROVADO. Reenviar sem ajustar a permissão vai falhar de novo.`
      : `O BTG recusou a inclusão dos pagamentos no lote (${falhas} falha${falhas > 1 ? "s" : ""}). ` +
        `Nada foi executado nem debitado — o borderô segue APROVADO, é só reenviar. ` +
        `Resposta do banco (texto genérico deles): ${motivo}`;

    console.warn(`[financeiro-lancamentos] ${mensagem}`);

    // Rejeição do provedor é um resultado operacional recuperável, não uma falha
    // inesperada da function. Responder 200 evita que o cliente transforme o caso
    // em RUNTIME_ERROR/tela em branco, sem avançar o estado financeiro do borderô.
    return json({
      ok: false,
      code: "BTG_PAYMENT_REJECTED",
      error: mensagem,
      status: "APROVADO",
      btg_batch_id: batchId,
      falhas,
      motivos,
    });
  }


  // 3. Fechar o lote — PATCH espera { isFinished: true } e responde 202.
  //    Sem isso o lote nunca chega à área de aprovação do app/internet banking.
  const fecharRes = await fetch(`${apiBase}/${cnpj}/banking/batch-payments/${batchId}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${tokenData.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ isFinished: true }),
  });

  if (!fecharRes.ok) {
    // Os itens entraram no lote, mas o lote não fechou — e lote que não fecha
    // não chega à aprovação do app, ou seja NÃO vai ao banco e nunca vira baixa.
    //
    // Aqui estava o bug que deixava títulos presos: eles já tinham sido virados
    // para PROCESSANDO item a item (linha ~1428) e ficavam assim para sempre.
    // O reenvio só busca AUTORIZADO, então achava 0 itens e devolvia "o BTG
    // recusou (0 falha)"; e o cancelamento do borderô pula PROCESSANDO, então
    // os títulos ficavam órfãos, sem nenhuma ação possível na tela.
    //
    // Correção: desfaz o PROCESSANDO (volta a AUTORIZADO, pronto para reenviar)
    // e abandona o lote no BTG para não deixar remessa fantasma pendurada.
    const errText = await fecharRes.text();
    console.error(`[financeiro-lancamentos] Falha ao fechar lote ${batchId}:`, fecharRes.status, errText);

    await fetch(`${apiBase}/${cnpj}/banking/batch-payments/${batchId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    }).catch((e) => console.warn("[financeiro-lancamentos] Falha ao abandonar lote não fechado:", e));

    const { data: revertidos } = await supabase
      .from("lancamentos_financeiros")
      .update({
        status: "AUTORIZADO",
        observacao: `Lote BTG ${String(batchId).slice(0, 8)} não fechou (${fecharRes.status}) — não foi ao banco, reenviar.`,
      })
      .eq("bordero_id", bordero_id)
      .eq("status", "PROCESSANDO")
      .select("id");

    return json({
      ok: false,
      code: "BTG_BATCH_NOT_FINISHED",
      error:
        `Os ${aceitos} pagamento(s) foram aceitos, mas o BTG recusou o fechamento do lote ` +
        `(${fecharRes.status}). Nada foi executado nem debitado, e o lote foi abandonado. ` +
        `Os ${(revertidos || []).length} título(s) voltaram para autorizados — reenvie o borderô. ` +
        `Detalhe do banco: ${descreverErroBtg(errText).slice(0, 300)}`,
      status: "APROVADO",
      btg_batch_id: batchId,
      aceitos,
      falhas,
      revertidos: (revertidos || []).length,
    });
  }


  // 4. Consome os créditos de liberação usados nesta remessa.
  //
  // O débito acontece no ENVIO, não na avaliação: a listagem reavalia os selos
  // o tempo todo, e consumir ali gastaria o crédito só de olhar a tela.
  await consumirLiberacoes(lancamentos || []);

  // 5. Update local records
  await supabase.from("borderos").update({
    status: "ENVIADO",
    btg_batch_id: batchId,
  }).eq("id", bordero_id);

  return json({ ok: true, status: "ENVIADO", btg_batch_id: batchId, aceitos, falhas });
}

/**
 * Envia um borderô de folha por POST /{companyId}/banking/payroll/payments.
 *
 * Diferenças em relação ao lote de pagamentos que valem registrar:
 *   - não há "abrir lote" e "fechar lote": é uma submissão só, e o retorno é
 *     202 com o identificador;
 *   - o tipo de pagamento (salário, férias, rescisão...) vai no CABEÇALHO,
 *     por isso um borderô de folha carrega um único evento;
 *   - X-Idempotency-Key é obrigatório aqui (no outro fluxo era opcional);
 *   - `reference` de cada item leva o id do lançamento, cumprindo o mesmo papel
 *     do tags.externalId — é por ele que a baixa volta a encontrar a pessoa.
 */
async function enviarFolhaBtg(
  bordero: Record<string, unknown>,
  lancamentos: Array<Record<string, unknown>>,
  apiBase: string,
  accessToken: string,
  cnpj: string,
  debitParty: { branchCode: string; number: string },
) {
  const { data: comp } = await supabase
    .from("folha_competencias")
    .select("*")
    .eq("id", bordero.folha_competencia_id)
    .single();
  if (!comp) throw new Error("Competência de folha não encontrada");

  const itens = lancamentos.map((l) => {
    const d = (l.dados_extras || {}) as Record<string, unknown>;
    return {
      id: String(l.id),
      cpf: String(l.pessoa_documento ?? ""),
      banco: d.banco as string | null,
      agencia: d.agencia as string | null,
      conta: d.conta as string | null,
      valor_liquido: Number(l.valor),
    };
  });

  let corpo;
  try {
    corpo = montarLoteFolha({
      evento: comp.evento,
      descricao: String(bordero.descricao ?? `Folha ${comp.competencia}`),
      dataPagamento: String(bordero.data_pagamento ?? comp.data_pagamento),
      cnpj,
      debitParty,
      itens,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ ok: false, code: "FOLHA_INVALIDA", error: msg, status: bordero.status });
  }

  const idempotencyKey = await chaveIdempotencia("folha", String(comp.id), String(bordero.id));

  console.log(
    `[financeiro-lancamentos] BTG request POST /${cnpj}/banking/payroll/payments (folha ${comp.competencia}):`,
    JSON.stringify({ ...corpo, companies: [{ ...corpo.companies[0], items: `${itens.length} itens` }] }),
  );

  const res = await fetch(`${apiBase}/${cnpj}/banking/payroll/payments`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "X-Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify(corpo),
  });

  const texto = await res.text();
  if (!res.ok) {
    console.error("[financeiro-lancamentos] folha rejeitada:", res.status, texto.slice(0, 500));
    let detalhe = texto.slice(0, 300);
    try {
      // A API de folha usa ProblemDetails, com invalidParams por campo.
      const p = JSON.parse(texto);
      const invalidos = Array.isArray(p.invalidParams)
        ? p.invalidParams.map((i: Record<string, unknown>) => `${i.name}: ${i.reason}`).join(" | ")
        : "";
      detalhe = [p.detail || p.title, invalidos].filter(Boolean).join(" — ") || detalhe;
    } catch { /* corpo não-JSON */ }

    return json({
      ok: false,
      code: "BTG_FOLHA_REJEITADA",
      error: `O BTG recusou a folha (${res.status}). Nada foi debitado. Detalhe: ${detalhe}`,
      status: bordero.status,
    });
  }

  const dados = JSON.parse(texto || "{}");

  await supabase.from("lancamentos_financeiros")
    .update({ status: "PROCESSANDO" })
    .eq("bordero_id", bordero.id);

  await supabase.from("borderos").update({
    status: "ENVIADO",
    btg_batch_id: String(dados.paymentId ?? dados.requestId ?? ""),
  }).eq("id", bordero.id);

  await supabase.from("folha_competencias").update({
    status: "ENVIADA",
    btg_request_id: dados.requestId ?? null,
    btg_payment_id: dados.paymentId != null ? String(dados.paymentId) : null,
    btg_status: dados.status ?? null,
  }).eq("id", comp.id);

  return json({
    ok: true,
    status: "ENVIADO",
    tipo: "FOLHA",
    btg_payment_id: dados.paymentId ?? null,
    colaboradores: dados.totalEmployees ?? itens.length,
    total: dados.totalAmount ?? Number(comp.total_liquido),
  });
}

/**
 * Debita um crédito de liberação por lançamento que dependeu dele.
 *
 * Chamado só depois do envio bem-sucedido: a listagem reavalia os selos a cada
 * carregamento de tela, e consumir na avaliação gastaria o crédito só de alguém
 * abrir a página.
 */
async function consumirLiberacoes(lancamentos: Array<Record<string, unknown>>) {
  const rubIds = [...new Set(lancamentos.map((l) => l.rubrica_id).filter(Boolean))] as string[];
  if (rubIds.length === 0) return;

  const { data: rubs } = await supabase
    .from("rubricas_autorizadas")
    .select("*")
    .in("id", rubIds)
    .gt("liberacoes_restantes", 0);
  if (!rubs || rubs.length === 0) return;

  const hoje = hojeBrt();
  const consumo = new Map<string, number>();

  for (const l of lancamentos) {
    if (!l.rubrica_id) continue;
    const rub = rubs.find((r) => String(r.id) === String(l.rubrica_id));
    if (!rub) continue;
    const av = avaliarLancamento(l as never, rub as never, hoje);
    if (av.usouLiberacao) {
      consumo.set(String(rub.id), (consumo.get(String(rub.id)) ?? 0) + 1);
    }
  }

  for (const [rubricaId, usados] of consumo) {
    const rub = rubs.find((r) => String(r.id) === rubricaId)!;
    const restante = Math.max(0, Number(rub.liberacoes_restantes ?? 0) - usados);
    await supabase.from("rubricas_autorizadas")
      .update({ liberacoes_restantes: restante })
      .eq("id", rubricaId);
    console.log(`[financeiro-lancamentos] rubrica ${rubricaId}: ${usados} liberação(ões) consumida(s), restam ${restante}`);
  }
}

/**
 * Cancelar borderô = desmanchar a remessa, não descartar os títulos.
 *
 * Todo lançamento que estava nele volta para "Em Preparo" (PREVISTO, sem
 * autorização e sem vínculo), pronto para ser selecionado num borderô novo. A
 * classificação e os dados de pagamento continuam gravados — o trabalho de
 * preparação não se perde.
 *
 * O filtro de status é largo de propósito: antes só BORDERO/AUTORIZADO eram
 * devolvidos, e itens AGRUPADO/CLASSIFICADO ficavam pendurados na seção
 * "Em Borderô" apontando para um borderô cancelado — a confusão que se via na
 * tela.
 *
 * PROCESSANDO entra na devolução SÓ quando o borderô não tem `btg_batch_id`:
 * sem lote fechado nada foi ao banco, então esse PROCESSANDO é resíduo de um
 * envio que morreu no meio (ver o rollback no fechamento do lote). Com
 * `btg_batch_id` presente o título fica intocado — aí existe remessa de verdade
 * esperando aprovação no app do BTG. BAIXADO nunca volta.
 */
async function cancelarBordero(body: Record<string, unknown>) {
  const { bordero_id } = body;
  if (!bordero_id) throw new Error("bordero_id obrigatório");

  const { data: bordero } = await supabase
    .from("borderos")
    .select("status, btg_batch_id")
    .eq("id", bordero_id)
    .single();
  if (!bordero) throw new Error("Borderô não encontrado");
  if (!["MONTAGEM", "APROVADO"].includes(bordero.status)) {
    throw new Error("Borderô já enviado ou processado não pode ser cancelado");
  }

  const statusDevolviveis = ["BORDERO", "AUTORIZADO", "AGRUPADO", "CLASSIFICADO", "PREVISTO"];
  const semLoteNoBanco = !bordero.btg_batch_id;
  if (semLoteNoBanco) statusDevolviveis.push("PROCESSANDO");

  // Cancelar não é apagar: o título volta para Contas a Pagar (Em preparo) com a
  // classificação intacta. Zerar tudo para PREVISTO fazia o operador achar que o
  // lançamento havia desaparecido — foi o que aconteceu com um salário recusado
  // que já tinha sido corrigido.
  const jaClassificados = statusDevolviveis.filter((st) => st !== "PREVISTO");
  const { data: devolvidosClass } = await supabase
    .from("lancamentos_financeiros")
    .update({
      bordero_id: null,
      status: "CLASSIFICADO",
      autorizado_por: null,
      autorizado_em: null,
      observacao: "Borderô cancelado — título de volta em Contas a Pagar (Em preparo). Monte um novo borderô.",
    })
    .eq("bordero_id", bordero_id)
    .in("status", jaClassificados)
    .select("id");

  const { data: devolvidosPrev } = await supabase
    .from("lancamentos_financeiros")
    .update({ bordero_id: null, status: "PREVISTO", autorizado_por: null, autorizado_em: null })
    .eq("bordero_id", bordero_id)
    .eq("status", "PREVISTO")
    .select("id");

  await supabase.from("borderos").update({ status: "CANCELADO" }).eq("id", bordero_id);

  const devolvidos = (devolvidosClass || []).length + (devolvidosPrev || []).length;
  return json({
    ok: true,
    status: "CANCELADO",
    devolvidos,
    mensagem: devolvidos > 0
      ? `Borderô cancelado. ${devolvidos} título(s) voltaram para Contas a Pagar, aba "Em preparo", com a classificação preservada.`
      : "Borderô cancelado (não havia títulos para devolver).",
  });
}

/**
 * Escape hatch para títulos presos em PROCESSANDO sem lote no banco.
 *
 * Existe para o caso que já aconteceu: envio aceitou os itens, o fechamento do
 * lote falhou e os títulos ficaram PROCESSANDO num borderô depois cancelado —
 * invisíveis a qualquer ação da tela. Só libera quando dá para afirmar que o
 * dinheiro não se moveu: borderô sem `btg_batch_id` e título sem baixa.
 */
async function liberarProcessandoOrfao(body: Record<string, unknown>, userId: string) {
  const ids = (body.lancamento_ids as string[]) || [];
  if (ids.length === 0) throw new Error("lancamento_ids obrigatório");
  await requireAdmin(userId);

  const { data: lancs, error } = await supabase
    .from("lancamentos_financeiros")
    .select("id, descricao, status, data_baixa, bordero_id, borderos(status, btg_batch_id)")
    .in("id", ids);
  if (error) throw new Error(error.message);

  const liberados: string[] = [];
  const bloqueados: { id: string; descricao: string; motivo: string }[] = [];

  for (const l of (lancs || [])) {
    const bordero = (l as unknown as { borderos: { status: string; btg_batch_id: string | null } | null }).borderos;
    const descricao = String(l.descricao ?? l.id);
    if (l.status !== "PROCESSANDO") {
      bloqueados.push({ id: l.id, descricao, motivo: `status é ${l.status}, não PROCESSANDO` });
      continue;
    }
    if (l.data_baixa) {
      bloqueados.push({ id: l.id, descricao, motivo: "já tem baixa registrada" });
      continue;
    }
    if (bordero?.btg_batch_id) {
      bloqueados.push({
        id: l.id,
        descricao,
        motivo: `há lote no BTG (${String(bordero.btg_batch_id).slice(0, 12)}) — confirme ou cancele a remessa no app do banco`,
      });
      continue;
    }
    liberados.push(l.id);
  }

  if (liberados.length > 0) {
    const { error: uErr } = await supabase
      .from("lancamentos_financeiros")
      .update({
        status: "PREVISTO",
        bordero_id: null,
        autorizado_por: null,
        autorizado_em: null,
        observacao: "Liberado de PROCESSANDO: lote nunca fechou no BTG, pagamento não foi executado.",
      })
      .in("id", liberados);
    if (uErr) throw new Error(uErr.message);
    console.log(`[financeiro-lancamentos] ${liberados.length} título(s) liberados de PROCESSANDO órfão por ${userId}`);
  }

  return json({ ok: true, liberados: liberados.length, bloqueados });
}


async function detalheBordero(body: Record<string, unknown>) {
  const { bordero_id } = body;
  if (!bordero_id) throw new Error("bordero_id obrigatório");

  const { data: bordero } = await supabase.from("borderos").select("*").eq("id", bordero_id).single();
  if (!bordero) throw new Error("Borderô não encontrado");

  const { data: lancamentos } = await supabase
    .from("lancamentos_financeiros")
    .select("*")
    .eq("bordero_id", bordero_id)
    .order("data_vencimento", { ascending: true });

  return json({ bordero, lancamentos: lancamentos || [] });
}

// ── Helper ──────────────────────────────────────────────
async function recalcBordero(borderoId: string) {
  const { data: lancs } = await supabase
    .from("lancamentos_financeiros")
    .select("valor")
    .eq("bordero_id", borderoId);

  const total = (lancs || []).reduce((s: number, l: { valor: number }) => s + Number(l.valor), 0);
  const qtd = (lancs || []).length;

  await supabase.from("borderos").update({
    total_valor: total,
    qtd_lancamentos: qtd,
  }).eq("id", borderoId);
}

// ═══════════════════════════════════════════════════════════
// IMPORT ERP → LEDGER (manual, receives parcelas array)
// ═══════════════════════════════════════════════════════════

async function importarErp(body: Record<string, unknown>, userId: string) {
  const { cod_empresa, parcelas } = body;
  if (!cod_empresa) throw new Error("cod_empresa obrigatório");
  if (!Array.isArray(parcelas) || parcelas.length === 0) {
    throw new Error("parcelas deve ser um array não vazio");
  }

  const records = parcelas.map((p: Record<string, unknown>) => ({
    cod_empresa: Number(cod_empresa),
    tipo: p.tipo === "PAGAR" ? "PAGAR" : "RECEBER",
    descricao: String(p.descricao || p.documento || "Parcela ERP"),
    valor: Number(p.valor || 0),
    data_vencimento: String(p.data_vencimento),
    data_emissao: p.data_emissao ? String(p.data_emissao) : null,
    pessoa_nome: p.pessoa_nome ? String(p.pessoa_nome) : null,
    pessoa_documento: p.pessoa_documento ? String(p.pessoa_documento) : null,
    forma_pagamento: p.forma_pagamento ? String(p.forma_pagamento) : null,
    adquirente: p.adquirente ? String(p.adquirente) : null,
    bandeira: p.bandeira ? String(p.bandeira) : null,
    numero_parcela: p.numero_parcela ? Number(p.numero_parcela) : null,
    total_parcelas: p.total_parcelas ? Number(p.total_parcelas) : null,
    natureza: p.natureza ? String(p.natureza) : null,
    categoria: p.categoria ? String(p.categoria) : null,
    origem: "ERP",
    origem_id: p.origem_id ? String(p.origem_id) : null,
    criado_por: userId,
    status: "PREVISTO",
  }));

  let inserted = 0;
  let skipped = 0;

  for (const rec of records) {
    if (rec.origem_id) {
      const { data: existing } = await supabase
        .from("lancamentos_financeiros")
        .select("id")
        .eq("origem", "ERP")
        .eq("origem_id", rec.origem_id)
        .eq("cod_empresa", rec.cod_empresa)
        .limit(1);

      if (existing && existing.length > 0) {
        skipped++;
        continue;
      }
    }

    const { error: insErr } = await supabase
      .from("lancamentos_financeiros")
      .insert(rec);

    if (insErr) {
      console.error("[importar_erp] erro ao inserir:", insErr.message);
      skipped++;
    } else {
      inserted++;
    }
  }

  return json({ ok: true, inserted, skipped, total: records.length });
}

// ═══════════════════════════════════════════════════════════
// IMPORT ERP AUTO — reads from parcelas_cache + DDA cross-match
// ═══════════════════════════════════════════════════════════

async function importarErpAuto(body: Record<string, unknown>, userId: string) {
  const { cod_empresa, data_inicio, data_fim, tipo_filtro } = body;
  if (!cod_empresa) throw new Error("cod_empresa obrigatório");

  const codEmp = Number(cod_empresa);

  // Default: current month
  const hoje = new Date();
  const defaultIni = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-01`;
  const lastDay = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).getDate();
  const defaultFim = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${lastDay}`;

  const dtIni = String(data_inicio || defaultIni);
  const dtFim = String(data_fim || defaultFim);
  const tipoFiltro = String(tipo_filtro || "TODOS"); // TODOS | PAGAR | RECEBER

  // 1. Fetch parcelas from cache
  let cacheQuery = supabase
    .from("parcelas_cache")
    .select("*")
    .eq("cod_empresa", codEmp)
    .gte("data_vencimento", dtIni)
    .lte("data_vencimento", dtFim);

  if (tipoFiltro !== "TODOS") {
    cacheQuery = cacheQuery.eq("tipo_lancamento", tipoFiltro);
  }

  const { data: parcelas, error: pErr } = await cacheQuery;
  if (pErr) throw new Error(`Erro ao buscar parcelas_cache: ${pErr.message}`);
  if (!parcelas || parcelas.length === 0) {
    return json({ ok: true, inserted: 0, skipped: 0, dda_vinculados: 0, dda_orfaos: 0, total: 0, message: "Nenhuma parcela encontrada no cache para o período." });
  }

  // 2. Fetch DDA titles for cross-match (only PAGAR parcelas)
  // Janela alargada em relação ao período importado: o vencimento registrado na
  // CIP pode estar alguns dias fora do que veio do ERP, e sem a folga o título
  // nem entraria na lista de candidatos.
  const folga = (d: string, dias: number) =>
    new Date(Date.parse(`${d}T12:00:00Z`) + dias * 86_400_000).toISOString().slice(0, 10);

  const { data: ddaTitulos } = await supabase
    .from("btg_dda_titulos")
    .select("*")
    .eq("cod_empresa", codEmp)
    .eq("status", "PENDENTE")
    .gte("data_vencimento", folga(dtIni, -JANELA_DIAS))
    .lte("data_vencimento", folga(dtFim, JANELA_DIAS));

  const ddaList = ddaTitulos || [];
  const ddaUsed = new Set<string>();

  // Load dre_plano_contas mapping table
  const { data: planoContas } = await supabase
    .from("dre_plano_contas")
    .select("conta_numero, conta_descricao, grupo_dre, categoria")
    .eq("ativo", true);

  const planoMap = new Map<string, { grupo_dre: string; categoria: string }>();
  for (const pc of (planoContas || [])) {
    planoMap.set(pc.conta_numero, { grupo_dre: pc.grupo_dre, categoria: pc.categoria });
  }

  // Helper: auto-classify using dre_plano_contas table with prefix fallback
  function autoClassify(
    tipo: string,
    contaNumero?: string | null,
    contaDescricao?: string | null,
    forma?: string | null
  ): { natureza: string; categoria: string; subcategoria: string | null } {
    // 1. Try exact match from plano de contas
    if (contaNumero && planoMap.has(contaNumero)) {
      const match = planoMap.get(contaNumero)!;
      return { natureza: match.grupo_dre, categoria: match.categoria, subcategoria: contaDescricao || null };
    }

    // 2. Try prefix fallback (e.g. "3.4.28" → "3.4" → "3")
    if (contaNumero) {
      const parts = contaNumero.split(".");
      while (parts.length > 1) {
        parts.pop();
        const prefix = parts.join(".");
        if (planoMap.has(prefix)) {
          const match = planoMap.get(prefix)!;
          return { natureza: match.grupo_dre, categoria: match.categoria, subcategoria: contaDescricao || null };
        }
      }
      // Try first character
      const firstChar = contaNumero.charAt(0);
      if (planoMap.has(firstChar)) {
        const match = planoMap.get(firstChar)!;
        return { natureza: match.grupo_dre, categoria: match.categoria, subcategoria: contaDescricao || null };
      }
    }

    // 3. Generic fallback
    if (tipo === "RECEBER") {
      return { natureza: "RECEITA_BRUTA", categoria: "VENDAS", subcategoria: contaDescricao || null };
    }
    if (forma) {
      const fp = forma.toUpperCase();
      if (fp.includes("CARTAO") || fp.includes("CREDITO") || fp.includes("DEBITO")) {
        return { natureza: "DEDUCOES", categoria: "TAXAS", subcategoria: contaDescricao || "Taxas Adquirentes" };
      }
    }
    return { natureza: "DESPESAS_OPERACIONAIS", categoria: "OUTROS", subcategoria: contaDescricao || null };
  }

  // 3. Process parcelas
  let inserted = 0;
  let skipped = 0;
  let ddaVinculados = 0;

  for (const p of parcelas) {
    const origemId = `ERP-${codEmp}-${p.documento || p.id}`;

    // Check duplicates
    const { data: existing } = await supabase
      .from("lancamentos_financeiros")
      .select("id")
      .eq("origem", "ERP")
      .eq("origem_id", origemId)
      .eq("cod_empresa", codEmp)
      .limit(1);

    if (existing && existing.length > 0) {
      skipped++;
      continue;
    }

    const tipo = p.tipo_lancamento === "PAGAR" ? "PAGAR" : "RECEBER";
    const classification = autoClassify(tipo, p.conta_numero, p.conta_descricao, p.forma_pagamento_tipo);

    const record: Record<string, unknown> = {
      cod_empresa: codEmp,
      tipo,
      descricao: p.pessoa_nome ? `${p.pessoa_nome} - ${p.documento || 'Parcela ERP'}` : (p.documento || "Parcela ERP"),
      valor: Number(p.valor || 0),
      data_vencimento: p.data_vencimento,
      data_emissao: p.data_emissao || null,
      pessoa_nome: p.pessoa_nome || null,
      // CNPJ do fornecedor: sem ele a conciliação com o DDA fica cega — era a
      // causa de boleto legítimo não encontrar o lançamento.
      pessoa_documento: (p.fornecedor_cnpj || p.pessoa_identificador || p.pessoa_documento || null) as string | null,
      forma_pagamento: p.forma_pagamento_tipo || null,
      natureza: classification.natureza,
      categoria: classification.categoria,
      subcategoria: classification.subcategoria,
      origem: "ERP",
      origem_id: origemId,
      criado_por: userId,
      status: "PREVISTO",
      dados_extras: {
        conta_numero: p.conta_numero || null,
        conta_descricao: p.conta_descricao || null,
        // Número da nota: é a chave mais forte do match com o boleto do DDA.
        documento: p.documento || null,
      },
    };

    // Cross-match com o DDA (só para PAGAR).
    //
    // Antes exigia valor idêntico ao centavo E vencimento idêntico — os dois
    // campos que sabemos que derivam (juros do emissor, prorrogação na CIP).
    // Agora a regra vale CNPJ do emissor como sinal forte e aceita tolerância
    // em valor e data; ambiguidade não casa. Ver _shared/ddaMatch.ts.
    if (tipo === "PAGAR" && ddaList.length > 0) {
      const disponiveis = ddaList.filter((d) => !ddaUsed.has(d.id));
      // Invertido em relação ao match do DDA: aqui percorremos os títulos
      // procurando o que casa com ESTA parcela.
      const matchedDda = disponiveis.find((d) => {
        const r = casarTitulo(
          {
            valor: Number(d.valor),
            data_vencimento: String(d.data_vencimento),
            documento_emissor: d.documento_emissor,
            numero_documento: d.numero_documento,
          },
          [{
            id: String(p.parcela_id ?? p.id ?? ""),
            valor: Number(p.valor),
            data_vencimento: String(p.data_vencimento),
            pessoa_documento: (p.fornecedor_cnpj ?? p.pessoa_identificador ?? p.pessoa_documento) as string | null,
            documento: p.documento as string | null,
          }],
        );
        return r.candidato !== null;
      });

      if (matchedDda) {
        ddaUsed.add(matchedDda.id);
        record.btg_dda_id = matchedDda.id;
        (record.dados_extras as Record<string, unknown>).linha_digitavel = matchedDda.linha_digitavel;
        (record.dados_extras as Record<string, unknown>).dda_emissor = matchedDda.emissor;
        (record.dados_extras as Record<string, unknown>).dda_banco = matchedDda.banco_emissor;
        (record.dados_extras as Record<string, unknown>).btg_payment_type = "BANKSLIP";
        ddaVinculados++;
      }
    }

    const { error: insErr } = await supabase
      .from("lancamentos_financeiros")
      .insert(record);

    if (insErr) {
      console.error("[importar_erp_auto] erro:", insErr.message);
      skipped++;
    } else {
      inserted++;
    }
  }

  // 4. Create orphan DDA entries (DDA titles without ERP match)
  let ddaOrfaos = 0;
  for (const dda of ddaList) {
    if (ddaUsed.has(dda.id)) continue;

    // Check if already imported as DDA orphan
    const { data: existingDda } = await supabase
      .from("lancamentos_financeiros")
      .select("id")
      .eq("btg_dda_id", dda.id)
      .eq("cod_empresa", codEmp)
      .limit(1);

    if (existingDda && existingDda.length > 0) continue;

    const { error: ddaInsErr } = await supabase
      .from("lancamentos_financeiros")
      .insert({
        cod_empresa: codEmp,
        tipo: "PAGAR",
        descricao: `DDA: ${dda.emissor || dda.documento_emissor || 'Título sem identificação'}`,
        valor: Number(dda.valor),
        data_vencimento: dda.data_vencimento,
        pessoa_nome: dda.emissor || null,
        pessoa_documento: dda.documento_emissor || null,
        natureza: "DESPESAS_OPERACIONAIS",
        categoria: "FORNECEDORES",
        origem: "DDA",
        origem_id: `DDA-${dda.id}`,
        btg_dda_id: dda.id,
        requer_validacao: true,
        criado_por: userId,
        status: "PREVISTO",
        dados_extras: {
          linha_digitavel: dda.linha_digitavel,
          dda_emissor: dda.emissor,
          dda_banco: dda.banco_emissor,
          btg_payment_type: "BANKSLIP",
        },
      });

    if (!ddaInsErr) ddaOrfaos++;
  }

  return json({
    ok: true,
    inserted,
    skipped,
    dda_vinculados: ddaVinculados,
    dda_orfaos: ddaOrfaos,
    total: parcelas.length,
  });
}

// ═══════════════════════════════════════════════════════════
// CONFIRMAR PROCESSAMENTO (baixar lotes pós-banco)
// ═══════════════════════════════════════════════════════════

async function confirmarProcessamento(body: Record<string, unknown>, userId: string) {
  const { bordero_id } = body;
  if (!bordero_id) throw new Error("bordero_id obrigatório");
  await requireAdmin(userId);

  const { data: bordero } = await supabase.from("borderos").select("*").eq("id", bordero_id).single();
  if (!bordero) throw new Error("Borderô não encontrado");
  if (bordero.status !== "ENVIADO") throw new Error("Borderô precisa estar ENVIADO para confirmação");

  const hoje = new Date().toISOString().slice(0, 10);
  const agora = new Date().toISOString();

  // Baixar todos os lançamentos do borderô
  const { data: lancamentos, error: qErr } = await supabase
    .from("lancamentos_financeiros")
    .select("id, valor")
    .eq("bordero_id", bordero_id)
    .eq("status", "PROCESSANDO");

  if (qErr) throw new Error(qErr.message);

  let baixados = 0;
  for (const l of (lancamentos || [])) {
    const { error: uErr } = await supabase
      .from("lancamentos_financeiros")
      .update({
        status: "BAIXADO",
        valor_pago: l.valor,
        data_pagamento: hoje,
        data_baixa: hoje,
        baixado_por: userId,
        baixado_em: agora,
      })
      .eq("id", l.id);

    if (!uErr) {
      baixados++;
      baixados += await baixarComponentes(l.id, Number(l.valor), hoje, userId);
    }
  }

  // Update borderô status
  await supabase.from("borderos").update({ status: "PROCESSADO" }).eq("id", bordero_id);

  return json({ ok: true, baixados, status: "PROCESSADO" });
}

// ═══════════════════════════════════════════════════════════
// CLASSIFICAR LANÇAMENTOS (requer_validacao)
// ═══════════════════════════════════════════════════════════

async function classificar(body: Record<string, unknown>, _userId: string) {
  const { id, categoria, natureza, subcategoria, descricao } = body;
  if (!id) throw new Error("id obrigatório");

  const updates: Record<string, unknown> = { requer_validacao: false };
  if (categoria !== undefined) updates.categoria = categoria;
  if (natureza !== undefined) updates.natureza = natureza;
  if (subcategoria !== undefined) updates.subcategoria = subcategoria;
  if (descricao !== undefined) updates.descricao = descricao;

  const { data, error: updErr } = await supabase
    .from("lancamentos_financeiros")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (updErr) throw new Error(updErr.message);
  return json(data);
}

// ═══════════════════════════════════════════════════════════
// CLASSIFICAR EM LOTE
// ═══════════════════════════════════════════════════════════

async function classificarLote(body: Record<string, unknown>, _userId: string) {
  const { ids, natureza, categoria, subcategoria } = body;
  if (!Array.isArray(ids) || ids.length === 0) throw new Error("ids obrigatório (array)");
  if (!subcategoria) throw new Error("subcategoria obrigatório");

  // Classificar NÃO muda o status: o título continua em PREVISTO (preparo) até
  // entrar num borderô. O que muda é o preenchimento da conta DRE — a tela
  // sinaliza "pronto p/ borderô" quando conta + dados de pagamento existem.
  const { data, error } = await supabase
    .from("lancamentos_financeiros")
    .update({
      natureza: natureza || null,
      categoria: categoria || null,
      subcategoria: subcategoria,
      requer_validacao: false,
    })
    .in("id", ids as string[])
    .in("status", ["PREVISTO", "CLASSIFICADO"])
    .select("id");

  if (error) throw new Error(error.message);
  return json({ ok: true, classificados: (data || []).length });
}

// ═══════════════════════════════════════════════════════════
// CANCELAR EM LOTE
// ═══════════════════════════════════════════════════════════

async function cancelarLote(body: Record<string, unknown>) {
  const { ids } = body;
  if (!Array.isArray(ids) || ids.length === 0) throw new Error("ids obrigatório (array)");

  const { data, error } = await supabase
    .from("lancamentos_financeiros")
    .update({ status: "CANCELADO" })
    .in("id", ids as string[])
    .in("status", ["PREVISTO"])
    .select("id");

  if (error) throw new Error(error.message);
  return json({ ok: true, cancelados: (data || []).length });
}

/**
 * Desfaz cancelamentos.
 *
 * Nasceu de um acidente de uso: para limpar a seleção da tabela, o operador
 * clicou em "Cancelar" — que cancela os lançamentos, não a seleção. Vinte e um
 * títulos com boleto anexado foram cancelados de uma vez.
 *
 * O estado anterior é reconstruído com fidelidade porque nada foi apagado:
 * quem tem subcategoria e não pede validação estava CLASSIFICADO; o resto
 * estava PREVISTO. O cancelamento em lote, aliás, só atinge PREVISTO — então
 * na prática o risco de errar aqui é baixo.
 *
 * Aceita `ids` explícitos ou `cod_empresa` + `horas` para desfazer uma janela
 * inteira, que é o caso de socorro.
 */
async function reverterCancelamento(body: Record<string, unknown>) {
  const ids = Array.isArray(body.ids) ? (body.ids as string[]) : null;
  const codEmpresa = body.cod_empresa ? Number(body.cod_empresa) : null;
  const horas = Number(body.horas ?? 24);

  if (!ids && !codEmpresa) throw new Error("Informe ids ou cod_empresa");

  let query = supabase
    .from("lancamentos_financeiros")
    .select("id, subcategoria, requer_validacao")
    .eq("status", "CANCELADO");

  if (ids) {
    query = query.in("id", ids);
  } else {
    const desde = new Date(Date.now() - horas * 3600 * 1000).toISOString();
    query = query.eq("cod_empresa", codEmpresa!).gte("updated_at", desde);
  }

  const { data: alvos, error: qErr } = await query;
  if (qErr) throw new Error(qErr.message);
  if (!alvos || alvos.length === 0) return json({ ok: true, revertidos: 0, mensagem: "Nada a reverter" });

  // Todos voltam para PREVISTO (preparo). Classificação é atributo, não status.
  const previstos = alvos.map((l) => l.id);

  if (previstos.length > 0) {
    await supabase.from("lancamentos_financeiros")
      .update({ status: "PREVISTO" }).in("id", previstos);
  }

  return json({
    ok: true,
    revertidos: alvos.length,
    para_classificado: 0,
    para_previsto: previstos.length,
  });
}

async function listarPendentesValidacao(body: Record<string, unknown>) {
  const { cod_empresa, limit: lim } = body;

  let query = supabase
    .from("lancamentos_financeiros")
    .select("*")
    .eq("requer_validacao", true)
    .order("created_at", { ascending: false });

  if (cod_empresa) query = query.eq("cod_empresa", cod_empresa);
  if (lim) query = query.limit(Number(lim));

  const { data, error: qErr } = await query;
  if (qErr) throw new Error(qErr.message);
  return json(data);
}

// ═══════════════════════════════════════════════════════════
// RESUMO FINANCEIRO UNIFICADO
// ═══════════════════════════════════════════════════════════

async function resumoFinanceiro(body: Record<string, unknown>) {
  const { cod_empresa, data_inicio, data_fim } = body;
  const codEmp = cod_empresa && Number(cod_empresa) > 0 ? Number(cod_empresa) : null;

  let query = supabase
    .from("lancamentos_financeiros")
    .select("tipo, status, valor, valor_pago, requer_validacao, data_vencimento")
    .not("status", "eq", "CANCELADO");

  if (codEmp) query = query.eq("cod_empresa", codEmp);
  if (data_inicio) query = query.gte("data_vencimento", data_inicio);
  if (data_fim) query = query.lte("data_vencimento", data_fim);

  const { data: lancs, error: lErr } = await query;
  if (lErr) throw new Error(lErr.message);

  const hoje = new Date().toISOString().slice(0, 10);

  let totalReceberAberto = 0;
  let totalPagarAberto = 0;
  let totalBaixadoReceber = 0;
  let totalBaixadoPagar = 0;
  let qtdVencidos = 0;
  let qtdPendentesValidacao = 0;
  let totalLancamentos = 0;

  const useLedger = (lancs || []).length > 0;

  if (useLedger) {
    for (const l of (lancs || [])) {
      totalLancamentos++;
      const val = Number(l.valor || 0);
      const valPago = Number(l.valor_pago || 0);

      if (l.requer_validacao) qtdPendentesValidacao++;

      if (l.status === "BAIXADO") {
        if (l.tipo === "RECEBER") totalBaixadoReceber += valPago || val;
        else totalBaixadoPagar += valPago || val;
      } else {
        if (l.tipo === "RECEBER") totalReceberAberto += val;
        else totalPagarAberto += val;

        if (l.data_vencimento < hoje && l.status === "PREVISTO") {
          qtdVencidos++;
        }
      }
    }
  } else {
    console.log("[resumo] Ledger vazio, usando parcelas_cache como fallback");
    let cacheQuery = supabase
      .from("parcelas_cache")
      .select("tipo_lancamento, situacao, valor, valor_pago, data_vencimento");

    if (codEmp) cacheQuery = cacheQuery.eq("cod_empresa", codEmp);
    if (data_inicio) cacheQuery = cacheQuery.gte("data_vencimento", data_inicio);
    if (data_fim) cacheQuery = cacheQuery.lte("data_vencimento", data_fim);

    const { data: parcelas, error: pErr } = await cacheQuery;
    if (pErr) throw new Error(pErr.message);

    for (const p of (parcelas || [])) {
      totalLancamentos++;
      const val = Number(p.valor || 0);
      const valPago = Number(p.valor_pago || 0);

      if (p.situacao === "PAGA") {
        if (p.tipo_lancamento === "RECEBER") totalBaixadoReceber += valPago || val;
        else totalBaixadoPagar += valPago || val;
      } else {
        if (p.tipo_lancamento === "RECEBER") totalReceberAberto += val;
        else totalPagarAberto += val;

        if (p.data_vencimento && p.data_vencimento < hoje && p.situacao === "EM ABERTO") {
          qtdVencidos++;
        }
        if (p.situacao === "EM ATRASO") {
          qtdVencidos++;
        }
      }
    }
  }

  let bQuery = supabase
    .from("borderos")
    .select("status, total_valor")
    .in("status", ["MONTAGEM", "APROVADO", "ENVIADO"]);

  if (codEmp) bQuery = bQuery.eq("cod_empresa", codEmp);

  const { data: borderosData } = await bQuery;
  const borderosAbertos = (borderosData || []).length;
  const borderosTotalValor = (borderosData || []).reduce((s: number, b: { total_valor: number }) => s + Number(b.total_valor || 0), 0);

  let rcQuery = supabase
    .from("recebiveis_cartao")
    .select("status, valor_bruto, valor_liquido, taxa_valor");

  if (codEmp) rcQuery = rcQuery.eq("cod_empresa", codEmp);

  const { data: recebiveis } = await rcQuery;
  const recebiveisPendentes = (recebiveis || []).filter((r: { status: string }) => r.status === "PREVISTO").length;
  const totalTaxasCartao = (recebiveis || []).reduce((s: number, r: { taxa_valor: number | null }) => s + Number(r.taxa_valor || 0), 0);

  return json({
    totalReceberAberto,
    totalPagarAberto,
    saldoAberto: totalReceberAberto - totalPagarAberto,
    totalBaixadoReceber,
    totalBaixadoPagar,
    saldoBaixado: totalBaixadoReceber - totalBaixadoPagar,
    qtdVencidos,
    qtdPendentesValidacao,
    totalLancamentos,
    borderosAbertos,
    borderosTotalValor,
    recebiveisPendentes,
    totalTaxasCartao,
  });
}

// ═══════════════════════════════════════════════════════════
// G3 — MESA DE APROVAÇÃO (SPEC_P2_5 §4/§5)
// ═══════════════════════════════════════════════════════════

// Lançamentos PAGAR do pipeline com selo de lastro computado no servidor
// (mesma regra pura _shared/governanca.ts usada nas travas do borderô).
async function mesaAprovacao(body: Record<string, unknown>) {
  const codEmpresa = body.cod_empresa ? Number(body.cod_empresa) : null;

  let query = supabase
    .from("lancamentos_financeiros")
    .select("id, cod_empresa, tipo, descricao, pessoa_nome, pessoa_documento, valor, data_vencimento, status, natureza, categoria, lastro, erp_parcela_id, rubrica_id, btg_dda_id, justificativa, bordero_id, criado_por, forma_pagamento, dados_extras")
    .eq("tipo", "PAGAR")
    .in("status", ["PREVISTO", "CLASSIFICADO", "BORDERO"])
    .order("data_vencimento", { ascending: true })
    .limit(500);
  if (codEmpresa) query = query.eq("cod_empresa", codEmpresa);
  const { data: lancs, error } = await query;
  if (error) throw new Error(error.message);

  const rubricaIds = [...new Set((lancs || []).map((l) => l.rubrica_id).filter(Boolean))] as string[];
  const rubricasMap = new Map<string, Record<string, unknown>>();
  if (rubricaIds.length > 0) {
    const { data: rubs } = await supabase.from("rubricas_autorizadas").select("*").in("id", rubricaIds);
    for (const r of (rubs || [])) rubricasMap.set(String(r.id), r);
  }

  const hoje = new Date().toISOString().slice(0, 10);
  const avaliados = (lancs || []).map((l) => {
    const rubrica = l.rubrica_id ? (rubricasMap.get(String(l.rubrica_id)) as never) ?? null : null;
    const av = avaliarLancamento(l as never, rubrica, hoje);
    const rub = l.rubrica_id ? rubricasMap.get(String(l.rubrica_id)) : null;
    return {
      ...l,
      selo: av.selo,
      selo_motivo: av.motivo,
      desvio_pct: av.desvioPct ?? null,
      pode_bordero: av.podeBordero,
      rubrica_descricao: rub ? String(rub.descricao) : null,
    };
  });

  // Borderôs em montagem/aprovados com composição de selos
  let bq = supabase
    .from("borderos")
    .select("id, cod_empresa, descricao, status, qtd_lancamentos, total_valor, criado_por, created_at")
    .in("status", ["MONTAGEM", "APROVADO"])
    .order("created_at", { ascending: false })
    .limit(50);
  if (codEmpresa) bq = bq.eq("cod_empresa", codEmpresa);
  const { data: borderos } = await bq;

  const borderosResumo = (borderos || []).map((b) => {
    const doBordero = avaliados.filter((l) => l.bordero_id === b.id);
    const porSelo: Record<string, number> = {};
    for (const l of doBordero) porSelo[l.selo] = (porSelo[l.selo] || 0) + 1;
    return { ...b, selos: porSelo };
  });

  const porSelo: Record<string, number> = {};
  for (const l of avaliados) porSelo[l.selo] = (porSelo[l.selo] || 0) + 1;

  // Cobranças sem entrada: DDA (boleto no banco) sem título correspondente no
  // ledger = nota provavelmente sem entrada no ERP. Aparece na Mesa ANTES do
  // vencimento — o "não me dei conta" vira alerta acionável, não juros.
  let ddaQ = supabase
    .from("btg_dda_titulos")
    .select("id, emissor, documento_emissor, valor, data_vencimento, banco_emissor")
    .eq("status", "PENDENTE")
    .order("data_vencimento", { ascending: true })
    .limit(100);
  if (codEmpresa) ddaQ = ddaQ.eq("cod_empresa", codEmpresa);
  const { data: ddaPendentes } = await ddaQ;

  let ddaSemEntrada: Record<string, unknown>[] = [];
  if (ddaPendentes && ddaPendentes.length > 0) {
    const { data: vinculados } = await supabase
      .from("lancamentos_financeiros")
      .select("btg_dda_id")
      .in("btg_dda_id", ddaPendentes.map((d) => d.id))
      .neq("status", "CANCELADO");
    const comTitulo = new Set((vinculados || []).map((v) => v.btg_dda_id));
    ddaSemEntrada = ddaPendentes.filter((d) => !comTitulo.has(d.id));
  }

  return json({ lancamentos: avaliados, borderos: borderosResumo, resumo_selos: porSelo, dda_sem_entrada: ddaSemEntrada });
}

// Exceção emergencial: aprovação individual do master, fora do borderô.
// Após aprovada, a execução é o pagamento avulso BTG (único uso remanescente).
async function aprovarExcecao(body: Record<string, unknown>, userId: string) {
  const { id } = body;
  if (!id) throw new Error("id obrigatório");
  await requireAdmin(userId);

  const { data: lanc } = await supabase
    .from("lancamentos_financeiros")
    .select("id, status, lastro, justificativa, criado_por, dados_extras")
    .eq("id", String(id))
    .single();
  if (!lanc) throw new Error("Lançamento não encontrado");
  if (lanc.lastro !== "EXCECAO") throw new Error("Só exceções emergenciais passam por este caminho");
  if (!validarJustificativa(lanc.justificativa)) throw new Error("Exceção sem justificativa válida");
  // BORDERO também é válido: o caminho normal é montar o borderô e aprovar as
  // exceções dele na Mesa (modo foco). Rejeitar BORDERO deixava o borderô
  // travado sem nenhuma ação possível a partir da Mesa (caso real, 07/08).
  if (!["PREVISTO", "CLASSIFICADO", "BORDERO"].includes(lanc.status)) {
    throw new Error(`Status ${lanc.status} não permite aprovação de exceção`);
  }

  const distinto = criadorAprovadorDistintos(lanc.criado_por, userId);
  if (!distinto.ok) throw new Error(distinto.motivo!);

  const dados = (lanc.dados_extras || {}) as Record<string, unknown>;
  // Aprovada → volta ao Hub como CLASSIFICADO com a flag de aprovação, e segue
  // o trilho normal (borderô → BTG → app). Antes ia direto a AUTORIZADO sem
  // borderô = limbo invisível: o operador achava que o lançamento sumiu e
  // cadastrava de novo (caso real, 05/08).
  // Se já está em borderô, preserva o status — rebaixar para CLASSIFICADO o
  // arrancaria do borderô que o operador acabou de montar.
  const novoStatus = lanc.status === "BORDERO" ? "BORDERO" : "CLASSIFICADO";
  const { error } = await supabase
    .from("lancamentos_financeiros")
    .update({
      status: novoStatus,
      dados_extras: { ...dados, excecao_aprovada_por: userId, excecao_aprovada_em: new Date().toISOString() },
    })
    .eq("id", String(id));
  if (error) throw new Error(error.message);
  return json({ ok: true, status: novoStatus, excecao_aprovada: true });

}

// ═══════════════════════════════════════════════════════════
// Sugerir rubricas do histórico (carga inicial — SPEC_P2_5 §3)
// Minera o ledger: favorecido+conta com recorrência mensal viram RASCUNHO
// com valor esperado (mediana), dia de vencimento (moda) e a MESMA conta
// contábil do ERP — pré-requisito da substituição automática de provisões.
// ═══════════════════════════════════════════════════════════
/**
 * Cria uma rubrica a partir de um lançamento já preparado.
 *
 * O operador informa chave PIX ou dados de TED em "Preparar pagamento", e isso
 * grava no lançamento DAQUELE mês. No mês seguinte alguém preenche tudo de novo,
 * do zero. A ponte do lançamento para a rubrica não existia — só o caminho em
 * massa (sugerir_rubricas), que exige histórico de vários meses.
 *
 * Nasce em RASCUNHO, como qualquer rubrica: outro admin aprova. E NÃO vinculamos
 * o lançamento atual — ele já tem o lastro do ERP, e apontar para uma rubrica em
 * rascunho o rebaixaria para "sem lastro", travando um borderô que estava bom.
 */
async function criarRubricaDeLancamento(body: Record<string, unknown>, userId: string) {
  await requireAdmin(userId);
  const { lancamento_id } = body;
  if (!lancamento_id) throw new Error("lancamento_id obrigatório");

  const { data: l } = await supabase
    .from("lancamentos_financeiros")
    .select("*")
    .eq("id", String(lancamento_id))
    .single();
  if (!l) throw new Error("Lançamento não encontrado");
  if (!l.pessoa_nome) throw new Error("Lançamento sem favorecido — não dá para criar rubrica");

  const extras = (l.dados_extras || {}) as Record<string, unknown>;
  const conta = String(extras.conta_numero ?? "");
  if (!conta) throw new Error("Lançamento sem conta do plano — classifique antes de criar a rubrica");

  const nome = String(l.pessoa_nome).trim().toUpperCase();
  const escopoGlobal = body.escopo === "GLOBAL";

  const { data: jaExiste } = await supabase
    .from("rubricas_autorizadas")
    .select("id, status")
    .eq("favorecido_nome", nome)
    .eq("conta_numero", conta)
    .maybeSingle();
  if (jaExiste) {
    throw new Error(`Já existe rubrica para ${nome} nesta conta (${jaExiste.status})`);
  }

  // Forma de pagamento herdada do que o operador acabou de preparar.
  const det = (extras.btg_details || {}) as Record<string, unknown>;
  const tipo = String(extras.btg_payment_type ?? "");
  const pagamento: Record<string, unknown> = {};
  if (tipo === "PIX_KEY" && det.pixKey) {
    pagamento.forma_pagamento = "PIX_KEY";
    pagamento.favorecido_chave = String(det.pixKey);
  } else if (tipo === "TED" && det.bankCode) {
    pagamento.forma_pagamento = "TED";
    pagamento.favorecido_banco = String(det.bankCode);
    pagamento.favorecido_agencia = String(det.branch ?? "");
    pagamento.favorecido_conta = String(det.account ?? "");
    pagamento.favorecido_tipo_conta = String(det.accountType ?? "CC");
  }

  const valor = Number(l.valor);
  const esperado = Number(body.valor_esperado ?? valor);
  // Teto conservador quando não informado: o dobro do esperado. Serve de
  // proteção contra erro grosseiro, e o admin ajusta na aprovação.
  const teto = Number(body.valor_teto ?? esperado * 2);

  const { data: nova, error } = await supabase.from("rubricas_autorizadas").insert({
    cod_empresa: escopoGlobal ? null : l.cod_empresa,
    descricao: String(body.descricao ?? `${nome} — ${l.subcategoria ?? conta}`),
    favorecido_nome: nome,
    favorecido_documento: l.pessoa_documento ?? (det.taxId ? String(det.taxId) : null),
    conta_numero: conta,
    periodicidade: String(body.periodicidade ?? "MENSAL"),
    valor_esperado: Math.round(esperado * 100) / 100,
    tolerancia_pct: Number(body.tolerancia_pct ?? 15),
    valor_teto: Math.round(teto * 100) / 100,
    dia_vencimento: Math.min(28, Math.max(1, Number(
      body.dia_vencimento ?? String(l.data_vencimento).slice(8, 10),
    ) || 10)),
    status: "RASCUNHO",
    criado_por: userId,
    ...pagamento,
  }).select("id").single();

  if (error) throw new Error(error.message);

  return json({
    ok: true,
    rubrica_id: nova.id,
    herdou_forma_pagamento: Object.keys(pagamento).length > 0,
    mensagem: "Rubrica criada em rascunho — outro admin precisa aprovar antes de ela servir de lastro",
  });
}

async function sugerirRubricas(body: Record<string, unknown>, userId: string) {
  await requireAdmin(userId);
  const codEmpresa = body.cod_empresa ? Number(body.cod_empresa) : null;
  // Quantos meses distintos caracterizam "recorrente".
  //
  // Era fixo em 4, o que devolvia zero para quem acabou de começar a importar o
  // ERP — e sem explicação, parecia que a função não funcionava. Configurável, e
  // o retorno agora diz quantos grupos ficaram de fora por qual motivo.
  const mesesMin = Math.max(2, Math.min(12, Number(body.meses_min ?? 3)));

  const desde = new Date();
  desde.setMonth(desde.getMonth() - 12);

  let q = supabase
    .from("lancamentos_financeiros")
    .select("cod_empresa, pessoa_nome, pessoa_documento, valor, data_vencimento, dados_extras, natureza, origem")
    .eq("tipo", "PAGAR")
    .in("origem", ["ERP", "MANUAL"])
    .gte("data_vencimento", desde.toISOString().slice(0, 10))
    .not("pessoa_nome", "is", null)
    .limit(20000);
  if (codEmpresa) q = q.eq("cod_empresa", codEmpresa);
  const { data: lancs, error } = await q;
  if (error) throw new Error(error.message);

  // Agrupa por empresa + favorecido + conta contábil
  interface Grupo {
    emp: number; nome: string; doc: string | null; conta: string;
    valores: number[]; dias: number[]; meses: Set<string>;
    // Forma de pagamento do lançamento mais recente do grupo: a rubrica nasce
    // sabendo COMO se paga, e a provisão mensal não precisa de redigitação.
    ultimaData: string; pagamento: Record<string, unknown>;
  }
  const grupos = new Map<string, Grupo>();
  for (const l of (lancs || [])) {
    const conta = String((l.dados_extras as Record<string, unknown>)?.conta_numero ?? "");
    if (!conta || !l.pessoa_nome || !l.data_vencimento) continue;
    const nome = String(l.pessoa_nome).trim().toUpperCase();
    const k = `${l.cod_empresa}|${nome}|${conta}`;
    const g = grupos.get(k) ?? {
      emp: l.cod_empresa, nome, doc: l.pessoa_documento ?? null, conta,
      valores: [], dias: [], meses: new Set<string>(),
      ultimaData: "", pagamento: {},
    };

    const extras = (l.dados_extras || {}) as Record<string, unknown>;
    const dataStr = String(l.data_vencimento);
    if (extras.btg_payment_type && dataStr > g.ultimaData) {
      g.ultimaData = dataStr;
      const det = (extras.btg_details || {}) as Record<string, unknown>;
      const tipo = String(extras.btg_payment_type);
      if (tipo === "PIX_KEY" && det.pixKey) {
        g.pagamento = { forma_pagamento: "PIX_KEY", favorecido_chave: String(det.pixKey) };
      } else if (tipo === "TED" && det.bankCode) {
        g.pagamento = {
          forma_pagamento: "TED",
          favorecido_banco: String(det.bankCode),
          favorecido_agencia: String(det.branch ?? ""),
          favorecido_conta: String(det.account ?? ""),
          favorecido_tipo_conta: String(det.accountType ?? "CC"),
        };
      }
      // Boleto fica de fora: a linha digitável muda a cada competência.
    }
    g.valores.push(Number(l.valor));
    g.dias.push(Number(String(l.data_vencimento).slice(8, 10)));
    g.meses.add(String(l.data_vencimento).slice(0, 7));
    if (l.pessoa_documento) g.doc = l.pessoa_documento;
    grupos.set(k, g);
  }

  // Rubricas já existentes (não duplicar sugestão)
  const { data: existentes } = await supabase
    .from("rubricas_autorizadas")
    .select("cod_empresa, favorecido_nome, conta_numero");
  const jaTem = new Set((existentes || []).map((r) =>
    `${r.cod_empresa ?? "G"}|${String(r.favorecido_nome).trim().toUpperCase()}|${r.conta_numero}`));

  const mediana = (v: number[]) => { const s = [...v].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
  const moda = (v: number[]) => {
    const c = new Map<number, number>();
    for (const x of v) c.set(x, (c.get(x) || 0) + 1);
    return [...c.entries()].sort((a, b) => b[1] - a[1])[0][0];
  };

  const sugestoes: Record<string, unknown>[] = [];
  let poucoHistorico = 0;
  let jaCadastradas = 0;

  for (const g of grupos.values()) {
    if (g.meses.size < mesesMin) { poucoHistorico++; continue; }
    if (jaTem.has(`${g.emp}|${g.nome}|${g.conta}`) || jaTem.has(`G|${g.nome}|${g.conta}`)) { jaCadastradas++; continue; }
    const esperado = mediana(g.valores);
    sugestoes.push({
      cod_empresa: g.emp,
      descricao: `${g.nome} (sugerida do histórico)`,
      favorecido_nome: g.nome,
      favorecido_documento: g.doc,
      conta_numero: g.conta,
      periodicidade: "MENSAL",
      valor_esperado: Math.round(esperado * 100) / 100,
      tolerancia_pct: 15,
      valor_teto: Math.round(esperado * 2 * 100) / 100, // teto conservador: 2x a mediana — revisar na aprovação
      dia_vencimento: Math.min(28, moda(g.dias)),
      status: "RASCUNHO",
      criado_por: userId,
      ...g.pagamento,
    });
  }

  if (sugestoes.length > 0) {
    const { error: insErr } = await supabase.from("rubricas_autorizadas").insert(sugestoes);
    if (insErr) throw new Error(insErr.message);
  }

  return json({
    ok: true,
    grupos_analisados: grupos.size,
    sugeridas: sugestoes.length,
    meses_min: mesesMin,
    // Diagnóstico: sem isto, "0 sugeridas" não distingue "não há recorrentes"
    // de "o critério está apertado demais para o histórico que existe".
    ignorados_pouco_historico: poucoHistorico,
    ignorados_ja_cadastrados: jaCadastradas,
    com_forma_pagamento: sugestoes.filter((s) => s.forma_pagamento).length,
  });
}
