// src/services/fluxoCaixaService.ts
// Service para Fluxo de Caixa derivado do ledger central (lancamentos_financeiros)

import { supabase } from "@/integrations/supabase/client";

export interface FluxoCaixaLancamento {
  id: string;
  codEmpresa: number;
  tipo: string; // RECEBER | PAGAR
  valor: number;
  dataReferencia: string;
  status: string;
  descricao: string;
  pessoaNome: string | null;
  categoria: string | null;
  formaPagamento: string | null;
  realizado: boolean;
}

export interface GetFluxoCaixaParams {
  empresa: number | string | null;
  dataInicio: string;
  dataFim: string;
  apenasBaixado?: boolean;
}

export async function getFluxoCaixa(params: GetFluxoCaixaParams): Promise<FluxoCaixaLancamento[]> {
  const codEmpresa = params.empresa === 'ALL' || params.empresa === '' ? null : params.empresa ? Number(params.empresa) : null;

  const { data, error } = await supabase.functions.invoke('financeiro-relatorios', {
    body: {
      action: 'fluxo_caixa',
      cod_empresa: codEmpresa,
      data_inicio: params.dataInicio,
      data_fim: params.dataFim,
      apenas_baixado: params.apenasBaixado ?? false,
    },
  });

  if (error) throw new Error(error.message || 'Erro ao buscar fluxo de caixa');

  const raw = Array.isArray(data) ? data : [];
  return raw.map((r: Record<string, unknown>) => ({
    id: String(r.id || ''),
    codEmpresa: Number(r.cod_empresa || 0),
    tipo: String(r.tipo || ''),
    valor: Number(r.valor || 0),
    dataReferencia: String(r.data_referencia || ''),
    status: String(r.status || ''),
    descricao: String(r.descricao || ''),
    pessoaNome: r.pessoa_nome ? String(r.pessoa_nome) : null,
    categoria: r.categoria ? String(r.categoria) : null,
    formaPagamento: r.forma_pagamento ? String(r.forma_pagamento) : null,
    realizado: Boolean(r.realizado),
  }));
}
