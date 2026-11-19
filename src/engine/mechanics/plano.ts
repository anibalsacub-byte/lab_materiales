/**
 * Armaduras planas (2D): nudos en el plano x–y (y vertical hacia arriba), apoyos articulados o de
 * rodillo y cargas en los nudos. Se resuelven con el mismo motor de reticulados espaciales, poniendo
 * la armadura en el plano x–z e impidiendo el desplazamiento fuera del plano.
 *
 * Unidades: mm y N.
 */
import type { Barra, Estructura, Nudo } from './reticulado3d';

/** rodilloH: rueda sobre una superficie horizontal (impide solo el movimiento vertical). rodilloV: sobre una pared. */
export type ApoyoPlano = 'ninguno' | 'articulado' | 'rodilloH' | 'rodilloV';

export interface NudoPlano {
  x: number;
  y: number;
  apoyo: ApoyoPlano;
}

export interface BarraPlano {
  a: number;
  b: number;
  /** Sección propia (id del material); si falta, se usa la sección por defecto. */
  seccion?: string;
}

export interface CargaPlano {
  nudo: number;
  fx: number;
  fy: number;
}

export interface ArmaduraPlana {
  nudos: NudoPlano[];
  barras: BarraPlano[];
  cargas: CargaPlano[];
}

export const REACCIONES_APOYO: Record<ApoyoPlano, number> = { ninguno: 0, articulado: 2, rodilloH: 1, rodilloV: 1 };

export function aEstructura(arm: ArmaduraPlana): Estructura {
  const nudos: Nudo[] = arm.nudos.map((n) => ({
    x: n.x,
    y: 0,
    z: n.y,
    fijo: [n.apoyo === 'articulado' || n.apoyo === 'rodilloV', true, n.apoyo === 'articulado' || n.apoyo === 'rodilloH'],
  }));
  const barras: Barra[] = arm.barras.map((b) => (b.seccion ? { a: b.a, b: b.b, grupo: 'libre', seccion: b.seccion } : { a: b.a, b: b.b, grupo: 'libre' }));
  return { nudos, barras };
}

/** Vector de cargas nodales del motor 3D (Fx → x, Fy → z). */
export function vectorCargas(arm: ArmaduraPlana): Float64Array {
  const f = new Float64Array(3 * arm.nudos.length);
  for (const c of arm.cargas) {
    if (c.nudo >= arm.nudos.length) continue;
    f[3 * c.nudo] += c.fx;
    f[3 * c.nudo + 2] += c.fy;
  }
  return f;
}

/**
 * Criterio de Maxwell para armaduras planas: con m barras, r reacciones y j nudos, si m + r < 2j la
 * armadura es un mecanismo; si m + r = 2j puede ser isostática; si m + r > 2j es hiperestática. Es una
 * condición necesaria: una armadura con barras mal ubicadas puede cumplirla y aun así ser inestable.
 */
export function conteoMaxwell(arm: ArmaduraPlana): { m: number; r: number; j: number; grado: number; texto: string } {
  const m = arm.barras.length;
  const r = arm.nudos.reduce((s, n) => s + REACCIONES_APOYO[n.apoyo], 0);
  const j = arm.nudos.length;
  const grado = m + r - 2 * j;
  const texto = grado < 0 ? 'faltan barras o apoyos: es un mecanismo' : grado === 0 ? 'isostática (si las barras están bien ubicadas)' : `hiperestática de grado ${grado}`;
  return { m, r, j, grado, texto };
}

export type PlantillaPlana = 'pratt' | 'howe' | 'warren' | 'warren-montantes' | 'vacia';

/**
 * Armaduras de puente clásicas de luz L, altura h y n paneles, apoyadas en un extremo con un apoyo
 * articulado y en el otro con un rodillo, con la carga total repartida en los nudos del tablero
 * (cordón inferior).
 */
export function plantillaArmadura(tipo: PlantillaPlana, L: number, h: number, paneles: number, cargaTotal: number): ArmaduraPlana {
  if (tipo === 'vacia') return { nudos: [], barras: [], cargas: [] };
  const n = Math.max(2, Math.round(paneles / 2) * 2);
  const dx = L / n;
  const nudos: NudoPlano[] = [];
  const barras: BarraPlano[] = [];
  for (let i = 0; i <= n; i++) nudos.push({ x: i * dx, y: 0, apoyo: i === 0 ? 'articulado' : i === n ? 'rodilloH' : 'ninguno' });
  const inf = (i: number) => i;
  const unir = (a: number, b: number) => barras.push({ a, b });
  for (let i = 0; i < n; i++) unir(inf(i), inf(i + 1));

  if (tipo === 'warren' || tipo === 'warren-montantes') {
    // Cordón superior en los puntos medios de los paneles.
    const sup = (i: number) => n + 1 + i;
    for (let i = 0; i < n; i++) nudos.push({ x: (i + 0.5) * dx, y: h, apoyo: 'ninguno' });
    for (let i = 0; i < n; i++) {
      unir(inf(i), sup(i));
      unir(sup(i), inf(i + 1));
      if (i < n - 1) unir(sup(i), sup(i + 1));
    }
    if (tipo === 'warren-montantes') {
      // Montantes desde el centro de cada panel superior hasta un nudo nuevo del tablero no son
      // posibles sin dividir el cordón: se agregan montantes en los nudos interiores del tablero
      // hasta el cordón superior, uniendo con el punto medio entre dos nudos superiores.
      for (let i = 1; i < n; i++) {
        const k = nudos.length;
        nudos.push({ x: i * dx, y: h, apoyo: 'ninguno' });
        // Se reemplaza la barra superior sup(i−1)–sup(i) por dos tramos con el nudo nuevo.
        const idx = barras.findIndex((b) => b.a === sup(i - 1) && b.b === sup(i));
        if (idx >= 0) barras.splice(idx, 1);
        unir(sup(i - 1), k);
        unir(k, sup(i));
        unir(inf(i), k);
      }
    }
  } else {
    // Pratt y Howe: nudos superiores sobre los nudos interiores del tablero.
    const sup = (i: number) => n + i; // i = 1..n−1
    for (let i = 1; i < n; i++) nudos.push({ x: i * dx, y: h, apoyo: 'ninguno' });
    for (let i = 1; i < n - 1; i++) unir(sup(i), sup(i + 1));
    unir(inf(0), sup(1));
    unir(inf(n), sup(n - 1));
    for (let i = 1; i < n; i++) unir(inf(i), sup(i));
    for (let i = 1; i < n - 1; i++) {
      const izquierda = i < n / 2;
      if (tipo === 'pratt') {
        // Diagonales que bajan hacia el centro: trabajan en tracción con cargas de gravedad.
        if (izquierda) unir(sup(i), inf(i + 1));
        else unir(sup(i + 1), inf(i));
      } else {
        // Howe: diagonales que suben hacia el centro (en compresión).
        if (izquierda) unir(inf(i), sup(i + 1));
        else unir(inf(i + 1), sup(i));
      }
    }
  }

  const cargas: CargaPlano[] = [];
  const interiores = n - 1;
  for (let i = 1; i < n; i++) cargas.push({ nudo: inf(i), fx: 0, fy: -cargaTotal / interiores });
  return { nudos, barras, cargas };
}

/** Quita un nudo con sus barras y cargas, renumerando los demás. */
export function quitarNudo(arm: ArmaduraPlana, i: number): ArmaduraPlana {
  const ren = (k: number) => (k > i ? k - 1 : k);
  return {
    nudos: arm.nudos.filter((_, k) => k !== i),
    barras: arm.barras.filter((b) => b.a !== i && b.b !== i).map((b) => ({ ...b, a: ren(b.a), b: ren(b.b) })),
    cargas: arm.cargas.filter((c) => c.nudo !== i).map((c) => ({ ...c, nudo: ren(c.nudo) })),
  };
}

/** Etiquetas de los grados de libertad libres (u3x, u3y…), en el orden de la matriz de rigidez. */
export function etiquetasGdl(arm: ArmaduraPlana): string[] {
  const r: string[] = [];
  arm.nudos.forEach((n, i) => {
    if (!(n.apoyo === 'articulado' || n.apoyo === 'rodilloV')) r.push(`u${i + 1}x`);
    if (!(n.apoyo === 'articulado' || n.apoyo === 'rodilloH')) r.push(`u${i + 1}y`);
  });
  return r;
}
