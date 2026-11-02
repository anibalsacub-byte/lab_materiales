import { describe, it, expect } from 'vitest';
import {
  esfuerzoAxial,
  deformacionUnitaria,
  alargamientoElastico,
  deformacionTransversal,
  esfuerzoEnDeformacion,
  deformacionPermanenteTrasDescarga,
} from '../mechanics/axial';
import { obtenerMaterial } from '../materials';

describe('Axial — caso de validación obligatorio (sección 12)', () => {
  // P = 10 000 N, A = 100 mm², L = 100 mm, E = 200 000 MPa
  const P = 10000;
  const A = 100;
  const L = 100;
  const E = 200000;

  it('σ = 100 MPa', () => {
    expect(esfuerzoAxial(P, A)).toBeCloseTo(100, 6);
  });

  it('ΔL = 0.05 mm', () => {
    expect(alargamientoElastico(P, L, A, E)).toBeCloseTo(0.05, 9);
  });

  it('ε = 0.0005', () => {
    const deltaL = alargamientoElastico(P, L, A, E);
    expect(deformacionUnitaria(deltaL, L)).toBeCloseTo(0.0005, 9);
  });
});

describe('Axial — validaciones de entradas inválidas', () => {
  it('rechaza área no positiva', () => {
    expect(() => esfuerzoAxial(1000, 0)).toThrow();
    expect(() => esfuerzoAxial(1000, -5)).toThrow();
  });

  it('rechaza longitud no positiva', () => {
    expect(() => deformacionUnitaria(0.1, 0)).toThrow();
  });
});

describe('Deformación transversal y Poisson', () => {
  it('ε_transversal = -ν·ε_longitudinal', () => {
    expect(deformacionTransversal(0.001, 0.3)).toBeCloseTo(-0.0003, 9);
  });
});

describe('Modelo constitutivo por material', () => {
  it('acero A36 (bilineal): en régimen elástico usa σ = E·ε', () => {
    const a36 = obtenerMaterial('astm-a36')!;
    const eps = 0.0005; // muy por debajo de εY
    expect(esfuerzoEnDeformacion(a36, eps)).toBeCloseTo(200000 * eps, 6);
  });

  it('acero A36: más allá de εY el esfuerzo es menor que si siguiera lineal (endurecimiento)', () => {
    const a36 = obtenerMaterial('astm-a36')!;
    const epsY = a36.propiedades.sigmaY_MPa! / a36.propiedades.E_MPa!;
    const sigma = esfuerzoEnDeformacion(a36, epsY * 2)!;
    expect(sigma).toBeLessThan(200000 * epsY * 2);
    expect(sigma).toBeGreaterThan(a36.propiedades.sigmaY_MPa!);
  });

  it('fundición gris (frágil): no hay fluencia, falla devuelve undefined más allá de εF', () => {
    const fundicion = obtenerMaterial('fundicion-gris-clase30')!;
    const epsF = fundicion.propiedades.epsilonF!;
    expect(esfuerzoEnDeformacion(fundicion, epsF * 1.5)).toBeUndefined();
  });

  it('descarga puramente elástica (no supera εY) no deja deformación permanente', () => {
    const a36 = obtenerMaterial('astm-a36')!;
    expect(deformacionPermanenteTrasDescarga(a36, 0.0005)).toBeCloseTo(0, 9);
  });

  it('descarga tras fluencia deja deformación permanente positiva', () => {
    const a36 = obtenerMaterial('astm-a36')!;
    const epsY = a36.propiedades.sigmaY_MPa! / a36.propiedades.E_MPa!;
    const permanente = deformacionPermanenteTrasDescarga(a36, epsY * 3);
    expect(permanente).toBeGreaterThan(0);
    expect(permanente).toBeLessThan(epsY * 3);
  });
});
