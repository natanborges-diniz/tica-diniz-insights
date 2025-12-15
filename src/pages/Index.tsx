import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { BarChart3, Database, Users, RefreshCw, Package, Layers, ClipboardList, Wallet, Store, Trophy, Brain } from 'lucide-react';

const Index = () => {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="text-center max-w-4xl px-4">
        <div className="mb-6 flex justify-center">
          <div className="p-4 rounded-2xl bg-primary/10">
            <Database className="h-12 w-12 text-primary" />
          </div>
        </div>
        <h1 className="mb-4 text-4xl font-bold">Sistema de Gestão</h1>
        <p className="text-xl text-muted-foreground mb-8">
          Integração Firebird → Data Warehouse com dashboards analíticos e IA
        </p>
        
        {/* Módulos de Inteligência */}
        <div className="mb-6">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center justify-center gap-2">
            <Brain className="h-4 w-4" />
            Inteligência de Vendas
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 max-w-3xl mx-auto">
            <Link to="/ranking-lojas">
              <Button className="w-full h-auto py-4 flex flex-col gap-2 bg-gradient-to-br from-primary to-primary/80" size="lg">
                <Store className="h-6 w-6" />
                <span>Ranking de Lojas</span>
              </Button>
            </Link>

            <Link to="/ranking-vendedores">
              <Button className="w-full h-auto py-4 flex flex-col gap-2 bg-gradient-to-br from-primary to-primary/80" size="lg">
                <Trophy className="h-6 w-6" />
                <span>Ranking de Vendedores</span>
              </Button>
            </Link>

            <Link to="/vendas">
              <Button variant="secondary" className="w-full h-auto py-4 flex flex-col gap-2" size="lg">
                <BarChart3 className="h-6 w-6" />
                <span>Dashboard de Vendas</span>
              </Button>
            </Link>

            <Link to="/vendas-familia">
              <Button variant="secondary" className="w-full h-auto py-4 flex flex-col gap-2" size="lg">
                <Layers className="h-6 w-6" />
                <span>Vendas por Família</span>
              </Button>
            </Link>
          </div>
        </div>

        {/* Módulos Operacionais */}
        <div className="mb-6">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Operações
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 max-w-3xl mx-auto">
            <Link to="/estoque">
              <Button variant="outline" className="w-full h-auto py-4 flex flex-col gap-2" size="lg">
                <Package className="h-6 w-6" />
                <span>Painel de Estoque</span>
              </Button>
            </Link>

            <Link to="/os">
              <Button variant="outline" className="w-full h-auto py-4 flex flex-col gap-2" size="lg">
                <ClipboardList className="h-6 w-6" />
                <span>Monitor de OS</span>
              </Button>
            </Link>

            <Link to="/financeiro">
              <Button variant="outline" className="w-full h-auto py-4 flex flex-col gap-2" size="lg">
                <Wallet className="h-6 w-6" />
                <span>Financeiro</span>
              </Button>
            </Link>
            
            <Button variant="outline" className="w-full h-auto py-4 flex flex-col gap-2" size="lg" disabled>
              <Users className="h-6 w-6" />
              <span>Cliente 360 (em breve)</span>
            </Button>
          </div>
        </div>

        <div className="mt-8 p-4 bg-muted/50 rounded-lg text-sm text-muted-foreground">
          <p className="flex items-center justify-center gap-2">
            <RefreshCw className="h-4 w-4" />
            Dados sincronizados via ETL Firebird API • Análises com IA integrada
          </p>
        </div>
      </div>
    </div>
  );
};

export default Index;
