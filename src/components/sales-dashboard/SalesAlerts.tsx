import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { TrendingDown } from 'lucide-react';
import { ResumoEmpresaVendedor } from '@/services/vendasService';

interface SalesAlertsProps {
  dados: ResumoEmpresaVendedor[];
  limiteDesconto?: number;
}

export function SalesAlerts({ dados, limiteDesconto = 15 }: SalesAlertsProps) {
  const vendedoresDescontoAlto = dados.filter(
    d => d.percentualDesconto > limiteDesconto && d.totalBruto > 0
  ).sort((a, b) => b.percentualDesconto - a.percentualDesconto);

  if (vendedoresDescontoAlto.length === 0) return null;

  return (
    <div className="space-y-4">
      <Alert variant="destructive" className="border-warning-muted bg-warning-soft">
        <TrendingDown className="h-4 w-4 text-warning" />
        <AlertTitle className="text-warning-foreground">
          Desconto Elevado (acima de {limiteDesconto}%)
        </AlertTitle>
        <AlertDescription className="text-warning-foreground/80">
          <ul className="mt-2 space-y-1 text-sm">
            {vendedoresDescontoAlto.slice(0, 5).map((v, i) => (
              <li key={i} className="flex justify-between">
                <span>{v.vendedor} ({v.empresaNomeLogico})</span>
                <span className="font-semibold">{v.percentualDesconto.toFixed(2)}%</span>
              </li>
            ))}
            {vendedoresDescontoAlto.length > 5 && (
              <li className="text-muted-foreground">
                ... e mais {vendedoresDescontoAlto.length - 5} vendedor(es)
              </li>
            )}
          </ul>
        </AlertDescription>
      </Alert>
    </div>
  );
}
