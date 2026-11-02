import { describe, it, expect } from 'vitest';
import { momentoPolarInerciaCircular, anguloGiro, esfuerzoCortanteMaximoTorsion } from '../mechanics/torsion';

describe('Torsión — caso de validación obligatorio (sección 12)', () => {
  // Eje circular macizo d=10mm, L=500mm, G=80000MPa, T=10 N·m = 10000 N·mm
  const d = 10;
  const L = 500;
  const G = 80000;
  const T = 10 * 1000; // N·mm

  it('ángulo de giro ≈ 0.06366 rad', () => {
    const J = momentoPolarInerciaCircular(d);
    expect(anguloGiro(T, L, G, J)).toBeCloseTo(0.06366, 4);
  });

  it('esfuerzo cortante máximo ≈ 50.93 MPa', () => {
    const J = momentoPolarInerciaCircular(d);
    const tauMax = esfuerzoCortanteMaximoTorsion(T, d / 2, J);
    expect(tauMax).toBeCloseTo(50.93, 1);
  });
});

describe('Torsión — eje tubular y validaciones', () => {
  it('un eje tubular tiene menor J que uno macizo del mismo diámetro exterior', () => {
    const Jmaciza = momentoPolarInerciaCircular(10);
    const Jtubular = momentoPolarInerciaCircular(10, 6);
    expect(Jtubular).toBeLessThan(Jmaciza);
  });

  it('rechaza diámetro interior mayor o igual al exterior', () => {
    expect(() => momentoPolarInerciaCircular(10, 10)).toThrow();
    expect(() => momentoPolarInerciaCircular(10, 12)).toThrow();
  });
});
