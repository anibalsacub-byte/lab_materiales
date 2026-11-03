import { describe, it, expect } from 'vitest';
import {
  esfuerzoAxial,
  deformacionUnitaria,
  alargamientoElastico,
  deformacionTransversal,
  esfuerzoEnDeformacion,
  deformacionDesdeEsfuerzo,
  deformacionPermanenteTrasDescarga,
  parametrosCurvaBilineal,
  esfuerzoConHistoria,
  trabajoDeformacion,
  limiteElasticoOffset,
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

  it('acero A36: en la meseta de fluencia el esfuerzo es constante en σY', () => {
    const a36 = obtenerMaterial('astm-a36')!;
    const p = parametrosCurvaBilineal(a36)!;
    const puntoMedio = (p.epsY + p.epsPlateauFin) / 2;
    expect(esfuerzoEnDeformacion(a36, puntoMedio)).toBeCloseTo(p.sigmaY, 6);
  });

  it('acero A36: pasada la meseta, el endurecimiento es menor que si siguiera lineal desde el origen', () => {
    const a36 = obtenerMaterial('astm-a36')!;
    const p = parametrosCurvaBilineal(a36)!;
    const puntoEndurecimiento = (p.epsPlateauFin + p.epsUTS) / 2;
    const sigma = esfuerzoEnDeformacion(a36, puntoEndurecimiento)!;
    expect(sigma).toBeLessThan(200000 * puntoEndurecimiento);
    expect(sigma).toBeGreaterThan(p.sigmaY);
    expect(sigma).toBeLessThanOrEqual(p.sigmaU);
  });

  it('acero A36: en el pico (εUTS) el esfuerzo es σU', () => {
    const a36 = obtenerMaterial('astm-a36')!;
    const p = parametrosCurvaBilineal(a36)!;
    expect(esfuerzoEnDeformacion(a36, p.epsUTS)).toBeCloseTo(p.sigmaU, 6);
  });

  it('acero A36: pasado εUTS, el esfuerzo ingenieril cae (ablandamiento por estricción) hasta εF', () => {
    const a36 = obtenerMaterial('astm-a36')!;
    const p = parametrosCurvaBilineal(a36)!;
    const puntoAblandamiento = (p.epsUTS + p.epsF) / 2;
    const sigma = esfuerzoEnDeformacion(a36, puntoAblandamiento)!;
    expect(sigma).toBeLessThan(p.sigmaU);
    expect(sigma).toBeGreaterThan(p.sigmaFractura);
    expect(esfuerzoEnDeformacion(a36, p.epsF)).toBeCloseTo(p.sigmaFractura, 6);
  });

  it('un material sin meseta de fluencia (p. ej. aluminio) endurece inmediatamente tras εY', () => {
    const al = obtenerMaterial('al-6061-t6')!;
    const p = parametrosCurvaBilineal(al)!;
    expect(p.epsPlateauFin).toBeCloseTo(p.epsY, 9); // sin meseta: el endurecimiento empieza en εY
  });

  it('fundición gris (frágil): no hay fluencia, falla devuelve undefined más allá de εF', () => {
    const fundicion = obtenerMaterial('fundicion-gris-clase30')!;
    const epsF = fundicion.propiedades.epsilonF!;
    expect(esfuerzoEnDeformacion(fundicion, epsF * 1.5)).toBeUndefined();
  });

  it('frágil con σU < E·εF (fundición gris, ABS, PLA…): curva cóncava de pendiente inicial E que rompe en (εF, σU) sin superarlo', () => {
    for (const id of ['fundicion-gris-clase30', 'abs', 'pla-fdm', 'abs-fdm']) {
      const m = obtenerMaterial(id)!;
      const { E_MPa, sigmaU_MPa, epsilonF } = m.propiedades;
      expect(esfuerzoEnDeformacion(m, epsilonF!)).toBeCloseTo(sigmaU_MPa!, 6);
      const h = epsilonF! * 1e-5;
      expect(esfuerzoEnDeformacion(m, h)! / h).toBeCloseTo(E_MPa!, -2);
      for (let i = 1; i <= 50; i++) expect(esfuerzoEnDeformacion(m, (epsilonF! * i) / 50)!).toBeLessThanOrEqual(sigmaU_MPa! + 1e-9);
    }
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

describe('deformacionDesdeEsfuerzo — inversa del modelo constitutivo (control por fuerza)', () => {
  it('es exactamente invertible en el régimen elástico', () => {
    const a36 = obtenerMaterial('astm-a36')!;
    const eps = deformacionDesdeEsfuerzo(a36, 80)!;
    expect(eps).toBeCloseTo(80 / 200000, 9);
    expect(esfuerzoEnDeformacion(a36, eps)).toBeCloseTo(80, 6);
  });

  it('es invertible en el régimen plástico (bilineal)', () => {
    const a36 = obtenerMaterial('astm-a36')!;
    const sigmaObjetivo = 320; // entre σY=250 y σU=400
    const eps = deformacionDesdeEsfuerzo(a36, sigmaObjetivo)!;
    expect(esfuerzoEnDeformacion(a36, eps)).toBeCloseTo(sigmaObjetivo, 6);
  });

  it('es invertible para un material frágil', () => {
    const fundicion = obtenerMaterial('fundicion-gris-clase30')!;
    const eps = deformacionDesdeEsfuerzo(fundicion, 150)!;
    expect(esfuerzoEnDeformacion(fundicion, eps)).toBeCloseTo(150, 6);
  });

  it('devuelve undefined más allá de la resistencia que el modelo puede alcanzar', () => {
    const a36 = obtenerMaterial('astm-a36')!;
    expect(deformacionDesdeEsfuerzo(a36, 1000)).toBeUndefined(); // > σU
    const fundicion = obtenerMaterial('fundicion-gris-clase30')!;
    expect(deformacionDesdeEsfuerzo(fundicion, 700)).toBeUndefined(); // > σU del modelo frágil
  });

  it('ida y vuelta: σ → ε → σ coincide para una malla de esfuerzos', () => {
    const a36 = obtenerMaterial('astm-a36')!;
    for (const sigma of [10, 100, 249, 260, 350, 399]) {
      const eps = deformacionDesdeEsfuerzo(a36, sigma);
      expect(eps).toBeDefined();
      expect(esfuerzoEnDeformacion(a36, eps!)).toBeCloseTo(sigma, 4);
    }
  });
});

describe('esfuerzoConHistoria — descarga y recarga elásticas', () => {
  const a36 = obtenerMaterial('astm-a36')!;
  const E = a36.propiedades.E_MPa!;

  it('en carga monótona coincide con la curva del material', () => {
    expect(esfuerzoConHistoria(a36, 0.05, 0.05)).toBeCloseTo(esfuerzoEnDeformacion(a36, 0.05)!, 9);
  });

  it('al descargar sigue una recta de pendiente E hasta la deformación permanente', () => {
    const epsMax = 0.05;
    const sigmaMax = esfuerzoEnDeformacion(a36, epsMax)!;
    const epsP = epsMax - sigmaMax / E;
    expect(esfuerzoConHistoria(a36, epsP, epsMax)).toBeCloseTo(0, 6);
    expect(esfuerzoConHistoria(a36, (epsP + epsMax) / 2, epsMax)).toBeCloseTo(sigmaMax / 2, 6);
    expect(epsP).toBeCloseTo(deformacionPermanenteTrasDescarga(a36, epsMax), 9);
  });

  it('por debajo de la deformación permanente la probeta queda sin carga (nunca compresión)', () => {
    expect(esfuerzoConHistoria(a36, 0, 0.05)).toBe(0);
  });

  it('un material frágil también descarga con pendiente E desde el punto alcanzado', () => {
    const fundicion = obtenerMaterial('fundicion-gris-clase30')!;
    const sigmaMax = esfuerzoEnDeformacion(fundicion, 0.004)!;
    expect(esfuerzoConHistoria(fundicion, 0.0035, 0.004)).toBeCloseTo(sigmaMax - fundicion.propiedades.E_MPa! * 0.0005, 6);
  });
});

describe('trabajoDeformacion — energía absorbida', () => {
  it('área del triángulo elástico = ½·σ·ε', () => {
    expect(trabajoDeformacion([{ epsilon: 0, sigma_MPa: 0 }, { epsilon: 0.001, sigma_MPa: 200 }])).toBeCloseTo(0.1, 9);
  });

  it('un ciclo elástico de carga y descarga no absorbe energía neta', () => {
    const ciclo = [{ epsilon: 0, sigma_MPa: 0 }, { epsilon: 0.001, sigma_MPa: 200 }, { epsilon: 0, sigma_MPa: 0 }];
    expect(trabajoDeformacion(ciclo)).toBeCloseTo(0, 9);
  });
});

describe('limiteElasticoOffset — método del 0,2 %', () => {
  it('en un acero con meseta, Rp0,2 coincide con σY', () => {
    const a36 = obtenerMaterial('astm-a36')!;
    expect(limiteElasticoOffset(a36)!.sigma_MPa).toBeCloseTo(250, 3);
  });

  it('en un aluminio sin meseta, Rp0,2 queda ligeramente por encima de σY', () => {
    const al = obtenerMaterial('al-6061-t6')!;
    const rp = limiteElasticoOffset(al)!.sigma_MPa;
    expect(rp).toBeGreaterThan(al.propiedades.sigmaY_MPa!);
    expect(rp).toBeLessThan(al.propiedades.sigmaY_MPa! * 1.05);
  });

  it('un material frágil no tiene límite convencional (rompe antes)', () => {
    expect(limiteElasticoOffset(obtenerMaterial('fundicion-gris-clase30')!)).toBeUndefined();
  });
});
