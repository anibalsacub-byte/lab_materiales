import { describe, it, expect } from 'vitest';
import { esfuerzoCircunferencial, esfuerzoLongitudinal, esValidoParedDelgada } from '../mechanics/pressureVessel';

describe('Recipiente de pared delgada — caso de validación obligatorio (sección 12)', () => {
  // P = 1 MPa, radio interior = 100 mm, espesor = 5 mm, extremos cerrados
  const P = 1;
  const r = 100;
  const t = 5;

  it('es válido el modelo de pared delgada (r/t = 20 ≥ 10)', () => {
    expect(esValidoParedDelgada(r, t)).toBe(true);
  });

  it('esfuerzo circunferencial ≈ 20 MPa', () => {
    expect(esfuerzoCircunferencial(P, r, t)).toBeCloseTo(20, 6);
  });

  it('esfuerzo longitudinal ≈ 10 MPa (extremos cerrados)', () => {
    expect(esfuerzoLongitudinal(P, r, t)).toBeCloseTo(10, 6);
  });

  it('el esfuerzo circunferencial es el doble del longitudinal', () => {
    const sc = esfuerzoCircunferencial(P, r, t);
    const sl = esfuerzoLongitudinal(P, r, t);
    expect(sc).toBeCloseTo(2 * sl, 6);
  });
});

describe('Validez del modelo de pared delgada', () => {
  it('rechaza (marca inválido) un recipiente de pared gruesa', () => {
    expect(esValidoParedDelgada(20, 5)).toBe(false); // r/t = 4 < 10
  });
});
