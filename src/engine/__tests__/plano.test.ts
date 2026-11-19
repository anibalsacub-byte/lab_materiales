import { describe, expect, it } from 'vitest';
import { analizarColapso, desplazamientos, ensamblar, esMecanismo, fuerzasAxiales, nudosSinArriostrar, reacciones } from '../mechanics/reticulado3d';
import { aEstructura, conteoMaxwell, etiquetasGdl, plantillaArmadura, quitarNudo, vectorCargas, type ArmaduraPlana } from '../mechanics/plano';

const triangulo: ArmaduraPlana = {
  nudos: [
    { x: 0, y: 0, apoyo: 'articulado' },
    { x: 400, y: 0, apoyo: 'rodilloH' },
    { x: 200, y: 150, apoyo: 'ninguno' },
  ],
  barras: [{ a: 0, b: 1 }, { a: 0, b: 2 }, { a: 1, b: 2 }],
  cargas: [{ nudo: 2, fx: 0, fy: -100 }],
};

function resolver(arm: ArmaduraPlana) {
  const e = aEstructura(arm);
  const props = e.barras.map(() => ({ EA: 1e4, capTraccion: Infinity, capCompresion: Infinity, modoTraccion: 'traccion' as const, modoCompresion: 'pandeo' as const }));
  const activas = e.barras.map(() => true);
  const sis = ensamblar(e, props, activas);
  const f = vectorCargas(arm);
  const u = desplazamientos(sis, f);
  const N = fuerzasAxiales(e, props, activas, u);
  return { e, sis, f, u, N, R: reacciones(e, activas, N, f), props };
}

describe('Armaduras planas', () => {
  it('triángulo con carga en el vértice: fuerzas y reacciones de la estática', () => {
    const { N, R, sis, f, u } = resolver(triangulo);
    expect(N[0]).toBeCloseTo(66.667, 2); // cordón inferior en tracción
    expect(N[1]).toBeCloseTo(-83.333, 2);
    expect(N[2]).toBeCloseTo(-83.333, 2);
    expect(R[2]).toBeCloseTo(50, 6); // reacción vertical en A (eje z del motor)
    expect(R[5]).toBeCloseTo(50, 6);
    expect(R[0]).toBeCloseTo(0, 6);
    expect(esMecanismo(sis, f, u)).toBe(false);
    expect(conteoMaxwell(triangulo).grado).toBe(0);
    expect(etiquetasGdl(triangulo)).toEqual(['u2x', 'u3x', 'u3y']);
    expect(sis.n).toBe(3);
  });

  it('dos rodillos horizontales no impiden el desplazamiento lateral: mecanismo', () => {
    const arm: ArmaduraPlana = { ...triangulo, nudos: triangulo.nudos.map((n, i) => (i === 0 ? { ...n, apoyo: 'rodilloH' } : n)), cargas: [{ nudo: 2, fx: 5, fy: -100 }] };
    const { sis, f, u } = resolver(arm);
    expect(conteoMaxwell(arm).grado).toBe(-1);
    expect(esMecanismo(sis, f, u)).toBe(true);
  });

  it('Pratt de 6 paneles: isostática, estable y con reacciones iguales a la mitad de la carga', () => {
    const arm = plantillaArmadura('pratt', 600, 100, 6, 120);
    expect(conteoMaxwell(arm).grado).toBe(0);
    const { N, R, sis, f, u, e } = resolver(arm);
    expect(esMecanismo(sis, f, u)).toBe(false);
    expect(R[2] + R[3 * 6 + 2]).toBeCloseTo(120, 6);
    expect(R[2]).toBeCloseTo(60, 6);
    // Cordón inferior del tercer panel: momentos respecto del nudo superior en x = 200 → N·h = R·200 − P·100
    const central = e.barras.findIndex((b) => b.a === 2 && b.b === 3);
    expect(N[central]).toBeCloseTo((60 * 200 - 24 * 100) / 100, 4);
  });

  it('Howe y Warren también son isostáticas y estables', () => {
    for (const tipo of ['howe', 'warren', 'warren-montantes'] as const) {
      const arm = plantillaArmadura(tipo, 600, 100, 6, 60);
      expect(conteoMaxwell(arm).grado).toBe(0);
      const { sis, f, u } = resolver(arm);
      expect(esMecanismo(sis, f, u)).toBe(false);
    }
  });

  it('colapso con capacidad: el factor de carga escala el patrón de cargas', () => {
    const { e, props } = resolver(triangulo);
    const conCap = props.map((p) => ({ ...p, capTraccion: 1000, capCompresion: 41.6667 }));
    const r = analizarColapso(e, conCap, vectorCargas(triangulo), new Float64Array(9));
    expect(r.Pmax).toBeCloseTo(0.5, 4); // las diagonales llevan 83,3 N por factor 1
  });

  it('quitar un nudo renumera barras y cargas', () => {
    const arm = quitarNudo(triangulo, 0);
    expect(arm.nudos.length).toBe(2);
    expect(arm.barras).toEqual([{ a: 0, b: 1 }]);
    expect(arm.cargas[0].nudo).toBe(1);
  });
});

describe('Nudos sin arriostrar', () => {
  it('el punto medio de una barra con solo sus dos tramos alineados queda suelto', () => {
    const arm: ArmaduraPlana = {
      nudos: [...triangulo.nudos, { x: 100, y: 75, apoyo: 'ninguno' }],
      barras: [{ a: 0, b: 1 }, { a: 0, b: 3 }, { a: 3, b: 2 }, { a: 1, b: 2 }],
      cargas: triangulo.cargas,
    };
    expect(nudosSinArriostrar(aEstructura(arm))).toEqual([3]);
    expect(nudosSinArriostrar(aEstructura(triangulo))).toEqual([]);
  });
});
