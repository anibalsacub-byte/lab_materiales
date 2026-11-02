import { describe, it, expect } from 'vitest';
import { calcularSeccion } from '../sections';

describe('Sección circular maciza', () => {
  it('área y momento de inercia de un círculo de 20 mm', () => {
    const s = calcularSeccion({ tipo: 'circular_maciza', d: 20 });
    expect(s.area_mm2).toBeCloseTo((Math.PI * 400) / 4, 6);
    expect(s.Ix_mm4).toBeCloseTo((Math.PI * 20 ** 4) / 64, 3);
    expect(s.esSimetrica).toBe(true);
  });
});

describe('Sección rectangular', () => {
  it('Ix = b·h³/12', () => {
    const s = calcularSeccion({ tipo: 'rectangular', b: 50, h: 100 });
    expect(s.area_mm2).toBe(5000);
    expect(s.Ix_mm4).toBeCloseTo((50 * 100 ** 3) / 12, 3);
    expect(s.Iy_mm4).toBeCloseTo((100 * 50 ** 3) / 12, 3);
  });
});

describe('Sección tubular rectangular', () => {
  it('resta correctamente el hueco interior', () => {
    const exterior = calcularSeccion({ tipo: 'rectangular', b: 60, h: 40 });
    const tubular = calcularSeccion({ tipo: 'rectangular_tubular', b: 60, h: 40, bInt: 40, hInt: 20 });
    expect(tubular.area_mm2).toBeLessThan(exterior.area_mm2);
    expect(tubular.Ix_mm4).toBeLessThan(exterior.Ix_mm4);
  });
});

describe('Perfil I', () => {
  it('es simétrico (Ixy = 0) y el centroide queda en el centro geométrico', () => {
    const s = calcularSeccion({ tipo: 'perfil_I', bf: 100, tf: 10, hw: 180, tw: 8 });
    expect(s.Ixy_mm4).toBeCloseTo(0, 6);
    expect(s.centroide.y_mm).toBeCloseTo(0, 6);
    expect(s.esSimetrica).toBe(true);
  });
});

describe('Perfil T', () => {
  it('es simétrico respecto al eje vertical (Ixy = 0) pero el centroide no está en el borde del ala', () => {
    const s = calcularSeccion({ tipo: 'perfil_T', bf: 100, tf: 10, hw: 90, tw: 10 });
    expect(s.Ixy_mm4).toBeCloseTo(0, 6);
    expect(s.centroide.y_mm).not.toBeCloseTo(0, 3);
  });
});

describe('Perfil L', () => {
  it('es asimétrico: Ixy ≠ 0 y los ejes principales están rotados', () => {
    const s = calcularSeccion({ tipo: 'perfil_L', bL: 80, hL: 40, tw: 6 });
    expect(Math.abs(s.Ixy_mm4)).toBeGreaterThan(0);
    expect(s.esSimetrica).toBe(false);
    expect(s.I1_mm4).toBeGreaterThanOrEqual(s.I2_mm4);
    expect(s.I1_mm4).toBeGreaterThanOrEqual(Math.max(s.Ix_mm4, s.Iy_mm4) - 1e-6);
  });

  it('rechaza espesor mayor o igual que alguna ala', () => {
    expect(() => calcularSeccion({ tipo: 'perfil_L', bL: 10, hL: 40, tw: 10 })).toThrow();
  });
});

describe('Validaciones de entradas inválidas', () => {
  it('rechaza diámetro interior mayor o igual al exterior en sección tubular circular', () => {
    expect(() => calcularSeccion({ tipo: 'circular_tubular', d: 20, dInt: 25 })).toThrow();
  });

  it('rechaza dimensiones faltantes', () => {
    expect(() => calcularSeccion({ tipo: 'rectangular' })).toThrow();
  });
});
