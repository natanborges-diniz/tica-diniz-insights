import { useState, useCallback, useEffect } from "react";
import {
  getMetasPeriodos,
  upsertMetaPeriodo,
  getFeriados,
  upsertFeriado,
  deleteFeriado,
  getLojasConfiguracao,
  upsertLojaConfiguracao,
  getLojasExcecoes,
  upsertLojaExcecao,
  deleteLojaExcecao,
  MetaPeriodo,
  Feriado,
  LojaConfiguracao,
  LojaExcecao,
} from "@/services/calendarioService";
import { getEmpresas, Empresa } from "@/services/empresaService";
import { toast } from "sonner";

// Empresas que não devem aparecer nos filtros (sem operação ativa)
const EMPRESAS_INATIVAS = [10]; // Loja 10 não tem mais operação

export function useCalendarioConfig() {
  const anoAtual = new Date().getFullYear();

  const [ano, setAno] = useState(anoAtual);
  const [periodos, setPeriodos] = useState<MetaPeriodo[]>([]);
  const [feriados, setFeriados] = useState<Feriado[]>([]);
  const [lojasConfig, setLojasConfig] = useState<LojaConfiguracao[]>([]);
  const [excecoes, setExcecoes] = useState<LojaExcecao[]>([]);
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Carregar dados iniciais
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [periodosData, feriadosData, lojasData, excecoesData, empresasData] = await Promise.all([
        getMetasPeriodos(ano),
        getFeriados(ano),
        getLojasConfiguracao(),
        getLojasExcecoes(),
        getEmpresas(),
      ]);
      setPeriodos(periodosData);
      setFeriados(feriadosData);
      setLojasConfig(lojasData);
      setExcecoes(excecoesData);
      // Filtrar empresas inativas
      const empresasAtivas = empresasData.filter(
        (emp) => !EMPRESAS_INATIVAS.includes(emp.codEmpresa)
      );
      setEmpresas(empresasAtivas);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao carregar configurações";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [ano]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ========== PERÍODOS ==========
  const salvarPeriodo = useCallback(async (periodo: Omit<MetaPeriodo, 'id'>): Promise<boolean> => {
    try {
      const success = await upsertMetaPeriodo(periodo);
      if (success) {
        toast.success("Período salvo com sucesso!");
        await fetchData();
        return true;
      } else {
        toast.error("Erro ao salvar período");
        return false;
      }
    } catch (err) {
      toast.error("Erro ao salvar período");
      return false;
    }
  }, [fetchData]);

  // ========== FERIADOS ==========
  const salvarFeriado = useCallback(async (feriado: Omit<Feriado, 'id'>): Promise<boolean> => {
    try {
      const success = await upsertFeriado(feriado);
      if (success) {
        toast.success("Feriado salvo com sucesso!");
        await fetchData();
        return true;
      } else {
        toast.error("Erro ao salvar feriado");
        return false;
      }
    } catch (err) {
      toast.error("Erro ao salvar feriado");
      return false;
    }
  }, [fetchData]);

  const excluirFeriado = useCallback(async (id: string): Promise<boolean> => {
    try {
      const success = await deleteFeriado(id);
      if (success) {
        toast.success("Feriado excluído com sucesso!");
        await fetchData();
        return true;
      } else {
        toast.error("Erro ao excluir feriado");
        return false;
      }
    } catch (err) {
      toast.error("Erro ao excluir feriado");
      return false;
    }
  }, [fetchData]);

  // ========== CONFIGURAÇÃO DE LOJAS ==========
  const salvarLojaConfig = useCallback(async (config: Omit<LojaConfiguracao, 'id'>): Promise<boolean> => {
    try {
      const success = await upsertLojaConfiguracao(config);
      if (success) {
        toast.success("Configuração de loja salva!");
        await fetchData();
        return true;
      } else {
        toast.error("Erro ao salvar configuração");
        return false;
      }
    } catch (err) {
      toast.error("Erro ao salvar configuração");
      return false;
    }
  }, [fetchData]);

  const configurarLojasEmLote = useCallback(async (
    codEmpresas: number[],
    config: { 
      tipoLoja: 'RUA' | 'SHOPPING'; 
      abreDomingo: boolean; 
      abreFeriado: boolean;
      numVendedores: number;
      percentualAceitavel: number;
    }
  ): Promise<boolean> => {
    try {
      const promises = codEmpresas.map(codEmpresa => 
        upsertLojaConfiguracao({
          codEmpresa,
          tipoLoja: config.tipoLoja,
          abreDomingo: config.abreDomingo,
          abreFeriado: config.abreFeriado,
          numVendedores: config.numVendedores,
          percentualAceitavel: config.percentualAceitavel,
        })
      );
      await Promise.all(promises);
      toast.success(`${codEmpresas.length} lojas configuradas!`);
      await fetchData();
      return true;
    } catch (err) {
      toast.error("Erro ao configurar lojas");
      return false;
    }
  }, [fetchData]);

  // ========== EXCEÇÕES ==========
  const salvarExcecao = useCallback(async (excecao: Omit<LojaExcecao, 'id'>): Promise<boolean> => {
    try {
      const success = await upsertLojaExcecao(excecao);
      if (success) {
        toast.success("Exceção salva com sucesso!");
        await fetchData();
        return true;
      } else {
        toast.error("Erro ao salvar exceção");
        return false;
      }
    } catch (err) {
      toast.error("Erro ao salvar exceção");
      return false;
    }
  }, [fetchData]);

  const excluirExcecao = useCallback(async (id: string): Promise<boolean> => {
    try {
      const success = await deleteLojaExcecao(id);
      if (success) {
        toast.success("Exceção excluída!");
        await fetchData();
        return true;
      } else {
        toast.error("Erro ao excluir exceção");
        return false;
      }
    } catch (err) {
      toast.error("Erro ao excluir exceção");
      return false;
    }
  }, [fetchData]);

  return {
    ano,
    setAno,
    periodos,
    feriados,
    lojasConfig,
    excecoes,
    empresas,
    loading,
    error,
    fetchData,
    salvarPeriodo,
    salvarFeriado,
    excluirFeriado,
    salvarLojaConfig,
    configurarLojasEmLote,
    salvarExcecao,
    excluirExcecao,
  };
}
