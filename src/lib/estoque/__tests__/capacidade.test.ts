import { describe, it, expect } from 'vitest';
import { calcularCapacidadePorCategoria } from '../capacidade';

describe('calcularCapacidadePorCategoria', () => {
  describe('config ausente', () => {
    it('null → 0 para AR_RX', () => {
      expect(calcularCapacidadePorCategoria(null, 'AR_RX')).toBe(0);
    });
    it('undefined → 0 para AR_SOLAR', () => {
      expect(calcularCapacidadePorCategoria(undefined, 'AR_SOLAR')).toBe(0);
    });
    it('null → 0 para categoria desconhecida', () => {
      expect(calcularCapacidadePorCategoria(null, 'LENTES')).toBe(0);
    });
  });

  describe('AR_RX', () => {
    it('800 total, 25% solar → 600 rx', () => {
      expect(calcularCapacidadePorCategoria({ capacidade_total: 800, percentual_solar: 25 }, 'AR_RX')).toBe(600);
    });
    it('1000 total, 30% solar → 700 rx', () => {
      expect(calcularCapacidadePorCategoria({ capacidade_total: 1000, percentual_solar: 30 }, 'AR_RX')).toBe(700);
    });
    it('1100 total, 30% solar → 770 rx', () => {
      expect(calcularCapacidadePorCategoria({ capacidade_total: 1100, percentual_solar: 30 }, 'AR_RX')).toBe(770);
    });
  });

  describe('AR_SOLAR', () => {
    it('800 total, 25% solar → 200 solar', () => {
      expect(calcularCapacidadePorCategoria({ capacidade_total: 800, percentual_solar: 25 }, 'AR_SOLAR')).toBe(200);
    });
    it('1000 total, 30% solar → 300 solar', () => {
      expect(calcularCapacidadePorCategoria({ capacidade_total: 1000, percentual_solar: 30 }, 'AR_SOLAR')).toBe(300);
    });
    it('1100 total, 30% solar → 330 solar', () => {
      expect(calcularCapacidadePorCategoria({ capacidade_total: 1100, percentual_solar: 30 }, 'AR_SOLAR')).toBe(330);
    });
  });

  describe('categorias sem meta física', () => {
    const cfg = { capacidade_total: 800, percentual_solar: 25 };
    it('LENTES → 0', () => expect(calcularCapacidadePorCategoria(cfg, 'LENTES')).toBe(0));
    it('LENTES_GRAU → 0', () => expect(calcularCapacidadePorCategoria(cfg, 'LENTES_GRAU')).toBe(0));
    it('LENTES_CONTATO → 0', () => expect(calcularCapacidadePorCategoria(cfg, 'LENTES_CONTATO')).toBe(0));
    it('ACESSORIOS → 0', () => expect(calcularCapacidadePorCategoria(cfg, 'ACESSORIOS')).toBe(0));
    it('OUTROS → 0', () => expect(calcularCapacidadePorCategoria(cfg, 'OUTROS')).toBe(0));
    it('string vazia → 0', () => expect(calcularCapacidadePorCategoria(cfg, '')).toBe(0));
  });

  describe('casos de borda', () => {
    it('percentual_solar=0 → AR_RX = total, AR_SOLAR = 0', () => {
      const cfg = { capacidade_total: 600, percentual_solar: 0 };
      expect(calcularCapacidadePorCategoria(cfg, 'AR_RX')).toBe(600);
      expect(calcularCapacidadePorCategoria(cfg, 'AR_SOLAR')).toBe(0);
    });
    it('percentual_solar=100 → AR_RX = 0, AR_SOLAR = total', () => {
      const cfg = { capacidade_total: 600, percentual_solar: 100 };
      expect(calcularCapacidadePorCategoria(cfg, 'AR_RX')).toBe(0);
      expect(calcularCapacidadePorCategoria(cfg, 'AR_SOLAR')).toBe(600);
    });
    it('arredondamento para baixo: 1000 total, 33% solar → AR_RX=670, AR_SOLAR=330', () => {
      const cfg = { capacidade_total: 1000, percentual_solar: 33 };
      expect(calcularCapacidadePorCategoria(cfg, 'AR_RX')).toBe(670);
      expect(calcularCapacidadePorCategoria(cfg, 'AR_SOLAR')).toBe(330);
    });
    it('soma RX+Solar pode ser menor que total por floor', () => {
      const cfg = { capacidade_total: 1000, percentual_solar: 33 };
      const rx = calcularCapacidadePorCategoria(cfg, 'AR_RX');
      const solar = calcularCapacidadePorCategoria(cfg, 'AR_SOLAR');
      expect(rx + solar).toBeLessThanOrEqual(cfg.capacidade_total);
    });
  });
});
