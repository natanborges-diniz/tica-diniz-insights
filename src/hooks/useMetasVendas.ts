import { useState, useCallback, useEffect } from "react";
import { 
  getMetasPorPeriodo, 
  upsertMeta, 
  deleteMeta,
  MetaVenda 
} from "@/services/metasService";
import { getEmpresas, Empresa } from "@/services/empresaService";
import { getResumoEmpresaVendedor, ResumoEmpresaVendedor } from "@/services/vendasService";
import { toast } from "sonner";

export interface MetasFilters {
  ano: number;
  mes: number;
  tipo: 'LOJA' | 'VENDEDOR' | 'TODOS';
  empresa: number | 'ALL';
}

export interface VendedorOption {
  codVendedor: number;
  nome: string;
  empresa: string;
  codEmpresa: number;
}

export function useMetasVendas() {
  const anoAtual = new Date().getFullYear();
  const mesAtual = new Date().getMonth() + 1;

  const [filters, setFilters] = useState<MetasFilters>({
    ano: anoAtual,
    mes: mesAtual,
    tipo: 'TODOS',
    empresa: 'ALL',
  });

  const [metas, setMetas] = useState<MetaVenda[]>([]);
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [vendedores, setVendedores] = useState<VendedorOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingVendedores, setLoadingVendedores] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [metaEmEdicao, setMetaEmEdicao] = useState<MetaVenda | null>(null);

  // Buscar empresas ao montar
  useEffect(() => {
    const fetchEmpresas = async () => {
      try {
        const result = await getEmpresas();
        setEmpresas(result);
      } catch (err) {
        console.error("Erro ao buscar empresas:", err);
      }
    };
    fetchEmpresas();
  }, []);

  // Buscar vendedores quando empresa mudar
  const fetchVendedores = useCallback(async (empresa: number | 'ALL') => {
    setLoadingVendedores(true);
    try {
      const dataFim = new Date();
      const dataIni = new Date();
      dataIni.setMonth(dataIni.getMonth() - 3); // Últimos 3 meses para pegar vendedores ativos
      
      const result = await getResumoEmpresaVendedor({
        empresa: empresa === 'ALL' ? 'ALL' : String(empresa),
        dataInicio: dataIni.toISOString().split('T')[0],
        dataFim: dataFim.toISOString().split('T')[0],
      });

      const vendedoresUnicos = new Map<number, VendedorOption>();
      result.forEach((r: ResumoEmpresaVendedor) => {
        if (r.codVendedor && r.vendedor && r.vendedor.trim()) {
          vendedoresUnicos.set(r.codVendedor, {
            codVendedor: r.codVendedor,
            nome: r.vendedor,
            empresa: r.empresa,
            codEmpresa: r.codEmpresa || 0,
          });
        }
      });

      setVendedores(Array.from(vendedoresUnicos.values()).sort((a, b) => a.nome.localeCompare(b.nome)));
    } catch (err) {
      console.error("Erro ao buscar vendedores:", err);
      setVendedores([]);
    } finally {
      setLoadingVendedores(false);
    }
  }, []);

  // Buscar metas - agora busca todos os meses do ano
  const fetchMetas = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Buscar todos os meses do ano para ter dados completos
      const promisesLoja: Promise<MetaVenda[]>[] = [];
      const promisesVendedor: Promise<MetaVenda[]>[] = [];
      
      for (let mes = 1; mes <= 12; mes++) {
        if (filters.tipo === 'TODOS' || filters.tipo === 'LOJA') {
          promisesLoja.push(getMetasPorPeriodo('LOJA', filters.ano, mes));
        }
        if (filters.tipo === 'TODOS' || filters.tipo === 'VENDEDOR') {
          promisesVendedor.push(getMetasPorPeriodo('VENDEDOR', filters.ano, mes));
        }
      }

      const [metasLojaResults, metasVendedorResults] = await Promise.all([
        Promise.all(promisesLoja),
        Promise.all(promisesVendedor),
      ]);

      let resultado: MetaVenda[] = [
        ...metasLojaResults.flat(),
        ...metasVendedorResults.flat(),
      ];

      // Filtrar por empresa se necessário
      if (filters.empresa !== 'ALL' && filters.tipo !== 'LOJA') {
        resultado = resultado.filter(m => {
          if (m.tipo === 'LOJA') return true;
          const vendedor = vendedores.find(v => v.codVendedor === m.codReferencia);
          return vendedor?.codEmpresa === filters.empresa;
        });
      }

      setMetas(resultado);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao buscar metas";
      setError(message);
      setMetas([]);
    } finally {
      setLoading(false);
    }
  }, [filters.ano, filters.tipo, filters.empresa, vendedores]);

  // Salvar meta
  const salvarMeta = useCallback(async (meta: Omit<MetaVenda, 'id'>): Promise<boolean> => {
    try {
      const success = await upsertMeta(meta);
      if (success) {
        toast.success("Meta salva com sucesso!");
        await fetchMetas();
        setMetaEmEdicao(null);
        return true;
      } else {
        toast.error("Erro ao salvar meta");
        return false;
      }
    } catch (err) {
      toast.error("Erro ao salvar meta");
      return false;
    }
  }, [fetchMetas]);

  // Excluir meta
  const excluirMeta = useCallback(async (id: string): Promise<boolean> => {
    try {
      const success = await deleteMeta(id);
      if (success) {
        toast.success("Meta excluída com sucesso!");
        await fetchMetas();
        return true;
      } else {
        toast.error("Erro ao excluir meta");
        return false;
      }
    } catch (err) {
      toast.error("Erro ao excluir meta");
      return false;
    }
  }, [fetchMetas]);

  // Editar meta
  const editarMeta = useCallback((meta: MetaVenda) => {
    setMetaEmEdicao(meta);
  }, []);

  // Cancelar edição
  const cancelarEdicao = useCallback(() => {
    setMetaEmEdicao(null);
  }, []);

  return {
    filters,
    setFilters,
    metas,
    empresas,
    vendedores,
    loading,
    loadingVendedores,
    error,
    metaEmEdicao,
    fetchMetas,
    fetchVendedores,
    salvarMeta,
    excluirMeta,
    editarMeta,
    cancelarEdicao,
  };
}
