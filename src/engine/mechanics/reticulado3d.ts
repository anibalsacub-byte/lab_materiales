/**
 * Reticulados espaciales (barras articuladas en 3D) por el método de rigidez.
 *
 * Unidades: longitudes en mm, fuerzas en N, módulos en MPa (N/mm²).
 * Ejes: x, y en planta; z vertical hacia arriba (la gravedad actúa en −z).
 *
 * Además de las fuerzas axiales, el módulo calcula:
 *  - si la estructura es un mecanismo (no es estable con nudos articulados);
 *  - el factor de carga de pandeo global (análisis lineal de estabilidad K + λ·Kg);
 *  - la secuencia de fallas hasta el colapso, retirando cada barra que alcanza su capacidad.
 */

export interface Nudo {
  x: number;
  y: number;
  z: number;
  /** Nudo pegado a la base: los tres desplazamientos están impedidos. */
  apoyo?: boolean;
  /** Restricción por dirección [x, y, z]; si existe, reemplaza a «apoyo» (rodillos, armaduras planas). */
  fijo?: [boolean, boolean, boolean];
}

/** Indica si el desplazamiento del nudo en el eje k (0 = x, 1 = y, 2 = z) está impedido. */
export function restringido(n: Nudo, k: number): boolean {
  return n.fijo ? n.fijo[k] : !!n.apoyo;
}

export type GrupoBarra = 'pata' | 'anillo' | 'diagonal' | 'planta' | 'placa' | 'libre';

export interface Barra {
  a: number;
  b: number;
  grupo: GrupoBarra;
  /** Diagonal de una cruz en X (si los cruces van pegados, pandea en la mitad de su largo). */
  cruce?: boolean;
  /** Sección propia (id), en lugar de la de su grupo. */
  seccion?: string;
}

export interface Estructura {
  nudos: Nudo[];
  barras: Barra[];
}

export type ModoFalla = 'traccion' | 'pandeo' | 'aplastamiento' | 'union' | 'global' | 'mecanismo';

export interface PropiedadBarra {
  /** Rigidez axial E·A (N). */
  EA: number;
  /** Fuerza de tracción que rompe la barra o su unión (N). */
  capTraccion: number;
  /** Fuerza de compresión que la hace pandear o aplastarse (N, positiva). */
  capCompresion: number;
  modoTraccion: ModoFalla;
  modoCompresion: ModoFalla;
  /** Barra auxiliar que no falla (por ejemplo, la placa de carga). */
  rigida?: boolean;
}

export function longitudBarra(e: Estructura, j: number): number {
  const { a, b } = e.barras[j];
  const p = e.nudos[a];
  const q = e.nudos[b];
  return Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z);
}

function cosenos(e: Estructura, j: number): [number, number, number, number] {
  const { a, b } = e.barras[j];
  const p = e.nudos[a];
  const q = e.nudos[b];
  const L = Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z);
  return [(q.x - p.x) / L, (q.y - p.y) / L, (q.z - p.z) / L, L];
}

/** Sistema ensamblado y factorizado (Cholesky) para una configuración de barras activas. */
export interface SistemaRigidez {
  /** Número de ecuaciones (grados de libertad libres). */
  n: number;
  /** Grado de libertad global (3·nudo + eje) → ecuación, o −1 si está impedido. */
  mapa: Int32Array;
  /** Matriz de rigidez ensamblada (n×n, por filas), incluida la regularización. */
  K: Float64Array;
  /** Factor de Cholesky (triangular inferior, n×n). */
  L: Float64Array;
  /** Resorte mínimo añadido a cada ecuación para poder resolver aunque haya mecanismos. */
  kReg: number;
}

export function ensamblar(e: Estructura, props: PropiedadBarra[], activas: boolean[]): SistemaRigidez {
  const nN = e.nudos.length;
  const mapa = new Int32Array(3 * nN).fill(-1);
  let n = 0;
  for (let i = 0; i < nN; i++) {
    for (let k = 0; k < 3; k++) if (!restringido(e.nudos[i], k)) mapa[3 * i + k] = n++;
  }
  const K = new Float64Array(n * n);
  for (let j = 0; j < e.barras.length; j++) {
    if (!activas[j]) continue;
    const [cx, cy, cz, L] = cosenos(e, j);
    const c = [cx, cy, cz];
    const k = props[j].EA / L;
    const { a, b } = e.barras[j];
    const dofs = [3 * a, 3 * a + 1, 3 * a + 2, 3 * b, 3 * b + 1, 3 * b + 2];
    for (let r = 0; r < 6; r++) {
      const er = mapa[dofs[r]];
      if (er < 0) continue;
      for (let s = 0; s < 6; s++) {
        const es = mapa[dofs[s]];
        if (es < 0) continue;
        const signo = (r < 3) === (s < 3) ? 1 : -1;
        K[er * n + es] += signo * k * c[r % 3] * c[s % 3];
      }
    }
  }
  let maxDiag = 0;
  for (let i = 0; i < n; i++) maxDiag = Math.max(maxDiag, K[i * n + i]);
  const kReg = Math.max(maxDiag, 1) * 1e-12;
  for (let i = 0; i < n; i++) K[i * n + i] += kReg;
  return { n, mapa, K, L: cholesky(K, n), kReg };
}

function cholesky(K: Float64Array, n: number): Float64Array {
  const L = new Float64Array(n * n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let s = K[i * n + j];
      for (let k = 0; k < j; k++) s -= L[i * n + k] * L[j * n + k];
      if (i === j) L[i * n + i] = Math.sqrt(Math.max(s, 1e-300));
      else L[i * n + j] = s / L[j * n + j];
    }
  }
  return L;
}

function resolverReducido(sis: SistemaRigidez, b: Float64Array): Float64Array {
  const { n, L } = sis;
  const y = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let s = b[i];
    for (let k = 0; k < i; k++) s -= L[i * n + k] * y[k];
    y[i] = s / L[i * n + i];
  }
  const x = new Float64Array(n);
  for (let i = n - 1; i >= 0; i--) {
    let s = y[i];
    for (let k = i + 1; k < n; k++) s -= L[k * n + i] * x[k];
    x[i] = s / L[i * n + i];
  }
  return x;
}

/** Desplazamientos de todos los nudos (vector 3·nNudos) para un vector de cargas nodales. */
export function desplazamientos(sis: SistemaRigidez, cargas: Float64Array): Float64Array {
  const b = new Float64Array(sis.n);
  for (let g = 0; g < sis.mapa.length; g++) if (sis.mapa[g] >= 0) b[sis.mapa[g]] = cargas[g];
  const x = resolverReducido(sis, b);
  const u = new Float64Array(sis.mapa.length);
  for (let g = 0; g < sis.mapa.length; g++) if (sis.mapa[g] >= 0) u[g] = x[sis.mapa[g]];
  return u;
}

/** Fuerzas axiales (tracción positiva) a partir de los desplazamientos. */
export function fuerzasAxiales(e: Estructura, props: PropiedadBarra[], activas: boolean[], u: Float64Array): Float64Array {
  const N = new Float64Array(e.barras.length);
  for (let j = 0; j < e.barras.length; j++) {
    if (!activas[j]) continue;
    const [cx, cy, cz, L] = cosenos(e, j);
    const { a, b } = e.barras[j];
    const alargamiento = cx * (u[3 * b] - u[3 * a]) + cy * (u[3 * b + 1] - u[3 * a + 1]) + cz * (u[3 * b + 2] - u[3 * a + 2]);
    N[j] = (props[j].EA / L) * alargamiento;
  }
  return N;
}

/**
 * Nudos que sus barras no sujetan en alguna dirección: por ejemplo, el punto medio de una barra
 * dividida al que solo llegan los dos tramos alineados. Con nudos articulados, ese nudo se mueve
 * libremente en la dirección que nadie sujeta (o pandea si las barras están comprimidas).
 * Se arma M = Σ e·eᵀ con las direcciones de las barras (más los ejes impedidos por apoyos) y se
 * mira si M es singular.
 */
export function nudosSinArriostrar(e: Estructura, activas?: boolean[]): number[] {
  const M = e.nudos.map(() => [0, 0, 0, 0, 0, 0, 0, 0, 0]);
  const grado = e.nudos.map(() => 0);
  e.barras.forEach((b, j) => {
    if (activas && !activas[j]) return;
    const [cx, cy, cz] = cosenos(e, j);
    const c = [cx, cy, cz];
    for (const i of [b.a, b.b]) {
      grado[i]++;
      for (let r = 0; r < 3; r++) for (let s = 0; s < 3; s++) M[i][3 * r + s] += c[r] * c[s];
    }
  });
  const sueltos: number[] = [];
  e.nudos.forEach((n, i) => {
    if (grado[i] === 0) return;
    const m = M[i];
    for (let k = 0; k < 3; k++) if (restringido(n, k)) m[4 * k] += 1;
    const det = m[0] * (m[4] * m[8] - m[5] * m[7]) - m[1] * (m[3] * m[8] - m[5] * m[6]) + m[2] * (m[3] * m[7] - m[4] * m[6]);
    const traza = m[0] + m[4] + m[8];
    if (det < 1e-6 * (traza / 3) ** 3) sueltos.push(i);
  });
  return sueltos;
}

/**
 * Reacciones en los apoyos (vector 3·nNudos; cero en las direcciones libres): equilibrio de cada
 * nudo, R = −F − Σ(fuerzas de las barras sobre el nudo).
 */
export function reacciones(e: Estructura, activas: boolean[], N: Float64Array, cargas: Float64Array): Float64Array {
  const suma = new Float64Array(3 * e.nudos.length);
  for (let j = 0; j < e.barras.length; j++) {
    if (!activas[j]) continue;
    const [cx, cy, cz] = cosenos(e, j);
    const { a, b } = e.barras[j];
    const c = [cx, cy, cz];
    for (let k = 0; k < 3; k++) {
      suma[3 * a + k] += N[j] * c[k];
      suma[3 * b + k] -= N[j] * c[k];
    }
  }
  const R = new Float64Array(3 * e.nudos.length);
  e.nudos.forEach((n, i) => {
    for (let k = 0; k < 3; k++) if (restringido(n, k)) R[3 * i + k] = -cargas[3 * i + k] - suma[3 * i + k];
  });
  return R;
}

/**
 * Indica si la carga encuentra un mecanismo: con nudos articulados, una estructura sin
 * triangular se deforma sin resistencia. El sistema se resuelve con un resorte diminuto en cada
 * nudo; si ese resorte es el que sostiene la carga, la estructura es inestable: el
 * desplazamiento es del orden de F/kReg, mientras que en una estructura estable es F/k, con k
 * muchísimo mayor que kReg.
 */
export function esMecanismo(sis: SistemaRigidez, cargas: Float64Array, u: Float64Array): boolean {
  let fMax = 0;
  let uMax = 0;
  for (let g = 0; g < cargas.length; g++) {
    fMax = Math.max(fMax, Math.abs(cargas[g]));
    uMax = Math.max(uMax, Math.abs(u[g]));
  }
  if (fMax === 0) return false;
  return (uMax * sis.kReg) / fMax > 1e-5;
}

/** Nudo con el mayor desplazamiento (el que «se escapa» en un mecanismo). */
export function nudoMasDesplazado(u: Float64Array): { nudo: number; eje: 'x' | 'y' | 'z' } {
  let max = -1;
  let g = 0;
  for (let i = 0; i < u.length; i++) {
    if (Math.abs(u[i]) > max) {
      max = Math.abs(u[i]);
      g = i;
    }
  }
  return { nudo: Math.floor(g / 3), eje: (['x', 'y', 'z'] as const)[g % 3] };
}

/**
 * Factor de carga de pandeo global λ: la estructura pierde la estabilidad cuando las cargas
 * llegan a λ veces las del caso con fuerzas N. Resuelve (K + λ·Kg(N))·φ = 0 por iteración
 * inversa, donde Kg es la rigidez geométrica de cada barra (N/L)·(I − e·eᵀ). Solo ve la
 * inestabilidad de los nudos (la torre o un tramo de ella); el pandeo de cada barra entre sus
 * nudos se revisa aparte con Euler. Devuelve null si no hay pandeo para cargas positivas.
 */
export function pandeoGlobal(
  e: Estructura,
  activas: boolean[],
  N: Float64Array,
  sis: SistemaRigidez,
): { lambda: number; modo: Float64Array } | null {
  const { n, mapa, K } = sis;
  if (n === 0) return null;

  // y = B·x, con B = −Kg (positiva donde hay compresión).
  const multB = (x: Float64Array): Float64Array => {
    const y = new Float64Array(n);
    for (let j = 0; j < e.barras.length; j++) {
      if (!activas[j] || N[j] === 0) continue;
      const [cx, cy, cz, L] = cosenos(e, j);
      const c = [cx, cy, cz];
      const f = -N[j] / L;
      const { a, b } = e.barras[j];
      const da = [mapa[3 * a], mapa[3 * a + 1], mapa[3 * a + 2]];
      const db = [mapa[3 * b], mapa[3 * b + 1], mapa[3 * b + 2]];
      const d = [0, 0, 0];
      for (let k = 0; k < 3; k++) d[k] = (db[k] >= 0 ? x[db[k]] : 0) - (da[k] >= 0 ? x[da[k]] : 0);
      const proy = c[0] * d[0] + c[1] * d[1] + c[2] * d[2];
      for (let k = 0; k < 3; k++) {
        const v = f * (d[k] - c[k] * proy);
        if (db[k] >= 0) y[db[k]] += v;
        if (da[k] >= 0) y[da[k]] -= v;
      }
    }
    return y;
  };
  const multK = (x: Float64Array): Float64Array => {
    const y = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      let s = 0;
      for (let k = 0; k < n; k++) s += K[i * n + k] * x[k];
      y[i] = s;
    }
    return y;
  };
  const punto = (a: Float64Array, b: Float64Array) => {
    let s = 0;
    for (let i = 0; i < n; i++) s += a[i] * b[i];
    return s;
  };

  // Iteración de potencia sobre K⁻¹·B (desplazada en «s» si hace falta). Se lleva K·x junto con x
  // para no multiplicar por K en cada paso: si y = K⁻¹·B·x + s·x, entonces K·y = B·x + s·K·x.
  const iterar = (s: number): { mu: number; x: Float64Array } => {
    let x: Float64Array = new Float64Array(n);
    for (let i = 0; i < n; i++) x[i] = 1 + 0.37 * Math.sin(1.7 * i + 0.3) + 0.21 * Math.cos(0.9 * i * i);
    let kx: Float64Array = multK(x);
    let bx: Float64Array = multB(x);
    let mu = 0;
    for (let it = 0; it < 400; it++) {
      const y = resolverReducido(sis, bx);
      const ky = Float64Array.from(bx);
      if (s !== 0) {
        for (let i = 0; i < n; i++) {
          y[i] += s * x[i];
          ky[i] += s * kx[i];
        }
      }
      const yKy = punto(y, ky);
      if (!(yKy > 0)) return { mu: 0, x };
      const norma = Math.sqrt(yKy);
      for (let i = 0; i < n; i++) {
        y[i] /= norma;
        ky[i] /= norma;
      }
      const by = multB(y);
      // Cociente de Rayleigh con los operadores sin desplazar (y normalizado: yᵀ·K·y = 1).
      const nuevo = punto(y, by);
      x = y;
      kx = ky;
      bx = by;
      if (it > 15 && Math.abs(nuevo - mu) <= 1e-9 * Math.abs(nuevo)) {
        mu = nuevo;
        break;
      }
      mu = nuevo;
    }
    return { mu, x };
  };

  let { mu, x } = iterar(0);
  if (mu <= 0) {
    // El modo dominante es de tracción (carga invertida): se desplaza el espectro para hallar el
    // mayor valor positivo.
    const r = iterar(-mu * 1.0001);
    mu = r.mu;
    x = r.x;
  }
  if (!(mu > 1e-15)) return null;
  const modo = new Float64Array(mapa.length);
  let max = 0;
  for (let g = 0; g < mapa.length; g++) {
    if (mapa[g] >= 0) {
      modo[g] = x[mapa[g]];
      max = Math.max(max, Math.abs(modo[g]));
    }
  }
  if (max > 0) for (let g = 0; g < modo.length; g++) modo[g] /= max;
  return { lambda: 1 / mu, modo };
}

export interface EtapaColapso {
  activas: boolean[];
  /** Fuerzas axiales por newton de carga aplicada. */
  Nu: Float64Array;
  /** Fuerzas axiales por el peso propio. */
  Nw: Float64Array;
  uu: Float64Array;
  uw: Float64Array;
}

export interface EventoFalla {
  /** Carga total (N) a la que ocurre la falla. */
  P: number;
  /** Barra que falla (−1 para el pandeo global o el mecanismo final). */
  barra: number;
  modo: ModoFalla;
  /** Falla en cadena: ocurre sin aumentar la carga, porque las demás barras no pueden redistribuirla. */
  cascada: boolean;
}

export interface ResultadoColapso {
  etapas: EtapaColapso[];
  eventos: EventoFalla[];
  /** Carga máxima que soporta la estructura (N). */
  Pmax: number;
  /** Cómo termina el ensayo. */
  final: ModoFalla;
  /** La estructura es un mecanismo desde el principio (no soporta carga). */
  inestable: boolean;
  /** Nudo que se escapa si es un mecanismo. */
  nudoLibre?: { nudo: number; eje: 'x' | 'y' | 'z' };
  /** Factor de pandeo global de la estructura intacta (N), si existe. */
  pandeoGlobalInicial?: number;
  /** Forma del colapso (mecanismo o modo de pandeo), normalizada a 1, para animarlo. */
  formaColapso?: Float64Array;
}

/**
 * Ensayo hasta el colapso con carga creciente. En cada etapa calcula las fuerzas por unidad de
 * carga y la carga a la que cada barra llega a su capacidad. La primera que falla se retira y la
 * estructura se recalcula: si las demás soportan más carga, la carga sigue subiendo; si no, las
 * fallas siguen en cadena a la misma carga. Termina cuando la estructura se vuelve un mecanismo o
 * pandea globalmente. Las barras se suponen frágiles (una barra pandeada o rota deja de trabajar).
 */
export function analizarColapso(
  e: Estructura,
  props: PropiedadBarra[],
  cargaUnitaria: Float64Array,
  cargaPeso: Float64Array,
): ResultadoColapso {
  const activas = e.barras.map(() => true);
  const etapas: EtapaColapso[] = [];
  const eventos: EventoFalla[] = [];
  let P = 0;
  let final: ModoFalla = 'mecanismo';
  let nudoLibre: ResultadoColapso['nudoLibre'];
  let pandeoGlobalInicial: number | undefined;
  let formaColapso: Float64Array | undefined;

  for (let paso = 0; paso <= e.barras.length + 1; paso++) {
    const sis = ensamblar(e, props, activas);
    const uu = desplazamientos(sis, cargaUnitaria);
    if (esMecanismo(sis, cargaUnitaria, uu)) {
      final = 'mecanismo';
      nudoLibre = nudoMasDesplazado(uu);
      formaColapso = normalizar(uu);
      if (eventos.length > 0) eventos.push({ P, barra: -1, modo: 'mecanismo', cascada: true });
      break;
    }
    const uw = desplazamientos(sis, cargaPeso);
    const Nu = fuerzasAxiales(e, props, activas, uu);
    const Nw = fuerzasAxiales(e, props, activas, uw);
    etapas.push({ activas: [...activas], Nu, Nw, uu, uw });

    let Pbarra = Infinity;
    let jCritica = -1;
    let modo: ModoFalla = 'traccion';
    for (let j = 0; j < e.barras.length; j++) {
      if (!activas[j] || props[j].rigida) continue;
      const { capTraccion, capCompresion } = props[j];
      const nu = Nu[j];
      const nw = Nw[j];
      let Pj = Infinity;
      let mj: ModoFalla = 'traccion';
      const tol = 1e-12;
      if (nu > tol) {
        Pj = (capTraccion - nw) / nu;
        mj = props[j].modoTraccion;
      } else if (nu < -tol) {
        Pj = (-capCompresion - nw) / nu;
        mj = props[j].modoCompresion;
      } else if (nw > capTraccion || nw < -capCompresion) {
        Pj = 0;
        mj = nw > 0 ? props[j].modoTraccion : props[j].modoCompresion;
      }
      if (Pj < Pbarra) {
        Pbarra = Pj;
        jCritica = j;
        modo = mj;
      }
    }

    const global = pandeoGlobal(e, activas, Nu, sis);
    if (paso === 0 && global) pandeoGlobalInicial = global.lambda;

    if (global && global.lambda < Pbarra) {
      const cascada = global.lambda <= P;
      P = Math.max(P, global.lambda);
      eventos.push({ P, barra: -1, modo: 'global', cascada });
      final = 'global';
      formaColapso = global.modo;
      break;
    }
    if (jCritica < 0 || !Number.isFinite(Pbarra)) {
      // Ninguna barra trabaja: no debería ocurrir con cargas no nulas.
      final = 'mecanismo';
      break;
    }
    const Pf = Math.max(Pbarra, 0);
    const cascada = Pf <= P;
    if (!cascada) P = Pf;
    eventos.push({ P, barra: jCritica, modo, cascada });
    activas[jCritica] = false;
  }

  return {
    etapas,
    eventos,
    Pmax: P,
    final,
    inestable: etapas.length === 0,
    nudoLibre,
    pandeoGlobalInicial,
    formaColapso,
  };
}

function normalizar(u: Float64Array): Float64Array {
  let max = 0;
  for (const v of u) max = Math.max(max, Math.abs(v));
  const r = new Float64Array(u.length);
  if (max > 0) for (let i = 0; i < u.length; i++) r[i] = u[i] / max;
  return r;
}

/** Estado de la estructura con una carga total W (N): etapa vigente y fallas ocurridas. */
export function estadoEnCarga(r: ResultadoColapso, W: number): { etapa: EtapaColapso | undefined; indice: number; colapsada: boolean; fallas: EventoFalla[] } {
  const colapsada = r.inestable || W >= r.Pmax;
  const fallas = colapsada ? r.eventos : r.eventos.filter((ev) => ev.P < W);
  const indice = Math.min(fallas.filter((ev) => ev.barra >= 0).length, r.etapas.length - 1);
  return { etapa: r.etapas[indice], indice, colapsada, fallas };
}
