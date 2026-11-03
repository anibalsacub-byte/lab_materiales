/**
 * Flexión de vigas: casos clásicos con solución cerrada conocida (Hibbeler / Beer & Johnston).
 * Se cubren dos condiciones de apoyo (simplemente apoyada, en voladizo) y dos tipos de carga
 * (puntual, uniformemente distribuida en todo el claro) — las combinaciones que la especificación
 * permite limitar a "las ecuaciones implementadas". No se resuelven combinaciones de cargas ni
 * posiciones arbitrarias de carga distribuida: para eso se requeriría integración numérica, fuera
 * del alcance de este banco introductorio.
 *
 * Convención: x se mide desde el apoyo izquierdo (viga simple) o desde el empotramiento (voladizo),
 * creciendo hacia la derecha / hacia el extremo libre. M positivo = concavidad hacia arriba (fibra
 * inferior en tracción), consistente con la convención usual de vigas simplemente apoyadas; en el
 * voladizo, M resulta negativo (momento hogging), lo cual es correcto y se muestra tal cual.
 *
 * Unidades: fuerzas en N, longitudes en mm, momentos en N·mm, carga distribuida en N/mm.
 */

import { esfuerzoSinEstriccion } from './axial';
import type { Material } from '../types';

export type ApoyoViga = 'simple' | 'voladizo';
export type TipoCargaViga = 'puntual' | 'distribuida';

export interface ParametrosViga {
  apoyo: ApoyoViga;
  tipoCarga: TipoCargaViga;
  L_mm: number;
  /** Fuerza puntual (N). Requerida si tipoCarga = 'puntual'. */
  P_N?: number;
  /** Posición de la carga puntual desde el apoyo izquierdo (mm). Solo para apoyo 'simple' + carga
   *  'puntual'; en voladizo la carga puntual siempre se aplica en el extremo libre (x = L). */
  a_mm?: number;
  /** Carga distribuida uniforme (N/mm), aplicada en todo el claro. Requerida si tipoCarga = 'distribuida'. */
  w_N_mm?: number;
}

function validar(p: ParametrosViga): void {
  if (p.L_mm <= 0) throw new Error('La longitud de la viga debe ser positiva.');
  if (p.tipoCarga === 'puntual') {
    if (p.P_N === undefined) throw new Error('Falta la fuerza puntual P.');
    if (p.apoyo === 'simple') {
      const a = p.a_mm ?? p.L_mm / 2;
      if (a <= 0 || a >= p.L_mm) throw new Error('La posición de la carga debe estar dentro del claro (0 < a < L).');
    }
  } else {
    if (p.w_N_mm === undefined) throw new Error('Falta la carga distribuida w.');
  }
}

/** Reacción en el apoyo izquierdo (viga simple) o en el empotramiento (voladizo). */
export function reaccionIzquierda(p: ParametrosViga): number {
  validar(p);
  if (p.apoyo === 'voladizo') {
    return p.tipoCarga === 'puntual' ? p.P_N! : p.w_N_mm! * p.L_mm;
  }
  // simple
  if (p.tipoCarga === 'puntual') {
    const a = p.a_mm ?? p.L_mm / 2;
    const b = p.L_mm - a;
    return (p.P_N! * b) / p.L_mm;
  }
  return (p.w_N_mm! * p.L_mm) / 2;
}

/** Reacción en el apoyo derecho. Es 0 en voladizo (toda la reacción está en el empotramiento). */
export function reaccionDerecha(p: ParametrosViga): number {
  validar(p);
  if (p.apoyo === 'voladizo') return 0;
  if (p.tipoCarga === 'puntual') {
    const a = p.a_mm ?? p.L_mm / 2;
    return (p.P_N! * a) / p.L_mm;
  }
  return (p.w_N_mm! * p.L_mm) / 2;
}

/** Momento de reacción en el empotramiento (solo voladizo); negativo (hogging). */
export function momentoEmpotramiento(p: ParametrosViga): number {
  validar(p);
  if (p.apoyo !== 'voladizo') throw new Error('El momento de empotramiento solo aplica a vigas en voladizo.');
  return p.tipoCarga === 'puntual' ? -p.P_N! * p.L_mm : -(p.w_N_mm! * p.L_mm ** 2) / 2;
}

/** Fuerza cortante V(x) en la posición x (mm) a lo largo de la viga. */
export function cortante(x_mm: number, p: ParametrosViga): number {
  validar(p);
  if (x_mm < 0 || x_mm > p.L_mm) throw new Error('x debe estar dentro del claro de la viga.');

  if (p.apoyo === 'voladizo') {
    if (p.tipoCarga === 'puntual') return p.P_N!; // constante: una sola carga en el extremo libre
    return p.w_N_mm! * (p.L_mm - x_mm);
  }

  // simple
  const Rizq = reaccionIzquierda(p);
  if (p.tipoCarga === 'puntual') {
    const a = p.a_mm ?? p.L_mm / 2;
    return x_mm < a ? Rizq : Rizq - p.P_N!;
  }
  return Rizq - p.w_N_mm! * x_mm;
}

/** Momento flector M(x) en la posición x (mm) a lo largo de la viga. */
export function momento(x_mm: number, p: ParametrosViga): number {
  validar(p);
  if (x_mm < 0 || x_mm > p.L_mm) throw new Error('x debe estar dentro del claro de la viga.');

  if (p.apoyo === 'voladizo') {
    if (p.tipoCarga === 'puntual') return -p.P_N! * (p.L_mm - x_mm);
    return -(p.w_N_mm! * (p.L_mm - x_mm) ** 2) / 2;
  }

  // simple
  const Rizq = reaccionIzquierda(p);
  if (p.tipoCarga === 'puntual') {
    const a = p.a_mm ?? p.L_mm / 2;
    return x_mm <= a ? Rizq * x_mm : reaccionDerecha(p) * (p.L_mm - x_mm);
  }
  return Rizq * x_mm - (p.w_N_mm! * x_mm ** 2) / 2;
}

export interface ExtremoViga {
  valor: number;
  x_mm: number;
}

/** Momento flector máximo en magnitud, y dónde ocurre. */
export function momentoMaximo(p: ParametrosViga): ExtremoViga {
  validar(p);
  if (p.apoyo === 'voladizo') {
    return { valor: momento(0, p), x_mm: 0 }; // máximo siempre en el empotramiento
  }
  if (p.tipoCarga === 'puntual') {
    const a = p.a_mm ?? p.L_mm / 2;
    return { valor: momento(a, p), x_mm: a };
  }
  const xMedio = p.L_mm / 2;
  return { valor: momento(xMedio, p), x_mm: xMedio };
}

/**
 * Deflexión máxima (mm) y su ubicación, para los casos con fórmula cerrada estándar:
 * - simple + puntual: deflexión EN el punto de aplicación de la carga (no necesariamente el máximo
 *   global de toda la viga, pero sí la referencia estándar de las tablas de vigas): δ = Pa²b²/(3EIL).
 * - simple + distribuida: máximo en el centro del claro: δ = 5wL⁴/(384EI).
 * - voladizo + puntual: máximo en el extremo libre: δ = PL³/(3EI).
 * - voladizo + distribuida: máximo en el extremo libre: δ = wL⁴/(8EI).
 */
export function deflexionMaxima(p: ParametrosViga, E_MPa: number, I_mm4: number): ExtremoViga {
  validar(p);
  if (E_MPa <= 0 || I_mm4 <= 0) throw new Error('E e I deben ser positivos.');
  const L = p.L_mm;

  if (p.apoyo === 'voladizo') {
    if (p.tipoCarga === 'puntual') return { valor: (p.P_N! * L ** 3) / (3 * E_MPa * I_mm4), x_mm: L };
    return { valor: (p.w_N_mm! * L ** 4) / (8 * E_MPa * I_mm4), x_mm: L };
  }

  if (p.tipoCarga === 'puntual') {
    const a = p.a_mm ?? L / 2;
    const b = L - a;
    return { valor: (p.P_N! * a ** 2 * b ** 2) / (3 * E_MPa * I_mm4 * L), x_mm: a };
  }
  return { valor: (5 * p.w_N_mm! * L ** 4) / (384 * E_MPa * I_mm4), x_mm: L / 2 };
}

/** Esfuerzo normal por flexión: σ = M·c / I, con c = distancia de la fibra extrema al eje neutro. */
export function esfuerzoFlexion(M_Nmm: number, c_mm: number, I_mm4: number): number {
  if (I_mm4 <= 0) throw new Error('I debe ser positivo.');
  return (M_Nmm * c_mm) / I_mm4;
}

// ---------------------------------------------------------------------------------------------
// Ensayo de flexión en máquina universal (3 y 4 puntos), más allá del régimen elástico.
// ---------------------------------------------------------------------------------------------


export type SeccionFlexion = { tipo: 'rectangular'; b: number; h: number } | { tipo: 'circular'; d: number };
/** Tres puntos: carga P en el centro. Cuatro puntos: dos cargas P/2 a L/3 de cada apoyo. */
export type ConfiguracionFlexion = 'tres-puntos' | 'cuatro-puntos';

export function semialturaSeccion(s: SeccionFlexion): number {
  return s.tipo === 'rectangular' ? s.h / 2 : s.d / 2;
}

export function inerciaSeccionFlexion(s: SeccionFlexion): number {
  return s.tipo === 'rectangular' ? (s.b * s.h ** 3) / 12 : (Math.PI * s.d ** 4) / 64;
}

function anchoEn(s: SeccionFlexion, y: number): number {
  return s.tipo === 'rectangular' ? s.b : 2 * Math.sqrt(Math.max((s.d / 2) ** 2 - y ** 2, 0));
}

/**
 * Momento flector que resiste la sección para una curvatura κ (1/mm): M = ∫ σ(κ·y)·y·dA, con la
 * curva del material sin estricción y el mismo comportamiento a tracción y a compresión (válido
 * para metales). Devuelve undefined si la fibra extrema supera la deformación de rotura.
 */
export function momentoDesdeCurvatura(material: Material, s: SeccionFlexion, kappa: number, nFranjas = 200): number | undefined {
  const c = semialturaSeccion(s);
  const dy = c / nFranjas;
  let M = 0;
  for (let i = 0; i < nFranjas; i++) {
    const y = (i + 0.5) * dy;
    const sigma = esfuerzoSinEstriccion(material, kappa * y);
    if (sigma === undefined) return undefined;
    M += sigma * y * anchoEn(s, y) * dy;
  }
  return 2 * M;
}

/** Momento máximo (en el centro) para una carga total P. */
export function momentoCentral(P: number, L: number, config: ConfiguracionFlexion): number {
  return config === 'tres-puntos' ? (P * L) / 4 : (P * L) / 6;
}

/** Rigidez elástica P/δ en el centro del claro: 48EI/L³ (3 puntos) o 1296EI/(23L³) (4 puntos, cargas a L/3). */
export function rigidezFlexion(E: number, I: number, L: number, config: ConfiguracionFlexion): number {
  return config === 'tres-puntos' ? (48 * E * I) / L ** 3 : (1296 * E * I) / (23 * L ** 3);
}

export interface CurvaCargaFlecha {
  /** Flecha en el centro (mm) y carga total (N), crecientes. */
  delta: number[];
  P: number[];
  /** Rotura de la fibra traccionada (deformación εF): último punto de la curva. */
  deltaRotura: number;
  PRotura: number;
  /** Primera fluencia de la fibra extrema (solo materiales con σY). */
  PFluencia?: number;
  deltaFluencia?: number;
  rigidez: number;
}

/**
 * Curva carga–flecha de una viga simplemente apoyada en 3 o 4 puntos, con plasticidad: para cada
 * carga, la curvatura de cada sección sale de invertir M(κ) y la flecha en el centro se integra
 * por trabajos virtuales, δ = ∫ κ(x)·m(x) dx (m = momento de una carga unitaria en el centro).
 * En régimen elástico reproduce PL³/(48EI) y 23PL³/(1296EI). Teoría de pequeñas deflexiones.
 */
export function curvaCargaFlecha(material: Material, s: SeccionFlexion, L: number, config: ConfiguracionFlexion, nPuntos = 160): CurvaCargaFlecha {
  const E = material.propiedades.E_MPa ?? 200000;
  const epsF = material.propiedades.epsilonF ?? (material.propiedades.sigmaU_MPa ?? E * 0.01) / E;
  const c = semialturaSeccion(s);
  const I = inerciaSeccionFlexion(s);

  // Tabla M(κ), más densa cerca del origen (zona elástica y codo de fluencia).
  const kappaLim = (epsF * 0.999) / c;
  const nK = 320;
  const kappas: number[] = [];
  const momentos: number[] = [];
  for (let i = 0; i <= nK; i++) {
    const kappa = kappaLim * (i / nK) ** 2;
    kappas.push(kappa);
    momentos.push(momentoDesdeCurvatura(material, s, kappa) ?? momentos[momentos.length - 1]);
  }
  const Mlim = momentos[nK];
  const kappaDeM = (M: number) => {
    if (M <= 0) return 0;
    let lo = 0;
    let hi = nK;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (momentos[mid] < M) lo = mid;
      else hi = mid;
    }
    const t = momentos[hi] > momentos[lo] ? (M - momentos[lo]) / (momentos[hi] - momentos[lo]) : 1;
    return kappas[lo] + t * (kappas[hi] - kappas[lo]);
  };

  const PLim = config === 'tres-puntos' ? (4 * Mlim) / L : (6 * Mlim) / L;
  const nX = 240;
  const flecha = (P: number) => {
    let delta = 0;
    const dx = L / 2 / nX;
    for (let i = 0; i < nX; i++) {
      const x = (i + 0.5) * dx;
      const M = config === 'tres-puntos' || x < L / 3 ? (P * x) / 2 : (P * L) / 6;
      delta += kappaDeM(M) * (x / 2) * dx;
    }
    return 2 * delta;
  };

  const delta: number[] = [];
  const P: number[] = [];
  for (let j = 0; j <= nPuntos; j++) {
    const Pj = PLim * (1 - (1 - j / nPuntos) ** 2);
    P.push(Pj);
    delta.push(flecha(Pj));
  }

  const rigidez = rigidezFlexion(E, I, L, config);
  const sigmaY = material.propiedades.sigmaY_MPa;
  let PFluencia: number | undefined;
  if (material.modelo === 'elastico_plastico_bilineal' && sigmaY !== undefined) {
    const My = (sigmaY * I) / c;
    PFluencia = config === 'tres-puntos' ? (4 * My) / L : (6 * My) / L;
  }
  return {
    delta,
    P,
    deltaRotura: delta[nPuntos],
    PRotura: P[nPuntos],
    PFluencia,
    deltaFluencia: PFluencia !== undefined ? PFluencia / rigidez : undefined,
    rigidez,
  };
}

/** Interpola la carga de una curva carga–flecha en una flecha dada (envolvente monótona). */
export function cargaEnFlecha(curva: CurvaCargaFlecha, delta: number): number {
  const { delta: ds, P } = curva;
  if (delta <= 0) return 0;
  if (delta >= ds[ds.length - 1]) return P[P.length - 1];
  let lo = 0;
  let hi = ds.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (ds[mid] < delta) lo = mid;
    else hi = mid;
  }
  const t = (delta - ds[lo]) / (ds[hi] - ds[lo] || 1);
  return P[lo] + t * (P[hi] - P[lo]);
}

/** Curvatura de la sección para un momento M (inversa de {@link momentoDesdeCurvatura}, por bisección). */
export function curvaturaDesdeMomento(material: Material, s: SeccionFlexion, M: number): number {
  if (M <= 0) return 0;
  const E = material.propiedades.E_MPa ?? 200000;
  const epsF = material.propiedades.epsilonF ?? 0.01;
  let lo = 0;
  let hi = (epsF * 0.999) / semialturaSeccion(s);
  if ((momentoDesdeCurvatura(material, s, hi) ?? 0) <= M) return hi;
  // Arranque elástico: acota la búsqueda cuando la sección aún no fluye.
  const kElastico = M / (E * inerciaSeccionFlexion(s));
  if ((momentoDesdeCurvatura(material, s, kElastico) ?? 0) >= M * (1 - 1e-9)) hi = Math.min(hi, kElastico);
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if ((momentoDesdeCurvatura(material, s, mid, 120) ?? Infinity) < M) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * Distribución de esfuerzo normal σ(y) en la sección para el momento actual M, habiendo llegado
 * antes a Mmax. Si M < Mmax la viga se descargó: la descarga es elástica (Δσ = E·Δκ·y), así que
 * quedan esfuerzos residuales en las fibras que fluyeron aunque el momento sea cero.
 * Devuelve puntos (σ en MPa, y en mm) de la fibra inferior (−c) a la superior (+c).
 */
export function distribucionEsfuerzoFlexion(material: Material, s: SeccionFlexion, M: number, Mmax: number, nPuntos = 81): { sigma: number; y: number }[] {
  const E = material.propiedades.E_MPa ?? 200000;
  const c = semialturaSeccion(s);
  const kappaMax = curvaturaDesdeMomento(material, s, Math.max(Mmax, M));
  const kappa = kappaMax - (Math.max(Mmax, M) - M) / (E * inerciaSeccionFlexion(s));
  const puntos: { sigma: number; y: number }[] = [];
  for (let i = 0; i < nPuntos; i++) {
    const y = -c + (2 * c * i) / (nPuntos - 1);
    // Fibra superior comprimida (σ < 0) e inferior traccionada (σ > 0) bajo momento positivo.
    const sigmaEnv = esfuerzoSinEstriccion(material, -kappaMax * y) ?? 0;
    puntos.push({ sigma: sigmaEnv + E * (kappaMax - kappa) * y, y });
  }
  return puntos;
}
