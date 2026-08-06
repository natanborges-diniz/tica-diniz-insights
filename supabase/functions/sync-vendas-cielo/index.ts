// Ingestao do Extrato Eletronico Cielo (layout v15) -> base de conciliacao.
//
// Duas origens, mesmo pipeline:
//   API    — chama cielo-extrato-proxy (OAuth + mTLS) e recebe o arquivo
//   UPLOAD — recebe o arquivo em base64 (usado enquanto o mTLS nao esta de pe)
//
// Grava a camada crua (cielo_urs, cielo_lancamentos, cielo_pix) e deriva a
// camada de conciliacao (vendas_cartao, recebiveis_cartao), que e compartilhada
// com a REDE. Idempotente: reexecutar o mesmo arquivo nao duplica nada.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  parseExtratoCielo,
  chaveRastreioVenda,
  chaveUrLancamento,
  modalidadeVenda,
  statusVenda,
  LANCAMENTOS_VENDA,
  LANCAMENTOS_AJUSTE_VENDA,
  type CieloExtratoParsed,
  type CieloRegistroE,
} from "../_shared/cieloLayout15.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LOTE = 500;

interface CieloConfig {
  cod_empresa: number;
  ambiente: string;
  cielo_estabelecimento_matriz: string | null;
  cielo_pvs: string[] | null;
  cielo_documento: string | null;
  /** Chave HMAC do estabelecimento raiz. Nula = usa o secret global. */
  cielo_hmac_key: string | null;
}

// ---------------------------------------------------------------------------
// Utilitarios
// ---------------------------------------------------------------------------

async function sha256Bytes(bytes: Uint8Array): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Os arquivos da Cielo sao texto de byte unico (ASCII com acentuacao latin-1).
 * Decodificar como utf-8 transformaria cada acento em U+FFFD silenciosamente, o
 * que corrompe descricoes e — pior — o hash usado para deduplicar arquivos.
 */
function decodeLatin1(bytes: Uint8Array): string {
  return new TextDecoder("iso-8859-1").decode(bytes);
}

function base64ParaBytes(b64: string): Uint8Array {
  const bin = atob(b64.replace(/\s/g, ""));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function emLotes<T>(itens: T[], fn: (lote: T[]) => Promise<void>): Promise<void> {
  for (let i = 0; i < itens.length; i += LOTE) {
    await fn(itens.slice(i, i + LOTE));
  }
}

/**
 * Remove duplicatas pela chave de conflito, mantendo a ultima ocorrencia.
 *
 * Sem isso, dois registros do mesmo arquivo que colidam na chave unica fazem o
 * Postgres abortar o lote inteiro com "ON CONFLICT DO UPDATE command cannot
 * affect row a second time" — cenario real quando uma UR e reenviada dentro do
 * proprio arquivo (registro D, indicativo de reenvio = "S").
 */
function dedupPorChave<T extends Record<string, unknown>>(
  linhas: T[],
  chave: (l: T) => string,
): { linhas: T[]; duplicatas: number } {
  const mapa = new Map<string, T>();
  for (const l of linhas) mapa.set(chave(l), l);
  return { linhas: [...mapa.values()], duplicatas: linhas.length - mapa.size };
}

/** Normaliza numero de estabelecimento para comparacao (zeros a esquerda). */
function normalizaPv(pv: string | null | undefined): string {
  const v = String(pv ?? "").trim();
  return v.replace(/^0+/, "") || v;
}

/**
 * Mapeia estabelecimento submissor -> cod_empresa.
 * O PV da filial e a chave primaria; a matriz de extrato so entra como fallback
 * quando ha uma unica loja sob ela, para nao atribuir venda a loja errada.
 */
function montarMapaPv(configs: CieloConfig[]): {
  porPv: Record<string, number>;
  porMatriz: Record<string, number[]>;
  colisoes: string[];
} {
  const porPv: Record<string, number> = {};
  const porMatriz: Record<string, number[]> = {};
  const colisoes: string[] = [];

  for (const c of configs) {
    for (const pv of c.cielo_pvs || []) {
      if (!pv) continue;
      const k = normalizaPv(pv);
      if (porPv[k] !== undefined && porPv[k] !== c.cod_empresa) {
        // Um PV so pode pertencer a uma loja. Se aparecer em duas configuracoes
        // e erro de cadastro, e silenciar isso significa atribuir venda a loja
        // errada sem deixar rastro.
        colisoes.push(`PV ${k}: empresas ${porPv[k]} e ${c.cod_empresa}`);
        continue;
      }
      porPv[k] = c.cod_empresa;
    }
    if (c.cielo_estabelecimento_matriz) {
      const k = normalizaPv(c.cielo_estabelecimento_matriz);
      (porMatriz[k] ||= []).push(c.cod_empresa);
    }
  }
  return { porPv, porMatriz, colisoes };
}

function resolverEmpresa(
  estabelecimento: string,
  matrizArquivo: string,
  mapa: ReturnType<typeof montarMapaPv>,
): number | null {
  const direto = mapa.porPv[normalizaPv(estabelecimento)];
  if (direto) return direto;

  const lojas = mapa.porMatriz[normalizaPv(matrizArquivo)];
  return lojas && lojas.length === 1 ? lojas[0] : null;
}

// ---------------------------------------------------------------------------
// Persistencia
// ---------------------------------------------------------------------------

interface ResultadoArquivo {
  nome_arquivo: string;
  tipo_arquivo: string;
  arquivo_id: string | null;
  ja_processado: boolean;
  rejeitado: boolean;
  validacao: CieloExtratoParsed["validacao"];
  urs: number;
  lancamentos: number;
  pix: number;
  vendas_upsert: number;
  recebiveis_upsert: number;
  recebiveis_liquidados: number;
  vendas_ajustadas: number;
  duplicatas_no_arquivo: number;
  sem_mapeamento: Record<string, number>;
  colisoes_pv: string[];
}

async function processarArquivo(
  db: SupabaseClient,
  bytes: Uint8Array,
  nomeArquivo: string,
  origem: "API" | "UPLOAD",
  configs: CieloConfig[],
  importadoPor: string | null,
  aceitarComDivergencia: boolean,
  forcarReprocessamento: boolean,
): Promise<ResultadoArquivo> {
  const conteudo = decodeLatin1(bytes);
  const parsed = parseExtratoCielo(conteudo);
  const h = parsed.header;
  const hash = await sha256Bytes(bytes);
  const mapa = montarMapaPv(configs);

  const base: ResultadoArquivo = {
    nome_arquivo: nomeArquivo,
    tipo_arquivo: h.tipoArquivo,
    arquivo_id: null,
    ja_processado: false,
    rejeitado: false,
    validacao: parsed.validacao,
    urs: 0,
    lancamentos: 0,
    pix: 0,
    vendas_upsert: 0,
    recebiveis_upsert: 0,
    recebiveis_liquidados: 0,
    vendas_ajustadas: 0,
    duplicatas_no_arquivo: 0,
    sem_mapeamento: {},
    colisoes_pv: mapa.colisoes,
  };

  // Divergencia de totalizacao com o trailer significa arquivo truncado ou
  // corrompido. Importar mesmo assim contamina a conciliacao silenciosamente,
  // entao o padrao e recusar e exigir decisao explicita.
  if (!parsed.validacao.ok && !aceitarComDivergencia) {
    base.rejeitado = true;
  }

  // Consulta antes do upsert: o upsert devolve a linha ja com o status novo,
  // entao ele nao serve para descobrir se o arquivo ja tinha sido processado.
  // Os filtros espelham exatamente uq_cielo_arquivo_identidade.
  const { data: existente, error: errExistente } = await db
    .from("cielo_extratos_arquivos")
    .select("id, status, totais")
    .eq("estabelecimento_matriz", h.estabelecimentoMatriz)
    .eq("tipo_arquivo", h.opcaoExtrato)
    .eq("sequencia", h.sequencia)
    .eq("sha256", hash)
    .maybeSingle();

  if (errExistente) {
    throw new Error(`Erro ao verificar importacao anterior: ${errExistente.message}`);
  }

  if (existente?.status === "PROCESSADO") {
    // Reprocessar so faz sentido quando algo ficou por fazer: registros que
    // nao encontraram loja na importacao anterior passam a encontrar depois do
    // cadastro do PV. Sem isso a orientacao "cadastre o PV e reimporte" seria
    // inutil, porque o arquivo cairia sempre neste early return.
    const pendencias = (existente.totais as { sem_mapeamento?: Record<string, number> } | null)
      ?.sem_mapeamento ?? {};
    const temPendencia = Object.keys(pendencias).length > 0;

    if (!forcarReprocessamento && !temPendencia) {
      base.arquivo_id = existente.id;
      base.ja_processado = true;
      return base;
    }
    console.log(
      `[sync-cielo] reprocessando ${nomeArquivo}: forcado=${forcarReprocessamento} pendencias=${Object.keys(pendencias).length}`,
    );
  }

  const semMapeamento: Record<string, number> = {};
  const marcarSemMapa = (pv: string) => {
    semMapeamento[pv] = (semMapeamento[pv] || 0) + 1;
  };

  const { data: arquivo, error: errArquivo } = await db
    .from("cielo_extratos_arquivos")
    .upsert(
      {
        estabelecimento_matriz: h.estabelecimentoMatriz,
        tipo_arquivo: h.opcaoExtrato,
        data_processamento: h.dataProcessamento,
        periodo_inicial: h.periodoInicial,
        periodo_final: h.periodoFinal,
        sequencia: h.sequencia,
        reprocessamento: h.reprocessamento,
        versao_layout: h.versaoLayout,
        hierarquia_cadastro: h.hierarquiaCadastro,
        cadastro_completo: h.cadastroCompleto,
        origem,
        nome_arquivo: nomeArquivo,
        bytes: bytes.length,
        sha256: hash,
        status: base.rejeitado ? "REJEITADO" : "PENDENTE",
        validacao: parsed.validacao,
        importado_por: importadoPor,
      },
      { onConflict: "estabelecimento_matriz,tipo_arquivo,sequencia,sha256" },
    )
    .select("id")
    .single();

  if (errArquivo) throw new Error(`Erro ao registrar arquivo: ${errArquivo.message}`);
  base.arquivo_id = arquivo.id;

  if (base.rejeitado) return base;

  // --- Registros D (UR Agenda) ------------------------------------------------
  const urIdPorChave = new Map<string, string>();

  if (parsed.registrosD.length > 0) {
    const brutas = parsed.registrosD.map((d) => {
      const cod = resolverEmpresa(d.estabelecimentoSubmissor, h.estabelecimentoMatriz, mapa);
      if (!cod) marcarSemMapa(d.estabelecimentoSubmissor);
      return {
        arquivo_id: arquivo.id,
        cod_empresa: cod,
        estabelecimento_submissor: d.estabelecimentoSubmissor,
        chave_ur: d.chaveUr,
        tipo_lancamento: d.tipoLancamento,
        tipo_lancamento_original: d.tipoLancamentoOriginal,
        cpf_cnpj_titular: d.cpfCnpjTitular,
        cpf_cnpj_recebedor: d.cpfCnpjRecebedor,
        bandeira_codigo: d.bandeiraCodigo,
        bandeira: d.bandeira,
        tipo_liquidacao: d.tipoLiquidacao,
        matriz_pagamento: d.matrizPagamento,
        status_pagamento_codigo: d.statusPagamentoCodigo,
        status_pagamento: d.statusPagamento,
        liquidado: d.liquidado,
        valor_bruto: d.valorBruto,
        valor_taxa_administrativa: d.valorTaxaAdministrativa,
        valor_liquido: d.valorLiquido,
        banco: d.banco,
        agencia: d.agencia,
        conta: d.conta,
        digito_conta: d.digitoConta,
        qtd_lancamentos: d.qtdLancamentos,
        data_pagamento: d.dataPagamento,
        data_envio_banco: d.dataEnvioBanco,
        data_vencimento_original: d.dataVencimentoOriginal,
        estabelecimento_pagamento: d.estabelecimentoPagamento,
        lancamento_pendente: d.lancamentoPendente,
        reenvio_pagamento: d.reenvioPagamento,
        negociacao_gravame: d.negociacaoGravame,
        cpf_cnpj_negociador: d.cpfCnpjNegociador,
      };
    });

    const { linhas, duplicatas } = dedupPorChave(
      brutas,
      (l) => `${l.chave_ur}|${l.tipo_lancamento}`,
    );
    base.duplicatas_no_arquivo += duplicatas;

    await emLotes(linhas, async (lote) => {
      const { data, error } = await db
        .from("cielo_urs")
        .upsert(lote, { onConflict: "arquivo_id,chave_ur,tipo_lancamento" })
        .select("id, chave_ur, tipo_lancamento");
      if (error) throw new Error(`Erro ao gravar URs: ${error.message}`);
      for (const r of data || []) {
        urIdPorChave.set(chaveUrLancamento(r.chave_ur, r.tipo_lancamento), r.id);
      }
      base.urs += (data || []).length;
    });
  }

  // --- Registros E (lancamentos) ----------------------------------------------
  if (parsed.registrosE.length > 0) {
    const brutas = parsed.registrosE.map((e) => {
      const cod = resolverEmpresa(e.estabelecimentoSubmissor, h.estabelecimentoMatriz, mapa);
      if (!cod) marcarSemMapa(e.estabelecimentoSubmissor);
      return {
        arquivo_id: arquivo.id,
        ur_id: urIdPorChave.get(chaveUrLancamento(e.chaveUr, e.tipoLancamento)) ?? null,
        cod_empresa: cod,
        tipo_arquivo: h.opcaoExtrato,
        estabelecimento_submissor: e.estabelecimentoSubmissor,
        codigo_transacao_recebida: e.codigoTransacaoRecebida,
        numero_transacao_processada: e.numeroTransacaoProcessada,
        chave_ur: e.chaveUr,
        tipo_lancamento: e.tipoLancamento,
        tipo_lancamento_descricao: e.tipoLancamentoDescricao,
        codigo_ajuste: e.codigoAjuste,
        parcela: e.parcela,
        total_parcelas: e.totalParcelas,
        codigo_autorizacao: e.codigoAutorizacao,
        nsu: e.nsu,
        tid: e.tid,
        codigo_pedido: e.codigoPedido,
        codigo_unico_venda: e.codigoUnicoVenda,
        codigo_original_venda: e.codigoOriginalVenda,
        bandeira_liquidacao_codigo: e.bandeiraLiquidacaoCodigo,
        bandeira_liquidacao: e.bandeiraLiquidacao,
        bandeira_autorizacao_codigo: e.bandeiraAutorizacaoCodigo,
        tipo_liquidacao: e.tipoLiquidacao,
        tipo_transacao: e.tipoTransacao,
        forma_pagamento: e.formaPagamento,
        bin_cartao: e.binCartao,
        final_cartao: e.finalCartao,
        grupo_cartoes: e.grupoCartoes,
        tipo_cartao: e.tipoCartao,
        cartao_estrangeiro: e.cartaoEstrangeiro,
        parcelado_cliente: e.parceladoCliente,
        canal_venda_codigo: e.canalVendaCodigo,
        canal_venda: e.canalVenda,
        numero_terminal: e.numeroTerminal,
        tipo_captura_codigo: e.tipoCapturaCodigo,
        tipo_captura: e.tipoCaptura,
        taxa_mdr_percentual: e.taxaMdrPercentual,
        taxa_ra_percentual: e.taxaRaPercentual,
        taxa_venda_percentual: e.taxaVendaPercentual,
        valor_total_venda: e.valorTotalVenda,
        valor_bruto: e.valorBruto,
        valor_liquido: e.valorLiquido,
        valor_comissao: e.valorComissao,
        valor_tarifa_administrativa: e.valorTarifaAdministrativa,
        valor_tarifa_mdr: e.valorTarifaMdr,
        valor_cielo_promo: e.valorCieloPromo,
        valor_dcc: e.valorDcc,
        data_autorizacao: e.dataAutorizacao,
        data_captura: e.dataCaptura,
        data_lancamento: e.dataLancamento,
        data_original_lancamento: e.dataOriginalLancamento,
        data_vencimento_original: e.dataVencimentoOriginal,
        hora_transacao: e.horaTransacao,
        rejeitada: e.rejeitada,
        motivo_rejeicao: e.motivoRejeicao,
        identificador_efeito_negociacao: e.identificadorEfeitoNegociacao,
        negociacao_com_cielo: e.negociacaoComCielo,
        cpf_cnpj_negociador: e.cpfCnpjNegociador,
        cpf_cnpj_recebedor: e.cpfCnpjRecebedor,
        banco: e.banco,
        agencia: e.agencia,
        conta: e.conta,
        arn: e.arn,
        chave_rastreio: chaveRastreioVenda(e),
      };
    });

    const { linhas, duplicatas } = dedupPorChave(
      brutas,
      (l) => `${l.chave_ur}|${l.tipo_lancamento}|${l.chave_rastreio}`,
    );
    base.duplicatas_no_arquivo += duplicatas;

    await emLotes(linhas, async (lote) => {
      const { error } = await db
        .from("cielo_lancamentos")
        .upsert(lote, { onConflict: "arquivo_id,chave_ur,tipo_lancamento,chave_rastreio" });
      if (error) throw new Error(`Erro ao gravar lancamentos: ${error.message}`);
      base.lancamentos += lote.length;
    });
  }

  // --- Registros 8 (Pix) -------------------------------------------------------
  if (parsed.registros8.length > 0) {
    const brutas = parsed.registros8.map((p) => {
      const cod = resolverEmpresa(p.estabelecimentoSubmissor, h.estabelecimentoMatriz, mapa);
      if (!cod) marcarSemMapa(p.estabelecimentoSubmissor);
      return {
        arquivo_id: arquivo.id,
        cod_empresa: cod,
        estabelecimento_submissor: p.estabelecimentoSubmissor,
        tipo_transacao: p.tipoTransacao,
        id_pix: p.idPix,
        id_pix_original: p.idPixOriginal,
        tx_id: p.txId,
        id_recorrencia: p.idRecorrencia,
        id_pagamento_pix: p.idPagamentoPix,
        nsu: p.nsu,
        nsu_longo: p.nsuLongo,
        data_transacao: p.dataTransacao,
        hora_transacao: p.horaTransacao,
        data_captura: p.dataCaptura,
        data_pagamento: p.dataPagamento,
        data_pagamento_conta_cielo: p.dataPagamentoContaCielo,
        valor_bruto: p.valorBruto,
        valor_taxa_administrativa: p.valorTaxaAdministrativa,
        valor_liquido: p.valorLiquido,
        taxa_administrativa_percentual: p.taxaAdministrativaPercentual,
        tarifa_administrativa: p.tarifaAdministrativa,
        banco: p.banco,
        agencia: p.agencia,
        conta: p.conta,
        canal_venda_codigo: p.canalVendaCodigo,
        numero_terminal: p.numeroTerminal,
        indicativo_troco_saque: p.indicativoTrocoSaque,
        origem_ajuste_codigo: p.origemAjusteCodigo,
        origem_ajuste: p.origemAjuste,
        transferencia_automatica: p.transferenciaAutomatica,
        transferencia_programada: p.transferenciaProgramada,
        status_transferencia_codigo: p.statusTransferenciaCodigo,
        status_transferencia: p.statusTransferencia,
        liquidado: p.liquidado,
      };
    });

    const { linhas, duplicatas } = dedupPorChave(
      brutas,
      (l) => `${l.id_pix}|${l.tipo_transacao}|${l.status_transferencia_codigo}`,
    );
    base.duplicatas_no_arquivo += duplicatas;

    await emLotes(linhas, async (lote) => {
      const { error } = await db
        .from("cielo_pix")
        .upsert(lote, { onConflict: "arquivo_id,id_pix,tipo_transacao,status_transferencia_codigo" });
      if (error) throw new Error(`Erro ao gravar Pix: ${error.message}`);
      base.pix += lote.length;
    });
  }

  // --- Camada derivada ---------------------------------------------------------
  if (h.opcaoExtrato === "03") {
    await derivarVendas(db, parsed, h.estabelecimentoMatriz, mapa, base);
  }
  if (h.opcaoExtrato === "04") {
    await marcarLiquidacoes(db, parsed, base);
  }

  base.sem_mapeamento = semMapeamento;

  const { error: errFinal } = await db
    .from("cielo_extratos_arquivos")
    .update({
      status: "PROCESSADO",
      processado_em: new Date().toISOString(),
      totais: {
        registros_d: parsed.registrosD.length,
        registros_e: parsed.registrosE.length,
        registros_8: parsed.registros8.length,
        ignorados: parsed.registrosIgnorados,
        trailer: parsed.trailer,
        duplicatas_no_arquivo: base.duplicatas_no_arquivo,
        sem_mapeamento: semMapeamento,
      },
    })
    .eq("id", arquivo.id);

  // Falhar aqui em silencio deixaria o arquivo eternamente PENDENTE e ele seria
  // reprocessado a cada tentativa.
  if (errFinal) {
    throw new Error(`Registros gravados, mas nao foi possivel concluir o arquivo: ${errFinal.message}`);
  }

  return base;
}

// ---------------------------------------------------------------------------
// Derivacao: CIELO03 -> vendas_cartao + recebiveis_cartao
// ---------------------------------------------------------------------------

async function derivarVendas(
  db: SupabaseClient,
  parsed: CieloExtratoParsed,
  matriz: string,
  mapa: ReturnType<typeof montarMapaPv>,
  base: ResultadoArquivo,
): Promise<void> {
  const vendas: Record<string, unknown>[] = [];
  const recebiveis: Record<string, unknown>[] = [];
  const ajustes: CieloRegistroE[] = [];

  for (const e of parsed.registrosE) {
    if (LANCAMENTOS_AJUSTE_VENDA.has(e.tipoLancamento)) {
      ajustes.push(e);
      continue;
    }
    if (!LANCAMENTOS_VENDA.has(e.tipoLancamento)) continue;

    const cod = resolverEmpresa(e.estabelecimentoSubmissor, matriz, mapa);
    if (!cod) continue;

    const rastreio = chaveRastreioVenda(e);
    // A "data da venda" no vocabulario da conciliacao e a data em que o cliente
    // passou o cartao — no layout v15 isso e a data de autorizacao. A data de
    // captura fica como fallback para lancamentos sem autorizacao (ex.: voucher).
    const dataVenda = e.dataAutorizacao || e.dataCaptura || e.dataLancamento;
    if (!dataVenda) continue;

    const status = statusVenda(e);

    vendas.push({
      cod_empresa: cod,
      adquirente: "CIELO",
      nsu: e.nsu || null,
      autorizacao: e.codigoAutorizacao || null,
      tid: e.tid || e.codigoTransacaoRecebida || null,
      bandeira: e.bandeiraAutorizacao,
      tipo: modalidadeVenda(e),
      parcelas: e.totalParcelas || 1,
      valor_bruto: Math.abs(e.valorBruto),
      valor_liquido: Math.abs(e.valorLiquido),
      taxa_percentual: e.taxaVendaPercentual || null,
      taxa_valor: Math.abs(e.valorTarifaAdministrativa) || null,
      data_venda: dataVenda,
      data_prevista_credito: e.dataVencimentoOriginal,
      // `status` so entra no payload quando a propria linha carrega a recusa.
      // Numa venda normal ele fica de fora de proposito: o upsert sobrescreveria
      // um CANCELADA/ESTORNADA ja aplicado por um ajuste, devolvendo a venda
      // para APROVADA a cada reimportacao do arquivo.
      ...(status === "APROVADA" ? {} : { status }),
      origem_venda_id: rastreio,
      dados_extras: {
        origem: "CIELO_EXTRATO_V15",
        chave_ur: e.chaveUr,
        codigo_transacao_recebida: e.codigoTransacaoRecebida,
        tipo_lancamento: e.tipoLancamento,
        parcela: e.parcela,
        total_parcelas: e.totalParcelas,
        canal_venda: e.canalVenda,
        tipo_captura: e.tipoCaptura,
        forma_pagamento: e.formaPagamento,
        terminal: e.numeroTerminal,
        estabelecimento: e.estabelecimentoSubmissor,
      },
    });

    if (e.dataVencimentoOriginal && status === "APROVADA") {
      recebiveis.push({
        cod_empresa: cod,
        adquirente: "CIELO",
        adquirente_source: "CIELO_EXTC",
        bandeira: e.bandeiraLiquidacao,
        data_vencimento: e.dataVencimentoOriginal,
        valor_bruto: Math.abs(e.valorBruto),
        valor_liquido: Math.abs(e.valorLiquido),
        taxa_percentual: e.taxaVendaPercentual || null,
        taxa_valor: Math.abs(e.valorTarifaAdministrativa) || null,
        // `status` omitido pelo mesmo motivo das vendas: o default da coluna
        // cobre a insercao e a liquidacao ja aplicada nao e revertida.
        chave_ur: e.chaveUr,
        tipo_lancamento: e.tipoLancamento,
        origem_recebivel_id: rastreio,
      });
    }
  }

  const vendasUnicas = dedupPorChave(vendas, (l) => String(l.origem_venda_id));
  base.duplicatas_no_arquivo += vendasUnicas.duplicatas;
  await emLotes(vendasUnicas.linhas, async (lote) => {
    const { error } = await db
      .from("vendas_cartao")
      .upsert(lote, { onConflict: "adquirente,origem_venda_id" });
    if (error) throw new Error(`Erro ao gravar vendas_cartao: ${error.message}`);
    base.vendas_upsert += lote.length;
  });

  const recebiveisUnicos = dedupPorChave(recebiveis, (l) => String(l.origem_recebivel_id));
  await emLotes(recebiveisUnicos.linhas, async (lote) => {
    const { error } = await db
      .from("recebiveis_cartao")
      .upsert(lote, { onConflict: "adquirente,origem_recebivel_id" });
    if (error) throw new Error(`Erro ao gravar recebiveis_cartao: ${error.message}`);
    base.recebiveis_upsert += lote.length;
  });

  // Cancelamentos (06) e contestacoes (08) carregam, em "Numero da transacao
  // processada", o codigo da venda de origem. E por ele que a venda ja
  // importada e reclassificada — nunca por valor e data.
  for (const aj of ajustes) {
    const origem = aj.numeroTransacaoProcessada;
    // Filtro `or` do PostgREST e delimitado por virgula e ponto: um codigo com
    // esses caracteres montaria uma expressao diferente da pretendida.
    if (!origem || !/^[A-Za-z0-9_-]+$/.test(origem)) continue;

    const novoStatus = aj.tipoLancamento === "06"
      ? "CANCELADA"
      : aj.tipoLancamento === "08"
      ? "ESTORNADA"
      : "APROVADA"; // 07 e 09 sao reversoes do ajuste: a venda volta a valer

    const codEmpresa = resolverEmpresa(aj.estabelecimentoSubmissor, matriz, mapa);

    // A venda a vista tem origem_venda_id igual ao codigo; a parcelada usa
    // "codigo#NN". Um LIKE "codigo%" sozinho pegaria tambem qualquer codigo que
    // apenas COMECE com este (os codigos tem comprimento variavel depois da
    // normalizacao de zeros), cancelando vendas de terceiros.
    let q = db
      .from("vendas_cartao")
      .update({ status: novoStatus }, { count: "exact" })
      .eq("adquirente", "CIELO")
      .or(`origem_venda_id.eq.${origem},origem_venda_id.like.${origem}#%`);

    if (codEmpresa) q = q.eq("cod_empresa", codEmpresa);

    const { error, count } = await q;
    if (error) {
      console.error(`[sync-cielo] ajuste ${aj.tipoLancamento} para ${origem}:`, error.message);
      continue;
    }
    base.vendas_ajustadas += count ?? 0;
  }
}

// ---------------------------------------------------------------------------
// Derivacao: CIELO04 -> liquidacao dos recebiveis
// ---------------------------------------------------------------------------

async function marcarLiquidacoes(
  db: SupabaseClient,
  parsed: CieloExtratoParsed,
  base: ResultadoArquivo,
): Promise<void> {
  // No arquivo de pagamento, o registro D diz se a UR foi paga e o registro E
  // diz quais lancamentos compoem a UR. Liquidar por (chave UR + tipo de
  // lancamento) evita depender de casar valores.
  const urLiquidadas = new Map<string, string | null>();
  for (const d of parsed.registrosD) {
    if (d.liquidado) urLiquidadas.set(chaveUrLancamento(d.chaveUr, d.tipoLancamento), d.dataPagamento);
  }
  if (urLiquidadas.size === 0) return;

  // Agrupa por data de pagamento para nao emitir um update por lancamento.
  const porData = new Map<string, string[]>();
  for (const e of parsed.registrosE) {
    const chave = chaveUrLancamento(e.chaveUr, e.tipoLancamento);
    if (!urLiquidadas.has(chave)) continue;
    const data = urLiquidadas.get(chave) || "";
    const rastreio = chaveRastreioVenda(e);
    const lista = porData.get(data);
    if (lista) lista.push(rastreio);
    else porData.set(data, [rastreio]);
  }

  for (const [data, chaves] of porData) {
    const unicas = [...new Set(chaves)];
    await emLotes(unicas, async (lote) => {
      const { error, count } = await db
        .from("recebiveis_cartao")
        .update(
          // data_vencimento e a PREVISAO e alimenta a agenda: a data efetiva vai
          // para data_liquidacao, coluna propria.
          { status: "LIQUIDADO", ...(data ? { data_liquidacao: data } : {}) },
          { count: "exact" },
        )
        .eq("adquirente", "CIELO")
        .in("origem_recebivel_id", lote);
      if (error) throw new Error(`Erro ao liquidar recebiveis: ${error.message}`);
      base.recebiveis_liquidados += count ?? 0;
    });
  }
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const {
      conteudo_base64,
      nome_arquivo,
      tipo_arquivo,
      data,
      data_inicio,
      data_fim,
      process_type,
      ambiente: ambienteOverride,
      importado_por,
      aceitar_com_divergencia,
      reprocessar,
    } = body || {};

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const db = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: configsRaw, error: errCfg } = await db
      .from("adquirentes_config")
      .select("cod_empresa, ambiente, cielo_estabelecimento_matriz, cielo_pvs, cielo_documento, cielo_hmac_key")
      .eq("adquirente", "CIELO")
      .eq("ativo", true);
    if (errCfg) throw new Error(`Erro ao buscar configuracoes Cielo: ${errCfg.message}`);

    const configs = (configsRaw || []) as CieloConfig[];
    if (configs.length === 0) {
      throw new Error(
        "Nenhuma configuracao CIELO ativa. Cadastre a adquirente em Admin > Adquirentes antes de importar.",
      );
    }

    const resultados: ResultadoArquivo[] = [];

    // --- Origem UPLOAD ---
    if (conteudo_base64) {
      resultados.push(
        await processarArquivo(
          db,
          base64ParaBytes(conteudo_base64),
          nome_arquivo || "upload.txt",
          "UPLOAD",
          configs,
          importado_por || null,
          Boolean(aceitar_com_divergencia),
          Boolean(reprocessar),
        ),
      );

      return new Response(JSON.stringify({ origem: "UPLOAD", arquivos: resultados }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // --- Origem API ---
    const ambiente = ambienteOverride
      || (configs.some((c) => c.ambiente === "production") ? "production" : "sandbox");
    const tipos: string[] = tipo_arquivo ? [String(tipo_arquivo)] : ["03", "04", "16"];

    const matrizes = [
      ...new Map(
        configs
          .filter((c) => c.cielo_estabelecimento_matriz)
          .map((c) => [c.cielo_estabelecimento_matriz!, c]),
      ).values(),
    ];

    if (matrizes.length === 0) {
      throw new Error(
        "Nenhum estabelecimento matriz de extrato cadastrado. Preencha o campo em Admin > Adquirentes.",
      );
    }

    const falhas: Array<{ matriz: string; tipo: string; error: string; error_code?: string }> = [];

    for (const cfg of matrizes) {
      for (const tipo of tipos) {
        const res = await fetch(`${SUPABASE_URL}/functions/v1/cielo-extrato-proxy`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_KEY}` },
          body: JSON.stringify({
            action: "baixar_extrato",
            ambiente,
            tipo_arquivo: tipo,
            // merchantCode da API = estabelecimento matriz de extrato.
            merchant_code: cfg.cielo_estabelecimento_matriz,
            estabelecimento_matriz: cfg.cielo_estabelecimento_matriz,
            documento: cfg.cielo_documento,
            // Chave do estabelecimento raiz; ausente, o proxy usa o secret global.
            hmac_key: cfg.cielo_hmac_key,
            data,
            start_date: data_inicio || data,
            end_date: data_fim || data,
            // D = movimento diario. R (reprocessamento) e M (mensal) ficam
            // disponiveis, mas nao entram no ritmo automatico.
            process_type: process_type || "D",
          }),
        });

        const payload = await res.json().catch(() => ({}));
        if (!res.ok || payload?.error) {
          falhas.push({
            matriz: cfg.cielo_estabelecimento_matriz!,
            tipo,
            error: payload?.error || `HTTP ${res.status}`,
            error_code: payload?.error_code,
          });
          continue;
        }

        // A API devolve links temporarios, e um periodo pode render mais de um
        // arquivo — por isso o proxy entrega uma lista, ja baixada.
        for (const f of (payload.falhas || [])) {
          falhas.push({
            matriz: cfg.cielo_estabelecimento_matriz!,
            tipo,
            error: f.error,
            error_code: f.error_code,
          });
        }

        const arquivosBaixados: Array<{ nomeArquivo: string; conteudoBase64: string }> =
          payload.arquivos || [];

        if (arquivosBaixados.length === 0 && payload.aviso) {
          falhas.push({
            matriz: cfg.cielo_estabelecimento_matriz!,
            tipo,
            error: payload.aviso,
            error_code: "SEM_LINKS",
          });
        }

        for (const arq of arquivosBaixados) {
          try {
            resultados.push(
              await processarArquivo(
                db,
                base64ParaBytes(arq.conteudoBase64),
                arq.nomeArquivo,
                "API",
                configs,
                importado_por || null,
                Boolean(aceitar_com_divergencia),
                Boolean(reprocessar),
              ),
            );
          } catch (e) {
            falhas.push({
              matriz: cfg.cielo_estabelecimento_matriz!,
              tipo,
              error: `${arq.nomeArquivo}: ${(e as Error).message}`,
              error_code: "PARSE_OU_GRAVACAO",
            });
          }
        }
      }
    }

    return new Response(
      JSON.stringify({ origem: "API", ambiente, arquivos: resultados, falhas }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[sync-vendas-cielo] Error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
