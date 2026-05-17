export function calcularCurvaABC(
  itens: ReadonlyArray<{ codSku: number; totalVendido: number }>,
  cortes: { a?: number; b?: number } = {}
): Map<number, 'A' | 'B' | 'C'> {
  const corteA = cortes.a ?? 80;
  const corteB = cortes.b ?? 95;

  const totalVendas = itens.reduce((acc, i) => acc + i.totalVendido, 0);
  const ordenados = [...itens].sort((a, b) => b.totalVendido - a.totalVendido);

  let acumulado = 0;
  const curvaMap = new Map<number, 'A' | 'B' | 'C'>();

  ordenados.forEach(i => {
    acumulado += i.totalVendido;
    const percentual = totalVendas > 0 ? (acumulado / totalVendas) * 100 : 0;
    if (percentual <= corteA)      curvaMap.set(i.codSku, 'A');
    else if (percentual <= corteB) curvaMap.set(i.codSku, 'B');
    else                           curvaMap.set(i.codSku, 'C');
  });

  return curvaMap;
}
