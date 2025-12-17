import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertTriangle, TrendingDown, RotateCcw } from 'lucide-react';
import { ResumoEmpresaVendedor } from '@/services/vendasService';

interface SalesAlertsProps {
  dados: ResumoEmpresaVendedor[];
  limiteDesconto?: number; // Default 15%
  limiteDevolucao?: number; // Default 5%
}

export function SalesAlerts({ 
  dados, 
  limiteDesconto = 15, 
  limiteDevolucao = 5 
}: SalesAlertsProps) {
  // Vendedores com desconto acima do limite
  const vendedoresDescontoAlto = dados.filter(
    d => d.percentualDesconto > limiteDesconto && d.totalBruto > 0
  ).sort((a, b) => b.percentualDesconto - a.percentualDesconto);

  // Vendedores com devolução acima do limite
  const vendedoresDevolucaoAlta = dados.filter(d => {
    const percDevolucao = d.totalVendido > 0 ? (d.totalDevolucao / d.totalVendido) * 100 : 0;
    return percDevolucao > limiteDevolucao && d.totalVendido > 0;
  }).map(d => ({
    ...d,
    percDevolucao: d.totalVendido > 0 ? (d.totalDevolucao / d.totalVendido) * 100 : 0
  })).sort((a, b) => b.percDevolucao - a.percDevolucao);

  if (vendedoresDescontoAlto.length === 0 && vendedoresDevolucaoAlta.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4">
      {vendedoresDescontoAlto.length > 0 && (
        <Alert variant="destructive" className="border-amber-500 bg-amber-50 dark:bg-amber-950/20">
          <TrendingDown className="h-4 w-4 text-amber-600" />
          <AlertTitle className="text-amber-800 dark:text-amber-400">
            Desconto Elevado (acima de {limiteDesconto}%)
          </AlertTitle>
          <AlertDescription className="text-amber-700 dark:text-amber-300">
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
      )}

      {vendedoresDevolucaoAlta.length > 0 && (
        <Alert variant="destructive" className="border-red-500 bg-red-50 dark:bg-red-950/20">
          <RotateCcw className="h-4 w-4 text-red-600" />
          <AlertTitle className="text-red-800 dark:text-red-400">
            Devolução Elevada (acima de {limiteDevolucao}%)
          </AlertTitle>
          <AlertDescription className="text-red-700 dark:text-red-300">
            <ul className="mt-2 space-y-1 text-sm">
              {vendedoresDevolucaoAlta.slice(0, 5).map((v, i) => (
                <li key={i} className="flex justify-between">
                  <span>{v.vendedor} ({v.empresaNomeLogico})</span>
                  <span className="font-semibold">{v.percDevolucao.toFixed(2)}%</span>
                </li>
              ))}
              {vendedoresDevolucaoAlta.length > 5 && (
                <li className="text-muted-foreground">
                  ... e mais {vendedoresDevolucaoAlta.length - 5} vendedor(es)
                </li>
              )}
            </ul>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
