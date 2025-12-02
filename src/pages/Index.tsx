import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { BarChart3, Database, Users, RefreshCw } from 'lucide-react';

const Index = () => {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="text-center max-w-2xl px-4">
        <div className="mb-6 flex justify-center">
          <div className="p-4 rounded-2xl bg-primary/10">
            <Database className="h-12 w-12 text-primary" />
          </div>
        </div>
        <h1 className="mb-4 text-4xl font-bold">Sistema de Gestão</h1>
        <p className="text-xl text-muted-foreground mb-8">
          Integração Firebird → Data Warehouse com dashboards analíticos
        </p>
        
        <div className="grid gap-4 sm:grid-cols-2 max-w-md mx-auto">
          <Link to="/dashboard">
            <Button className="w-full h-auto py-4 flex flex-col gap-2" size="lg">
              <BarChart3 className="h-6 w-6" />
              <span>Dashboard de Gestão</span>
            </Button>
          </Link>
          
          <Button variant="outline" className="w-full h-auto py-4 flex flex-col gap-2" size="lg" disabled>
            <Users className="h-6 w-6" />
            <span>Cliente 360 (em breve)</span>
          </Button>
        </div>

        <div className="mt-8 p-4 bg-muted/50 rounded-lg text-sm text-muted-foreground">
          <p className="flex items-center justify-center gap-2">
            <RefreshCw className="h-4 w-4" />
            Dados sincronizados via ETL Firebird API
          </p>
        </div>
      </div>
    </div>
  );
};

export default Index;
