import { describe, it, expect } from 'vitest';
import { analizarMohr, transformarEsfuerzo, esfuerzoPromedio, radioCirculo } from '../mechanics/mohr';

describe('Círculo de Mohr — caso de validación obligatorio (sección 12)', () => {
  // σx = 80 MPa, σy = 20 MPa, τxy = 30 MPa
  const estado = { sigmaX_MPa: 80, sigmaY_MPa: 20, tauXY_MPa: 30 };

  it('esfuerzo promedio = 50 MPa', () => {
    expect(esfuerzoPromedio(estado)).toBeCloseTo(50, 6);
  });

  it('radio ≈ 42.426 MPa', () => {
    expect(radioCirculo(estado)).toBeCloseTo(42.426, 2);
  });

  it('esfuerzos principales ≈ 92.426 y 7.574 MPa', () => {
    const r = analizarMohr(estado);
    expect(r.sigma1_MPa).toBeCloseTo(92.426, 2);
    expect(r.sigma2_MPa).toBeCloseTo(7.574, 2);
  });
});

describe('Transformación de esfuerzos', () => {
  const estado = { sigmaX_MPa: 80, sigmaY_MPa: 20, tauXY_MPa: 30 };

  it('θ = 0 devuelve el estado original', () => {
    const t = transformarEsfuerzo(estado, 0);
    expect(t.sigmaX_MPa).toBeCloseTo(estado.sigmaX_MPa, 9);
    expect(t.sigmaY_MPa).toBeCloseTo(estado.sigmaY_MPa, 9);
    expect(t.tauXY_MPa).toBeCloseTo(estado.tauXY_MPa, 9);
  });

  it('en el ángulo principal, el esfuerzo cortante transformado es ~0', () => {
    const r = analizarMohr(estado);
    const t = transformarEsfuerzo(estado, r.thetaP1_deg);
    expect(Math.abs(t.tauXY_MPa)).toBeLessThan(1e-6);
  });

  it('σx + σy es invariante ante la rotación', () => {
    const t = transformarEsfuerzo(estado, 37);
    expect(t.sigmaX_MPa + t.sigmaY_MPa).toBeCloseTo(estado.sigmaX_MPa + estado.sigmaY_MPa, 6);
  });

  it('en el ángulo de cortante máximo, |τ| = radio del círculo', () => {
    const r = analizarMohr(estado);
    const t = transformarEsfuerzo(estado, r.thetaCortanteMax_deg);
    expect(Math.abs(t.tauXY_MPa)).toBeCloseTo(r.radio_MPa, 6);
  });
});

describe('Caso de corte puro (validación de signos)', () => {
  it('σx=σy=0, τxy=τ: esfuerzos principales = ±τ a 45°', () => {
    const estado = { sigmaX_MPa: 0, sigmaY_MPa: 0, tauXY_MPa: 40 };
    const r = analizarMohr(estado);
    expect(r.sigma1_MPa).toBeCloseTo(40, 6);
    expect(r.sigma2_MPa).toBeCloseTo(-40, 6);
    expect(Math.abs(r.thetaP1_deg)).toBeCloseTo(45, 6);
  });
});
