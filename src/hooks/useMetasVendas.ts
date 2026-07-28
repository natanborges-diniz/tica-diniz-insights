import { useState, useCallback, useEffect } from "react";
import {
  getMetasPorAno,
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
  vendedor: string;
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
      // F8: 1 mês é suficiente para popular o dropdown de vendedores ativos
      // (antes eram 3 meses de TODAS as lojas só para montar a lista).
      dataIni.setMonth(dataIni.getMonth() - 1);

      const result = await getResumoEmpresaVendedor({
        empresa: empresa === 'ALL' ? 'ALL' : String(empresa),
        dataInicio: dataIni.toISOString().split('T')[0],
        dataFim: dataFim.toISOString().split('T')[0],
      });

      const vendedoresUnicos = new Map<string, VendedorOption>();
      result.forEach((r: ResumoEmpresaVendedor) => {
        if (r.vendedor && r.vendedor.trim()) {
          // F1: usar o COD_VENDEDOR real (o bridge expõe cod_vendedor).
          // Antes gravava-se o código da LOJA como codVendedor, e o
          // UNIQUE(tipo, cod_referencia, ano, mes) colapsava todos os
          // vendedores da loja numa meta só.
          // Dedup por código real quando disponível; fallback tolerante por
          // empresa+nome quando a API (versão antiga do bridge) não devolver.
          // TODO: quando o bridge em produção garantir cod_vendedor sempre
          // preenchido, remover o fallback por nome.
          const key = r.codVendedor > 0
            ? `cod:${r.codVendedor}`
            : `nome:${r.empresaCodLogico}-${r.vendedor}`;
          vendedoresUnicos.set(key, {
            codVendedor: r.codVendedor > 0 ? r.codVendedor : (r.empresaCodLogico || 0),
            vendedor: r.vendedor,
            nome: r.vendedor,
            empresa: r.empresaNomeLogico || r.empresa,
            codEmpresa: r.empresaCodLogico || 0,
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
      // F8: 1 query por tipo com o ano inteiro (antes: 12 meses × 2 tipos = 24 queries)
      const [metasLoja, metasVendedor] = await Promise.all([
        (filters.tipo === 'TODOS' || filters.tipo === 'LOJA')
          ? getMetasPorAno('LOJA', filters.ano)
          : Promise.resolve<MetaVenda[]>([]),
        (filters.tipo === 'TODOS' || filters.tipo === 'VENDEDOR')
          ? getMetasPorAno('VENDEDOR', filters.ano)
          : Promise.resolve<MetaVenda[]>([]),
      ]);

      let resultado: MetaVenda[] = [...metasLoja, ...metasVendedor];

      // Filtrar por empresa se necessário
      if (filters.empresa !== 'ALL' && filters.tipo !== 'LOJA') {
        resultado = resultado.filter(m => {
          if (m.tipo === 'LOJA') return true;
          const vendedor = vendedores.find(v => v.vendedor === m.nomeReferencia);
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
