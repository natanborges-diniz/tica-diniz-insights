// src/services/comprasService.ts
// Service de Compras — lê parcelas_cache (PAGAR) e reconstitui notas fiscais.

import { supabase } from "@/integrations/supabase/client";

export interface ComprasParcela {
  codEmpresa: number;
  empresaNome: string;
  documento: string;
  pessoaNome: string;
  dataEmissao: string | null;
  dataVencimento: string | null;
  valor: number;
  contaNumero: string | null;
  contaDescricao: string | null;
  formaPagamentoTipo: string | null;
}

export interface ComprasNota {
  chave: string;
  codEmpresa: number;
  empresaNome: string;
  fornecedor: string;
  documento: string;
  dataEmissao: string;
  mes: string; // YYYY-MM
  conta: string;
  contaNumero: string | null;
  formaPagamento: string;
  valorTotal: number;
  qtdParcelas: number;
  prazoMedioDias: number;
}

export interface GetComprasParams {
  empresa: number | null; // null = todas
  dataInicio: string;
  dataFim: string;
}

export async function getComprasParcelas(params: GetComprasParams): Promise<ComprasParcela[]> {
  let query = supabase
    .from("parcelas_cache")
    .select("*")
    .eq("tipo_lancamento", "PAGAR")
    .gte("data_emissao", params.dataInicio)
    .lte("data_emissao", params.dataFim)
    .order("data_emissao", { ascending: false });

  if (params.empresa !== null) {
    query = query.eq("cod_empresa", params.empresa);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  return (data ?? []).map((r: any) => ({
    codEmpresa: r.cod_empresa ?? 0,
    empresaNome: (r.empresa_nome ?? "").trim(),
    documento: (r.documento ?? "").trim(),
    pessoaNome: (r.pessoa_nome ?? "").trim() || "—",
    dataEmissao: r.data_emissao ?? null,
    dataVencimento: r.data_vencimento ?? null,
    valor: Number(r.valor) || 0,
    contaNumero: r.conta_numero ?? null,
    contaDescricao: r.conta_descricao ?? null,
    formaPagamentoTipo: r.forma_pagamento_tipo ?? null,
  }));
}

/**
 * Reduz parcelas em notas fiscais (1 nota = 1 compra).
 * Chave: empresa + fornecedor + documento + data_emissao
 */
/** Extrai o número-base da NF removendo o sufixo de parcela (ex.: "3080021/1" -> "3080021"). */
function baseDocumento(doc: string): string {
  const limpo = (doc || "").trim();
  if (!limpo) return "(s/doc)";
  const idx = limpo.indexOf("/");
  return idx >= 0 ? limpo.slice(0, idx).trim() || "(s/doc)" : limpo;
}

export function aggregateNotas(parcelas: ComprasParcela[]): ComprasNota[] {
  const groups = new Map<string, ComprasParcela[]>();
  for (const p of parcelas) {
    if (!p.dataEmissao) continue;
    const docBase = baseDocumento(p.documento);
    const key = `${p.codEmpresa}|${p.pessoaNome}|${docBase}|${p.dataEmissao}`;
    const arr = groups.get(key) || [];
    arr.push(p);
    groups.set(key, arr);
  }

  const notas: ComprasNota[] = [];
  for (const [key, arr] of groups) {
    const first = arr[0];
    const valorTotal = arr.reduce((a, b) => a + b.valor, 0);
    const emissao = new Date(first.dataEmissao!);
    let somaDias = 0;
    let cont = 0;
    for (const p of arr) {
      if (p.dataVencimento) {
        const v = new Date(p.dataVencimento);
        somaDias += Math.round((v.getTime() - emissao.getTime()) / 86400000);
        cont++;
      }
    }
    notas.push({
      chave: key,
      codEmpresa: first.codEmpresa,
      empresaNome: first.empresaNome || `Empresa ${first.codEmpresa}`,
      fornecedor: first.pessoaNome,
      documento: baseDocumento(first.documento),
      dataEmissao: first.dataEmissao!,
      mes: first.dataEmissao!.slice(0, 7),
      conta: first.contaDescricao || "—",
      contaNumero: first.contaNumero,
      formaPagamento: first.formaPagamentoTipo || "—",
      valorTotal,
      qtdParcelas: arr.length,
      prazoMedioDias: cont > 0 ? Math.round(somaDias / cont) : 0,
    });
  }

  return notas.sort((a, b) => (a.dataEmissao < b.dataEmissao ? 1 : -1));
}
