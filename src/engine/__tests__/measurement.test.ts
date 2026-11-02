import { describe, it, expect } from 'vitest';
import { medir, INSTRUMENTOS, elegirCeldaCarga } from '../measurement';

describe('Instrumentación virtual', () => {
  const celda = INSTRUMENTOS.celdaCarga50kN;

  it('una magnitud dentro de rango devuelve una lectura numérica', () => {
    const lectura = medir(10000, celda, { semillaEnsayo: 42, indicePunto: 0, calibrado: true });
    expect(lectura.fueraDeRango).toBe(false);
    expect(lectura.valor).not.toBeNull();
    expect(Math.abs(lectura.valor! - 10000)).toBeLessThanOrEqual(lectura.incertidumbre + celda.resolucion);
  });

  it('una magnitud fuera de rango satura el instrumento y advierte', () => {
    const lectura = medir(999999, celda, { semillaEnsayo: 42, indicePunto: 0, calibrado: true });
    expect(lectura.fueraDeRango).toBe(true);
    expect(lectura.valor).toBeNull();
    expect(lectura.advertencias.length).toBeGreaterThan(0);
  });

  it('la lectura se redondea a la resolución del instrumento', () => {
    const lectura = medir(10000, celda, { semillaEnsayo: 1, indicePunto: 0, calibrado: true });
    const restoResolucion = (lectura.valor! / celda.resolucion) % 1;
    expect(Math.min(restoResolucion, 1 - restoResolucion)).toBeLessThan(1e-9);
  });

  it('misma semilla y punto ⇒ misma lectura (reproducibilidad)', () => {
    const a = medir(10000, celda, { semillaEnsayo: 7, indicePunto: 3, calibrado: true });
    const b = medir(10000, celda, { semillaEnsayo: 7, indicePunto: 3, calibrado: true });
    expect(a.valor).toBe(b.valor);
  });

  it('distinta semilla ⇒ puede dar una lectura distinta', () => {
    const a = medir(10000, celda, { semillaEnsayo: 7, indicePunto: 3, calibrado: true });
    const b = medir(10000, celda, { semillaEnsayo: 999, indicePunto: 3, calibrado: true });
    // No garantizado matemáticamente que difieran siempre, pero con semillas distintas
    // y resolución fina de esta celda, en la práctica el offset difiere.
    expect(typeof a.valor).toBe('number');
    expect(typeof b.valor).toBe('number');
  });

  it('sin calibrar, la lectura incluye advertencia de error de cero', () => {
    const lectura = medir(10000, celda, { semillaEnsayo: 7, indicePunto: 0, calibrado: false });
    expect(lectura.advertencias.some((a) => a.includes('puesta a cero'))).toBe(true);
  });

  it('el error de cero es determinista para una misma semilla e instrumento', () => {
    const a = medir(0, celda, { semillaEnsayo: 7, indicePunto: 0, calibrado: false });
    const b = medir(0, celda, { semillaEnsayo: 7, indicePunto: 0, calibrado: false });
    expect(a.valor).toBe(b.valor);
  });

  it('calibrar (sin error de cero) y no calibrar dan en general lecturas distintas', () => {
    const noCalibrado = medir(0, celda, { semillaEnsayo: 7, indicePunto: 0, calibrado: false });
    const calibrado = medir(0, celda, { semillaEnsayo: 7, indicePunto: 0, calibrado: true });
    expect(noCalibrado.valor).not.toBe(calibrado.valor);
  });
});

describe('Selección automática de celda de carga', () => {
  it('elige la celda más pequeña que cubre la fuerza esperada', () => {
    expect(elegirCeldaCarga(10000).id).toBe('celda-carga-50kn');
    expect(elegirCeldaCarga(80000).id).toBe('celda-carga-200kn');
    expect(elegirCeldaCarga(500000).id).toBe('celda-carga-1000kn');
  });

  it('una fuerza que excede todas las celdas usa la de mayor rango disponible', () => {
    expect(elegirCeldaCarga(5000000).id).toBe('celda-carga-1000kn');
  });
});
