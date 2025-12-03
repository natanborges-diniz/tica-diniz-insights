import { ReactNode } from 'react';
import { NavLink } from '@/components/NavLink';
import { BarChart3, Users, Package, FileText, Settings, Home } from 'lucide-react';

interface SalesDashboardLayoutProps {
  children: ReactNode;
}

const menuItems = [
  { title: 'Dashboard Vendas', href: '/vendas', icon: BarChart3 },
  // Futuros módulos
  { title: 'Formas de Pagamento', href: '/pagamentos', icon: FileText, disabled: true },
  { title: 'Carteira', href: '/carteira', icon: Users, disabled: true },
  { title: 'Estoque', href: '/estoque', icon: Package, disabled: true },
  { title: 'Ordens de Serviço', href: '/os', icon: Settings, disabled: true },
];

export function SalesDashboardLayout({ children }: SalesDashboardLayoutProps) {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-foreground">
                Gestão de Vendas
              </h1>
              <p className="text-sm text-muted-foreground">
                Óticas Diniz Osasco e Região
              </p>
            </div>
            <NavLink 
              to="/" 
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <Home className="h-4 w-4" />
              Início
            </NavLink>
          </div>
        </div>
      </header>

      <div className="flex">
        {/* Sidebar */}
        <aside className="w-64 border-r bg-card min-h-[calc(100vh-73px)] hidden md:block">
          <nav className="p-4 space-y-1">
            {menuItems.map((item) => (
              <NavLink
                key={item.href}
                to={item.disabled ? '#' : item.href}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                  item.disabled 
                    ? 'text-muted-foreground/50 cursor-not-allowed' 
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                }`}
                activeClassName={item.disabled ? '' : 'bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground'}
              >
                <item.icon className="h-4 w-4" />
                {item.title}
                {item.disabled && (
                  <span className="ml-auto text-xs bg-muted px-1.5 py-0.5 rounded">Em breve</span>
                )}
              </NavLink>
            ))}
          </nav>
        </aside>

        {/* Main Content */}
        <main className="flex-1 p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
