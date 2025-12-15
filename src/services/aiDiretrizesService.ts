import { supabase } from "@/integrations/supabase/client";

export interface DiretrizesParams {
  tipo: 'loja' | 'vendedor';
  dados: any[];
  periodo: string;
  meta?: any;
}

export async function gerarDiretrizes(params: DiretrizesParams): Promise<string> {
  const { data, error } = await supabase.functions.invoke('ai-diretrizes', {
    body: params
  });

  if (error) {
    console.error('Erro ao gerar diretrizes:', error);
    throw new Error(error.message || 'Erro ao processar análise de IA');
  }

  if (data?.error) {
    throw new Error(data.error);
  }

  return data?.analise || 'Não foi possível gerar análise.';
}
