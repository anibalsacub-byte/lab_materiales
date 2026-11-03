import { describe, it, expect } from 'vitest';
import {
  reaccionIzquierda,
  reaccionDerecha,
  cortante,
  momento,
  momentoMaximo,
  deflexionMaxima,
  momentoEmpotramiento,
  esfuerzoFlexion,
  type ParametrosViga,
} from '../mechanics/bending';

const E = 200000; // MPa
const I = 8_000_000; // mm⁴

describe('Viga simplemente apoyada — carga puntual en el centro', () => {
  const p: ParametrosViga = { apoyo: 'simple', tipoCarga: 'puntual', L_mm: 4000, P_N: 10000, a_mm: 2000 };

  it('reacciones iguales en ambos apoyos (P/2)', () => {
    expect(reaccionIzquierda(p)).toBeCloseTo(5000, 6);
    expect(reaccionDerecha(p)).toBeCloseTo(5000, 6);
  });

  it('Mmax = PL/4 en el centro', () => {
    const m = momentoMaximo(p);
    expect(m.valor).toBeCloseTo((10000 * 4000) / 4, 3);
    expect(m.x_mm).toBeCloseTo(2000, 6);
  });

  it('el cortante cambia de signo justo bajo la carga', () => {
    expect(cortante(1999, p)).toBeCloseTo(5000, 3);
    expect(cortante(2001, p)).toBeCloseTo(-5000, 3);
  });

  it('δ en el centro coincide con la fórmula clásica PL³/(48EI)', () => {
    const d = deflexionMaxima(p, E, I);
    expect(d.valor).toBeCloseTo((10000 * 4000 ** 3) / (48 * E * I), 6);
    expect(d.x_mm).toBeCloseTo(2000, 6);
  });
});

describe('Viga simplemente apoyada — carga puntual descentrada', () => {
  const p: ParametrosViga = { apoyo: 'simple', tipoCarga: 'puntual', L_mm: 3000, P_N: 9000, a_mm: 1000 };

  it('reacciones proporcionales a la distancia al apoyo opuesto', () => {
    expect(reaccionIzquierda(p)).toBeCloseTo(6000, 3); // P·b/L
    expect(reaccionDerecha(p)).toBeCloseTo(3000, 3); // P·a/L
  });

  it('M bajo la carga = P·a·b/L', () => {
    expect(momento(1000, p)).toBeCloseTo((9000 * 1000 * 2000) / 3000, 3);
  });
});

describe('Viga simplemente apoyada — carga distribuida', () => {
  const p: ParametrosViga = { apoyo: 'simple', tipoCarga: 'distribuida', L_mm: 4000, w_N_mm: 5 };

  it('reacciones iguales (wL/2)', () => {
    expect(reaccionIzquierda(p)).toBeCloseTo((5 * 4000) / 2, 6);
    expect(reaccionDerecha(p)).toBeCloseTo((5 * 4000) / 2, 6);
  });

  it('Mmax = wL²/8 en el centro', () => {
    const m = momentoMaximo(p);
    expect(m.valor).toBeCloseTo((5 * 4000 ** 2) / 8, 3);
    expect(m.x_mm).toBeCloseTo(2000, 6);
  });

  it('δmax = 5wL⁴/(384EI) en el centro', () => {
    const d = deflexionMaxima(p, E, I);
    expect(d.valor).toBeCloseTo((5 * 5 * 4000 ** 4) / (384 * E * I), 3);
  });
});

describe('Viga en voladizo — carga puntual en el extremo libre', () => {
  const p: ParametrosViga = { apoyo: 'voladizo', tipoCarga: 'puntual', L_mm: 4000, P_N: 10000 };

  it('la reacción en el empotramiento es P', () => {
    expect(reaccionIzquierda(p)).toBeCloseTo(10000, 6);
    expect(reaccionDerecha(p)).toBe(0);
  });

  it('el cortante es constante e igual a P en todo el claro', () => {
    expect(cortante(0, p)).toBeCloseTo(10000, 6);
    expect(cortante(3999, p)).toBeCloseTo(10000, 6);
  });

  it('Mmax = P·L en el empotramiento (momento negativo, hogging)', () => {
    const m = momentoMaximo(p);
    expect(Math.abs(m.valor)).toBeCloseTo(10000 * 4000, 3);
    expect(m.x_mm).toBe(0);
    expect(momentoEmpotramiento(p)).toBeCloseTo(-10000 * 4000, 3);
  });

  it('δ en el extremo libre = PL³/(3EI)', () => {
    const d = deflexionMaxima(p, E, I);
    expect(d.valor).toBeCloseTo((10000 * 4000 ** 3) / (3 * E * I), 3);
    expect(d.x_mm).toBe(4000);
  });
});

describe('Viga en voladizo — carga distribuida', () => {
  const p: ParametrosViga = { apoyo: 'voladizo', tipoCarga: 'distribuida', L_mm: 4000, w_N_mm: 5 };

  it('la reacción en el empotramiento es wL', () => {
    expect(reaccionIzquierda(p)).toBeCloseTo(5 * 4000, 6);
  });

  it('Mmax = wL²/2 en el empotramiento', () => {
    const m = momentoMaximo(p);
    expect(Math.abs(m.valor)).toBeCloseTo((5 * 4000 ** 2) / 2, 3);
  });

  it('δ en el extremo libre = wL⁴/(8EI)', () => {
    const d = deflexionMaxima(p, E, I);
    expect(d.valor).toBeCloseTo((5 * 4000 ** 4) / (8 * E * I), 3);
  });
});

describe('Esfuerzo por flexión y validaciones', () => {
  it('σ = M·c/I', () => {
    expect(esfuerzoFlexion(10_000_000, 50, 8_000_000)).toBeCloseTo((10_000_000 * 50) / 8_000_000, 6);
  });

  it('rechaza longitud no positiva', () => {
    expect(() => reaccionIzquierda({ apoyo: 'simple', tipoCarga: 'puntual', L_mm: 0, P_N: 1000, a_mm: 0 })).toThrow();
  });

  it('rechaza una posición de carga puntual fuera del claro', () => {
    expect(() => momento(100, { apoyo: 'simple', tipoCarga: 'puntual', L_mm: 1000, P_N: 1000, a_mm: 1000 })).toThrow();
  });

  it('rechaza x fuera del claro', () => {
    const p: ParametrosViga = { apoyo: 'simple', tipoCarga: 'distribuida', L_mm: 1000, w_N_mm: 2 };
    expect(() => momento(1500, p)).toThrow();
  });
});
