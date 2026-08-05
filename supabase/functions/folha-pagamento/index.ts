// supabase/functions/folha-pagamento/index.ts
// Folha de pagamento — importação, fechamento e envio ao BTG.
//
// Fluxo:
//   1. importar  — planilha do contador vira competência + itens (+ encargos)
//   2. fechar    — cria os lançamentos no contas a pagar e um borderô do tipo
//                  FOLHA, que passa pela mesma aprovação dos demais
//   3. o envio   — feito pelo borderô (financeiro-lancamentos), que roteia para
//                  /banking/payroll/payments quando o tipo é FOLHA
//
// O envio mora no borderô de propósito: assim existe UM lugar que fala com o
// banco e UM fluxo de aprovação, em vez de dois caminhos paralelos divergindo
// com o tempo — que foi exatamente o problema que passamos o dia consertando
// entre btg-pagamentos e financeiro-lancamentos.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, authGuard } from "../_shared/authGuard.ts";
import { cruzarDadosBancarios, type LinhaBancaria } from "../_shared/dadosBancarios.ts";
import {
  ehEventoFolha,
  validarLinha,
  montarEncargos,
  totalizar,
  ROTULO_EVENTO,
  type EventoFolha,
  type LinhaFolha,
  type TipoEncargo,
} from "../_shared/folha.ts";
import { normalizarChavePix } from "../_shared/btgPayment.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function requireAdmin(userId: string) {
  const { data } = await supabase.from("user_roles")
    .select("role").eq("user_id", userId).eq("role", "admin");
  if (!data || data.length === 0) throw new Error("Apenas admin");
}

// ─── importar ────────────────────────────────────────────────
/**
 * Recebe a planilha já parseada pelo front (nome, cpf, banco, valores).
 *
 * Reimportar a mesma (loja, competência, evento) SUBSTITUI os itens em vez de
 * duplicar — planilha de contador costuma vir corrigida duas ou três vezes
 * antes de fechar, e a segunda versão é a que vale.
 */
async function importar(body: Record<string, unknown>, userId: string) {
  const { cod_empresa, competencia, evento, data_pagamento, descricao } = body;
  const linhas = (body.itens as LinhaFolha[]) || [];
  const encargosInformados = (body.encargos || {}) as Partial<Record<TipoEncargo, number>>;

  if (!cod_empresa) throw new Error("cod_empresa obrigatório");
  if (!/^\d{4}-\d{2}$/.test(String(competencia))) throw new Error("competencia deve ser YYYY-MM");
  if (!ehEventoFolha(evento)) throw new Error(`Evento inválido: ${evento}`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(data_pagamento))) throw new Error("data_pagamento deve ser yyyy-MM-dd");
  if (linhas.length === 0) throw new Error("Planilha sem colaboradores");

  // Dados bancários vindos da rubrica do colaborador.
  //
  // A Relação de Totais Líquidos traz nome, CPF e líquido — e nada de banco.
  // Sem isto, toda competência exigiria redigitar agência e conta de todo mundo,
  // que é exatamente onde se erra um dígito e o salário some. A rubrica guarda
  // esses dados uma vez; aqui eles voltam sozinhos.
  const cpfs = [...new Set(linhas.map((l) => String(l.cpf ?? "").replace(/\D/g, "")).filter(Boolean))];
  const porCpf = new Map<string, Record<string, unknown>>();
  if (cpfs.length > 0) {
    const { data: rubs } = await supabase
      .from("rubricas_autorizadas")
      .select("favorecido_documento, favorecido_banco, favorecido_agencia, favorecido_conta, favorecido_tipo_conta, favorecido_chave, forma_pagamento")
      .eq("cod_empresa", Number(cod_empresa))
      .not("folha_evento", "is", null)
      .in("favorecido_documento", cpfs);
    for (const r of (rubs || [])) porCpf.set(String(r.favorecido_documento), r);
  }

  const completadas = linhas.map((l) => {
    const cpf = String(l.cpf ?? "").replace(/\D/g, "");
    const r = porCpf.get(cpf);
    if (!r) return l;
    // A planilha, quando traz o dado, manda: pode ser justamente a correção.
    return {
      ...l,
      banco: l.banco || (r.favorecido_banco as string | null),
      agencia: l.agencia || (r.favorecido_agencia as string | null),
      conta: l.conta || (r.favorecido_conta as string | null),
      tipo_conta: l.tipo_conta || (r.favorecido_tipo_conta as string | null),
      chave_pix: l.chave_pix || (r.favorecido_chave as string | null),
    };
  });

  const validadas = completadas.map(validarLinha);
  const comErro = validadas.filter((l) => l.erros.length > 0);
  if (comErro.length > 0) {
    // Devolve TODOS os problemas de uma vez: corrigir de um em um numa folha de
    // cem pessoas é inviável.
    return json({
      ok: false,
      code: "PLANILHA_INVALIDA",
      error: `${comErro.length} linha(s) com problema`,
      linhas_invalidas: comErro.map((l) => ({ nome: l.nome, cpf: l.cpf, erros: l.erros })),
    });
  }

  const ev = evento as EventoFolha;
  const totais = totalizar(validadas);

  const { data: existente } = await supabase
    .from("folha_competencias")
    .select("id, status")
    .eq("cod_empresa", Number(cod_empresa))
    .eq("competencia", String(competencia))
    .eq("evento", ev)
    .neq("status", "CANCELADA")
    .maybeSingle();

  if (existente && existente.status !== "RASCUNHO") {
    throw new Error(
      `Já existe folha de ${ROTULO_EVENTO[ev]} para ${competencia} em ${existente.status}. ` +
      `Cancele antes de reimportar.`,
    );
  }

  let competenciaId = existente?.id as string | undefined;

  if (competenciaId) {
    await supabase.from("folha_competencias").update({
      data_pagamento: String(data_pagamento),
      descricao: descricao ? String(descricao) : null,
      ...totais,
    }).eq("id", competenciaId);
    // Substitui itens e encargos — a versão nova da planilha manda.
    await supabase.from("folha_itens").delete().eq("competencia_id", competenciaId);
    await supabase.from("folha_encargos").delete().eq("competencia_id", competenciaId);
  } else {
    const { data: nova, error } = await supabase.from("folha_competencias").insert({
      cod_empresa: Number(cod_empresa),
      competencia: String(competencia),
      evento: ev,
      descricao: descricao ? String(descricao) : `${ROTULO_EVENTO[ev]} ${competencia}`,
      data_pagamento: String(data_pagamento),
      status: "RASCUNHO",
      criado_por: userId,
      ...totais,
    }).select("id").single();
    if (error) throw new Error(error.message);
    competenciaId = nova.id;
  }

  const { error: itErr } = await supabase.from("folha_itens").insert(
    validadas.map((l) => ({
      competencia_id: competenciaId,
      nome: l.nome.trim(),
      cpf: l.cpf,
      matricula: l.matricula ?? null,
      banco: l.banco ?? null,
      agencia: l.agencia ?? null,
      conta: l.conta ?? null,
      tipo_conta: l.tipo_conta ?? "CC",
      chave_pix: l.chave_pix ?? null,
      valor_bruto: Number(l.valor_bruto ?? 0),
      descontos: Number(l.descontos ?? 0),
      valor_liquido: Number(l.valor_liquido),
    })),
  );
  if (itErr) throw new Error(itErr.message);

  const encargos = montarEncargos(String(competencia), encargosInformados);
  if (encargos.length > 0) {
    await supabase.from("folha_encargos").insert(
      encargos.map((e) => ({ competencia_id: competenciaId, ...e })),
    );
  }

  // Quem ficou sem banco/agência/conta não pode ser pago: avisamos agora, na
  // importação, e não no envio do borderô.
  const semConta = validadas
    .filter((l) => !(l.banco && l.agencia && l.conta))
    .map((l) => ({ nome: l.nome, cpf: l.cpf }));

  return json({
    ok: true,
    competencia_id: competenciaId,
    ...totais,
    encargos: encargos.length,
    substituiu: !!existente,
    herdados_da_rubrica: validadas.filter((l) => porCpf.has(l.cpf)).length,
    sem_dados_bancarios: semConta,
  });
}

// ─── listar / detalhe ────────────────────────────────────────
async function listar(body: Record<string, unknown>) {
  let q = supabase.from("folha_competencias").select("*")
    .order("competencia", { ascending: false })
    .order("created_at", { ascending: false });
  if (body.cod_empresa) q = q.eq("cod_empresa", Number(body.cod_empresa));
  if (body.status) q = q.eq("status", String(body.status));
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return json(data || []);
}

async function detalhe(body: Record<string, unknown>) {
  const id = String(body.competencia_id || "");
  if (!id) throw new Error("competencia_id obrigatório");

  const { data: comp } = await supabase.from("folha_competencias").select("*").eq("id", id).single();
  if (!comp) throw new Error("Folha não encontrada");

  const { data: itens } = await supabase.from("folha_itens")
    .select("*").eq("competencia_id", id).order("nome");
  const { data: encargos } = await supabase.from("folha_encargos")
    .select("*").eq("competencia_id", id).order("data_vencimento");

  return json({ competencia: comp, itens: itens || [], encargos: encargos || [] });
}

// ─── fechar ──────────────────────────────────────────────────
/**
 * Fecha a folha: cria os lançamentos no contas a pagar e o borderô do tipo
 * FOLHA já montado.
 *
 * O líquido de cada colaborador vira um lançamento (decisão da casa: folha
 * aberta, sem consolidação). Os encargos viram títulos próprios, com o
 * vencimento legal de cada um — assim o custo do mês aparece inteiro no DRE
 * mesmo antes de a guia ser emitida, e não entram no borderô de folha porque
 * são pagos por guia/DARF.
 */
async function fechar(body: Record<string, unknown>, userId: string) {
  await requireAdmin(userId);
  const id = String(body.competencia_id || "");
  if (!id) throw new Error("competencia_id obrigatório");

  const { data: comp } = await supabase.from("folha_competencias").select("*").eq("id", id).single();
  if (!comp) throw new Error("Folha não encontrada");
  if (comp.status !== "RASCUNHO") throw new Error(`Folha já está ${comp.status}`);

  const { data: itens } = await supabase.from("folha_itens").select("*").eq("competencia_id", id);
  if (!itens || itens.length === 0) throw new Error("Folha sem colaboradores");

  const ev = comp.evento as EventoFolha;
  const rotulo = ROTULO_EVENTO[ev] ?? ev;

  // Como o dinheiro sai.
  //
  // FOLHA usa POST /banking/payroll/payments, que exige o escopo `payroll` — e
  // esse escopo depende de liberação do BTG e de conta salário. Enquanto isso
  // não sai, PIX_INDIVIDUAL paga cada colaborador por Pix com os dados
  // bancários, num borderô comum. Mesmo dinheiro, mesma conferência, caminho
  // que já funciona hoje.
  const modo = String(body.modo_pagamento || "PIX_INDIVIDUAL") === "FOLHA_BTG"
    ? "FOLHA_BTG"
    : "PIX_INDIVIDUAL";
  const ehLoteFolha = modo === "FOLHA_BTG";

  // Sem banco/agência/conta ninguém é pago, nos dois modos.
  const semConta = itens.filter((i: Record<string, unknown>) => !(i.banco && i.agencia && i.conta));
  if (semConta.length > 0) {
    return json({
      ok: false,
      code: "SEM_DADOS_BANCARIOS",
      error: `${semConta.length} colaborador(es) sem banco, agência ou conta`,
      colaboradores: semConta.map((i: Record<string, unknown>) => ({ nome: i.nome, cpf: i.cpf })),
    });
  }

  // 1. Borderô — passa pela mesma aprovação dos demais.
  const { data: bordero, error: bErr } = await supabase.from("borderos").insert({
    cod_empresa: comp.cod_empresa,
    tipo: ehLoteFolha ? "FOLHA" : "NORMAL",
    folha_competencia_id: id,
    descricao: `${rotulo} ${comp.competencia}`,
    data_pagamento: comp.data_pagamento,
    modo_data: "DATA_UNICA",
    status: "MONTAGEM",
    criado_por: userId,
    qtd_lancamentos: itens.length,
    total_valor: Number(comp.total_liquido),
  }).select().single();
  if (bErr) throw new Error(bErr.message);

  // 2. Um lançamento por colaborador, já no borderô.
  let criados = 0;
  for (const it of itens) {
    const { data: lanc, error } = await supabase.from("lancamentos_financeiros").insert({
      cod_empresa: comp.cod_empresa,
      tipo: "PAGAR",
      descricao: `${rotulo} ${comp.competencia} — ${it.nome}`,
      pessoa_nome: it.nome,
      pessoa_documento: it.cpf,
      valor: Number(it.valor_liquido),
      data_vencimento: comp.data_pagamento,
      natureza: "DESPESAS_OPERACIONAIS",
      categoria: "PESSOAL",
      subcategoria: rotulo,
      origem: "FOLHA",
      origem_id: `FOLHA:${id}:${it.id}`,
      bordero_id: bordero.id,
      status: "BORDERO",
      criado_por: userId,
      dados_extras: {
        folha_competencia_id: id,
        folha_item_id: it.id,
        folha_evento: ev,
        banco: it.banco,
        agencia: it.agencia,
        conta: it.conta,
        chave_pix: it.chave_pix,
        // No modo Pix o lançamento já sai preparado: o operador não precisa
        // abrir "Preparar pagamento" em cada colaborador.
        ...(ehLoteFolha ? {} : {
          btg_payment_type: "PIX_MANUAL",
          btg_details: {
            bankCode: it.banco,
            branch: it.agencia,
            account: it.conta,
            accountType: it.tipo_conta || "CC",
            name: it.nome,
            taxId: it.cpf,
          },
        }),
      },
    }).select("id").single();

    if (!error && lanc) {
      await supabase.from("folha_itens").update({ lancamento_id: lanc.id }).eq("id", it.id);
      criados++;
    }
  }

  // 3. Encargos: títulos avulsos, fora do borderô de folha (vão por guia/DARF).
  const { data: encargos } = await supabase.from("folha_encargos").select("*").eq("competencia_id", id);
  let encargosCriados = 0;
  for (const e of (encargos || [])) {
    const { data: lanc, error } = await supabase.from("lancamentos_financeiros").insert({
      cod_empresa: comp.cod_empresa,
      tipo: "PAGAR",
      descricao: e.descricao || `${e.tipo} — folha ${comp.competencia}`,
      valor: Number(e.valor),
      data_vencimento: e.data_vencimento,
      natureza: "DESPESAS_OPERACIONAIS",
      categoria: "ENCARGOS",
      subcategoria: e.tipo,
      origem: "FOLHA",
      origem_id: `FOLHA:${id}:ENCARGO:${e.tipo}`,
      status: "PREVISTO",
      requer_validacao: true, // aguarda a guia com o código de barras
      criado_por: userId,
      dados_extras: { folha_competencia_id: id, encargo_tipo: e.tipo },
    }).select("id").single();
    if (!error && lanc) {
      await supabase.from("folha_encargos").update({ lancamento_id: lanc.id }).eq("id", e.id);
      encargosCriados++;
    }
  }

  await supabase.from("folha_competencias").update({
    status: "FECHADA",
    fechado_por: userId,
    fechado_em: new Date().toISOString(),
  }).eq("id", id);

  return json({
    ok: true,
    bordero_id: bordero.id,
    modo_pagamento: modo,
    lancamentos: criados,
    encargos: encargosCriados,
    total_liquido: Number(comp.total_liquido),
  });
}

// ─── cancelar ────────────────────────────────────────────────
async function cancelar(body: Record<string, unknown>, userId: string) {
  await requireAdmin(userId);
  const id = String(body.competencia_id || "");
  if (!id) throw new Error("competencia_id obrigatório");

  const { data: comp } = await supabase.from("folha_competencias").select("status").eq("id", id).single();
  if (!comp) throw new Error("Folha não encontrada");
  if (!["RASCUNHO", "FECHADA"].includes(comp.status)) {
    throw new Error(`Folha em ${comp.status} não pode ser cancelada — já foi ao banco`);
  }

  // Cancela os lançamentos gerados que ainda não foram pagos.
  await supabase.from("lancamentos_financeiros")
    .update({ status: "CANCELADO", bordero_id: null })
    .like("origem_id", `FOLHA:${id}:%`)
    .not("status", "in", "(BAIXADO,PROCESSANDO)");

  await supabase.from("borderos").update({ status: "CANCELADO" }).eq("folha_competencia_id", id);
  await supabase.from("folha_competencias").update({ status: "CANCELADA" }).eq("id", id);

  return json({ ok: true });
}

// ─── criar_rubricas ──────────────────────────────────────────
/**
 * Uma rubrica por colaborador, criada em massa a partir da competência.
 *
 * A rubrica é o cadastro de colaborador que não temos. Ela guarda os dados
 * bancários (que o relatório da contabilidade não traz), sustenta a média dos
 * últimos meses e faz o selo de governança funcionar — um salário fora da faixa
 * passa a parar na Mesa, como qualquer outra despesa.
 *
 * Idempotente por (loja, CPF, evento): rodar de novo atualiza o valor esperado
 * em vez de duplicar. Nasce em RASCUNHO — quem aprova é outra pessoa, e não é
 * este endpoint que fura a segregação.
 */
async function criarRubricas(body: Record<string, unknown>, userId: string) {
  await requireAdmin(userId);
  const id = String(body.competencia_id || "");
  if (!id) throw new Error("competencia_id obrigatório");

  const { data: comp } = await supabase.from("folha_competencias").select("*").eq("id", id).single();
  if (!comp) throw new Error("Folha não encontrada");

  const { data: itens } = await supabase.from("folha_itens").select("*").eq("competencia_id", id);
  if (!itens || itens.length === 0) throw new Error("Folha sem colaboradores");

  const ev = comp.evento as EventoFolha;
  const rotulo = ROTULO_EVENTO[ev] ?? ev;
  const contaNumero = String(body.conta_numero || "");
  if (!contaNumero) {
    throw new Error("conta_numero obrigatório — é a conta do plano do DRE onde a folha é classificada");
  }

  const cpfs = itens.map((i: Record<string, unknown>) => String(i.cpf));
  const { data: existentes } = await supabase
    .from("rubricas_autorizadas")
    .select("id, favorecido_documento, valor_esperado")
    .eq("cod_empresa", comp.cod_empresa)
    .eq("folha_evento", ev)
    .in("favorecido_documento", cpfs);
  const porCpf = new Map((existentes || []).map((r: Record<string, unknown>) => [String(r.favorecido_documento), r]));

  // O dia do vencimento sai da data de pagamento da folha; 28 é o teto para não
  // criar dia inexistente em fevereiro.
  const diaVencimento = Math.min(28, Number(String(comp.data_pagamento).slice(8, 10)) || 5);

  let criadas = 0;
  let atualizadas = 0;
  const erros: string[] = [];

  for (const it of itens) {
    const liquido = Number(it.valor_liquido);
    const campos = {
      cod_empresa: comp.cod_empresa,
      descricao: `${rotulo} — ${it.nome}`,
      favorecido_nome: it.nome,
      favorecido_documento: String(it.cpf),
      favorecido_chave: it.chave_pix ?? null,
      favorecido_banco: it.banco ?? null,
      favorecido_agencia: it.agencia ?? null,
      favorecido_conta: it.conta ?? null,
      favorecido_tipo_conta: it.tipo_conta ?? "CC",
      forma_pagamento: "PIX_MANUAL",
      folha_evento: ev,
      conta_numero: contaNumero,
      periodicidade: "MENSAL",
      dia_vencimento: diaVencimento,
      valor_esperado: liquido,
      // Salário varia com hora extra, falta e comissão: 10% de banda é apertado
      // demais e faria toda folha cair na Mesa. O teto protege o extremo.
      tolerancia_pct: 20,
      valor_teto: Math.round(liquido * 1.5 * 100) / 100,
    };

    const ja = porCpf.get(String(it.cpf));
    if (ja) {
      const { error } = await supabase.from("rubricas_autorizadas").update({
        ...campos,
        // Não mexe em vigência nem em status: rubrica já aprovada continua
        // aprovada, e reimportar a folha não pode reabrir a autorização.
      }).eq("id", ja.id);
      if (error) erros.push(`${it.nome}: ${error.message}`);
      else atualizadas++;
    } else {
      const { error } = await supabase.from("rubricas_autorizadas").insert({
        ...campos,
        status: "RASCUNHO",
        criado_por: userId,
      });
      if (error) erros.push(`${it.nome}: ${error.message}`);
      else criadas++;
    }
  }

  return json({ ok: true, criadas, atualizadas, erros });
}

// ─── atualizar dados bancários de UM colaborador ─────────────
/**
 * Corrigir a chave Pix (ou a conta) de um colaborador sem cancelar a
 * competência e recolar a planilha inteira — que era o único caminho antes.
 *
 * A correção também sobe para a rubrica autorizada do CPF, para a próxima folha
 * já nascer certa. Mudar a chave da rubrica reabre a aprovação dela por
 * trigger (fn_rubrica_reaprovacao), e isso é proposital: dado bancário novo
 * passa por quatro olhos.
 */
async function atualizarDadosBancarios(body: Record<string, unknown>, userId: string) {
  await requireAdmin(userId);
  const itemId = String(body.item_id || "");
  if (!itemId) throw new Error("item_id obrigatório");

  const { data: item } = await supabase.from("folha_itens")
    .select("*, folha_competencias!inner(id, status, cod_empresa)")
    .eq("id", itemId).single();
  if (!item) throw new Error("Colaborador não encontrado nesta folha");

  const comp = (item as Record<string, unknown>).folha_competencias as
    { id: string; status: string; cod_empresa: number };
  if (comp.status !== "RASCUNHO") {
    throw new Error(
      `A folha está ${comp.status} — os lançamentos já foram gerados. ` +
      `Ajuste o favorecido no lançamento/borderô ou cancele a folha.`,
    );
  }

  const chaveBruta = String(body.chave_pix ?? "").trim();
  let chave: string | null = null;
  if (chaveBruta) {
    // Mesma normalização do envio ao banco: erro de chave aparece aqui, não no
    // 400 do BTG depois de o borderô estar aprovado.
    chave = normalizarChavePix(chaveBruta);
  }

  const banco = String(body.banco ?? "").trim() || null;
  const agencia = String(body.agencia ?? "").trim() || null;
  const conta = String(body.conta ?? "").trim() || null;
  const tipoConta = String(body.tipo_conta ?? "").trim() || null;

  if (!chave && !(banco && agencia && conta)) {
    throw new Error("Informe a chave Pix ou banco + agência + conta completos");
  }

  const { error: upErr } = await supabase.from("folha_itens").update({
    chave_pix: chave,
    banco, agencia, conta,
    tipo_conta: tipoConta,
  }).eq("id", itemId);
  if (upErr) throw new Error(upErr.message);

  // Propaga para a rubrica do CPF, se existir.
  let rubricaAtualizada = false;
  const cpf = String((item as Record<string, unknown>).cpf ?? "");
  if (cpf) {
    const { data: rub } = await supabase.from("rubricas_autorizadas")
      .select("id").eq("cod_empresa", comp.cod_empresa)
      .eq("favorecido_documento", cpf).limit(1);
    if (rub && rub.length > 0) {
      const { error } = await supabase.from("rubricas_autorizadas").update({
        favorecido_chave: chave,
        favorecido_banco: banco,
        favorecido_agencia: agencia,
        favorecido_conta: conta,
        favorecido_tipo_conta: tipoConta,
        forma_pagamento: chave ? "PIX" : "TED",
      }).eq("id", rub[0].id);
      rubricaAtualizada = !error;
    }
  }

  return json({ ok: true, chave_pix: chave, rubrica_atualizada: rubricaAtualizada });
}


// ─── importar_dados_bancarios ────────────────────────────────
/**
 * Planilha de banco/agência/conta cruzada com os colaboradores da folha.
 *
 * Grava nos dois lugares de propósito: no item da competência, para esta folha
 * poder fechar; e na rubrica do colaborador, para a competência seguinte já vir
 * preenchida. É a rubrica que faz o dado sobreviver ao mês.
 *
 * Nada é gravado quando o casamento é duvidoso — homônimo sem CPF fica de fora e
 * aparece no relatório de volta. Dado bancário na pessoa errada manda o salário
 * para a conta errada, e isso não se desfaz com um clique.
 */
async function importarDadosBancarios(body: Record<string, unknown>, userId: string) {
  await requireAdmin(userId);
  const id = String(body.competencia_id || "");
  const linhas = (body.linhas as LinhaBancaria[]) || [];
  if (!id) throw new Error("competencia_id obrigatório");
  if (linhas.length === 0) throw new Error("Planilha sem linhas");

  const { data: comp } = await supabase.from("folha_competencias").select("*").eq("id", id).single();
  if (!comp) throw new Error("Folha não encontrada");

  const { data: itens } = await supabase
    .from("folha_itens").select("id, nome, cpf").eq("competencia_id", id);
  if (!itens || itens.length === 0) throw new Error("Folha sem colaboradores");

  const r = cruzarDadosBancarios(
    linhas,
    itens.map((i: Record<string, unknown>) => ({ id: String(i.id), nome: String(i.nome), cpf: String(i.cpf) })),
  );

  const erros: string[] = [];
  let rubricasAtualizadas = 0;

  for (const c of r.casados) {
    const { error } = await supabase.from("folha_itens").update({
      banco: c.dados.banco,
      agencia: c.dados.agencia,
      conta: c.dados.conta,
      tipo_conta: c.dados.tipo_conta,
      chave_pix: c.dados.chave_pix ?? null,
    }).eq("id", c.alvo.id);
    if (error) { erros.push(`${c.alvo.nome}: ${error.message}`); continue; }

    // A rubrica é o cadastro que atravessa competências.
    const { data: rub } = await supabase
      .from("rubricas_autorizadas")
      .select("id")
      .eq("cod_empresa", comp.cod_empresa)
      .eq("folha_evento", comp.evento)
      .eq("favorecido_documento", c.alvo.cpf)
      .maybeSingle();

    if (rub) {
      const { error: rErr } = await supabase.from("rubricas_autorizadas").update({
        favorecido_banco: c.dados.banco,
        favorecido_agencia: c.dados.agencia,
        favorecido_conta: c.dados.conta,
        favorecido_tipo_conta: c.dados.tipo_conta,
        favorecido_chave: c.dados.chave_pix ?? null,
        forma_pagamento: "PIX_MANUAL",
      }).eq("id", rub.id);
      if (rErr) erros.push(`rubrica de ${c.alvo.nome}: ${rErr.message}`);
      else rubricasAtualizadas++;
    }
  }

  return json({
    ok: true,
    casados: r.casados.length,
    por_cpf: r.casados.filter((c) => c.por === "CPF").length,
    por_nome: r.casados.filter((c) => c.por === "NOME").length,
    rubricas_atualizadas: rubricasAtualizadas,
    ambiguos: r.ambiguos,
    sem_correspondente: r.sem_correspondente.length,
    nao_cobertos: r.nao_cobertos.map((a) => ({ nome: a.nome, cpf: a.cpf })),
    erros,
  });
}

// ─── MAIN ────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const auth = await authGuard(req, { requiredRole: "authenticated" });
    const body = await req.json();

    switch (body.action) {
      case "importar": return await importar(body, auth.userId);
      case "listar": return await listar(body);
      case "detalhe": return await detalhe(body);
      case "criar_rubricas": return await criarRubricas(body, auth.userId);
      case "importar_dados_bancarios": return await importarDadosBancarios(body, auth.userId);
      case "fechar": return await fechar(body, auth.userId);
      case "cancelar": return await cancelar(body, auth.userId);
      case "atualizar_dados_bancarios": return await atualizarDadosBancarios(body, auth.userId);
      default:
        return json({ error: `Ação desconhecida: '${body.action}'. Use: importar, listar, detalhe, criar_rubricas, importar_dados_bancarios, fechar, cancelar, atualizar_dados_bancarios` }, 400);
    }
  } catch (err) {
    console.error("[folha-pagamento]", err);
    return json({ error: err instanceof Error ? err.message : "Erro interno" }, 500);
  }
});
