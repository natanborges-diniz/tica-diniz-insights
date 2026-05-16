export type CapacidadeConfig = {
  capacidade_total: number;
  percentual_solar: number;
};

/**
 * Deriva a capacidade mínima (meta OTB) por subcategoria a partir da config por loja.
 * AR_RX  = capacidade_total × (100 - percentual_solar) / 100  (arredondado para baixo)
 * AR_SOLAR = capacidade_total × percentual_solar / 100         (arredondado para baixo)
 * Demais categorias (lentes, acessórios, etc.) → 0 (sem meta física gerenciada).
 */
export function calcularCapacidadePorCategoria(
  config: CapacidadeConfig | null | undefined,
  categoria: string
): number {
  if (!config) return 0;
  switch (categoria) {
    case 'AR_RX':
      return Math.floor(config.capacidade_total * (100 - config.percentual_solar) / 100);
    case 'AR_SOLAR':
      return Math.floor(config.capacidade_total * config.percentual_solar / 100);
    default:
      return 0;
  }
}
