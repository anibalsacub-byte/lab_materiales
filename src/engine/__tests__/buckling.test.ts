import { describe, it, expect } from 'vitest';
import {
  cargaCriticaEuler,
  esfuerzoCriticoEuler,
  esbeltez,
  radioGiro,
  longitudEfectiva,
  APOYOS,
  verificarAplicabilidadEuler,
  esbeltezCritica,
  factorSeguridad,
  deflexionConImperfeccion,
} from '../mechanics/buckling';

describe('Pandeo de Euler — caso de validación obligatorio (sección 12)', () => {
  // E = 200 000 MPa, I = 10 000 mm⁴, L = 1000 mm, K = 1
  it('Pcr ≈ 19.739 kN', () => {
    const Pcr = cargaCriticaEuler(200000, 10000, 1000, 1);
    expect(Pcr / 1000).toBeCloseTo(19.739, 2);
  });
});

describe('Condiciones de apoyo (K)', () => {
  it('expone los cuatro casos ideales con K coherentes', () => {
    expect(APOYOS['articulado-articulado'].K).toBeCloseTo(1.0, 6);
    expect(APOYOS['empotrado-libre'].K).toBeCloseTo(2.0, 6);
    expect(APOYOS['empotrado-articulado'].K).toBeCloseTo(0.699, 3);
    expect(APOYOS['empotrado-empotrado'].K).toBeCloseTo(0.5, 6);
  });

  it('a mayor K, menor carga crítica para la misma columna', () => {
    const PcrArtArt = cargaCriticaEuler(200000, 10000, 1000, APOYOS['articulado-articulado'].K);
    const PcrEmpLibre = cargaCriticaEuler(200000, 10000, 1000, APOYOS['empotrado-libre'].K);
    expect(PcrEmpLibre).toBeLessThan(PcrArtArt);
  });

  it('longitud efectiva escala con K', () => {
    expect(longitudEfectiva(1000, 2)).toBe(2000);
  });
});

describe('Esbeltez y radio de giro', () => {
  it('radio de giro y esbeltez se calculan correctamente', () => {
    const r = radioGiro(10000, 200); // I=10000mm4, A=200mm2
    expect(r).toBeCloseTo(Math.sqrt(50), 9);
    expect(esbeltez(1000, r)).toBeCloseTo(1000 / r, 9);
  });

  it('rechaza radio de giro no positivo', () => {
    expect(() => esbeltez(1000, 0)).toThrow();
  });
});

describe('Aplicabilidad de Euler', () => {
  it('columna esbelta: Euler aplica', () => {
    const esb = esbeltez(2000, radioGiro(10000, 200));
    const resultado = verificarAplicabilidadEuler(200000, esb, 250);
    expect(resultado.aplicable).toBe(true);
  });

  it('columna corta: Euler no aplica (esbeltez por debajo de la crítica)', () => {
    const esbCrit = esbeltezCritica(200000, 250);
    const resultado = verificarAplicabilidadEuler(200000, esbCrit / 2, 250);
    expect(resultado.aplicable).toBe(false);
  });
});

describe('Factor de seguridad e imperfección inicial', () => {
  it('factor de seguridad = Pcr / Paplicada', () => {
    expect(factorSeguridad(20000, 5000)).toBeCloseTo(4, 9);
  });

  it('columna perfecta (δ0 = 0): deflexión nula para toda P < Pcr', () => {
    expect(deflexionConImperfeccion(5000, 20000, 0)).toBe(0);
  });

  it('columna con imperfección: la deflexión crece y diverge al acercarse a Pcr', () => {
    const d1 = deflexionConImperfeccion(1000, 20000, 0.5);
    const d2 = deflexionConImperfeccion(18000, 20000, 0.5);
    expect(d2).toBeGreaterThan(d1);
  });

  it('rechaza evaluar en o más allá de Pcr (no hay trayectoria post-pandeo válida)', () => {
    expect(() => deflexionConImperfeccion(20000, 20000, 0.5)).toThrow();
    expect(() => deflexionConImperfeccion(25000, 20000, 0.5)).toThrow();
  });
});

describe('Esfuerzo crítico de Euler', () => {
  it('σcr = Pcr / A para una columna dada', () => {
    const I = 10000;
    const A = 200;
    const L = 1000;
    const K = 1;
    const r = radioGiro(I, A);
    const esb = esbeltez(longitudEfectiva(L, K), r);
    const sigmaCr = esfuerzoCriticoEuler(200000, esb);
    const Pcr = cargaCriticaEuler(200000, I, L, K);
    expect(sigmaCr * A).toBeCloseTo(Pcr, 3);
  });
});
