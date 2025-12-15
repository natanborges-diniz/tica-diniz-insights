import { useEffect } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Target } from "lucide-react";
import { useMetasVendas } from "@/hooks/useMetasVendas";
import { MetasFilters } from "@/components/metas/MetasFilters";
import { MetaForm } from "@/components/metas/MetaForm";
import { MetasTable } from "@/components/metas/MetasTable";

export default function MetasVendasDashboard() {
  const {
    filters,
    setFilters,
    metas,
    empresas,
    vendedores,
    loading,
    loadingVendedores,
    metaEmEdicao,
    fetchMetas,
    fetchVendedores,
    salvarMeta,
    excluirMeta,
    editarMeta,
    cancelarEdicao,
  } = useMetasVendas();

  // Buscar vendedores iniciais
  useEffect(() => {
    fetchVendedores('ALL');
  }, [fetchVendedores]);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Link to="/">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Target className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h1 className="text-xl font-bold">Cadastro de Metas de Vendas</h1>
                <p className="text-sm text-muted-foreground">
                  Defina metas por loja ou vendedor para cada mês
                </p>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Filtros */}
      <div className="border-b bg-card/50">
        <div className="container mx-auto px-4 py-3">
          <MetasFilters
            filters={filters}
            setFilters={setFilters}
            empresas={empresas}
            onBuscar={fetchMetas}
            loading={loading}
          />
        </div>
      </div>

      {/* Conteúdo */}
      <main className="container mx-auto px-4 py-6">
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Tabela de metas */}
          <div className="lg:col-span-2">
            <MetasTable
              metas={metas}
              onEditar={editarMeta}
              onExcluir={excluirMeta}
              loading={loading}
            />
          </div>

          {/* Formulário */}
          <div className="lg:col-span-1">
            <MetaForm
              empresas={empresas}
              vendedores={vendedores}
              metaEmEdicao={metaEmEdicao}
              onSalvar={salvarMeta}
              onCancelar={cancelarEdicao}
              onEmpresaChange={fetchVendedores}
              loadingVendedores={loadingVendedores}
            />
          </div>
        </div>
      </main>
    </div>
  );
}
