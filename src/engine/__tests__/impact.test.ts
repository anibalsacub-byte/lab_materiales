import { describe, it, expect } from 'vitest';
import {
  DATOS_IMPACTO,
  PENDULO_CHARPY,
  anguloSubida,
  energiaCharpy,
  energiaDesdeAngulos,
  energiaPotencial,
  fraccionFracturaDuctil,
  temperaturaParaEnergia,
  temperaturaProbeta,
  velocidadImpacto,
} from '../mechanics/impact';
import { obtenerMaterial } from '../materials';

const { masa_kg: m, brazo_m: R } = PENDULO_CHARPY;

describe('Péndulo Charpy', () => {
  it('a 150° es un péndulo de 300 J con velocidad de impacto de ~5,4 m/s', () => {
    expect(energiaPotencial(m, R, 150)).toBeCloseTo(300, -1);
    expect(velocidadImpacto(R, 150)).toBeCloseTo(5.41, 2);
  });

  it('el ángulo de subida y la energía indicada son inversos (la indicación incluye las pérdidas)', () => {
    const beta = anguloSubida(m, R, 150, 100, PENDULO_CHARPY.perdidas_J)!;
    expect(energiaDesdeAngulos(m, R, 150, beta)).toBeCloseTo(100 + PENDULO_CHARPY.perdidas_J, 6);
  });

  it('en vacío el péndulo sube casi hasta α: solo pierde el rozamiento', () => {
    const beta = anguloSubida(m, R, 150, 0, PENDULO_CHARPY.perdidas_J)!;
    expect(beta).toBeLessThan(150);
    expect(beta).toBeGreaterThan(149);
  });

  it('si la energía disponible no alcanza, la probeta no rompe', () => {
    expect(anguloSubida(m, R, 30, 100, 0.6)).toBeUndefined();
  });
});

describe('Transición dúctil–frágil', () => {
  const a36 = DATOS_IMPACTO['astm-a36'];

  it('en T0 la energía es el promedio de los estantes, y los extremos tienden a ellos', () => {
    expect(energiaCharpy(a36, a36.T0)).toBeCloseTo((a36.inferior + a36.superior) / 2, 6);
    expect(energiaCharpy(a36, -196)).toBeCloseTo(a36.inferior, 0);
    expect(energiaCharpy(a36, 100)).toBeCloseTo(a36.superior, 0);
  });

  it('T27J es la inversa de la curva', () => {
    const T27 = temperaturaParaEnergia(a36, 27)!;
    expect(energiaCharpy(a36, T27)).toBeCloseTo(27, 6);
  });

  it('más carbono sube la transición y baja el estante superior (1045 frente a A36)', () => {
    const t1045 = DATOS_IMPACTO['sae-1045'];
    expect(t1045.T0).toBeGreaterThan(a36.T0);
    expect(t1045.superior).toBeLessThan(a36.superior);
  });

  it('los FCC no tienen transición: menos de 25 % de variación entre −196 °C y 100 °C', () => {
    const inox = DATOS_IMPACTO['aisi-304'];
    expect(energiaCharpy(inox, -196) / energiaCharpy(inox, 100)).toBeGreaterThan(0.75);
    expect(fraccionFracturaDuctil(inox, energiaCharpy(inox, -196))).toBe(100);
  });

  it('la entalla en U, menos aguda, baja la temperatura de transición', () => {
    expect(temperaturaParaEnergia(a36, 27, 'U')!).toBeLessThan(temperaturaParaEnergia(a36, 27, 'V')!);
  });

  it('todos los materiales con datos de impacto existen en la biblioteca', () => {
    for (const id of Object.keys(DATOS_IMPACTO)) expect(obtenerMaterial(id)).toBeDefined();
  });
});

describe('Temperatura de la probeta durante el traslado', () => {
  it('a los 5 s una probeta a −40 °C ya se calentó unos 5 °C; a los 60 s, mucho más', () => {
    const a5 = temperaturaProbeta(-40, 23, 5);
    expect(a5 - -40).toBeGreaterThan(4);
    expect(a5 - -40).toBeLessThan(6);
    expect(temperaturaProbeta(-40, 23, 60)).toBeGreaterThan(-20);
  });
});
