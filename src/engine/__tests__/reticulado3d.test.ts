import { describe, expect, it } from 'vitest';
import {
  analizarColapso,
  desplazamientos,
  ensamblar,
  esMecanismo,
  estadoEnCarga,
  fuerzasAxiales,
  pandeoGlobal,
  type Estructura,
  type PropiedadBarra,
} from '../mechanics/reticulado3d';
import {
  MATERIALES_MAQUETA,
  UNIONES_MAQUETA,
  aplicarEdiciones,
  cargaPesoPropio,
  cargaUnitariaPlaca,
  generarTorre,
  masaMaqueta,
  propiedadesMaqueta,
  seccionHaz,
  type ConfiguracionMaqueta,
  type ParametrosTorre,
} from '../mechanics/torres';

const prop = (EA: number, capT = Infinity, capC = Infinity): PropiedadBarra => ({ EA, capTraccion: capT, capCompresion: capC, modoTraccion: 'traccion', modoCompresion: 'pandeo' });

/** Pirámide de 4 patas: base cuadrada de lado 2a, vértice a altura h. */
function piramide(a: number, h: number): Estructura {
  return {
    nudos: [
      { x: -a, y: -a, z: 0, apoyo: true },
      { x: a, y: -a, z: 0, apoyo: true },
      { x: a, y: a, z: 0, apoyo: true },
      { x: -a, y: a, z: 0, apoyo: true },
      { x: 0, y: 0, z: h },
    ],
    barras: [0, 1, 2, 3].map((i) => ({ a: i, b: 4, grupo: 'pata' as const })),
  };
}

function cargaVertice(e: Estructura, P: number, nudo = 4): Float64Array {
  const f = new Float64Array(3 * e.nudos.length);
  f[3 * nudo + 2] = -P;
  return f;
}

describe('Reticulado espacial: rigidez', () => {
  it('pirámide de 4 patas: cada pata soporta P/(4·cos θ) en compresión', () => {
    const e = piramide(100, 300);
    const props = e.barras.map(() => prop(5000 * 2));
    const activas = e.barras.map(() => true);
    const sis = ensamblar(e, props, activas);
    const u = desplazamientos(sis, cargaVertice(e, 100));
    const N = fuerzasAxiales(e, props, activas, u);
    const L = Math.hypot(100, 100, 300);
    const esperado = -100 / (4 * (300 / L));
    for (const n of N) expect(n).toBeCloseTo(esperado, 6);
    expect(esMecanismo(sis, cargaVertice(e, 100), u)).toBe(false);
  });

  it('trípode con carga lateral: equilibrio de fuerzas en el vértice', () => {
    const e: Estructura = {
      nudos: [
        { x: 100, y: 0, z: 0, apoyo: true },
        { x: -50, y: 86.6, z: 0, apoyo: true },
        { x: -50, y: -86.6, z: 0, apoyo: true },
        { x: 0, y: 0, z: 200 },
      ],
      barras: [0, 1, 2].map((i) => ({ a: i, b: 3, grupo: 'pata' as const })),
    };
    const props = e.barras.map(() => prop(1e4));
    const activas = e.barras.map(() => true);
    const f = new Float64Array(12);
    f[9] = 7;
    f[11] = -50;
    const sis = ensamblar(e, props, activas);
    const N = fuerzasAxiales(e, props, activas, desplazamientos(sis, f));
    // Suma de las fuerzas de las barras sobre el vértice + carga = 0.
    const suma = [0, 0, 0];
    e.barras.forEach((b, j) => {
      const p = e.nudos[b.a];
      const q = e.nudos[b.b];
      const L = Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z);
      suma[0] += (-N[j] * (q.x - p.x)) / L;
      suma[1] += (-N[j] * (q.y - p.y)) / L;
      suma[2] += (-N[j] * (q.z - p.z)) / L;
    });
    expect(suma[0] + 7).toBeCloseTo(0, 6);
    expect(suma[1]).toBeCloseTo(0, 6);
    expect(suma[2] - 50).toBeCloseTo(0, 6);
  });

  it('un cubo sin diagonales es un mecanismo ante carga lateral', () => {
    const p: ParametrosTorre = { planta: 'cuadrada', ladoBase: 100, ladoSuperior: 100, altura: 100, niveles: 1, caras: 'ninguno', arriostrePlanta: 'ninguno', plantaCada: 1 };
    const e = generarTorre(p);
    const props = e.barras.map(() => prop(1e4));
    const activas = e.barras.map(() => true);
    const sis = ensamblar(e, props, activas);
    const f = cargaUnitariaPlaca(e, { excentricidad: 0, lateral: 0.01 });
    expect(esMecanismo(sis, f, desplazamientos(sis, f))).toBe(true);
  });

  it('pandeo global: columna de dos eslabones rígidos con resorte central, Pcr = k·a/2', () => {
    const a = 100;
    const kResorte = 2; // N/mm
    const Lr = 50;
    const EAr = kResorte * Lr;
    const e: Estructura = {
      nudos: [
        { x: 0, y: 0, z: 0, apoyo: true }, // 0 base
        { x: 0, y: 0, z: a }, // 1 nudo central
        { x: 0, y: 0, z: 2 * a }, // 2 cabeza
        { x: Lr, y: 0, z: a, apoyo: true }, // 3 resorte central en x
        { x: 0, y: Lr, z: a, apoyo: true }, // 4 resorte central en y
        { x: Lr, y: 0, z: 2 * a, apoyo: true }, // 5 guía de la cabeza en x
        { x: 0, y: Lr, z: 2 * a, apoyo: true }, // 6 guía de la cabeza en y
      ],
      barras: [
        { a: 0, b: 1, grupo: 'pata' },
        { a: 1, b: 2, grupo: 'pata' },
        { a: 1, b: 3, grupo: 'anillo' },
        { a: 1, b: 4, grupo: 'anillo' },
        { a: 2, b: 5, grupo: 'anillo' },
        { a: 2, b: 6, grupo: 'anillo' },
      ],
    };
    const props = [prop(1e9), prop(1e9), prop(EAr), prop(EAr), prop(1e9), prop(1e9)];
    const activas = e.barras.map(() => true);
    const sis = ensamblar(e, props, activas);
    const f = cargaVertice(e, 1, 2);
    const N = fuerzasAxiales(e, props, activas, desplazamientos(sis, f));
    const g = pandeoGlobal(e, activas, N, sis);
    expect(g).not.toBeNull();
    expect(g!.lambda).toBeCloseTo((kResorte * a) / 2, 2);
  });
});

describe('Ensayo hasta el colapso', () => {
  it('pirámide de patas iguales: colapsa cuando pandea la primera pata', () => {
    const e = piramide(100, 300);
    const Pcr = 10;
    const props = e.barras.map(() => prop(1e4, 1e6, Pcr));
    const r = analizarColapso(e, props, cargaVertice(e, 1), new Float64Array(15));
    const L = Math.hypot(100, 100, 300);
    expect(r.inestable).toBe(false);
    expect(r.Pmax).toBeCloseTo(4 * (300 / L) * Pcr, 6);
    expect(r.eventos[0].modo).toBe('pandeo');
    expect(r.eventos.slice(1).every((ev) => ev.cascada)).toBe(true);
    expect(estadoEnCarga(r, r.Pmax * 0.99).colapsada).toBe(false);
    expect(estadoEnCarga(r, r.Pmax).colapsada).toBe(true);
  });

  it('una torre sin arriostrar no soporta carga (mecanismo)', () => {
    const p: ParametrosTorre = { planta: 'cuadrada', ladoBase: 200, ladoSuperior: 200, altura: 400, niveles: 4, caras: 'ninguno', arriostrePlanta: 'ninguno', plantaCada: 1 };
    const e = generarTorre(p);
    const cfg = configTallarin();
    const { props } = propiedadesMaqueta(e, cfg);
    const r = analizarColapso(e, props, cargaUnitariaPlaca(e, { excentricidad: 0, lateral: 0.01 }), new Float64Array(3 * e.nudos.length));
    expect(r.inestable).toBe(true);
    expect(r.Pmax).toBe(0);
  });
});

function configTallarin(): ConfiguracionMaqueta {
  return {
    material: MATERIALES_MAQUETA[0],
    union: UNIONES_MAQUETA[2],
    secciones: { pata: '7h', anillo: '2h', diagonal: '2h', planta: '1h' },
    dispersion: false,
    semilla: 1,
  };
}

describe('Torres de maqueta', () => {
  it('haz de hebras: área n·A1 y el haz de 2 pandea por su lado débil', () => {
    const d = 1.65;
    const a1 = (Math.PI * d * d) / 4;
    const i1 = (Math.PI * d ** 4) / 64;
    expect(seccionHaz(d, 1).I).toBeCloseTo(i1, 10);
    expect(seccionHaz(d, 2).A).toBeCloseTo(2 * a1, 10);
    expect(seccionHaz(d, 2).I).toBeCloseTo(2 * i1, 10);
    // 7 hebras pegadas: mucho más que 7 veces la inercia de una sola.
    expect(seccionHaz(d, 7).I).toBeGreaterThan(20 * i1);
  });

  it('tallarín: una hebra de 100 mm pandea con ≈ 1,8 N y resiste ≈ 66 N en tracción', () => {
    const e = piramide(50, Math.sqrt(100 ** 2 - 2 * 50 ** 2)); // patas de 100 mm
    const cfg = { ...configTallarin(), secciones: { pata: '1h', anillo: '1h', diagonal: '1h', planta: '1h' } };
    const { props, detalle } = propiedadesMaqueta(e, cfg);
    expect(detalle[0].L).toBeCloseTo(100, 0);
    expect(props[0].capCompresion).toBeCloseTo(1.8, 1);
    expect(props[0].modoCompresion).toBe('pandeo');
    expect(seccionHaz(1.65, 1).A * 31).toBeCloseTo(66.3, 0);
  });

  it('torre cuadrada arriostrada en X: estable, con nudos y barras esperados', () => {
    const p: ParametrosTorre = { planta: 'cuadrada', ladoBase: 200, ladoSuperior: 120, altura: 500, niveles: 5, caras: 'X', arriostrePlanta: 'diagonal', plantaCada: 1 };
    const e = generarTorre(p);
    expect(e.nudos.length).toBe(24);
    // 20 patas + 40 diagonales + 20 anillos + 4 diagonales de planta + 2 de placa
    expect(e.barras.length).toBe(86);
    const cfg = configTallarin();
    const { props, detalle } = propiedadesMaqueta(e, cfg);
    const peso = cargaPesoPropio(e, detalle, cfg.union);
    const r = analizarColapso(e, props, cargaUnitariaPlaca(e, { excentricidad: 0, lateral: 0.01 }), peso);
    expect(r.inestable).toBe(false);
    expect(r.Pmax).toBeGreaterThan(5);
    const masa = masaMaqueta(e, detalle, cfg.union);
    expect(masa.total_g).toBeGreaterThan(masa.barras_g);
  });

  it('las ediciones libres quitan y agregan barras', () => {
    const p: ParametrosTorre = { planta: 'triangular', ladoBase: 200, ladoSuperior: 200, altura: 300, niveles: 3, caras: 'diagonal', arriostrePlanta: 'ninguno', plantaCada: 1 };
    const base = generarTorre(p);
    const editada = aplicarEdiciones(base, ['0-3'], [[0, 7]]);
    expect(editada.barras.length).toBe(base.barras.length);
    expect(editada.barras.some((b) => b.grupo === 'libre')).toBe(true);
  });

  it('la dispersión es reproducible con la misma semilla', () => {
    const e = generarTorre({ planta: 'cuadrada', ladoBase: 150, ladoSuperior: 150, altura: 300, niveles: 3, caras: 'X', arriostrePlanta: 'X', plantaCada: 1 });
    const cfg = { ...configTallarin(), dispersion: true, semilla: 42 };
    const a = propiedadesMaqueta(e, cfg).detalle.map((d) => d.factor);
    const b = propiedadesMaqueta(e, cfg).detalle.map((d) => d.factor);
    expect(a).toEqual(b);
    expect(new Set(a).size).toBeGreaterThan(5);
  });
});
