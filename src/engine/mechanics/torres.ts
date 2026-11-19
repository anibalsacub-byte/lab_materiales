/**
 * Concurso de estructuras: materiales de maqueta, secciones (haces de hebras o palitos),
 * uniones pegadas, generador de torres por niveles y cargas sobre la placa superior.
 *
 * Unidades: mm, N, MPa, g.
 */
import { crearPRNG } from '../prng';
import { esbeltezTransicionJohnson, esfuerzoCriticoJohnsonEuler } from './buckling';
import { longitudBarra, type Barra, type Estructura, type GrupoBarra, type ModoFalla, type Nudo, type PropiedadBarra } from './reticulado3d';

export const G_MM_S2 = 9.81;

export interface SeccionMaqueta {
  id: string;
  etiqueta: string;
  /** Área (mm²). */
  A: number;
  /** Momento de inercia mínimo (mm⁴): gobierna el pandeo. */
  I: number;
  /** Perímetro de contacto con el pegamento (mm). */
  perimetro: number;
}

export interface MaterialMaqueta {
  id: string;
  nombre: string;
  nombreCorto: string;
  E_MPa: number;
  /** Resistencia a la tracción. */
  sigmaT_MPa: number;
  /** Resistencia a la compresión de una pieza corta (aplastamiento). */
  sigmaC_MPa: number;
  densidad_kg_m3: number;
  /** Coeficiente de variación de la resistencia entre piezas (dispersión natural). */
  cv: number;
  color: string;
  secciones: SeccionMaqueta[];
  descripcion: string;
  fuente: string;
}

/** Posiciones (en diámetros) de las hebras de un haz compacto. */
const POSICIONES_HAZ: Record<number, [number, number][]> = {
  1: [[0, 0]],
  2: [[-0.5, 0], [0.5, 0]],
  3: [[-0.5, 0], [0.5, 0], [0, Math.sqrt(3) / 2]],
  4: [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]],
  7: [[0, 0], ...Array.from({ length: 6 }, (_, k) => [Math.cos((k * Math.PI) / 3), Math.sin((k * Math.PI) / 3)] as [number, number])],
};

/**
 * Haz de n hebras circulares de diámetro d pegadas entre sí (trabajan juntas). El momento de
 * inercia es el mínimo principal del conjunto (teorema de Steiner), así que un haz de 2 hebras
 * pandea por su lado débil.
 */
export function seccionHaz(d: number, hebras: number): SeccionMaqueta {
  const pos = POSICIONES_HAZ[hebras];
  const a1 = (Math.PI * d * d) / 4;
  const i1 = (Math.PI * d ** 4) / 64;
  const cx = pos.reduce((s, p) => s + p[0], 0) / pos.length;
  const cy = pos.reduce((s, p) => s + p[1], 0) / pos.length;
  let Ixx = 0;
  let Iyy = 0;
  let Ixy = 0;
  for (const [px, py] of pos) {
    const x = (px - cx) * d;
    const y = (py - cy) * d;
    Ixx += i1 + a1 * y * y;
    Iyy += i1 + a1 * x * x;
    Ixy += a1 * x * y;
  }
  const Imin = (Ixx + Iyy) / 2 - Math.sqrt(((Ixx - Iyy) / 2) ** 2 + Ixy ** 2);
  // Perímetro de la envolvente del haz (lo que toca el pegamento en el nudo).
  const perimetro = hebras === 1 ? Math.PI * d : hebras === 2 ? Math.PI * d + 2 * d : hebras === 3 ? Math.PI * d + 3 * d : hebras === 4 ? Math.PI * d + 4 * d : Math.PI * 3 * d;
  return {
    id: `${hebras}h`,
    etiqueta: hebras === 1 ? '1 hebra' : `${hebras} hebras`,
    A: a1 * hebras,
    I: Imin,
    perimetro,
  };
}

/** Pieza rectangular b × h (el pandeo ocurre por el lado delgado). */
export function seccionRectangular(b: number, h: number, etiqueta = `${b} × ${h} mm`): SeccionMaqueta {
  return { id: `${b}x${h}`, etiqueta, A: b * h, I: (Math.max(b, h) * Math.min(b, h) ** 3) / 12, perimetro: 2 * (b + h) };
}

const HEBRAS = [1, 2, 3, 4, 7];

/**
 * Valores ilustrativos de referencia (el docente puede editarlos con sus propios ensayos).
 * Tallarín: E ≈ 5 GPa (Guinea et al. 2004; JEI 2022), σt ≈ 31 MPa, d = 1,65 mm.
 * Balsa, bambú y madera de palito: órdenes de magnitud de Wood Handbook (USDA FPL) y literatura.
 */
export const MATERIALES_MAQUETA: MaterialMaqueta[] = [
  {
    id: 'tallarin',
    nombre: 'Tallarín seco (spaghetti n.º 5)',
    nombreCorto: 'Tallarín',
    E_MPa: 5000,
    sigmaT_MPa: 31,
    sigmaC_MPa: 40,
    densidad_kg_m3: 1500,
    cv: 0.15,
    color: '#e8c46a',
    secciones: HEBRAS.map((n) => seccionHaz(1.65, n)),
    descripcion: 'Frágil y casi lineal elástico. Muy resistente a la tracción para su peso, pero una hebra larga pandea con muy poca carga.',
    fuente: 'E ≈ 5 GPa (Guinea, Rojo y Elices 2004; JEI 2022, 5,07 ± 1,7 GPa); σt ≈ 31 ± 4 MPa (ensayos de tracción de clase).',
  },
  {
    id: 'bambu',
    nombre: 'Brocheta de bambú Ø 3 mm',
    nombreCorto: 'Bambú',
    E_MPa: 17000,
    sigmaT_MPa: 160,
    sigmaC_MPa: 60,
    densidad_kg_m3: 700,
    cv: 0.2,
    color: '#d9b77e',
    secciones: [1, 2, 3, 4].map((n) => ({ ...seccionHaz(3, n), etiqueta: n === 1 ? '1 brocheta' : `${n} brochetas` })),
    descripcion: 'Fibras largas y muy resistentes a la tracción; más rígido que el tallarín y bastante más pesado.',
    fuente: 'Bambú en dirección de la fibra: E 15–20 GPa, σt 150–200 MPa (valores típicos de literatura).',
  },
  {
    id: 'balsa',
    nombre: 'Varilla de balsa',
    nombreCorto: 'Balsa',
    E_MPa: 3500,
    sigmaT_MPa: 18,
    sigmaC_MPa: 11,
    densidad_kg_m3: 160,
    cv: 0.2,
    color: '#efe0b9',
    secciones: [seccionRectangular(3, 3), seccionRectangular(5, 5), seccionRectangular(6, 6), seccionRectangular(10, 3)],
    descripcion: 'Muy liviana: permite secciones gruesas que resisten el pandeo con poco peso.',
    fuente: 'Balsa de densidad media (≈ 160 kg/m³): E ≈ 3,4 GPa, σc ≈ 11 MPa (Wood Handbook, USDA FPL).',
  },
  {
    id: 'palito',
    nombre: 'Palito de helado (madera dura)',
    nombreCorto: 'Palito',
    E_MPa: 10000,
    sigmaT_MPa: 70,
    sigmaC_MPa: 40,
    densidad_kg_m3: 600,
    cv: 0.15,
    color: '#d2a86a',
    secciones: [seccionRectangular(10, 2, '1 palito (10 × 2 mm)'), seccionRectangular(10, 4, '2 palitos (10 × 4 mm)'), seccionRectangular(10, 6, '3 palitos (10 × 6 mm)')],
    descripcion: 'Plano: muy rígido en un sentido y débil en el otro. Pegar palitos uno sobre otro mejora mucho el pandeo.',
    fuente: 'Maderas duras (abedul, haya): E ≈ 10 GPa, σc ≈ 40 MPa (Wood Handbook, USDA FPL).',
  },
];

export interface UnionMaqueta {
  id: string;
  nombre: string;
  /** Resistencia de adherencia al cortante del pegamento (MPa). */
  tau_MPa: number;
  /** Masa de pegamento por cada extremo de barra unido (g). */
  masaPorExtremo_g: number;
  /** Largo pegado de cada barra dentro del nudo (mm). */
  solape_mm: number;
  descripcion: string;
}

export const UNIONES_MAQUETA: UnionMaqueta[] = [
  { id: 'silicona', nombre: 'Silicona caliente', tau_MPa: 0.5, masaPorExtremo_g: 0.15, solape_mm: 10, descripcion: 'Rápida y fácil, pero blanda y pesada: el nudo suele despegarse antes de que rompa la barra.' },
  { id: 'cola', nombre: 'Cola blanca (PVA)', tau_MPa: 1.5, masaPorExtremo_g: 0.04, solape_mm: 10, descripcion: 'Liviana y resistente en madera; en tallarín agarra menos. Necesita tiempo de secado.' },
  { id: 'epoxi', nombre: 'Epóxico', tau_MPa: 3, masaPorExtremo_g: 0.08, solape_mm: 10, descripcion: 'La unión más resistente: casi siempre falla la barra antes que el nudo.' },
];

export type Planta = 'triangular' | 'cuadrada';
export type ArriostreCaras = 'ninguno' | 'diagonal' | 'zigzag' | 'X';
export type ArriostrePlanta = 'ninguno' | 'diagonal' | 'X';

export interface ParametrosTorre {
  planta: Planta;
  /** Lado de la base (mm). */
  ladoBase: number;
  /** Lado del nivel superior (mm). */
  ladoSuperior: number;
  altura: number;
  niveles: number;
  caras: ArriostreCaras;
  arriostrePlanta: ArriostrePlanta;
  /** Arriostrar la planta cada cuántos niveles (1 = en todos). */
  plantaCada: number;
}

export function verticesPlanta(planta: Planta, lado: number): [number, number][] {
  if (planta === 'cuadrada') {
    const s = lado / 2;
    return [[-s, -s], [s, -s], [s, s], [-s, s]];
  }
  const R = lado / Math.sqrt(3);
  return [90, 210, 330].map((g) => [R * Math.cos((g * Math.PI) / 180), R * Math.sin((g * Math.PI) / 180)]);
}

/**
 * Torre por niveles: patas en las esquinas, un anillo por nivel, caras arriostradas y,
 * si se pide, diagonales en planta. La placa de carga se apoya en el último nivel y se modela
 * como un diafragma rígido (barras «placa» que no pesan ni fallan).
 */
export function generarTorre(p: ParametrosTorre): Estructura {
  const m = p.planta === 'cuadrada' ? 4 : 3;
  const nudos: Nudo[] = [];
  const barras: Barra[] = [];
  const id = (k: number, c: number) => k * m + (((c % m) + m) % m);
  for (let k = 0; k <= p.niveles; k++) {
    const t = k / p.niveles;
    const lado = p.ladoBase + (p.ladoSuperior - p.ladoBase) * t;
    for (const [x, y] of verticesPlanta(p.planta, lado)) nudos.push({ x, y, z: p.altura * t, apoyo: k === 0 });
  }
  const agregar = (a: number, b: number, grupo: GrupoBarra) => barras.push({ a, b, grupo });
  for (let k = 0; k < p.niveles; k++) {
    for (let c = 0; c < m; c++) {
      agregar(id(k, c), id(k + 1, c), 'pata');
      const sube = (k % 2 === 0) || p.caras !== 'zigzag';
      if (p.caras === 'diagonal' || p.caras === 'X' || p.caras === 'zigzag') {
        if (sube) agregar(id(k, c), id(k + 1, c + 1), 'diagonal');
        else agregar(id(k, c + 1), id(k + 1, c), 'diagonal');
      }
      if (p.caras === 'X') agregar(id(k, c + 1), id(k + 1, c), 'diagonal');
    }
  }
  for (let k = 1; k <= p.niveles; k++) {
    for (let c = 0; c < m; c++) agregar(id(k, c), id(k, c + 1), 'anillo');
    if (m === 4) {
      if (k === p.niveles) {
        agregar(id(k, 0), id(k, 2), 'placa');
        agregar(id(k, 1), id(k, 3), 'placa');
      } else if (p.arriostrePlanta !== 'ninguno' && k % Math.max(1, p.plantaCada) === 0) {
        agregar(id(k, 0), id(k, 2), 'planta');
        if (p.arriostrePlanta === 'X') agregar(id(k, 1), id(k, 3), 'planta');
      }
    }
  }
  return { nudos, barras };
}

export function claveBarra(a: number, b: number): string {
  return a < b ? `${a}-${b}` : `${b}-${a}`;
}

/** Aplica las ediciones libres (barras quitadas y agregadas) a una torre generada. */
export function aplicarEdiciones(base: Estructura, quitadas: string[], agregadas: [number, number][]): Estructura {
  const fuera = new Set(quitadas);
  const barras = base.barras.filter((b) => b.grupo === 'placa' || !fuera.has(claveBarra(b.a, b.b)));
  const existentes = new Set(barras.map((b) => claveBarra(b.a, b.b)));
  for (const [a, b] of agregadas) {
    const k = claveBarra(a, b);
    if (a === b || existentes.has(k) || a >= base.nudos.length || b >= base.nudos.length) continue;
    existentes.add(k);
    barras.push({ a, b, grupo: 'libre' });
  }
  return { nudos: base.nudos, barras };
}

export type GrupoSeccion = 'pata' | 'anillo' | 'diagonal' | 'planta';

export function grupoSeccion(g: GrupoBarra): GrupoSeccion | null {
  if (g === 'placa') return null;
  if (g === 'libre') return 'diagonal';
  return g;
}

export interface ConfiguracionMaqueta {
  material: MaterialMaqueta;
  union: UnionMaqueta;
  secciones: Record<GrupoSeccion, string>;
  /** Variación aleatoria de resistencia entre piezas (reproducible con la semilla). */
  dispersion: boolean;
  semilla: number;
}

export interface DetalleBarra {
  L: number;
  seccion: SeccionMaqueta | null;
  /** Esbeltez L/r (articulada en ambos extremos, K = 1). */
  lambda: number;
  /** Carga crítica de Euler π²EI/L² (N). */
  Pcr: number;
  /** Capacidad de la unión pegada en tracción (N). */
  capUnion: number;
  masa_g: number;
  /** Factor de resistencia de esta pieza (dispersión). */
  factor: number;
}

function normalEstandar(rng: () => number): number {
  const u = Math.max(rng(), 1e-12);
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Propiedades mecánicas de cada barra según el material, la sección de su grupo y la unión. */
export function propiedadesMaqueta(e: Estructura, cfg: ConfiguracionMaqueta): { props: PropiedadBarra[]; detalle: DetalleBarra[] } {
  const { material: mat, union } = cfg;
  const rng = crearPRNG(cfg.semilla);
  const props: PropiedadBarra[] = [];
  const detalle: DetalleBarra[] = [];
  let EAmax = 1;
  for (const id of Object.values(cfg.secciones)) {
    const s = mat.secciones.find((x) => x.id === id);
    if (s) EAmax = Math.max(EAmax, mat.E_MPa * s.A);
  }
  for (let j = 0; j < e.barras.length; j++) {
    const b = e.barras[j];
    const L = longitudBarra(e, j);
    const factor = cfg.dispersion ? Math.min(1.5, Math.max(0.5, 1 + mat.cv * normalEstandar(rng))) : 1;
    const g = grupoSeccion(b.grupo);
    if (g === null) {
      props.push({ EA: EAmax * 50, capTraccion: Infinity, capCompresion: Infinity, modoTraccion: 'traccion', modoCompresion: 'pandeo', rigida: true });
      detalle.push({ L, seccion: null, lambda: 0, Pcr: Infinity, capUnion: Infinity, masa_g: 0, factor: 1 });
      continue;
    }
    const s = mat.secciones.find((x) => x.id === cfg.secciones[g]) ?? mat.secciones[0];
    const r = Math.sqrt(s.I / s.A);
    const lambda = L / r;
    const Pcr = (Math.PI ** 2 * mat.E_MPa * s.I) / (L * L);
    const capBarraT = mat.sigmaT_MPa * s.A * factor;
    const capUnion = union.tau_MPa * s.perimetro * union.solape_mm;
    const capC = esfuerzoCriticoJohnsonEuler(mat.E_MPa, mat.sigmaC_MPa, lambda) * s.A * factor;
    const lt = esbeltezTransicionJohnson(mat.E_MPa, mat.sigmaC_MPa);
    const modoT: ModoFalla = capUnion < capBarraT ? 'union' : 'traccion';
    props.push({
      EA: mat.E_MPa * s.A,
      capTraccion: Math.min(capBarraT, capUnion),
      capCompresion: capC,
      modoTraccion: modoT,
      modoCompresion: lambda >= lt ? 'pandeo' : 'aplastamiento',
    });
    detalle.push({ L, seccion: s, lambda, Pcr: Pcr * factor, capUnion, masa_g: mat.densidad_kg_m3 * 1e-6 * s.A * L, factor });
  }
  return { props, detalle };
}

/** Masa total de la maqueta (g): barras más pegamento en cada extremo unido. */
export function masaMaqueta(e: Estructura, detalle: DetalleBarra[], union: UnionMaqueta): { barras_g: number; pegamento_g: number; total_g: number } {
  let barras = 0;
  let extremos = 0;
  e.barras.forEach((b, j) => {
    if (b.grupo === 'placa') return;
    barras += detalle[j].masa_g;
    extremos += 2;
  });
  const pegamento = extremos * union.masaPorExtremo_g;
  return { barras_g: barras, pegamento_g: pegamento, total_g: barras + pegamento };
}

/** Nudos sobre los que se apoya la placa de carga (los más altos). */
export function nudosSuperiores(e: Estructura): number[] {
  const zMax = Math.max(...e.nudos.map((n) => n.z));
  return e.nudos.map((n, i) => (Math.abs(n.z - zMax) < 1e-6 ? i : -1)).filter((i) => i >= 0);
}

export interface OpcionesCarga {
  /** Excentricidad de la carga sobre la placa, en x (mm). */
  excentricidad: number;
  /** Carga lateral por imperfección, como fracción de la vertical (p. ej. 0,01 = 1 %). */
  lateral: number;
}

/**
 * Cargas nodales por cada newton de carga total sobre la placa. La placa rígida reparte la carga
 * entre los nudos superiores: por igual si está centrada, y con más carga del lado de la
 * excentricidad si no (Fi = P/n + P·e·xi/Σx²). La carga lateral representa la torre que nunca
 * está perfectamente vertical.
 */
export function cargaUnitariaPlaca(e: Estructura, op: OpcionesCarga): Float64Array {
  const f = new Float64Array(3 * e.nudos.length);
  const sup = nudosSuperiores(e);
  const xm = sup.reduce((s, i) => s + e.nudos[i].x, 0) / sup.length;
  const sx2 = sup.reduce((s, i) => s + (e.nudos[i].x - xm) ** 2, 0);
  for (const i of sup) {
    const dx = e.nudos[i].x - xm;
    f[3 * i + 2] = -(1 / sup.length + (sx2 > 0 ? (op.excentricidad * dx) / sx2 : 0));
    f[3 * i] = op.lateral / sup.length;
  }
  return f;
}

/** Peso propio repartido en los nudos (N): mitad de cada barra y su pegamento en cada extremo. */
export function cargaPesoPropio(e: Estructura, detalle: DetalleBarra[], union: UnionMaqueta): Float64Array {
  const f = new Float64Array(3 * e.nudos.length);
  e.barras.forEach((b, j) => {
    if (b.grupo === 'placa') return;
    const mitad = (detalle[j].masa_g / 2 + union.masaPorExtremo_g) * 1e-3 * G_MM_S2;
    f[3 * b.a + 2] -= mitad;
    f[3 * b.b + 2] -= mitad;
  });
  return f;
}
