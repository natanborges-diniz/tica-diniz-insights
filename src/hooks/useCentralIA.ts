// src/hooks/useCentralIA.ts
// Hook para Central de IA - gerenciamento de estado e coleta de dados

import { useState, useCallback, useEffect } from "react";
import { useUserEmpresas } from "./useUserEmpresas";
import { useDefaultEmpresa } from "./useDefaultEmpresa";
import { EmpresaParam } from "@/services/firebirdBridge";
import { 
  coletarDadosCentralIA, 
  gerarAnaliseCentralIA, 
  DadosCentralIA 
} from "@/services/aiCentralService";
import { getPeriodoComercial, formatLocalDate } from "@/utils/dateValidation";
import { toast } from "@/hooks/use-toast";

export interface CentralIAFilters {
  empresa: EmpresaParam;
  dataInicio: string;
  dataFim: string;
  incluirEstoque: boolean;
  incluirAnaliseSku: boolean;
}

export interface CentralIAState {
  dadosColetados: DadosCentralIA | null;
  analise: string | null;
  coletando: boolean;
  gerando: boolean;
  error: string | null;
}

export function useCentralIA() {
  const { empresas, isLoading: loadingEmpresas } = useUserEmpresas();
  const { defaultEmpresa } = useDefaultEmpresa();
  
  const hoje = new Date();
  const [filters, setFilters] = useState<CentralIAFilters>({
    empresa: '', // Será preenchido pelo useEffect abaixo
    dataInicio: formatLocalDate(new Date(hoje.getFullYear(), hoje.getMonth(), 1)),
    dataFim: formatLocalDate(new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0)),
    incluirEstoque: true,
    incluirAnaliseSku: true,
  });

  // Preencher empresa do profile quando disponível
  useEffect(() => {
    if (defaultEmpresa && filters.empresa === '') {
      setFilters(prev => ({ ...prev, empresa: defaultEmpresa }));
    }
  }, [defaultEmpresa]);

  // Carregar período comercial do banco ao montar
  useEffect(() => {
    getPeriodoComercial().then(p => {
      setFilters(prev => ({ ...prev, dataInicio: p.dataIni, dataFim: p.dataFim }));
    });
  }, []);

  const [state, setState] = useState<CentralIAState>({
    dadosColetados: null,
    analise: null,
    coletando: false,
    gerando: false,
    error: null,
  });

  /**
   * Coleta dados de todas as fontes
   */
  const coletarDados = useCallback(async () => {
    setState(prev => ({ ...prev, coletando: true, error: null }));
    
    try {
      console.log('[useCentralIA] Iniciando coleta de dados...');
      
      const dados = await coletarDadosCentralIA({
        empresa: filters.empresa,
        dataInicio: filters.dataInicio,
        dataFim: filters.dataFim,
        incluirEstoque: filters.incluirEstoque,
        incluirAnaliseSku: filters.incluirAnaliseSku,
      });
      
      console.log('[useCentralIA] Dados coletados:', {
        temVendas: !!dados.vendas,
        temFormasPagamento: dados.formasPagamento?.length || 0,
        temFamilias: dados.familias?.length || 0,
        temEstoque: !!dados.estoque,
      });
      
      setState(prev => ({ 
        ...prev, 
        dadosColetados: dados, 
        coletando: false,
        analise: null, // Limpar análise anterior
      }));
      
      toast({
        title: "Dados coletados",
        description: "Pronto para gerar análise com IA",
      });
      
      return dados;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao coletar dados';
      console.error('[useCentralIA] Erro na coleta:', message);
      
      setState(prev => ({ 
        ...prev, 
        coletando: false, 
        error: message,
      }));
      
      toast({
        title: "Erro na coleta",
        description: message,
        variant: "destructive",
      });
      
      return null;
    }
  }, [filters]);

  /**
   * Gera análise com IA
   */
  const gerarAnalise = useCallback(async () => {
    if (!state.dadosColetados) {
      toast({
        title: "Dados não coletados",
        description: "Primeiro colete os dados antes de gerar a análise",
        variant: "destructive",
      });
      return;
    }
    
    setState(prev => ({ ...prev, gerando: true, error: null }));
    
    try {
      console.log('[useCentralIA] Gerando análise com IA...');
      
      const analise = await gerarAnaliseCentralIA(state.dadosColetados);
      
      setState(prev => ({ 
        ...prev, 
        analise, 
        gerando: false,
      }));
      
      toast({
        title: "Análise gerada",
        description: "Diretrizes estratégicas prontas",
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao gerar análise';
      console.error('[useCentralIA] Erro na análise:', message);
      
      setState(prev => ({ 
        ...prev, 
        gerando: false, 
        error: message,
      }));
      
      toast({
        title: "Erro na análise",
        description: message,
        variant: "destructive",
      });
    }
  }, [state.dadosColetados]);

  /**
   * Coleta dados e gera análise em sequência
   */
  const executarAnaliseCompleta = useCallback(async () => {
    const dados = await coletarDados();
    if (dados) {
      // Pequena pausa para feedback visual
      await new Promise(resolve => setTimeout(resolve, 500));
      
      setState(prev => ({ ...prev, gerando: true, error: null }));
      
      try {
        const analise = await gerarAnaliseCentralIA(dados);
        setState(prev => ({ 
          ...prev, 
          analise, 
          gerando: false,
        }));
        
        toast({
          title: "Análise completa",
          description: "Diretrizes estratégicas prontas",
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Erro ao gerar análise';
        setState(prev => ({ 
          ...prev, 
          gerando: false, 
          error: message,
        }));
        
        toast({
          title: "Erro na análise",
          description: message,
          variant: "destructive",
        });
      }
    }
  }, [coletarDados]);

  /**
   * Limpa tudo
   */
  const limpar = useCallback(() => {
    setState({
      dadosColetados: null,
      analise: null,
      coletando: false,
      gerando: false,
      error: null,
    });
  }, []);

  return {
    // Empresas
    empresas,
    loadingEmpresas,
    
    // Filtros
    filters,
    setFilters,
    
    // Estado
    ...state,
    
    // Ações
    coletarDados,
    gerarAnalise,
    executarAnaliseCompleta,
    limpar,
  };
}
