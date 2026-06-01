export type CapacidadeConfig = {
  capacidade_total: number;
  percentual_solar: number;
};

/**
 * Deriva a capacidade mínima (meta OTB) por subcategoria a partir da config por loja.
 * AR_RX  = capacidade_total × (100 - percentual_solar) / 100  (arredondado para baixo)
 * AR_SOLAR = capacidade_total × percentual_solar / 100         (arredondado para baixo)
 * Demais categorias (lentes, acessórios, etc.) → 0 (sem meta física gerenciada).
 *
 * pctSolarOverride: quando informado (≠ null/undefined), substitui o
 * `percentual_solar` global. Usado para aplicar overrides por (cod_empresa, marca)
 * vindos da tabela marca_config.
 */
export function calcularCapacidadePorCategoria(
  config: CapacidadeConfig | null | undefined,
  categoria: string,
  pctSolarOverride?: number | null,
): number {
  if (!config) return 0;
  const pctSolar = pctSolarOverride != null ? pctSolarOverride : config.percentual_solar;
  switch (categoria) {
    case 'AR_RX':
      return Math.floor(config.capacidade_total * (100 - pctSolar) / 100);
    case 'AR_SOLAR':
      return Math.floor(config.capacidade_total * pctSolar / 100);
    default:
      return 0;
  }
}
